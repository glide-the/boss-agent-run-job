import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { ChatRecord, Config, RuntimeTraceTarget } from "../types";
import { extractMarkedSegment } from "../parser";
import { projectRoot } from "../runtime";
import { safeLabel } from "./target-resolver";

export class ChatCollector {
  constructor(private readonly config: Config) {}

  async collect(
    target: RuntimeTraceTarget,
    output: string,
    trace: (step: string, detail?: unknown) => Promise<void>
  ): Promise<ChatRecord> {
    const label = safeLabel(target.target_id, 1);
    const flowRawFile = join(this.config.outputDir, "raw", `flow-${label}.txt`);
    const chatRawFile = join(this.config.outputDir, "raw", `chat-${label}.txt`);
    const chatSnapshotFile = join(this.config.outputDir, "snapshots", `chat-${label}.txt`);

    const flowSegment = extractMarkedSegment(output, `flow-${label}-start`, `flow-${label}-end`) || output;
    const chatSegment = extractMarkedSegment(output, `chat-${label}-start`, `chat-${label}-end`) || flowSegment;

    await writeFile(join(projectRoot, flowRawFile), flowSegment);
    await writeFile(join(projectRoot, chatRawFile), chatSegment);
    await writeFile(join(projectRoot, chatSnapshotFile), chatSegment);

    const chat: ChatRecord = {
      target_id: target.target_id,
      leftIndex: target.leftIndex,
      targetProvenance: target.targetProvenance,
      contactLocator: target.conversationLocator,
      collectedAt: new Date().toISOString(),
      rawTextFile: chatRawFile,
      snapshotFile: chatSnapshotFile
    };

    await trace("chat-collected", {
      target_id: target.target_id,
      leftIndex: target.leftIndex,
      targetProvenance: target.targetProvenance,
      contactLocator: target.conversationLocator,
      rawTextFile: chatRawFile,
      snapshotFile: chatSnapshotFile
    });

    return chat;
  }
}
