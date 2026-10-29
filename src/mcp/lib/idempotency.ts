/**
 * Short-TTL in-memory dedupe for mutation tools that accept clientRequestId.
 * Best-effort only (per-process); enough to absorb chat/MCP retries.
 */

type Entry = { at: number; result: unknown };
const store = new Map<string, Entry>();
const TTL_MS = 10 * 60 * 1000;
const MAX_KEYS = 2_000;

function prune(now: number) {
  if (store.size < MAX_KEYS) return;
  for (const [key, entry] of store) {
    if (now - entry.at > TTL_MS) store.delete(key);
  }
  if (store.size < MAX_KEYS) return;
  // Drop oldest half if still over capacity
  const sorted = [...store.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of sorted.slice(0, Math.floor(sorted.length / 2))) {
    store.delete(key);
  }
}

export async function withClientRequestId<T>(
  orgId: string,
  clientRequestId: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const id = clientRequestId?.trim();
  if (!id) return run();

  const key = `${orgId}:${id}`;
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < TTL_MS) {
    return hit.result as T;
  }

  const result = await run();
  prune(now);
  store.set(key, { at: now, result });
  return result;
}
