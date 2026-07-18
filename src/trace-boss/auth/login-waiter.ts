import type { AccountSwitchContext, LoginWaitResult } from "../types";
import { command } from "../commands";
import { runBatch } from "../commands";
import { setTimeout } from "node:timers/promises";

export class LoginWaiter {
  private loginPageWarned = false;

  constructor(private readonly ctx: AccountSwitchContext) {}

  async wait(): Promise<LoginWaitResult> {
    const config = this.ctx.config.account;
    if (!config?.waitForLogin) {
      await this.ctx.trace("login-wait-skip", { reason: "account.waitForLogin not enabled" });
      return { loggedIn: true, evidence: "waitForLogin disabled" };
    }

    const timeoutMs = config.loginTimeoutMs ?? 120_000;
    const intervalMs = config.loginPollIntervalMs ?? 3_000;
    const checkUrl = config.loginCheckUrl ?? this.ctx.chatUrl;
    const selectors = config.loginCheckSelectors ?? [".chat-container", ".chat-list", ".friend-list"];
    const startAt = Date.now();

    await this.ctx.trace("login-wait-start", { timeoutMs, intervalMs, checkUrl, selectors });

    while (Date.now() - startAt < timeoutMs) {
      const result = await this.checkOnce(checkUrl, selectors);
      await this.ctx.trace("login-wait-poll", result);
      if (result.loggedIn) {
        return result;
      }
      await setTimeout(intervalMs);
    }

    await this.ctx.trace("login-wait-timeout", { elapsedMs: Date.now() - startAt });
    return {
      loggedIn: false,
      evidence: `login wait timed out after ${Date.now() - startAt}ms`
    };
  }

  private async checkOnce(checkUrl: string, selectors: string[]): Promise<LoginWaitResult> {
    const selectorChecks = selectors.flatMap((selector) => [
      command("get", "count", selector),
      "snapshot -i -u -c"
    ]);

    const loginPagePattern = /\/web\/user\/?|\/login\/?/;

    const output = await runBatch(
      this.ctx.config,
      [
        "get url",
        "get title",
        ...selectorChecks
      ],
      { optional: true }
    );

    const currentUrl = output.match(/^https?:\/\/\S+$/m)?.[0] ?? "";
    if (loginPagePattern.test(currentUrl) && !this.loginPageWarned) {
      this.loginPageWarned = true;
      console.log(`[login] 检测到登录页 ${currentUrl}，请完成登录或切换账号，脚本会继续等待...`);
      await this.ctx.trace("login-page-detected", { currentUrl });
    }

    const urlOk =
      currentUrl.length > 0 &&
      (currentUrl.includes(checkUrl) || checkUrl.includes(currentUrl) || currentUrl.startsWith(checkUrl));

    for (const selector of selectors) {
      const count = this.extractCount(output, selector);
      if (count > 0 && urlOk) {
        return {
          loggedIn: true,
          url: currentUrl,
          evidence: `selector ${selector} count=${count} and url=${currentUrl}`
        };
      }
    }

    return {
      loggedIn: false,
      url: currentUrl,
      evidence: `urlOk=${urlOk}, selectors=${selectors.join(",")}, url=${currentUrl}, output=${output.slice(0, 300)}`
    };
  }

  private extractCount(output: string, selector: string): number {
    const escaped = selector.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const pattern = new RegExp(`get count ${escaped}\\s*\\n\\s*(\\d+)`, "m");
    const match = output.match(pattern);
    return match ? Number.parseInt(match[1], 10) : 0;
  }
}
