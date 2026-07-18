import { join } from "node:path";
import type { ChatListEntry, ChatRecord, Config, JobRecord, Locator, RuntimeTraceTarget } from "./types";
import { resolveTraceTargets } from "./chat/target-resolver";
import { ContactChain } from "./chat/contact-chain";

export async function runSingleSessionTraceFlow(
  config: Config,
  out: string,
  discoveredEntries: ChatListEntry[],
  conversationLocators: Locator[],
  trace: (step: string, detail?: unknown) => Promise<void>,
  includeSelectorInspection = false
): Promise<{ chatList: { rawTextFile: string; entries: ChatListEntry[] }; chats: ChatRecord[]; jobs: JobRecord[] }> {
  const targets = resolveTraceTargets(config, discoveredEntries, conversationLocators);
  await traceTargetMetadata(targets, trace, includeSelectorInspection);

  const chats: ChatRecord[] = [];
  const jobs: JobRecord[] = [];
  const seenJobs = new Set<string>();

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const chain = new ContactChain(config, target, trace);
    const result = await chain.execute({
      includeSelectorInspection,
      isLastTarget: i === targets.length - 1
    });

    if (result.chat) {
      chats.push(result.chat);
    }

    if (result.job) {
      const duplicateKey = `${result.job.target_id}:${result.job.job_id}`;
      if (seenJobs.has(duplicateKey)) {
        await trace("job-duplicate-skipped", {
          target_id: target.target_id,
          leftIndex: target.leftIndex,
          targetProvenance: target.targetProvenance,
          job_id: result.job.job_id
        });
      } else {
        seenJobs.add(duplicateKey);
        jobs.push(result.job);
      }
    }
  }

  await trace("single-session-flow-done", {
    targetCount: targets.length,
    chatCount: chats.length,
    jobCount: jobs.length
  });

  return {
    chatList: { rawTextFile: join(config.outputDir, "raw", "chat-list-full.txt"), entries: discoveredEntries },
    chats,
    jobs
  };
}

async function traceTargetMetadata(
  targets: RuntimeTraceTarget[],
  trace: (step: string, detail?: unknown) => Promise<void>,
  includeSelectorInspection: boolean
) {
  const provenanceCounts = targets.reduce(
    (counts, target) => {
      const provenance = target.targetProvenance || "fallback";
      counts[provenance] += 1;
      return counts;
    },
    { discovered: 0, fallback: 0, "config-only": 0 } as Record<"discovered" | "fallback" | "config-only", number>
  );

  for (const target of targets) {
    if (target.targetProvenance !== "config-only") continue;
    await trace("trace-target-not-found", {
      target_id: target.target_id,
      conversationLocator: target.conversationLocator,
      targetProvenance: target.targetProvenance,
      message: "config target not found in discovered chat-list coverage; preserved as config-only compatibility evidence"
    });
  }

  await trace("single-session-flow-start", {
    steps: [
      "open-chat-once",
      "switch-account-if-configured",
      "wait-for-login-if-configured",
      "collect-chat-list",
      "resolve-targets",
      "per-contact-chain-click-contact",
      "per-contact-chain-collect-chat",
      "per-contact-chain-click-job",
      "per-contact-chain-collect-job",
      "per-contact-chain-return-to-chat"
    ],
    targetCount: targets.length,
    provenanceCounts,
    includeSelectorInspection,
    targets: targets.map((target) => ({
      target_id: target.target_id,
      leftIndex: target.leftIndex,
      targetProvenance: target.targetProvenance,
      description: target.description,
      jobLocatorCount: target.jobEntryLocators.length
    }))
  });
}
