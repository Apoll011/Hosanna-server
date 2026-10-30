/**
 * Short-TTL in-memory dedupe for mutation tools that accept clientRequestId.
 * Best-effort only (per-process); enough to absorb chat/MCP retries.
 * Keys are bound to a stable payload hash — same id + different body → conflict.
 */

import { createHash } from "node:crypto";

type Entry = { at: number; result: unknown; hash: string };
const store = new Map<string, Entry>();
const TTL_MS = 10 * 60 * 1000;
const MAX_KEYS = 2_000;

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT" as const;

  constructor(message: string) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

function prune(now: number) {
  if (store.size < MAX_KEYS) return;
  for (const [key, entry] of store) {
    if (now - entry.at > TTL_MS) store.delete(key);
  }
  if (store.size < MAX_KEYS) return;
  const sorted = [...store.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of sorted.slice(0, Math.floor(sorted.length / 2))) {
    store.delete(key);
  }
}

/** Stable hash of a JSON-serializable payload (keys sorted). */
export function payloadHash(payload: unknown): string {
  const normalized = JSON.stringify(payload ?? null, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      );
    }
    return v;
  });
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export async function withClientRequestId<T>(
  orgId: string,
  clientRequestId: string | undefined,
  run: () => Promise<T>,
  /** Request body excluding clientRequestId — bound to the key. */
  payload?: unknown,
): Promise<T> {
  const id = clientRequestId?.trim();
  if (!id) return run();

  const hash = payloadHash(payload);
  const key = `${orgId}:${id}`;
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < TTL_MS) {
    if (hit.hash !== hash) {
      throw new IdempotencyConflictError(
        `clientRequestId "${id}" was already used with a different payload`,
      );
    }
    return hit.result as T;
  }

  const result = await run();
  prune(now);
  store.set(key, { at: now, result, hash });
  return result;
}
