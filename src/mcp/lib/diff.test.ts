import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeDiff } from "./diff.js";
import { validateServiceElements } from "../../validators/serviceElement.validators.js";
import { validateChordProContent } from "./chordproGate.js";
import { createHosannaMcpServer } from "../server.js";

describe("summarizeDiff", () => {
  it("detects unchanged content", () => {
    const result = summarizeDiff("a\nb", "a\nb");
    assert.equal(result.unchanged, true);
  });

  it("counts added and removed lines", () => {
    const result = summarizeDiff("a\nb", "a\nc");
    assert.equal(result.unchanged, false);
    assert.ok(result.addedLines >= 1);
    assert.ok(result.removedLines >= 1);
  });
});

describe("validateServiceElements", () => {
  it("requires songId for song elements", () => {
    const result = validateServiceElements([
      { id: "1", type: "song", title: "Test" },
    ]);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("songId")));
  });

  it("accepts a welcome element", () => {
    const result = validateServiceElements([
      { id: "1", type: "welcome", title: "Welcome", position: 0 },
    ]);
    assert.equal(result.ok, true);
  });
});

describe("validateChordProContent", () => {
  it("accepts a simple valid document", () => {
    const report = validateChordProContent(
      "{title: Test}\n{key: G}\n[G]Hello",
    );
    assert.equal(report.ok, true);
    assert.equal(report.metadata.title, "Test");
  });

  it("reports unclosed braces", () => {
    const report = validateChordProContent("{title: Broken\n[G]Hi");
    assert.equal(report.ok, false);
  });
});

describe("createHosannaMcpServer", () => {
  it("registers without throwing", () => {
    const server = createHosannaMcpServer();
    assert.ok(server);
    assert.equal(typeof server.registerTool, "function");
  });
});
