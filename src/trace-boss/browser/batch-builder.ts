import { join } from "node:path";
import type { Config, Locator, PerContactChainConfig, RuntimeTraceTarget } from "../types";
import { command, locatorToClickCommand, markerCommand, returnToChatCommands } from "../commands";
import { projectRoot } from "../runtime";
import { safeLabel } from "../chat/target-resolver";

export class PerContactBatchBuilder {
  private target?: RuntimeTraceTarget;
  private chatUrl?: string;
  private returnToChatMethod: "browser-back" | "open-chat-url" = "browser-back";
  private screenshot = false;
  private outputDir = "output";
  private jobDetailScrollPixels = 600;

  withTarget(target: RuntimeTraceTarget): this {
    this.target = target;
    return this;
  }

  withChatUrl(url: string): this {
    this.chatUrl = url;
    return this;
  }

  withReturnToChatMethod(method?: PerContactChainConfig["returnToChatMethod"]): this {
    if (method) this.returnToChatMethod = method;
    return this;
  }

  withScreenshot(enabled: boolean): this {
    this.screenshot = enabled;
    return this;
  }

  withOutputDir(outputDir: string): this {
    this.outputDir = outputDir;
    return this;
  }

  withJobDetailScrollPixels(pixels: number): this {
    this.jobDetailScrollPixels = Math.max(100, pixels);
    return this;
  }

  build(): string[] {
    if (!this.target) throw new Error("PerContactBatchBuilder: target is required");
    const target = this.target;
    const label = safeLabel(target.target_id, 1);
    const commands: string[] = [];

    commands.push(markerCommand(`flow-${label}-start`));
    commands.push(...this.ensureChatPageCommands());
    commands.push(markerCommand(`contact-${label}-start`));
    commands.push(locatorToClickCommand(target.conversationLocator));
    commands.push("wait --load networkidle");
    commands.push("get url");
    commands.push("get title");
    commands.push("snapshot -i -u -c");
    commands.push("read");
    commands.push(markerCommand(`contact-${label}-end`));
    commands.push(markerCommand(`chat-${label}-start`));
    commands.push("get url");
    commands.push("get title");
    commands.push("snapshot -i -u -c");
    commands.push("read");
    commands.push(markerCommand(`chat-${label}-end`));

    const jobLocator = target.jobEntryLocators[0];
    if (jobLocator) {
      const jobLabel = `job-${label}-1`;
      const screenshotFile = this.screenshot
        ? join(this.outputDir, "screenshots", `${jobLabel}.png`)
        : undefined;

      commands.push(markerCommand(`job-${label}-start`));
      commands.push(locatorToClickCommand(jobLocator));
      commands.push("wait --load networkidle");
      commands.push("get url");
      commands.push("get title");
      commands.push("snapshot -i -u -c");
      commands.push("read");
      if (screenshotFile) {
        commands.push(command("screenshot", join(projectRoot, screenshotFile)));
      }
      commands.push(command("scroll", "down", String(this.jobDetailScrollPixels)));
      commands.push("wait 250");
      commands.push("snapshot -i -u -c");
      commands.push("read");
      commands.push(markerCommand(`job-${label}-end`));
    }

    commands.push(...this.returnToChatCommands(label));
    commands.push(markerCommand(`flow-${label}-end`));
    return commands;
  }

  private ensureChatPageCommands(): string[] {
    if (this.returnToChatMethod === "open-chat-url" && this.chatUrl) {
      return [command("open", this.chatUrl), "wait --load networkidle", "snapshot -i -u -c"];
    }
    return [];
  }

  private returnToChatCommands(label: string): string[] {
    if (this.returnToChatMethod === "open-chat-url" && this.chatUrl) {
      return [command("open", this.chatUrl), "wait --load networkidle", "snapshot -i -u -c"];
    }
    return returnToChatCommands();
  }
}
