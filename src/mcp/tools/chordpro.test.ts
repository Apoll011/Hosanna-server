import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getChordProCapabilities } from "../lib/capabilities.js";
import { validateChordProContent } from "../lib/chordproGate.js";
import { transposeChordProSource } from "../lib/transposeSource.js";

describe("chordpro library via MCP gate", () => {
  it("transposes source and still validates", () => {
    const source = `{title: Test}
{key: C}
{start_of_version: Acoustic}
[C]Hello [G]world
{end_of_version}
`;
    const { content, toKey } = transposeChordProSource(source, { toKey: "D" });
    assert.equal(toKey, "D");
    assert.match(content, /\{start_of_version: Acoustic\}/);
    assert.match(content, /\[D\]Hello \[A\]world/);
    const report = validateChordProContent(content);
    assert.equal(report.ok, true);
  });

  it("exposes variants as implemented", () => {
    const variants = getChordProCapabilities().features.find(
      (f) => f.id === "variants",
    );
    assert.equal(variants?.support, "implemented");
  });
});
