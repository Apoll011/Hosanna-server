import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customInstructionsPromptBlock,
  memoryPromptBlock,
  normalizeMemoryContent,
  toolBudgetNotice,
  toolBudgetPhase,
} from "../../src/services/aiBehavior.js";

describe("tool budget", () => {
  it("is silent while plenty of calls remain", () => {
    assert.equal(toolBudgetPhase(0, 12), "ok");
    assert.equal(toolBudgetPhase(9, 12), "ok");
    assert.equal(toolBudgetNotice(5, 12), null);
  });

  it("warns two calls before the limit", () => {
    assert.equal(toolBudgetPhase(10, 12), "warn");
    const warn = toolBudgetNotice(10, 12);
    assert.ok(warn && !warn.final);
    assert.match(warn.text, /Only 2 tool calls left/);
    const last = toolBudgetNotice(11, 12);
    assert.match(last!.text, /Only 1 tool call left/);
  });

  it("locks tools and demands a written answer at the limit", () => {
    const fin = toolBudgetNotice(12, 12);
    assert.ok(fin?.final);
    assert.match(fin.text, /can NOT call any more tools/);
    assert.match(fin.text, /final answer/);
    // parallel calls may overshoot
    assert.ok(toolBudgetNotice(14, 12)?.final);
  });

  it("small budgets warn immediately", () => {
    assert.equal(toolBudgetPhase(0, 2), "warn");
    assert.equal(toolBudgetPhase(0, 1), "warn");
  });
});

describe("prompt blocks", () => {
  it("renders memory only when present", () => {
    assert.equal(memoryPromptBlock([]), "");
    const block = memoryPromptBlock([{ id: "1", content: "Prefer key of G" }]);
    assert.match(block, /- Prefer key of G/);
  });

  it("skips empty custom instructions", () => {
    assert.equal(customInstructionsPromptBlock("  "), "");
    assert.match(customInstructionsPromptBlock("Be formal"), /Be formal/);
  });

  it("normalizes memory entries", () => {
    assert.equal(normalizeMemoryContent("  a\n b  "), "a b");
    assert.equal(normalizeMemoryContent("   "), null);
    assert.equal(normalizeMemoryContent("x".repeat(500))!.length, 300);
  });
});
