import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClockContext,
  clockContextPromptBlock,
} from "../../src/lib/clockContext.js";

describe("clockContext", () => {
  it("formats date and next Sunday", () => {
    // Thursday 2026-10-29 12:00 UTC
    const now = new Date("2026-10-29T12:00:00.000Z");
    const c = buildClockContext(now, "UTC");
    assert.equal(c.date, "2026-10-29");
    assert.equal(c.weekday, "Thursday");
    assert.equal(c.nextSunday, "2026-11-01");
  });

  it("prompt block mentions duration seconds", () => {
    const block = clockContextPromptBlock(
      new Date("2026-10-29T12:00:00.000Z"),
      "UTC",
    );
    assert.match(block, /2026-10-29/);
    assert.match(block, /seconds/);
  });
});
