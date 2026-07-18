import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { ChatListEntry, Config } from "../types";
import { command, runBatch } from "../commands";
import { extractChatListEntries, lastUrl } from "../parser";
import { writeSelectorInspection } from "../output/writer";
import { appendSelectorInspectionCommands } from "./target-resolver";
import { projectRoot } from "../runtime";

export type CollectFullChatListOptions = {
  skipOpen?: boolean;
  includeSelectorInspection?: boolean;
};

export async function collectFullChatList(
  config: Config,
  out: string,
  trace: (step: string, detail?: unknown) => Promise<void>,
  chatUrl: string,
  options: CollectFullChatListOptions = {}
): Promise<{ rawTextFile: string; entries: ChatListEntry[] }> {
  const scrolls = Math.max(0, config.chatListScrolls);
  const scrollPixels = Math.max(100, config.chatListScrollPixels);
  const commands: string[] = [];

  if (!options.skipOpen) {
    commands.push(command("open", chatUrl));
    commands.push("wait --load networkidle");
  }

  commands.push("get url");
  commands.push("get title");
  commands.push("snapshot -i -u -c");

  for (let i = 0; i < scrolls; i++) {
    commands.push(command("scroll", "down", String(scrollPixels)));
    commands.push("wait 300");
    commands.push("snapshot -i -u -c");
  }

  const selectorProbes = options.includeSelectorInspection
    ? appendSelectorInspectionCommands(commands, config, "chat-list")
    : [];

  await trace("collect-full-chat-list", { scrolls, scrollPixels, skipOpen: options.skipOpen });
  const output = await runBatch(config, commands, { optional: true });
  await writeFile(join(out, "snapshots", "chat-list-full.txt"), output);
  await writeFile(join(out, "raw", "chat-list-full.txt"), output);
  if (selectorProbes.length > 0) {
    await writeSelectorInspection(config, out, output, selectorProbes, trace, "chat-list");
  }

  const entries = extractChatListEntries(output);
  await trace("chat-list-collected", { count: entries.length });
  return { rawTextFile: join(config.outputDir, "raw", "chat-list-full.txt"), entries };
}

export async function openChatPage(
  config: Config,
  chatUrl: string,
  trace: (step: string, detail?: unknown) => Promise<void>
): Promise<string> {
  await trace("browser-open", { url: chatUrl });
  const output = await runBatch(
    config,
    [
      command("open", chatUrl),
      "wait --load networkidle",
      "get url",
      "get title",
      "snapshot -i -u -c"
    ],
    { optional: true }
  );
  await trace("browser-opened", { url: lastUrl(output) || chatUrl });
  return output;
}
