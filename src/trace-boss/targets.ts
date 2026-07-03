import type { Config, Locator, RuntimeTraceTarget, TraceTargetConfig } from "./types";
import { command, markerCommand } from "./commands";

export function resolveTraceTargets(config: Config, conversationLocators: Locator[]): RuntimeTraceTarget[] {
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

export function limitJobLocators(config: Config, target?: TraceTargetConfig) {
  const locators = target?.jobEntryLocators?.length
    ? target.jobEntryLocators
    : config.jobEntryLocators;
  if (locators.length === 0) {
    throw new Error("每个 trace target 至少需要一个岗位入口 locator");
  }

  // Normal flow only accepts the first current-session-bound job locator per target.
  return locators.slice(0, 1);
}

export function locatorSignature(locator: Locator) {
  if (locator.method === "find-text") {
    return `${locator.method}:${locator.value}:${locator.exact ? "exact" : "contains"}`;
  }

  if (locator.method === "role") {
    return `${locator.method}:${locator.role}:${locator.name}`;
  }

  return `${locator.method}:${locator.value}`;
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

export function safeLabel(value: string, index: number) {
  return safeName(value) || `target-${index}`;
}

function safeName(input: string) {
  return input.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}
