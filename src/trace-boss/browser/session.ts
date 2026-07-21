import type { AccountSwitchContext, ChatListEntry, Config } from "../types";
import { extractChatListEntries, lastUrl } from "../parser";
import { AccountSwitcher } from "../auth/account-switcher";
import { command, runBatch } from "../commands";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export class BrowserSession {
  async setup(
    config: Config,
    out: string,
    chatUrl: string,
    trace: (step: string, detail?: unknown) => Promise<void>
  ): Promise<{ entries: ChatListEntry[] }> {
    const switchCtx: AccountSwitchContext = { config, chatUrl, trace };
    const switcher = new AccountSwitcher();
    const switchResult = await switcher.switch(switchCtx);

    const batchResult = await runSetupBatch(config, out, chatUrl, switchResult.requiresLogin, trace);

    await trace("setup-complete", { entryCount: batchResult.entries.length });
    return { entries: batchResult.entries };
  }
}

async function runSetupBatch(
  config: Config,
  out: string,
  chatUrl: string,
  requiresLogin: boolean,
  trace: (step: string, detail?: unknown) => Promise<void>
): Promise<{ output: string; entries: ChatListEntry[] }> {
  const scrolls = Math.max(0, config.chatListScrolls);
  const scrollPixels = Math.max(100, config.chatListScrollPixels);
  const commands: string[] = [command("open", chatUrl), "wait --load networkidle"];

  if (requiresLogin) {
    console.log(`[login] 当前页面若未登录会被重定向到登录页，脚本将等待登录成功（超时 ${config.account?.loginTimeoutMs ?? 120000}ms）...`);
    await trace("login-required", { reason: "browser redirected to login page", timeoutMs: config.account?.loginTimeoutMs ?? 120000 });
    commands.push(command("wait", "--url", "**/web/geek/chat"));
  }

  commands.push("get url", "get title", "snapshot -i -u -c");

  for (let i = 0; i < scrolls; i++) {
    commands.push(command("scroll", "down", String(scrollPixels)));
    commands.push("wait 300");
    commands.push("snapshot -i -u -c");
  }

  const env: Record<string, string> | undefined = requiresLogin
    ? { AGENT_BROWSER_DEFAULT_TIMEOUT: String(config.account?.loginTimeoutMs ?? 120000) }
    : undefined;

  await trace("setup-batch-start", { scrolls, requiresLogin, timeoutMs: env ? env.AGENT_BROWSER_DEFAULT_TIMEOUT : undefined });
  const output = await runBatch(config, commands, { optional: true, env });
  await trace("setup-batch-end", { outputLength: output.length });

  await writeFile(join(out, "snapshots", "chat-list-full.txt"), output);
  await writeFile(join(out, "raw", "chat-list-full.txt"), output);

  const currentUrl = lastUrl(output) || "";
  if (requiresLogin && !currentUrl.includes("/web/geek/chat")) {
    const reason = output.includes("timed out") ? "等待登录超时" : "登录后未到达 chat 页面";
    throw new Error(`${reason}: currentUrl=${currentUrl}`);
  }

  const entries = extractChatListEntries(output);
  await trace("chat-list-collected", { count: entries.length });
  return { output, entries };
}
