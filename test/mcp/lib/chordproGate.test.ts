import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  durationSecondsFromChordPro,
  mirroredMetadataWarnings,
} from "../../../src/mcp/lib/chordproGate.js";

describe("durationSecondsFromChordPro", () => {
  it("parses plain seconds", () => {
    assert.equal(
      durationSecondsFromChordPro("{title: A}\n{duration: 180}\n"),
      180,
    );
  });

  it("parses M:SS", () => {
    assert.equal(durationSecondsFromChordPro("{duration: 3:00}\n[G]Hi"), 180);
  });
});

describe("mirroredMetadataWarnings", () => {
  it("flags title mismatch", () => {
    const warnings = mirroredMetadataWarnings({
      title: "DB Title",
      artist: "Same",
      content: "{title: ChordPro Title}\n{artist: Same}\n",
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /Title mismatch/);
  });

  it("passes when aligned", () => {
    const warnings = mirroredMetadataWarnings({
      title: "Same Title",
      artist: "Artist",
      content: "{title: Same Title}\n{artist: Artist}\n",
    });
    assert.deepEqual(warnings, []);
  });
});
