import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Config, JobRecord, SelectorProbe, TraceEvent } from "./types";
import { extractMarkedSegment, lastInteger, lastNonEmptyLine, lastUrl } from "./parser";

export async function ensureOutputDirs(out: string) {
  await mkdir(join(out, "snapshots"), { recursive: true });
  await mkdir(join(out, "screenshots"), { recursive: true });
  await mkdir(join(out, "raw"), { recursive: true });
}

export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTraceReport(out: string, traceEvents: TraceEvent[], jobs: JobRecord[]) {
  const lines = [
    "# BOSS Trace Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Events: ${traceEvents.length}`,
    `Jobs: ${jobs.length}`,
    "",
    "## Events",
    "",
    ...traceEvents.map((event) => `- ${event.ts} ${event.step}${event.detail ? ` ${JSON.stringify(event.detail)}` : ""}`),
    "",
    "## Jobs",
    "",
    ...jobs.map((job, index) => `${index + 1}. ${job.title || "(unknown title)"} ${job.salary || ""} ${job.url}`)
  ];
  await writeFile(join(out, "trace-report.md"), `${lines.join("\n")}\n`);
}

export async function writeSelectorInspection(
  config: Config,
  out: string,
  output: string,
  probes: SelectorProbe[],
  trace: (step: string, detail?: unknown) => Promise<void>,
  context: string
) {
  const contextLabel = safeName(context) || "inspection";
  const contextSegment = extractMarkedSegment(
    output,
    `selector-inspection-${contextLabel}-start`,
    `selector-inspection-${contextLabel}-end`
  ) || output;
  const currentUrl = lastUrl(contextSegment);
  const currentTitle = lastNonEmptyLine(contextSegment.replace(currentUrl || "", ""));
  const results = probes.map((probe) => {
    const segment = extractMarkedSegment(output, probe.startLabel, probe.endLabel);
    const count = segment ? lastInteger(segment) : 0;
    return {
      group: probe.group,
      selector: probe.selector,
      count: Number.isFinite(count) ? count : 0,
      debugOnly: true,
      evidence: "selector-inspection"
    };
  });

  const outputFile = join(config.outputDir, "selector-inspection.json");
  await writeJson(join(out, "selector-inspection.json"), {
    debugOnly: true,
    context,
    currentUrl,
    currentTitle,
    collectedAt: new Date().toISOString(),
    results
  });

  await trace("selector-inspection-debug-evidence", {
    context,
    currentUrl,
    currentTitle,
    outputFile,
    probeCount: results.length,
    note: "--inspect-selectors 在当前 batch/session 内执行，不作为正常采集完成证据"
  });
  for (const result of results) {
    await trace("selector-count", result);
  }
}

function safeName(input: string) {
  return input.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}
