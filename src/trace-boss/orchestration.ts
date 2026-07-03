import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatListEntry, ChatRecord, Config, JobRecord, Locator, TraceEvent } from "./types";
import { projectRoot } from "./runtime";
import { command, locatorToClickCommand, markerCommand, returnToChatCommands, runBatch } from "./commands";
import { resolveTraceTargets, safeLabel, appendSelectorInspectionCommands } from "./targets";
import {
  cleanJobDetailText,
  extractChatListEntries,
  extractJobId,
  extractMarkedSegment,
  extractSectionText,
  extractSkillTags,
  extractSkillChipLines,
  extractSkillTermsFromText,
  lastNonEmptyLine,
  lastUrl,
  isRecommendedJobUrl,
  looksLikeJobDetail,
  normalizeJobLine,
  parseJobText
} from "./parser";
import { writeSelectorInspection } from "./output";

export async function collectFullChatList(
  config: Config,
  out: string,
  trace: (step: string, detail?: unknown) => Promise<void>,
  includeSelectorInspection = false,
  chatUrl: string
): Promise<{ rawTextFile: string; entries: ChatListEntry[] }> {
  const scrolls = Math.max(0, config.chatListScrolls);
  const scrollPixels = Math.max(100, config.chatListScrollPixels);
  const commands = [
    command("open", chatUrl),
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

export async function runSingleSessionTraceFlow(
  config: Config,
  out: string,
  discoveredEntries: ChatListEntry[],
  conversationLocators: Locator[],
  trace: (step: string, detail?: unknown) => Promise<void>,
  includeSelectorInspection = false
) {
  const targets = resolveTraceTargets(config, discoveredEntries, conversationLocators);
  const scrolls = Math.max(0, config.chatListScrolls);
  const scrollPixels = Math.max(100, config.chatListScrollPixels);
  const jobDetailScrollPixels = Math.max(600, Math.floor(scrollPixels * 2 / 3));
  const commands: string[] = [];

  for (let i = 0; i < scrolls; i++) {
    commands.push(command("scroll", "up", String(scrollPixels)));
    commands.push("wait 150");
  }
  if (scrolls > 0) {
    commands.push("snapshot -i -u -c");
  }

  commands.push(markerCommand("target-phase-start"));
  commands.push("get url");
  commands.push("get title");
  commands.push("snapshot -i -u -c");

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
      commands.push(markerCommand(`${jobLabel}-start`));
      commands.push("get url");
      commands.push("get title");
      commands.push("snapshot -i -u -c");
      commands.push("read");
      if (screenshotFile) {
        commands.push(command("screenshot", join(projectRoot, screenshotFile)));
      }
      commands.push(command("scroll", "down", String(jobDetailScrollPixels)));
      commands.push("wait 250");
      commands.push("snapshot -i -u -c");
      commands.push("read");
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
  const provenanceCounts = targets.reduce(
    (counts, target) => {
      const provenance = target.targetProvenance || "fallback";
      counts[provenance] += 1;
      return counts;
    },
    { discovered: 0, fallback: 0, "config-only": 0 } as Record<"discovered" | "fallback" | "config-only", number>
  );

  for (const target of targets) {
    if (target.targetProvenance !== "config-only") continue;

    await trace("trace-target-not-found", {
      target_id: target.target_id,
      conversationLocator: target.conversationLocator,
      targetProvenance: target.targetProvenance,
      message: "config target not found in discovered chat-list coverage; preserved as config-only compatibility evidence"
    });
  }

  await trace("single-session-flow-start", {
    steps: [
      "scroll-list-back",
      "click-contact",
      "collect-chat",
      "click-current-session-bound-job",
      "collect-one-job",
      "capture-job-detail-beyond-first-viewport",
      "return-to-chat-with-browser-back"
    ],
    discoveredCount: discoveredEntries.length,
    scrolls,
    scrollPixels,
    jobDetailScrollPixels,
    targetCount: targets.length,
    plannedJobAttempts,
    provenanceCounts,
    includeSelectorInspection,
    targets: targets.map((target) => ({
      target_id: target.target_id,
      leftIndex: target.leftIndex,
      targetProvenance: target.targetProvenance,
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
      leftIndex: target.leftIndex,
      targetProvenance: target.targetProvenance,
      contactLocator: target.conversationLocator,
      collectedAt: new Date().toISOString(),
      rawTextFile: chatRawFile,
      snapshotFile: chatSnapshotFile
    };
    chats.push(chat);

    await trace("chat-collected", {
      target_id: target.target_id,
      leftIndex: target.leftIndex,
      targetProvenance: target.targetProvenance,
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
          leftIndex: target.leftIndex,
          targetProvenance: target.targetProvenance,
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
          leftIndex: target.leftIndex,
          targetProvenance: target.targetProvenance,
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

      if (isRecommendedJobUrl(currentUrl)) {
        await writeFile(join(projectRoot, jobRawFile), jobSegment);
        await trace("job-not-collected", {
          target_id: target.target_id,
          leftIndex: target.leftIndex,
          targetProvenance: target.targetProvenance,
          jobAttempt: jobNumber,
          reason: "命中推荐岗位 URL，跳过非当前会话绑定的岗位入口",
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
          leftIndex: target.leftIndex,
          targetProvenance: target.targetProvenance,
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

      const jobLines = jobSegment
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const rawDescriptionText = extractSectionText(
        jobLines,
        ["职位描述"],
        ["竞争力分析", "BOSS 安全提示", "工商信息", "工作地址", "更多职位", "精选职位"]
      );
      const descriptionText = rawDescriptionText;
      const rawSkillChipText = extractSkillChipLines(jobLines).join("\n");
      const chipSkills = rawSkillChipText.length > 0 ? extractSkillTags(rawSkillChipText) : [];
      const termSkills = extractSkillTermsFromText(descriptionText || rawDescriptionText);
      const skills = [...new Set([...chipSkills, ...termSkills])];
      const supplementalBlock = [
        descriptionText ? `职位描述\n${descriptionText}` : "",
        skills.length > 0 ? `技能标签\n${skills.join("\n")}` : ""
      ].filter(Boolean).join("\n\n");
      const augmentedJobSegment = injectSupplementBeforeNoise(
        jobSegment,
        supplementalBlock,
        config.excludedJobSectionHeadings
      );

      const duplicateKey = `${target.target_id}:${jobId}`;
      if (seenJobs.has(duplicateKey)) {
        await trace("job-duplicate-skipped", {
          target_id: target.target_id,
          leftIndex: target.leftIndex,
          targetProvenance: target.targetProvenance,
          jobAttempt: jobNumber,
          job_id: jobId,
          url: currentUrl,
          jobLocator
        });
        continue;
      }
      seenJobs.add(duplicateKey);

      const cleanJobText = cleanJobDetailText(augmentedJobSegment, config.excludedJobSectionHeadings);
      const resolvedJobRawFile = join(config.outputDir, "raw", `job-${jobId}.txt`);
      const resolvedJobSnapshotFile = join(config.outputDir, "snapshots", `job-detail-${jobId}.txt`);
      await writeFile(join(projectRoot, resolvedJobRawFile), cleanJobText);
      await writeFile(join(projectRoot, resolvedJobSnapshotFile), cleanJobText);

      const parsedJob = parseJobText(cleanJobText);
      const job: JobRecord = {
        ...parsedJob,
        skills: skills.length > 0 ? skills : parsedJob.skills,
        target_id: target.target_id,
        leftIndex: target.leftIndex,
        targetProvenance: target.targetProvenance,
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
      break;
    }
  }

  return {
    chatList: { rawTextFile: join(config.outputDir, "raw", "chat-list-full.txt"), entries: discoveredEntries },
    chats,
    jobs
  };
}

function injectSupplementBeforeNoise(text: string, supplement: string, excludedHeadings: string[]) {
  if (!supplement) return text;

  const lines = text.split(/\r?\n/);
  const firstExcludedIndex = lines.findIndex((line) => {
    const normalized = normalizeJobLine(line);
    return excludedHeadings.some((heading) => normalized.includes(heading));
  });
  if (firstExcludedIndex < 0) {
    return [text, supplement].filter(Boolean).join("\n\n");
  }

  const beforeNoise = lines.slice(0, firstExcludedIndex).join("\n");
  const noiseTail = lines.slice(firstExcludedIndex).join("\n");
  return [beforeNoise, supplement, noiseTail].filter(Boolean).join("\n\n");
}
