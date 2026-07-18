import type { AccountSwitchContext, ChatListEntry, Config } from "../types";
import { lastUrl } from "../parser";
import { AccountSwitcher } from "../auth/account-switcher";
import { LoginWaiter } from "../auth/login-waiter";
import { collectFullChatList, openChatPage } from "../chat/chat-list-collector";

export class BrowserSession {
  async setup(
    config: Config,
    out: string,
    chatUrl: string,
    trace: (step: string, detail?: unknown) => Promise<void>
  ): Promise<{ entries: ChatListEntry[] }> {
    const openOutput = await openChatPage(config, chatUrl, trace);
    const currentUrl = lastUrl(openOutput) || chatUrl;
    const onLoginPage = /\/web\/user\/?/.test(currentUrl) || /\/login\/?/.test(currentUrl);
    if (onLoginPage) {
      console.log(`[login] 当前页面是登录页 (${currentUrl})，请先在浏览器中完成登录/切换账号。脚本将等待登录成功...`);
      await trace("login-required", { currentUrl, reason: "browser redirected to login page" });
    }

    const switchCtx: AccountSwitchContext = { config, chatUrl, trace };
    const switcher = new AccountSwitcher();
    const switchResult = await switcher.switch(switchCtx);

    if (switchResult.requiresLogin || onLoginPage) {
      const waiter = new LoginWaiter(switchCtx);
      const loginResult = await waiter.wait();
      if (!loginResult.loggedIn) {
        throw new Error(`登录未在超时内完成: ${loginResult.evidence}`);
      }
    }

    const chatList = await collectFullChatList(config, out, trace, chatUrl, { skipOpen: true });
    return chatList;
  }
}
