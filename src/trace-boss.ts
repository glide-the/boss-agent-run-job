import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

type Locator =
  | { method: "find-text"; value: string; exact?: boolean; description?: string }
  | { method: "css"; value: string; description?: string }
  | { method: "role"; role: string; name: string; description?: string };

type AgentBrowserConfig = {
  extensions: string[];
  state: string;
  headed: boolean;
};

type TraceTargetConfig = {
  id?: string;
  description?: string;
  conversationLocator: Locator;
  jobEntryLocators?: Locator[];
  maxJobs?: number;
};

type Config = {
  chatUrl: string;
  startUrl?: string;
  chatListScrolls: number;
  chatListScrollPixels: number;
  waitTimeoutMs: number;
  screenshot: boolean;
  outputDir: string;
  jobDetailUrlPattern: string;
  agentBrowser: AgentBrowserConfig;
  chatAreaSelectors: string[];
  conversationListSelectors: string[];
  currentChatSelectors: string[];
  jobCardSelectors: string[];
  jobDetailLinkSelectors: string[];
  traceTargets?: TraceTargetConfig[];
  conversationEntryLocators?: Locator[];
  jobEntryLocators: Locator[];
  maxJobsPerTarget?: number;
  jobInfoSelectors: Record<string, string[]>;
  excludedJobSectionHeadings: string[];
  returnToChat?: { method: "browser-back" };
  fieldHints?: Record<string, string[]>;
};

type TraceEvent = {
  ts: string;
  step: string;
  detail?: unknown;
};

type JobRecord = {
  target_id: string;
  job_id: string;
  url: string;
  collectedAt: string;
  title?: string;
  salary?: string;
  location?: string;
  experience?: string;
  education?: string;
  company?: string;
  recruiter?: string;
  rawTextFile: string;
  snapshotFile?: string;
  screenshotFile?: string;
};

type ChatListEntry = {
  index: number;
  text: string;
};

type ChatRecord = {
  target_id: string;
  contactLocator?: Locator;
  collectedAt: string;
  rawTextFile: string;
  snapshotFile: string;
};

type RuntimeTraceTarget = {
  target_id: string;
  description?: string;
  conversationLocator: Locator;
  jobEntryLocators: Locator[];
};

type SelectorProbe = {
  group: string;
  selector: string;
  startLabel: string;
  endLabel: string;
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const traceMarkerPrefix = "__BOSS_TRACE_MARKER__:";
const requiredAgentBrowserConfig: AgentBrowserConfig = {
  extensions: [
    "/Users/dmeck/agent-brower/capsolver-extension",
    "/Users/dmeck/agent-brower/stealth-extension"
  ],
  state: "/Users/dmeck/agent-brower/my-auth.json",
  headed: true
};
const cliArgs = process.argv.slice(2);
const dryRun = cliArgs.includes("--dry-run");
const noScreenshot = cliArgs.includes("--no-screenshot");
const inspectSelectors = cliArgs.includes("--inspect-selectors");

async function main() {
  const config = await loadConfig();
  if (noScreenshot) config.screenshot = false;

  const out = resolve(projectRoot, config.outputDir);
  await ensureOutputDirs(out);
  await writeFile(join(out, "agent-browser-commands.log"), "");
  await writeJson(join(out, "chats.json"), []);
  await writeJson(join(out, "jobs.json"), []);

  const baseArgs = buildAgentBrowserBaseArgs(config.agentBrowser);
  await printRunParameters(config, out, baseArgs);

  const traceEvents: TraceEvent[] = [];
  const jobs: JobRecord[] = [];
  const chats: ChatRecord[] = [];

  const trace = async (step: string, detail?: unknown) => {
    const event = { ts: new Date().toISOString(), step, detail };
    traceEvents.push(event);
    console.log(`[trace] ${step}`, detail ? JSON.stringify(detail) : "");
    await writeJson(join(out, "trace-events.json"), traceEvents);
  };

  const conversationLocators = config.conversationEntryLocators || [];
  const hasTraceTargets = (config.traceTargets?.length || 0) > 0;
  if (dryRun || (!hasTraceTargets && conversationLocators.length === 0)) {
    const chatList = await collectFullChatList(config, out, trace, inspectSelectors);
    await writeJson(join(out, "chat-list.json"), chatList.entries);
    await trace("dry-run-stop", {
      message: dryRun
        ? "已打开 chat 页面并保存 snapshot/read；未点击岗位入口。"
        : "缺少 conversationEntryLocators，已只收集 chat 列表。",
      next: "查看 output/snapshots/chat-list-full.txt、output/raw/chat-list-full.txt 和 output/chat-list.json 后微调 config/boss.config.json。"
    });
    if (!hasTraceTargets && conversationLocators.length === 0) {
      await trace("no-conversation-locator", {
        message: "config.boss.config.json 需要配置 conversationEntryLocators，流程应先从 chat 列表点击联系人。"
      });
    }
    await trace("done", { jobCount: jobs.length });
    await writeTraceReport(out, traceEvents, jobs);
    return;
  }

  const result = await runSingleSessionTraceFlow(config, out, conversationLocators, trace, inspectSelectors);
  await writeJson(join(out, "chat-list.json"), result.chatList.entries);
  chats.push(...result.chats);
  jobs.push(...result.jobs);
  await writeJson(join(out, "chats.json"), chats);
  await writeJson(join(out, "jobs.json"), jobs);

  await trace("done", { jobCount: jobs.length });
  await writeTraceReport(out, traceEvents, jobs);
}

async function loadConfig(): Promise<Config> {
  const configPath = join(projectRoot, "config", "boss.config.json");
  const text = await readFile(configPath, "utf8");
  const config = JSON.parse(text) as Config;
  validateAgentBrowserConfig(config.agentBrowser);
  return config;
}

function chatUrl(config: Config) {
  return config.chatUrl || config.startUrl || "https://www.zhipin.com/web/geek/chat";
}

function buildAgentBrowserBaseArgs(agentConfig: AgentBrowserConfig) {
  const base: string[] = [];
  for (const extension of agentConfig.extensions) {
    base.push("--extension", extension);
  }
  base.push("--state", agentConfig.state);
  if (agentConfig.headed) base.push("--headed");
  return base;
}

function validateAgentBrowserConfig(agentConfig: AgentBrowserConfig) {
  const missing: string[] = [];
  for (const extension of requiredAgentBrowserConfig.extensions) {
    if (!agentConfig.extensions.includes(extension)) {
      missing.push(`--extension ${extension}`);
    }
  }
  if (agentConfig.state !== requiredAgentBrowserConfig.state) {
    missing.push(`--state ${requiredAgentBrowserConfig.state}`);
  }
  if (agentConfig.headed !== requiredAgentBrowserConfig.headed) {
    missing.push("--headed");
  }
  if (missing.length > 0) {
    throw new Error(`agentBrowser 配置缺少必需启动参数: ${missing.join(", ")}`);
  }
}

async function printRunParameters(config: Config, outputDir: string, agentBrowserBaseArgs: string[]) {
  const parameters = {
    cliArgs,
    dryRun,
    inspectSelectors,
    projectRoot,
    configFile: join(projectRoot, "config", "boss.config.json"),
    chatUrl: chatUrl(config),
    startUrl: config.startUrl,
    chatListScrolls: config.chatListScrolls,
    chatListScrollPixels: config.chatListScrollPixels,
    outputDir,
    extensions: config.agentBrowser.extensions,
    state: config.agentBrowser.state,
    headed: config.agentBrowser.headed,
    agentBrowserBaseArgs,
    jobEntryLocators: config.jobEntryLocators,
    conversationEntryLocators: config.conversationEntryLocators || [],
    traceTargets: config.traceTargets || [],
    maxJobsPerTarget: config.maxJobsPerTarget,
    selectors: {
      chatAreaSelectors: config.chatAreaSelectors,
      conversationListSelectors: config.conversationListSelectors,
      currentChatSelectors: config.currentChatSelectors,
      jobCardSelectors: config.jobCardSelectors,
      jobDetailLinkSelectors: config.jobDetailLinkSelectors,
      jobInfoSelectors: config.jobInfoSelectors
    },
    config
  };

  console.log("[parameters]");
  console.log(JSON.stringify(parameters, null, 2));
}

async function ensureOutputDirs(out: string) {
  await mkdir(join(out, "snapshots"), { recursive: true });
  await mkdir(join(out, "screenshots"), { recursive: true });
  await mkdir(join(out, "raw"), { recursive: true });
}

async function collectFullChatList(
  config: Config,
  out: string,
  trace: (step: string, detail?: unknown) => Promise<void>,
  includeSelectorInspection = false
) {
  const scrolls = Math.max(0, config.chatListScrolls);
  const scrollPixels = Math.max(100, config.chatListScrollPixels);
  const commands = [
    command("open", chatUrl(config)),
    "wait --load networkidle",
    "get url",
    "get title",
    "snapshot -i -u -c"
  ];

  for (let i = 0; i < scrolls; i++) {
    commands.push(command("scroll", "down", String(scrollPixels)));
    commands.push("wait 300");
    commands.push("snapshot -i -u -c");
  }

  const selectorProbes = includeSelectorInspection
    ? appendSelectorInspectionCommands(commands, config, "chat-list")
    : [];

  await trace("collect-full-chat-list", { scrolls, scrollPixels });
  const output = await runBatch(config, commands, { optional: true });
  await writeFile(join(out, "snapshots", "chat-list-full.txt"), output);
  await writeFile(join(out, "raw", "chat-list-full.txt"), output);
  if (selectorProbes.length > 0) {
    await writeSelectorInspection(config, out, output, selectorProbes, trace, "chat-list");
  }

  const entries = extractChatListEntries(output);
  await trace("chat-list-collected", { count: entries.length });
  return { rawTextFile: join(config.outputDir, "raw", "chat-list-full.txt"), entries };
}

async function runSingleSessionTraceFlow(
  config: Config,
  out: string,
  conversationLocators: Locator[],
  trace: (step: string, detail?: unknown) => Promise<void>,
  includeSelectorInspection = false
) {
  const targets = resolveTraceTargets(config, conversationLocators);
  const scrolls = Math.max(0, config.chatListScrolls);
  const scrollPixels = Math.max(100, config.chatListScrollPixels);
  const commands = [
    command("open", chatUrl(config)),
    "wait --load networkidle",
    markerCommand("chat-list-start"),
    "get url",
    "get title",
    "snapshot -i -u -c"
  ];

  for (let i = 0; i < scrolls; i++) {
    commands.push(command("scroll", "down", String(scrollPixels)));
    commands.push("wait 300");
    commands.push("snapshot -i -u -c");
  }

  commands.push("read");
  commands.push(markerCommand("chat-list-end"));

  for (let i = 0; i < scrolls; i++) {
    commands.push(command("scroll", "up", String(scrollPixels)));
    commands.push("wait 150");
  }
  if (scrolls > 0) {
    commands.push("snapshot -i -u -c");
  }

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const targetIndex = i + 1;
    const targetLabel = safeLabel(target.target_id, targetIndex);
    const cssLocatorAttemptCount = new Map<string, number>();

    commands.push(markerCommand(`flow-${targetLabel}-start`));
    commands.push(locatorToClickCommand(target.conversationLocator));
    commands.push("wait --load networkidle");
    commands.push(markerCommand(`chat-${targetLabel}-start`));
    commands.push("get url");
    commands.push("get title");
    commands.push("snapshot -i -u -c");
    commands.push("read");
    commands.push(markerCommand(`chat-${targetLabel}-end`));

    for (let j = 0; j < target.jobEntryLocators.length; j++) {
      const jobNumber = j + 1;
      const jobLabel = `job-${targetLabel}-${jobNumber}`;
      const jobLocator = target.jobEntryLocators[j];
      const screenshotFile = config.screenshot
        ? join(config.outputDir, "screenshots", `${jobLabel}.png`)
        : undefined;
      const cssLocatorValue = jobLocator.method === "css" ? jobLocator.value : undefined;
      const cssLocatorIndex = cssLocatorValue
        ? (cssLocatorAttemptCount.get(cssLocatorValue) ?? 0) + 1
        : undefined;
      if (cssLocatorValue && cssLocatorIndex !== undefined) {
        cssLocatorAttemptCount.set(cssLocatorValue, cssLocatorIndex);
      }

      commands.push(locatorToClickCommand(jobLocator, cssLocatorIndex));
      commands.push("wait --load networkidle");
      commands.push(command("wait", "--url", config.jobDetailUrlPattern));
      commands.push(markerCommand(`${jobLabel}-start`));
      commands.push("get url");
      commands.push("get title");
      commands.push("snapshot -i -u -c");
      commands.push("read");
      if (screenshotFile) {
        commands.push(command("screenshot", join(projectRoot, screenshotFile)));
      }
      commands.push(markerCommand(`${jobLabel}-end`));

      const hasNextJob = j < target.jobEntryLocators.length - 1;
      const hasNextTarget = i < targets.length - 1;
      if (hasNextJob || hasNextTarget || includeSelectorInspection) {
        commands.push(...returnToChatCommands());
      }
    }

    commands.push(markerCommand(`flow-${targetLabel}-end`));
  }

  const selectorProbes = includeSelectorInspection
    ? appendSelectorInspectionCommands(commands, config, "single-session")
    : [];
  const plannedJobAttempts = targets.reduce((sum, target) => sum + target.jobEntryLocators.length, 0);
  await trace("single-session-flow-start", {
    steps: [
      "open-chat-once",
      "collect-full-chat-list",
      "scroll-list-back",
      "click-contact",
      "collect-chat",
      "click-configured-job-entry",
      "collect-job",
      "return-to-chat-with-browser-back"
    ],
    scrolls,
    scrollPixels,
    targetCount: targets.length,
    plannedJobAttempts,
    includeSelectorInspection,
    targets: targets.map((target) => ({
      target_id: target.target_id,
      description: target.description,
      jobLocatorCount: target.jobEntryLocators.length,
      conversationLocator: target.conversationLocator
    }))
  });

  const output = await runBatch(config, commands, { optional: true });
  const singleSessionRawFile = join(config.outputDir, "raw", "single-session-flow.txt");
  await writeFile(join(projectRoot, singleSessionRawFile), output);
  if (selectorProbes.length > 0) {
    await writeSelectorInspection(config, out, output, selectorProbes, trace, "single-session");
  }

  const chatListSegment = extractMarkedSegment(output, "chat-list-start", "chat-list-end") || output;
  await writeFile(join(out, "snapshots", "chat-list-full.txt"), chatListSegment);
  await writeFile(join(out, "raw", "chat-list-full.txt"), chatListSegment);
  const entries = extractChatListEntries(chatListSegment);
  await trace("chat-list-collected", { count: entries.length, rawTextFile: join(config.outputDir, "raw", "chat-list-full.txt") });

  const chats: ChatRecord[] = [];
  const jobs: JobRecord[] = [];
  const seenJobs = new Set<string>();
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const targetIndex = i + 1;
    const targetLabel = safeLabel(target.target_id, targetIndex);
    const flowRawFile = join(config.outputDir, "raw", `flow-${targetLabel}.txt`);
    const chatRawFile = join(config.outputDir, "raw", `chat-${targetLabel}.txt`);
    const chatSnapshotFile = join(config.outputDir, "snapshots", `chat-${targetLabel}.txt`);

    const flowSegment = extractMarkedSegment(output, `flow-${targetLabel}-start`, `flow-${targetLabel}-end`) || output;
    const chatSegment = extractMarkedSegment(output, `chat-${targetLabel}-start`, `chat-${targetLabel}-end`) || flowSegment;

    await writeFile(join(projectRoot, flowRawFile), flowSegment);
    await writeFile(join(projectRoot, chatRawFile), chatSegment);
    await writeFile(join(projectRoot, chatSnapshotFile), chatSegment);

    const chat: ChatRecord = {
      target_id: target.target_id,
      contactLocator: target.conversationLocator,
      collectedAt: new Date().toISOString(),
      rawTextFile: chatRawFile,
      snapshotFile: chatSnapshotFile
    };
    chats.push(chat);

    await trace("chat-collected", {
      target_id: target.target_id,
      contactLocator: target.conversationLocator,
      rawTextFile: chatRawFile,
      snapshotFile: chatSnapshotFile
    });

    for (let j = 0; j < target.jobEntryLocators.length; j++) {
      const jobNumber = j + 1;
      const jobLabel = `job-${targetLabel}-${jobNumber}`;
      const jobLocator = target.jobEntryLocators[j];
      const jobSegment = extractMarkedSegment(output, `${jobLabel}-start`, `${jobLabel}-end`);
      const jobRawFile = join(config.outputDir, "raw", `${jobLabel}.txt`);
      const jobSnapshotFile = join(config.outputDir, "snapshots", `job-detail-${targetLabel}-${jobNumber}.txt`);
      const screenshotFile = config.screenshot
        ? join(config.outputDir, "screenshots", `${jobLabel}.png`)
        : undefined;

      if (!jobSegment) {
        await trace("job-not-collected", {
          target_id: target.target_id,
          jobAttempt: jobNumber,
          reason: "岗位采集片段缺失，可能是 locator 点击、页面加载或 wait --url 失败导致 batch 提前停止",
          jobLocator,
          flowRawFile
        });
        continue;
      }

      const currentUrl = lastUrl(jobSegment);
      const currentTitle = lastNonEmptyLine(jobSegment.replace(currentUrl || "", ""));
      if (!looksLikeJobDetail(currentUrl, config)) {
        await writeFile(join(projectRoot, jobRawFile), jobSegment);
        await trace("job-not-collected", {
          target_id: target.target_id,
          jobAttempt: jobNumber,
          reason: "点击岗位入口后未进入 job_detail URL",
          currentUrl,
          currentTitle,
          jobLocator,
          flowRawFile,
          rawTextFile: jobRawFile
        });
        continue;
      }

      const jobId = extractJobId(currentUrl);
      if (!jobId) {
        await writeFile(join(projectRoot, jobRawFile), jobSegment);
        await trace("job-not-collected", {
          target_id: target.target_id,
          jobAttempt: jobNumber,
          reason: "当前 URL 看起来是 job_detail，但无法从地址栏 URL 解析 job_id",
          currentUrl,
          currentTitle,
          jobLocator,
          flowRawFile,
          rawTextFile: jobRawFile
        });
        continue;
      }

      const duplicateKey = `${target.target_id}:${jobId}`;
      if (seenJobs.has(duplicateKey)) {
        await trace("job-duplicate-skipped", {
          target_id: target.target_id,
          jobAttempt: jobNumber,
          job_id: jobId,
          url: currentUrl,
          jobLocator
        });
        continue;
      }
      seenJobs.add(duplicateKey);

      const cleanJobText = cleanJobDetailText(jobSegment, config.excludedJobSectionHeadings);
      const resolvedJobRawFile = join(config.outputDir, "raw", `job-${jobId}.txt`);
      const resolvedJobSnapshotFile = join(config.outputDir, "snapshots", `job-detail-${jobId}.txt`);
      await writeFile(join(projectRoot, resolvedJobRawFile), cleanJobText);
      await writeFile(join(projectRoot, resolvedJobSnapshotFile), cleanJobText);

      const job: JobRecord = {
        ...parseJobText(cleanJobText),
        target_id: target.target_id,
        job_id: jobId,
        url: currentUrl,
        collectedAt: new Date().toISOString(),
        rawTextFile: resolvedJobRawFile,
        snapshotFile: resolvedJobSnapshotFile,
        screenshotFile
      };
      jobs.push(job);
      await trace("job-collected", {
        ...job,
        jobAttempt: jobNumber,
        jobLocator
      });
    }
  }

  return {
    chatList: { rawTextFile: join(config.outputDir, "raw", "chat-list-full.txt"), entries },
    chats,
    jobs
  };
}

function extractChatListEntries(text: string): ChatListEntry[] {
  const seen = new Set<string>();
  const entries: ChatListEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/generic "([^"]{8,})" \[ref=e\d+\] clickable/);
    if (!match) continue;
    const value = match[1].replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
    if (seen.has(value)) continue;
    seen.add(value);
    entries.push({ index: entries.length + 1, text: value });
  }
  return entries;
}

function resolveTraceTargets(config: Config, conversationLocators: Locator[]): RuntimeTraceTarget[] {
  if (config.traceTargets?.length) {
    const mergedTargets = config.traceTargets.map((target, index) => ({
      target_id: target.id?.trim() || `target-${index + 1}`,
      description: target.description,
      conversationLocator: target.conversationLocator,
      jobEntryLocators: limitJobLocators(config, target)
    }));
    const existingTargets = new Set(mergedTargets.map((target) => locatorSignature(target.conversationLocator)));

    for (const conversationLocator of conversationLocators) {
      const signature = locatorSignature(conversationLocator);
      if (existingTargets.has(signature)) continue;

      mergedTargets.push({
        target_id: `target-${mergedTargets.length + 1}`,
        description: undefined,
        conversationLocator,
        jobEntryLocators: limitJobLocators(config)
      });
      existingTargets.add(signature);
    }

    return mergedTargets;
  }

  return conversationLocators.map((conversationLocator, index) => ({
    target_id: `target-${index + 1}`,
    conversationLocator,
    jobEntryLocators: limitJobLocators(config)
  }));
}

function limitJobLocators(config: Config, target?: TraceTargetConfig) {
  const locators = target?.jobEntryLocators?.length
    ? target.jobEntryLocators
    : config.jobEntryLocators;
  if (locators.length === 0) {
    throw new Error("每个 trace target 至少需要一个岗位入口 locator");
  }

  const requestedLimit = target?.maxJobs ?? config.maxJobsPerTarget ?? locators.length;
  const effectiveLimit = Math.max(1, requestedLimit);
  const plannedLocators = locators.slice(0, effectiveLimit);
  if (plannedLocators.length >= effectiveLimit) return plannedLocators;

  const fallbackCss = plannedLocators.find((locator) => locator.method === "css")
    ?? config.jobEntryLocators.find((locator) => locator.method === "css");
  if (!fallbackCss) return plannedLocators;

  while (plannedLocators.length < effectiveLimit) {
    plannedLocators.push(fallbackCss);
  }
  return plannedLocators;
}

function locatorSignature(locator: Locator) {
  if (locator.method === "find-text") {
    return `${locator.method}:${locator.value}:${locator.exact ? "exact" : "contains"}`;
  }

  if (locator.method === "role") {
    return `${locator.method}:${locator.role}:${locator.name}`;
  }

  return `${locator.method}:${locator.value}`;
}

function appendSelectorInspectionCommands(commands: string[], config: Config, context: string): SelectorProbe[] {
  const selectorGroups: Record<string, string[]> = {
    chatArea: config.chatAreaSelectors,
    conversationList: config.conversationListSelectors,
    currentChat: config.currentChatSelectors,
    jobCards: config.jobCardSelectors,
    jobDetailLinks: config.jobDetailLinkSelectors
  };

  const contextLabel = safeName(context) || "inspection";
  const probes: SelectorProbe[] = [];
  commands.push(markerCommand(`selector-inspection-${contextLabel}-start`));
  commands.push("get url");
  commands.push("get title");
  commands.push("snapshot -i -u -c");

  for (const [group, selectors] of Object.entries(selectorGroups)) {
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const probeLabel = `selector-${contextLabel}-${safeName(group)}-${i + 1}`;
      const startLabel = `${probeLabel}-start`;
      const endLabel = `${probeLabel}-end`;
      commands.push(markerCommand(startLabel));
      commands.push(command("get", "count", selector));
      commands.push(markerCommand(endLabel));
      probes.push({ group, selector, startLabel, endLabel });
    }
  }

  commands.push(markerCommand(`selector-inspection-${contextLabel}-end`));
  return probes;
}

async function writeSelectorInspection(
  config: Config,
  out: string,
  output: string,
  probes: SelectorProbe[],
  trace: (step: string, detail?: unknown) => Promise<void>,
  context: string
) {
  const contextLabel = safeName(context) || "inspection";
  const contextSegment = extractMarkedSegment(
    output,
    `selector-inspection-${contextLabel}-start`,
    `selector-inspection-${contextLabel}-end`
  ) || output;
  const currentUrl = lastUrl(contextSegment);
  const currentTitle = lastNonEmptyLine(contextSegment.replace(currentUrl || "", ""));
  const results = probes.map((probe) => {
    const segment = extractMarkedSegment(output, probe.startLabel, probe.endLabel);
    const count = segment ? lastInteger(segment) : 0;
    return {
      group: probe.group,
      selector: probe.selector,
      count: Number.isFinite(count) ? count : 0,
      debugOnly: true,
      evidence: "selector-inspection"
    };
  });

  const outputFile = join(config.outputDir, "selector-inspection.json");
  await writeJson(join(out, "selector-inspection.json"), {
    debugOnly: true,
    context,
    currentUrl,
    currentTitle,
    collectedAt: new Date().toISOString(),
    results
  });

  await trace("selector-inspection-debug-evidence", {
    context,
    currentUrl,
    currentTitle,
    outputFile,
    probeCount: results.length,
    note: "--inspect-selectors 在当前 batch/session 内执行，不作为正常采集完成证据"
  });
  for (const result of results) {
    await trace("selector-count", result);
  }
}

function safeLabel(value: string, index: number) {
  return safeName(value) || `target-${index}`;
}

function locatorToClickCommand(locator: Locator, cssOccurrence?: number) {
  if (locator.method === "find-text") {
    return locator.exact
      ? command("find", "text", locator.value, "click", "--exact")
      : command("find", "text", locator.value, "click");
  }

  if (locator.method === "css") {
    if (cssOccurrence && cssOccurrence > 1) {
      const script = `(() => {\n  const nodes = Array.from(document.querySelectorAll(${JSON.stringify(locator.value)}));\n  const target = nodes[${cssOccurrence - 1}];\n  if (!target) return \"not-found\";\n  target.click();\n  return \"clicked\";\n})();`;
      return command("eval", script);
    }
    return command("click", locator.value);
  }

  return command("find", "role", locator.role, "click", "--name", locator.name);
}

function parseJobText(text: string): Partial<JobRecord> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const joined = lines.join("\n");
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "");
  const titleIndex = title ? lines.findIndex((line) => line === `# ${title}`) : -1;
  const companyInfoIndex = lines.findIndex((line) => line === "公司基本信息");
  const companyFromInfo = companyInfoIndex >= 0 ? lines[companyInfoIndex + 1] : undefined;

  return {
    title: title || firstMeaningfulLine(lines),
    salary: matchFirst(joined, /(?:\d+\s*-\s*\d+|\d+)\s*K(?:·\d+薪)?|(?:\d+\s*-\s*\d+|\d+)\s*元\/月/i),
    location: titleIndex >= 0
      ? matchFirst(lines.slice(titleIndex, titleIndex + 6).join("\n"), /(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|天津|长沙|郑州|青岛|厦门|合肥|东莞|佛山|宁波|无锡|远程)/)
      : matchFirst(joined, /(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|天津|长沙|郑州|青岛|厦门|合肥|东莞|佛山|宁波|无锡|远程)/),
    experience: matchFirst(joined, /(经验不限|\d+\s*-\s*\d+年|\d+年以上|\d+年以内|在校\/应届)/),
    education: matchFirst(joined, /(学历不限|中专\/中技|高中|大专|本科|硕士|博士)/),
    company: companyFromInfo || findLineAfterKeywords(lines, ["公司", "科技", "网络", "信息", "集团"]),
    recruiter: findLineAfterKeywords(lines.filter((line) => line !== title), ["招聘者", "HR", "人事", "经理", "负责人"])
  };
}

export function extractJobId(url: string) {
  return url.match(/\/job_detail\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/)?.[1];
}

export function cleanJobDetailText(text: string, excludedHeadings: string[]) {
  const headings = excludedHeadings.length > 0
    ? excludedHeadings
    : ["相似职位", "更多相似职位", "精选职位", "看过该职位的人还看了", "城市招聘", "热门职位", "推荐公司", "热门企业"];
  const allLines = text.split(/\r?\n/);
  const headingIndex = allLines.findIndex((line) => {
    const normalized = normalizeJobLine(line);
    return line.trim().startsWith("# ") && !containsExcludedJobHeading(normalized, headings);
  });
  const lines = headingIndex >= 0 ? allLines.slice(headingIndex) : allLines;
  const cleaned: string[] = [];

  for (const line of lines) {
    const normalized = normalizeJobLine(line);
    if (containsExcludedJobHeading(normalized, headings)) break;
    if (isExcludedJobNoise(normalized)) continue;
    if (line.includes(traceMarkerPrefix)) continue;
    cleaned.push(line);
  }

  return `${cleaned.join("\n").trim()}\n`;
}

function normalizeJobLine(line: string) {
  return line.replace(/^[-#\s]+/, "").trim();
}

function containsExcludedJobHeading(line: string, headings: string[]) {
  return headings.some((heading) => line.includes(heading));
}

function isExcludedJobNoise(line: string) {
  return [
    "相似职位",
    "更多相似职位",
    "精选职位",
    "看过该职位的人还看了",
    "城市招聘",
    "热门职位",
    "推荐公司",
    "热门企业",
    "其它公司品牌信息",
    "其他公司品牌信息"
  ].some((keyword) => line.includes(keyword));
}

function firstMeaningfulLine(lines: string[]) {
  return lines.find((line) => line.length >= 2 && line.length <= 40 && !line.includes("BOSS直聘"));
}

function matchFirst(text: string, regex: RegExp) {
  return text.match(regex)?.[0];
}

function findLineAfterKeywords(lines: string[], keywords: string[]) {
  return lines.find((line) =>
    !line.startsWith("#") &&
    keywords.some((keyword) => line.includes(keyword)) &&
    line.length <= 60
  );
}

function looksLikeJobDetail(url: string, config: Config) {
  if (url.includes("/job_detail/")) return true;
  const simplifiedPattern = config.jobDetailUrlPattern.replaceAll("*", "");
  return simplifiedPattern.length > 0 && url.includes(simplifiedPattern);
}

async function writeTraceReport(out: string, traceEvents: TraceEvent[], jobs: JobRecord[]) {
  const lines = [
    "# BOSS Trace Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Events: ${traceEvents.length}`,
    `Jobs: ${jobs.length}`,
    "",
    "## Events",
    "",
    ...traceEvents.map((event) => `- ${event.ts} ${event.step}${event.detail ? ` ${JSON.stringify(event.detail)}` : ""}`),
    "",
    "## Jobs",
    "",
    ...jobs.map((job, index) => `${index + 1}. ${job.title || "(unknown title)"} ${job.salary || ""} ${job.url}`)
  ];
  await writeFile(join(out, "trace-report.md"), `${lines.join("\n")}\n`);
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function safeName(input: string) {
  return input.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function markerCommand(label: string) {
  return command("eval", JSON.stringify(`${traceMarkerPrefix}${label}`));
}

function extractMarkedSegment(output: string, startLabel: string, endLabel: string) {
  const startMarker = `${traceMarkerPrefix}${startLabel}`;
  const endMarker = `${traceMarkerPrefix}${endLabel}`;
  const startIndex = output.indexOf(startMarker);
  if (startIndex < 0) return "";

  const segmentStart = output.indexOf("\n", startIndex);
  const endIndex = output.indexOf(endMarker, segmentStart >= 0 ? segmentStart : startIndex);
  const rawSegment = output.slice(segmentStart >= 0 ? segmentStart + 1 : startIndex, endIndex >= 0 ? endIndex : undefined);
  return rawSegment
    .split(/\r?\n/)
    .filter((line) => !line.includes(traceMarkerPrefix))
    .join("\n")
    .trim();
}

function returnToChatCommands() {
  return [
    "back",
    "wait --load networkidle",
    "snapshot -i -u -c"
  ];
}

async function agent(config: Config, args: string[], options: { optional?: boolean } = {}) {
  const fullArgs = [...buildAgentBrowserBaseArgs(config.agentBrowser), ...args];
  const result = await run("agent-browser", fullArgs, options.optional);
  return result.stdout;
}

async function runBatch(config: Config, commands: string[], options: { optional?: boolean } = {}) {
  return await agent(config, ["batch", ...commands], options);
}

function command(...parts: string[]) {
  return parts.map(shellQuote).join(" ");
}

function lastUrl(text: string) {
  const standalone = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\/\S+$/.test(line));
  if (standalone.length > 0) return standalone.at(-1) || "";

  const matches = text.match(/https?:\/\/[^\s)"\]]+/g);
  return matches?.at(-1) || "";
}

function lastInteger(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line));
  return Number.parseInt(lines.at(-1) || "0", 10);
}

function lastNonEmptyLine(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("✓"))
    .filter((line) => !line.startsWith("[agent-browser]"))
    .filter((line) => !line.startsWith("- "));
  return lines.at(-1) || "";
}

async function run(command: string, args: string[], optional = false) {
  const displayCommand = [command, ...args.map(shellQuote)].join(" ");
  await appendFile(join(projectRoot, "output", "agent-browser-commands.log"), `${displayCommand}\n`);

  return await new Promise<{ stdout: string; stderr: string }>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || optional) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(new Error(`${displayCommand} failed with code ${code}\n${stderr || stdout}`));
    });
  });
}

function shellQuote(value: string) {
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
