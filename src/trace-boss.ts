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
  conversationEntryLocators?: Locator[];
  jobEntryLocators: Locator[];
  jobInfoSelectors: Record<string, string[]>;
  excludedJobSectionHeadings: string[];
  returnToChat?: { method: "open-start-url" | "browser-back" };
  fieldHints?: Record<string, string[]>;
};

type TraceEvent = {
  ts: string;
  step: string;
  detail?: unknown;
};

type JobRecord = {
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
  contactLocator?: Locator;
  collectedAt: string;
  rawTextFile: string;
  snapshotFile: string;
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

  const chatList = await collectFullChatList(config, out, trace);
  await writeJson(join(out, "chat-list.json"), chatList.entries);
  if (inspectSelectors) {
    await inspectKnownAreas(config, trace);
  }

  if (dryRun) {
    await trace("dry-run-stop", {
      message: "已打开 chat 页面并保存 snapshot/read；未点击岗位入口。",
      next: "查看 output/snapshots/chat-list-full.txt、output/raw/chat-list-full.txt 和 output/chat-list.json 后微调 config/boss.config.json。"
    });
    await writeTraceReport(out, traceEvents, jobs);
    return;
  }

  const conversationLocators = config.conversationEntryLocators || [];
  if (conversationLocators.length === 0) {
    await trace("no-conversation-locator", {
      message: "config.boss.config.json 需要配置 conversationEntryLocators，流程应先从 chat 列表点击联系人。"
    });
  }

  for (let i = 0; i < conversationLocators.length; i++) {
    const result = await runSingleContactJobFlow(config, out, i + 1, conversationLocators[i], trace);
    chats.push(result.chat);
    await writeJson(join(out, "chats.json"), chats);

    if (result.job) {
      jobs.push(result.job);
      await writeJson(join(out, "jobs.json"), jobs);
      await trace("job-collected", result.job);
    }
  }

  await writeTraceReport(out, traceEvents, jobs);
  await trace("done", { jobCount: jobs.length });
}

async function loadConfig(): Promise<Config> {
  const configPath = join(projectRoot, "config", "boss.config.json");
  const text = await readFile(configPath, "utf8");
  return JSON.parse(text) as Config;
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
  trace: (step: string, detail?: unknown) => Promise<void>
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

  await trace("collect-full-chat-list", { scrolls, scrollPixels });
  const output = await runBatch(config, commands, { optional: true });
  await writeFile(join(out, "snapshots", "chat-list-full.txt"), output);
  await writeFile(join(out, "raw", "chat-list-full.txt"), output);

  const entries = extractChatListEntries(output);
  await trace("chat-list-collected", { count: entries.length });
  return { rawTextFile: join(config.outputDir, "raw", "chat-list-full.txt"), entries };
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

async function runSingleContactJobFlow(
  config: Config,
  out: string,
  index: number,
  conversationLocator: Locator,
  trace: (step: string, detail?: unknown) => Promise<void>
): Promise<{ chat: ChatRecord; job?: JobRecord }> {
  const jobLocator = config.jobEntryLocators[0];
  if (!jobLocator) {
    throw new Error("config.jobEntryLocators 至少需要一个岗位入口 locator");
  }

  const flowRawFile = join(config.outputDir, "raw", `flow-${index}.txt`);
  const chatRawFile = join(config.outputDir, "raw", `chat-${index}.txt`);
  const chatSnapshotFile = join(config.outputDir, "snapshots", `chat-contact-${index}.txt`);
  const jobRawFile = join(config.outputDir, "raw", `job-${index}.txt`);
  const jobSnapshotFile = join(config.outputDir, "snapshots", `job-detail-${index}.txt`);
  const screenshotFile = config.screenshot ? join(config.outputDir, "screenshots", `job-${index}.png`) : undefined;

  await trace("single-flow-start", {
    index,
    steps: ["open-chat", "click-contact", "collect-chat", "click-job", "collect-job"],
    conversationLocator,
    jobLocator
  });

  const commands = [
    command("open", chatUrl(config)),
    "wait --load networkidle",
    "get url",
    "get title",
    "snapshot -i -u -c",
    locatorToClickCommand(conversationLocator),
    "wait --load networkidle",
    "get url",
    "get title",
    "snapshot -i -u -c",
    "read",
    locatorToClickCommand(jobLocator),
    "wait --load networkidle",
    command("wait", "--url", config.jobDetailUrlPattern),
    "get url",
    "get title",
    "snapshot -i -u -c",
    "read",
    ...(screenshotFile ? [command("screenshot", join(projectRoot, screenshotFile))] : [])
  ];

  const output = await runBatch(config, commands, { optional: true });
  await writeFile(join(projectRoot, flowRawFile), output);
  await writeFile(join(projectRoot, chatRawFile), output);
  await writeFile(join(projectRoot, chatSnapshotFile), output);

  const currentUrl = lastUrl(output);
  const currentTitle = lastNonEmptyLine(output.replace(currentUrl || "", ""));
  const chat: ChatRecord = {
    contactLocator: conversationLocator,
    collectedAt: new Date().toISOString(),
    rawTextFile: chatRawFile,
    snapshotFile: chatSnapshotFile
  };

  await trace("chat-collected", {
    index,
    contactLocator: conversationLocator,
    rawTextFile: chatRawFile,
    snapshotFile: chatSnapshotFile
  });

  if (!looksLikeJobDetail(currentUrl, config)) {
    await trace("job-not-collected", {
      index,
      reason: "点击岗位入口后未进入 job_detail URL",
      currentUrl,
      currentTitle,
      jobLocator,
      flowRawFile
    });
    return { chat };
  }

  const jobId = extractJobId(currentUrl);
  const cleanJobText = cleanJobDetailText(output, config.excludedJobSectionHeadings);
  const resolvedJobRawFile = jobId ? join(config.outputDir, "raw", `job-${jobId}.txt`) : jobRawFile;
  const resolvedJobSnapshotFile = jobId ? join(config.outputDir, "snapshots", `job-detail-${jobId}.txt`) : jobSnapshotFile;
  await writeFile(join(projectRoot, resolvedJobRawFile), cleanJobText);
  await writeFile(join(projectRoot, resolvedJobSnapshotFile), cleanJobText);

  return {
    chat,
    job: {
      ...parseJobText(cleanJobText),
      job_id: jobId || safeName(currentUrl),
      url: currentUrl,
      collectedAt: new Date().toISOString(),
      rawTextFile: resolvedJobRawFile,
      snapshotFile: resolvedJobSnapshotFile,
      screenshotFile
    }
  };
}

async function inspectKnownAreas(
  config: Config,
  trace: (step: string, detail?: unknown) => Promise<void>
) {
  const selectorGroups: Record<string, string[]> = {
    chatArea: config.chatAreaSelectors,
    conversationList: config.conversationListSelectors,
    currentChat: config.currentChatSelectors,
    jobCards: config.jobCardSelectors,
    jobDetailLinks: config.jobDetailLinkSelectors
  };

  for (const [group, selectors] of Object.entries(selectorGroups)) {
    for (const selector of selectors) {
      const countText = await runBatch(config, [
        command("open", chatUrl(config)),
        "wait --load networkidle",
        command("get", "count", selector)
      ], { optional: true });
      const count = lastInteger(countText);
      await trace("selector-count", { group, selector, count: Number.isFinite(count) ? count : 0 });
    }
  }
}

function locatorToClickCommand(locator: Locator) {
  if (locator.method === "find-text") {
    return locator.exact
      ? command("find", "text", locator.value, "click", "--exact")
      : command("find", "text", locator.value, "click");
  }

  if (locator.method === "css") {
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

function extractJobId(url: string) {
  return url.match(/\/job_detail\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/)?.[1];
}

function cleanJobDetailText(text: string, excludedHeadings: string[]) {
  const headings = excludedHeadings.length > 0
    ? excludedHeadings
    : ["相似职位", "更多相似职位", "精选职位", "看过该职位的人还看了", "城市招聘", "热门职位", "推荐公司", "热门企业"];
  const allLines = text.split(/\r?\n/);
  const headingIndex = findLastLineIndex(allLines, (line) => line.trim().startsWith("# "));
  const lines = headingIndex >= 0 ? allLines.slice(headingIndex) : allLines;
  const cleaned: string[] = [];

  for (const line of lines) {
    const normalized = line.replace(/^[-#\s]+/, "").trim();
    if (headings.some((heading) => normalized.includes(heading))) break;
    if (isExcludedJobNoise(normalized)) continue;
    cleaned.push(line);
  }

  return `${cleaned.join("\n").trim()}\n`;
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

function findLastLineIndex(lines: string[], predicate: (line: string) => boolean) {
  for (let index = lines.length - 1; index >= 0; index--) {
    if (predicate(lines[index])) return index;
  }
  return -1;
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
