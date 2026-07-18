import { join } from "node:path";
import type { TraceEvent } from "../types";
import { writeJson } from "../output/writer";

export class TraceEventTracker {
  private events: TraceEvent[] = [];
  constructor(private readonly outDir: string) {}

  async trace(step: string, detail?: unknown): Promise<void> {
    const event: TraceEvent = { ts: new Date().toISOString(), step, detail };
    this.events.push(event);
    console.log(`[trace] ${step}`, detail ? JSON.stringify(detail) : "");
    await writeJson(join(this.outDir, "trace-events.json"), this.events);
  }

  getEvents(): TraceEvent[] {
    return this.events;
  }
}
