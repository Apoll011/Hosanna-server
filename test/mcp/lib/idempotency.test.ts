import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IdempotencyConflictError,
  payloadHash,
  withClientRequestId,
} from "../../../src/mcp/lib/idempotency.js";

describe("idempotency", () => {
  it("hashes payloads stably regardless of key order", () => {
    assert.equal(
      payloadHash({ b: 1, a: 2 }),
      payloadHash({ a: 2, b: 1 }),
    );
  });

  it("returns cached result for same id + payload", async () => {
    let runs = 0;
    const org = `org-${Math.random()}`;
    const id = "req-1";
    const payload = { name: "Folder", parentId: null };
    const first = await withClientRequestId(
      org,
      id,
      async () => {
        runs += 1;
        return { created: true, n: runs };
      },
      payload,
    );
    const second = await withClientRequestId(
      org,
      id,
      async () => {
        runs += 1;
        return { created: true, n: runs };
      },
      payload,
    );
    assert.deepEqual(first, second);
    assert.equal(runs, 1);
  });

  it("conflicts when same id is reused with different payload", async () => {
    const org = `org-${Math.random()}`;
    const id = "req-2";
    await withClientRequestId(
      org,
      id,
      async () => ({ ok: true }),
      { name: "A" },
    );
    await assert.rejects(
      () =>
        withClientRequestId(
          org,
          id,
          async () => ({ ok: true }),
          { name: "B" },
        ),
      (err: unknown) => err instanceof IdempotencyConflictError,
    );
  });
});
