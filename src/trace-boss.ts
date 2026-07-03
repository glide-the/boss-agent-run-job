import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  buildAgentBrowserBaseArgs,
  validateAgentBrowserConfig
} from "./trace-boss/commands";
import {
  collectFullChatList,
  runSingleSessionTraceFlow
} from "./trace-boss/orchestration";
import { projectRoot } from "./trace-boss/runtime";
import type {
  ChatRecord,
  Config,
  JobRecord,
  TraceEvent
} from "./trace-boss/types";
import {
  ensureOutputDirs,
  writeJson,
  writeTraceReport
} from "./trace-boss/output";

const cliArgs = process.argv.slice(2);
const dryRun = cliArgs.includes("--dry-run");
const noScreenshot = cliArgs.includes("--no-screenshot");
const inspectSelectors = cliArgs.includes("--inspect-selectors");

async function main() {
  const config = await loadConfig();
  if (noScreenshot) config.screenshot = false;

  const out = join(projectRoot, config.outputDir);
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
  const chatList = await collectFullChatList(
    config,
    out,
    trace,
    inspectSelectors,
    chatUrl(config)
  );
  await writeJson(join(out, "chat-list.json"), chatList.entries);

  if (dryRun) {
    await trace("dry-run-stop", {
      message: "已打开 chat 页面并保存 snapshot/read；未点击岗位入口。",
      next: "查看 output/snapshots/chat-list-full.txt、output/raw/chat-list-full.txt 和 output/chat-list.json 后微调 config/boss.config.json。"
    });
    await trace("done", { jobCount: jobs.length });
    await writeTraceReport(out, traceEvents, jobs);
    return;
  }

  const result = await runSingleSessionTraceFlow(
    config,
    out,
    chatList.entries,
    conversationLocators,
    trace,
    inspectSelectors
  );
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

async function printRunParameters(
  config: Config,
  outputDir: string,
  agentBrowserBaseArgs: string[]
) {
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

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
