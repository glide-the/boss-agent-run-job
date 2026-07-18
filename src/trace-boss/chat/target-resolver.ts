import type { ChatListEntry, Config, Locator, RuntimeTraceTarget, TraceTargetConfig } from "../types";
import { command, markerCommand } from "../commands";

export function resolveTraceTargets(
  config: Config,
  discoveredEntries: ChatListEntry[],
  compatibilityLocators: Locator[] = []
): RuntimeTraceTarget[] {
  const targets: RuntimeTraceTarget[] = discoveredEntries.map((entry) => ({
    target_id: `chat-list-target-${entry.leftIndex}`,
    description: entry.text,
    leftIndex: entry.leftIndex,
    targetProvenance: "discovered" as const,
    conversationLocator: {
      method: "find-text",
      value: entry.text
    },
    jobEntryLocators: limitJobLocators(config)
  }));

  const claimedTargetIndexes = new Set<number>();

  for (const target of config.traceTargets || []) {
    const matchIndex = findMatchingTargetIndex(targets, target.conversationLocator, claimedTargetIndexes);
    if (matchIndex >= 0) {
      const matchedTarget = targets[matchIndex];
      targets[matchIndex] = {
        ...matchedTarget,
        target_id: target.id?.trim() || matchedTarget.target_id,
        description: target.description || matchedTarget.description,
        jobEntryLocators: limitJobLocators(config, target)
      };
      claimedTargetIndexes.add(matchIndex);
      continue;
    }

    targets.push({
      target_id: target.id?.trim() || `config-only-target-${targets.length + 1}`,
      description: target.description,
      leftIndex: undefined,
      targetProvenance: "config-only",
      conversationLocator: target.conversationLocator,
      jobEntryLocators: limitJobLocators(config, target)
    });
  }

  for (const locator of compatibilityLocators) {
    if (targets.some((target) => locatorMatchesTarget(target, locator))) continue;

    targets.push({
      target_id: `fallback-target-${targets.length + 1}`,
      description: undefined,
      leftIndex: undefined,
      targetProvenance: "fallback",
      conversationLocator: locator,
      jobEntryLocators: limitJobLocators(config)
    });
  }

  return targets;
}

export function limitJobLocators(config: Config, target?: TraceTargetConfig) {
  const locators = target?.jobEntryLocators?.length
    ? target.jobEntryLocators
    : config.jobEntryLocators;
  if (locators.length === 0) {
    throw new Error("每个 trace target 至少需要一个岗位入口 locator");
  }
  return [...locators];
}

export function locatorSignature(locator: Locator) {
  if (locator.method === "find-text") {
    return `${locator.method}:${locator.value}:${locator.exact ? "exact" : "contains"}`;
  }
  if (locator.method === "dom-text") {
    return `${locator.method}:${locator.value}:${locator.exact ? "exact" : "contains"}`;
  }
  if (locator.method === "role") {
    return `${locator.method}:${locator.role}:${locator.name}`;
  }
  return `${locator.method}:${locator.value}`;
}

export function safeLabel(value: string, index: number) {
  return safeName(value) || `target-${index}`;
}

export function appendSelectorInspectionCommands(commands: string[], config: Config, context: string) {
  const selectorGroups: Record<string, string[]> = {
    chatArea: config.chatAreaSelectors,
    conversationList: config.conversationListSelectors,
    currentChat: config.currentChatSelectors,
    jobCards: config.jobCardSelectors,
    jobDetailLinks: config.jobDetailLinkSelectors
  };

  const contextLabel = safeName(context) || "inspection";
  const probes = [];
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

function findMatchingTargetIndex(
  targets: RuntimeTraceTarget[],
  locator: Locator,
  claimedTargetIndexes: Set<number>
) {
  for (let i = 0; i < targets.length; i++) {
    if (claimedTargetIndexes.has(i)) continue;
    if (locatorMatchesTarget(targets[i], locator)) return i;
  }
  return -1;
}

function locatorMatchesTarget(target: RuntimeTraceTarget, locator: Locator) {
  if (target.conversationLocator.method === "find-text" && locator.method === "find-text") {
    const targetText = target.conversationLocator.value;
    return targetText.includes(locator.value) || locator.value.includes(targetText);
  }
  if (locatorSignature(target.conversationLocator) === locatorSignature(locator)) {
    return true;
  }
  if (target.description && locator.method === "find-text") {
    return target.description.includes(locator.value);
  }
  return false;
}

function safeName(input: string) {
  return input.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}
