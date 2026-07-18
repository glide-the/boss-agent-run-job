export type Locator =
  | { method: "find-text"; value: string; exact?: boolean; description?: string }
  | { method: "css"; value: string; description?: string }
  | { method: "role"; role: string; name: string; description?: string }
  | { method: "dom-text"; value: string; exact?: boolean; description?: string };

export type AgentBrowserConfig = {
  extensions: string[];
  state: string;
  headed: boolean;
  executablePath?: string;
  resolveExecutablePath?: boolean;
};

export type TraceTargetConfig = {
  id?: string;
  description?: string;
  conversationLocator: Locator;
  jobEntryLocators?: Locator[];
  maxJobs?: number;
};

export type AccountSwitchStrategy = "click-locator" | "open-url" | "none";

export type AccountConfig = {
  enabled?: boolean;
  strategy?: AccountSwitchStrategy;
  switchLocator?: Locator;
  switchUrl?: string;
  waitForLogin?: boolean;
  loginCheckUrl?: string;
  loginCheckSelectors?: string[];
  loginPollIntervalMs?: number;
  loginTimeoutMs?: number;
};

export type PerContactChainConfig = {
  returnToChatMethod?: "browser-back" | "open-chat-url";
};

export type AccountSwitchContext = {
  config: Config;
  chatUrl: string;
  trace: (step: string, detail?: unknown) => Promise<void>;
};

export type Config = {
  account?: AccountConfig;
  perContactChain?: PerContactChainConfig;
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

export type TraceEvent = {
  ts: string;
  step: string;
  detail?: unknown;
};

export type JobRecord = {
  target_id: string;
  leftIndex?: number;
  targetProvenance?: "discovered" | "fallback" | "config-only";
  job_id: string;
  url: string;
  collectedAt: string;
  title?: string;
  salary?: string;
  location?: string;
  experience?: string;
  education?: string;
  description?: string;
  skills?: string[];
  company?: string;
  company_scale?: string;
  industry?: string;
  recruiter?: string;
  rawTextFile: string;
  snapshotFile?: string;
  screenshotFile?: string;
};

export type ChatListEntry = {
  index: number;
  leftIndex: number;
  text: string;
};

export type ChatRecord = {
  target_id: string;
  leftIndex?: number;
  targetProvenance?: "discovered" | "fallback" | "config-only";
  contactLocator?: Locator;
  collectedAt: string;
  rawTextFile: string;
  snapshotFile: string;
};

export type RuntimeTraceTarget = {
  target_id: string;
  description?: string;
  leftIndex?: number;
  targetProvenance?: "discovered" | "fallback" | "config-only";
  conversationLocator: Locator;
  jobEntryLocators: Locator[];
};

export type SelectorProbe = {
  group: string;
  selector: string;
  startLabel: string;
  endLabel: string;
};

export type AccountSwitchResult = {
  switched: boolean;
  requiresLogin: boolean;
  evidence: string;
};

export type LoginWaitResult = {
  loggedIn: boolean;
  url?: string;
  evidence: string;
};

export type PerContactBatchResult = {
  target: RuntimeTraceTarget;
  chat?: ChatRecord;
  job?: JobRecord;
  failedReason?: string;
  rawOutput: string;
};

export const traceMarkerPrefix = "__BOSS_TRACE_MARKER__:";

export const requiredAgentBrowserConfig: AgentBrowserConfig = {
  extensions: [
    "/Users/dmeck/agent-brower/capsolver-extension",
    "/Users/dmeck/agent-brower/stealth-extension"
  ],
  state: "/Users/dmeck/agent-brower/my-auth.json",
  headed: true
};
