import type { Config, PerContactBatchResult, RuntimeTraceTarget, SelectorProbe } from "../types";
import { runBatch } from "../commands";
import { PerContactBatchBuilder } from "../browser/batch-builder";
import { ChatCollector } from "./chat-collector";
import { JobCollector } from "../job/job-collector";
import { appendSelectorInspectionCommands } from "./target-resolver";
import { writeSelectorInspection } from "../output/writer";

export type ContactChainOptions = {
  includeSelectorInspection?: boolean;
  isLastTarget?: boolean;
};

export class ContactChain {
  constructor(
    private readonly config: Config,
    private readonly target: RuntimeTraceTarget,
    private readonly trace: (step: string, detail?: unknown) => Promise<void>
  ) {}

  async execute(options: ContactChainOptions = {}): Promise<PerContactBatchResult> {
    const builder = new PerContactBatchBuilder()
      .withTarget(this.target)
      .withChatUrl(this.config.chatUrl)
      .withReturnToChatMethod(this.config.perContactChain?.returnToChatMethod)
      .withScreenshot(this.config.screenshot)
      .withOutputDir(this.config.outputDir)
      .withJobDetailScrollPixels(this.config.chatListScrollPixels);

    const commands = builder.build();
    let selectorProbes: SelectorProbe[] = [];

    if (options.includeSelectorInspection && options.isLastTarget) {
      selectorProbes = appendSelectorInspectionCommands(commands, this.config, "single-session");
    }

    await this.trace("contact-chain-start", {
      target_id: this.target.target_id,
      leftIndex: this.target.leftIndex,
      targetProvenance: this.target.targetProvenance,
      commandCount: commands.length,
      includeSelectorInspection: options.includeSelectorInspection && options.isLastTarget
    });

    const output = await runBatch(this.config, commands, { optional: true });

    await this.trace("contact-chain-end", {
      target_id: this.target.target_id,
      outputLength: output.length
    });

    if (selectorProbes.length > 0) {
      await writeSelectorInspection(this.config, this.config.outputDir, output, selectorProbes, this.trace, "single-session");
    }

    const chatCollector = new ChatCollector(this.config);
    const jobCollector = new JobCollector(this.config);

    const chat = await chatCollector.collect(this.target, output, this.trace);
    const job = await jobCollector.collect(this.target, output, this.trace);

    return {
      target: this.target,
      chat,
      job,
      rawOutput: output
    };
  }
}
