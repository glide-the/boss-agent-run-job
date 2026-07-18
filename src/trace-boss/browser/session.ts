import type { AccountSwitchContext, ChatListEntry, Config } from "../types";
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
    await openChatPage(config, chatUrl, trace);
    const switchCtx: AccountSwitchContext = { config, chatUrl, trace };
    const switcher = new AccountSwitcher();
    const switchResult = await switcher.switch(switchCtx);

    if (switchResult.requiresLogin) {
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
