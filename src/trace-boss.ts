import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { buildAgentBrowserBaseArgs, validateAgentBrowserConfig } from "./trace-boss/commands";
import { runSingleSessionTraceFlow } from "./trace-boss/orchestration";
import { BrowserSession } from "./trace-boss/browser/session";
import { TraceEventTracker } from "./trace-boss/trace/event-tracker";
import { projectRoot } from "./trace-boss/runtime";
import type { Config } from "./trace-boss/types";
import { ensureOutputDirs, writeJson, writeTraceReport } from "./trace-boss/output/writer";

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

  const tracker = new TraceEventTracker(out);
  const trace = tracker.trace.bind(tracker);

  const baseArgs = buildAgentBrowserBaseArgs(config.agentBrowser);
  await printRunParameters(config, out, baseArgs);

  const chatUrl = config.chatUrl || config.startUrl || "https://www.zhipin.com/web/geek/chat";

  const session = new BrowserSession();
  const chatList = await session.setup(config, out, chatUrl, trace);
  await writeJson(join(out, "chat-list.json"), chatList.entries);

  if (dryRun) {
    await trace("dry-run-stop", {
      message: "已打开 chat 页面、完成账号切换/登录等待并保存 chat list snapshot；未点击岗位入口。",
      next: "查看 output/snapshots/chat-list-full.txt、output/raw/chat-list-full.txt 和 output/chat-list.json 后微调 config/boss.config.json。"
    });
    await trace("done", { jobCount: 0 });
    await writeTraceReport(out, tracker.getEvents(), []);
    return;
  }

  const result = await runSingleSessionTraceFlow(
    config,
    out,
    chatList.entries,
    config.conversationEntryLocators || [],
    trace,
    inspectSelectors
  );
  await writeJson(join(out, "chat-list.json"), result.chatList.entries);
  await writeJson(join(out, "chats.json"), result.chats);
  await writeJson(join(out, "jobs.json"), result.jobs);

  await trace("done", { jobCount: result.jobs.length });
  await writeTraceReport(out, tracker.getEvents(), result.jobs);
}

async function loadConfig(): Promise<Config> {
  const configPath = join(projectRoot, "config", "boss.config.json");
  const text = await readFile(configPath, "utf8");
  const config = JSON.parse(text) as Config;
  validateAgentBrowserConfig(config.agentBrowser);
  return config;
}

async function printRunParameters(
  config: Config,
  outputDir: string,
  agentBrowserBaseArgs: string[]
) {
  const parameters = {
    cliArgs,
    dryRun,
    noScreenshot,
    inspectSelectors,
    projectRoot,
    configFile: join(projectRoot, "config", "boss.config.json"),
    chatUrl: config.chatUrl || config.startUrl,
    startUrl: config.startUrl,
    chatListScrolls: config.chatListScrolls,
    chatListScrollPixels: config.chatListScrollPixels,
    outputDir,
    extensions: config.agentBrowser.extensions,
    state: config.agentBrowser.state,
    headed: config.agentBrowser.headed,
    agentBrowserBaseArgs,
    account: config.account,
    perContactChain: config.perContactChain,
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
