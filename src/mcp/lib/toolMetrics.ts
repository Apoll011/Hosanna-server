/**
 * In-process ring buffer of recent tool timings (observability / debugging).
 * Not durable across instances — useful for hosanna_capabilities samples.
 */

export type ToolTimingSample = {
  tool: string;
  durationMs: number;
  at: string;
  ok: boolean;
};

const MAX = 100;
const samples: ToolTimingSample[] = [];

export function recordToolTiming(
  tool: string,
  durationMs: number,
  ok = true,
): void {
  samples.push({
    tool,
    durationMs,
    at: new Date().toISOString(),
    ok,
  });
  if (samples.length > MAX) samples.splice(0, samples.length - MAX);
}

export function recentToolTimings(limit = 20): ToolTimingSample[] {
  return samples.slice(-Math.min(limit, samples.length));
}

export function toolTimingSummary(): {
  sampleCount: number;
  byTool: Record<string, { count: number; p50Ms: number; p95Ms: number }>;
} {
  const byName = new Map<string, number[]>();
  for (const s of samples) {
    const arr = byName.get(s.tool) ?? [];
    arr.push(s.durationMs);
    byName.set(s.tool, arr);
  }
  const byTool: Record<
    string,
    { count: number; p50Ms: number; p95Ms: number }
  > = {};
  for (const [tool, values] of byName) {
    const sorted = [...values].sort((a, b) => a - b);
    const p = (q: number) =>
      sorted[
        Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))
      ] ?? 0;
    byTool[tool] = {
      count: sorted.length,
      p50Ms: p(0.5),
      p95Ms: p(0.95),
    };
  }
  return { sampleCount: samples.length, byTool };
}
