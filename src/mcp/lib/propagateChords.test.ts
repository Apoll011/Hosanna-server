import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyChordAnchors,
  parseChordLine,
  propagateVerseChords,
  stripChords,
} from "./propagateChords.js";

describe("parseChordLine / applyChordAnchors", () => {
  it("round-trips lyric offsets", () => {
    const { lyrics, anchors } = parseChordLine("[G]Amazing [C]grace");
    assert.equal(lyrics, "Amazing grace");
    assert.deepEqual(
      anchors.map((a) => a.chord),
      ["G", "C"],
    );
    assert.equal(applyChordAnchors("Amazing grace", anchors), "[G]Amazing [C]grace");
  });

  it("places source chords onto different lyrics at the same offsets", () => {
    const { anchors } = parseChordLine("[G]Hello [C]world");
    // "Hello " is 6 chars; chord C at 6 → same place in "Other  text"
    const out = applyChordAnchors("Other  text", anchors);
    assert.equal(stripChords(out), "Other  text");
    assert.match(out, /^\[G\]/);
    assert.ok(out.includes("[C]"));
  });
});

describe("propagateVerseChords", () => {
  it("copies first-verse chords onto later verses", () => {
    const input = `{title: Test}
{start_of_verse}
[G]Amazing [C]grace how [G]sweet
[D]That saved a [G]wretch
{end_of_verse}
{start_of_verse}
Amazing grace how sweet
That saved a wretch
{end_of_verse}
`;
    const result = propagateVerseChords(input);
    assert.equal(result.unchanged, false);
    assert.equal(result.versesUpdated, 1);
    assert.ok(result.chordsCopied >= 4);
    assert.match(
      result.content,
      /\{start_of_verse\}\n\[G\]Amazing \[C\]grace how \[G\]sweet/,
    );
    // Second verse should now have chords (not invent new ones beyond source)
    const verses = result.content.split("{start_of_verse}");
    assert.ok(verses[2]!.includes("[G]"));
    assert.ok(verses[2]!.includes("[C]"));
  });

  it("does nothing when no chords exist", () => {
    const input = `{start_of_verse}
A
{end_of_verse}
{start_of_verse}
B
{end_of_verse}
`;
    const result = propagateVerseChords(input);
    assert.equal(result.unchanged, true);
  });

  it("does not invent chords beyond the source set", () => {
    const input = `{start_of_verse}
[Am]Line one
{end_of_verse}
{start_of_verse}
Line one
{end_of_verse}
`;
    const result = propagateVerseChords(input);
    assert.equal((result.content.match(/\[Am\]/g) ?? []).length, 2);
    assert.ok(!result.content.includes("[G]"));
  });

  it("preserves comment directives while applying chords", () => {
    const input = `{start_of_verse}
{c: Softly}
[G]Hello
{end_of_verse}
{start_of_verse}
{c: Softly}
Hello
{end_of_verse}
`;
    const result = propagateVerseChords(input);
    assert.equal((result.content.match(/\{c: Softly\}/g) ?? []).length, 2);
    assert.match(result.content, /\{c: Softly\}\n\[G\]Hello/);
  });
});
