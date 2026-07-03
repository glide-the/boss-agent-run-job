import { expect, test } from "bun:test";
import { resolveTraceTargets } from "./targets";
import type { ChatListEntry, Config } from "./types";

const sampleEntries: ChatListEntry[] = [
  {
    index: 1,
    leftIndex: 1,
    text: "16:35王攀盼上海拔策网络科技招聘者 [已读] 您觉得什么时间合适"
  },
  {
    index: 2,
    leftIndex: 2,
    text: "13:38刘先生衍届数科市场总监刘先生撤回了一条消息"
  }
];

test("resolveTraceTargets builds discovered targets from chat-list coverage", () => {
  const config = baseConfig();

  const targets = resolveTraceTargets(config, sampleEntries);

  expect(targets).toHaveLength(2);
  expect(targets[0]).toMatchObject({
    target_id: "chat-list-target-1",
    leftIndex: 1,
    targetProvenance: "discovered",
    conversationLocator: {
      method: "find-text",
      value: sampleEntries[0].text
    }
  });
  expect(targets[0].jobEntryLocators).toHaveLength(3);
  expect(targets[1]).toMatchObject({
    target_id: "chat-list-target-2",
    leftIndex: 2,
    targetProvenance: "discovered",
    conversationLocator: {
      method: "find-text",
      value: sampleEntries[1].text
    }
  });
});

test("resolveTraceTargets overlays matched config targets and preserves compatibility fallbacks", () => {
  const config = {
    ...baseConfig(),
    traceTargets: [
      {
        id: "target-wang-panpan",
        description: "王攀盼会话内的有限岗位入口采集；同一浏览器 session 内按 locator 顺序尝试，重复 job_id 会被跳过",
        conversationLocator: {
          method: "find-text",
          value: "王攀盼"
        },
        jobEntryLocators: baseConfig().jobEntryLocators
      },
      {
        id: "config-only-target",
        description: "配置兜底目标",
        conversationLocator: {
          method: "find-text",
          value: "不存在的会话"
        },
        jobEntryLocators: baseConfig().jobEntryLocators
      }
    ]
  } as Config;

  const targets = resolveTraceTargets(config, sampleEntries, [
    { method: "find-text", value: "王攀盼" }
  ]);

  expect(targets[0]).toMatchObject({
    target_id: "target-wang-panpan",
    leftIndex: 1,
    targetProvenance: "discovered"
  });
  expect(targets[0].jobEntryLocators).toHaveLength(3);
  expect(targets[1]).toMatchObject({
    target_id: "chat-list-target-2",
    leftIndex: 2,
    targetProvenance: "discovered"
  });
  expect(targets[2]).toMatchObject({
    target_id: "config-only-target",
    leftIndex: undefined,
    targetProvenance: "config-only"
  });
});

test("resolveTraceTargets keeps compatibility locators as fallback when discovery is unavailable", () => {
  const config = baseConfig();

  const targets = resolveTraceTargets(config, [], [
    { method: "find-text", value: "王攀盼" }
  ]);

  expect(targets).toHaveLength(1);
  expect(targets[0]).toMatchObject({
    target_id: "fallback-target-1",
    leftIndex: undefined,
    targetProvenance: "fallback",
    conversationLocator: {
      method: "find-text",
      value: "王攀盼"
    }
  });
});

function baseConfig(): Config {
  return {
    chatUrl: "https://www.zhipin.com/web/geek/chat",
    chatListScrolls: 0,
    chatListScrollPixels: 900,
    waitTimeoutMs: 25000,
    screenshot: false,
    outputDir: "output",
    jobDetailUrlPattern: "**/job_detail/**",
    agentBrowser: {
      extensions: [],
      state: "/tmp/state.json",
      headed: true
    },
    chatAreaSelectors: [],
    conversationListSelectors: [],
    currentChatSelectors: [],
    jobCardSelectors: [],
    jobDetailLinkSelectors: [],
    conversationEntryLocators: [],
    jobEntryLocators: [
      { method: "find-text", value: "职位详情" },
      { method: "find-text", value: "查看职位" },
      { method: "css", value: "a[href*='/job_detail/']" }
    ],
    maxJobsPerTarget: 1,
    jobInfoSelectors: {},
    excludedJobSectionHeadings: [],
    returnToChat: { method: "browser-back" }
  };
}
