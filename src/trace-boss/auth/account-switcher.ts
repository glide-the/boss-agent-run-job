import type { AccountSwitchContext, AccountSwitchResult, AccountSwitchStrategy, Locator } from "../types";
import { command, locatorToClickCommand } from "../commands";
import { runBatch } from "../commands";

export interface IAccountSwitchStrategy {
  readonly name: AccountSwitchStrategy;
  execute(ctx: AccountSwitchContext): Promise<AccountSwitchResult>;
}

export class ClickLocatorStrategy implements IAccountSwitchStrategy {
  readonly name = "click-locator" as const;

  async execute(ctx: AccountSwitchContext): Promise<AccountSwitchResult> {
    const locator = ctx.config.account?.switchLocator;
    if (!locator) {
      return {
        switched: false,
        requiresLogin: false,
        evidence: "account.switchLocator missing for click-locator strategy"
      };
    }
    await ctx.trace("account-switch-click", { locator });
    const output = await runBatch(
      ctx.config,
      [
        locatorToClickCommand(locator),
        "wait --load networkidle",
        "get url",
        "get title",
        "snapshot -i -u -c"
      ],
      { optional: true }
    );
    return {
      switched: true,
      requiresLogin: ctx.config.account?.waitForLogin ?? true,
      evidence: output.slice(0, 500)
    };
  }
}

export class OpenUrlStrategy implements IAccountSwitchStrategy {
  readonly name = "open-url" as const;

  async execute(ctx: AccountSwitchContext): Promise<AccountSwitchResult> {
    const url = ctx.config.account?.switchUrl || ctx.chatUrl;
    await ctx.trace("account-switch-open-url", { url });
    const output = await runBatch(
      ctx.config,
      [
        command("open", url),
        "wait --load networkidle",
        "get url",
        "get title",
        "snapshot -i -u -c"
      ],
      { optional: true }
    );
    return {
      switched: true,
      requiresLogin: ctx.config.account?.waitForLogin ?? true,
      evidence: output.slice(0, 500)
    };
  }
}

export class NoOpStrategy implements IAccountSwitchStrategy {
  readonly name = "none" as const;

  async execute(ctx: AccountSwitchContext): Promise<AccountSwitchResult> {
    await ctx.trace("account-switch-noop", { reason: "strategy is none or disabled" });
    return {
      switched: false,
      requiresLogin: false,
      evidence: "account switch disabled by strategy none"
    };
  }
}

export class ManualStrategy implements IAccountSwitchStrategy {
  readonly name = "manual" as const;

  async execute(ctx: AccountSwitchContext): Promise<AccountSwitchResult> {
    console.log("[account-switch] 手动策略：请在已打开的 Chrome 窗口中切换/登录账号，脚本会等待登录成功后继续。");
    await ctx.trace("account-switch-manual", {
      reason: "waiting for user to switch account manually in the browser",
      waitForLogin: ctx.config.account?.waitForLogin ?? true
    });
    return {
      switched: true,
      requiresLogin: ctx.config.account?.waitForLogin ?? true,
      evidence: "manual account switch: user is expected to change account in the browser before login wait"
    };
  }
}

export class AccountSwitcher {
  private readonly strategies: Map<AccountSwitchStrategy, IAccountSwitchStrategy> = new Map();
  private readonly defaultStrategy: IAccountSwitchStrategy = new NoOpStrategy();

  constructor() {
    this.register(new ClickLocatorStrategy());
    this.register(new OpenUrlStrategy());
    this.register(new NoOpStrategy());
    this.register(new ManualStrategy());
  }

  register(strategy: IAccountSwitchStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  resolve(ctx: AccountSwitchContext): IAccountSwitchStrategy {
    const strategyName = ctx.config.account?.strategy ?? "none";
    if (ctx.config.account?.enabled === false) {
      return this.defaultStrategy;
    }
    return this.strategies.get(strategyName) ?? this.defaultStrategy;
  }

  async switch(ctx: AccountSwitchContext): Promise<AccountSwitchResult> {
    const strategy = this.resolve(ctx);
    await ctx.trace("account-switch-start", { strategy: strategy.name });
    const result = await strategy.execute(ctx);
    await ctx.trace("account-switch-end", result);
    return result;
  }
}
