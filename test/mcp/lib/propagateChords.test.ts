import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyChordAnchors,
  findBlocks,
  parseChordLine,
  propagateVerseChords,
  stripChords,
  syllableStarts,
} from "../../../src/mcp/lib/propagateChords.js";

describe("parseChordLine / applyChordAnchors", () => {
  it("round-trips lyric offsets", () => {
    const { lyrics, anchors } = parseChordLine("[G]Amazing [C]grace");
    assert.equal(lyrics, "Amazing grace");
    assert.equal(
      applyChordAnchors("Amazing grace", anchors),
      "[G]Amazing [C]grace",
    );
  });

  it("keeps order when two chords share a position", () => {
    const out = applyChordAnchors("Hi", [
      { chord: "G", at: 0 },
      { chord: "C", at: 0 },
    ]);
    assert.equal(out, "[G][C]Hi");
    assert.equal(stripChords(out), "Hi");
  });
});

describe("syllableStarts", () => {
  it("splits common Portuguese words", () => {
    assert.deepEqual(syllableStarts("Senhor"), [0, 2]);
    assert.deepEqual(syllableStarts("aleluia"), [0, 1, 3]);
    assert.deepEqual(syllableStarts("Deus"), [0]);
  });
});

describe("propagateVerseChords", () => {
  const twoVerses = `{title: Test}
{start_of_verse}
[G]Amazing [C]grace how [G]sweet
[D]That saved a [G]wretch
{end_of_verse}
{start_of_verse}
Amazing grace how sweet
That saved a wretch
{end_of_verse}
`;

  it("copies chords exactly when the lyrics match", () => {
    const r = propagateVerseChords(twoVerses);
    assert.equal(r.unchanged, false);
    assert.equal(r.versesUpdated, 1);
    assert.match(
      r.content,
      /\{start_of_verse\}\n\[G\]Amazing \[C\]grace how \[G\]sweet\n\[D\]That saved a \[G\]wretch\n\{end_of_verse\}\n$/,
    );
    assert.ok(
      r.review.every((x) => x.mode === "exact" && x.confidence === "high"),
    );
  });

  it("anchors chords to words when the lyrics differ", () => {
    const r = propagateVerseChords(`{start_of_verse}
[G]Hello [C]beautiful [D]world
{end_of_verse}
{start_of_verse}
Another lovely evening
{end_of_verse}
`);
    assert.match(r.content, /\[G\]Another \[C\]lovely \[D\]evening/);
    assert.equal(r.review[0]!.mode, "aligned");
  });

  it("maps a mid-word chord to the same syllable", () => {
    const r = propagateVerseChords(`{start_of_verse}
Ale[G]luia, [D]Senhor
{end_of_verse}
{start_of_verse}
Aleluia, Senhor
{end_of_verse}
`);
    assert.match(
      r.content,
      /\{start_of_verse\}\nAle\[G\]luia, \[D\]Senhor\n\{end_of_verse\}\n$/,
    );
  });

  it("flags uncertain lines for review", () => {
    const r = propagateVerseChords(`{start_of_verse}
[G]Santo [C]santo [D]santo é o Senhor
{end_of_verse}
{start_of_verse}
Glória
{end_of_verse}
`);
    assert.equal(r.review.length, 1);
    assert.equal(r.review[0]!.confidence, "check");
    assert.equal(r.needsReview, 1);
    assert.match(r.next, /DRAFT/);
  });

  it("never overwrites existing chords", () => {
    const r = propagateVerseChords(`{start_of_verse}
[G]Hello [C]world
{end_of_verse}
{start_of_verse}
[Am]Hello world
{end_of_verse}
`);
    assert.equal(r.unchanged, true);
    assert.match(r.content, /\[Am\]Hello world/);
  });

  it("fills only the lines that lack chords", () => {
    const r = propagateVerseChords(`{start_of_verse}
[G]One [C]two
[D]Three
{end_of_verse}
{start_of_verse}
[Am]One two
Three
{end_of_verse}
`);
    assert.match(r.content, /\[Am\]One two\n\[D\]Three/);
  });

  it("copies an identical chorus exactly (cross-block)", () => {
    const r = propagateVerseChords(`{start_of_chorus}
[C]Holy [G]holy
{end_of_chorus}
{start_of_verse}
Some words
{end_of_verse}
{start_of_chorus}
Holy holy
{end_of_chorus}
`);
    assert.match(
      r.content,
      /\{start_of_chorus\}\n\[C\]Holy \[G\]holy\n\{end_of_chorus\}\n$/,
    );
    assert.ok(r.notes.some((n) => /\{chorus\}/.test(n)) === false);
  });

  it("suggests {chorus} for verbatim repeated choruses", () => {
    const r = propagateVerseChords(`{start_of_chorus}
[C]Holy [G]holy
{end_of_chorus}
{start_of_chorus}
[C]Holy [G]holy
{end_of_chorus}
`);
    assert.ok(r.notes.some((n) => /\{chorus\}/.test(n)));
  });

  it("ignores {chorus} recalls and tab/grid blocks", () => {
    const input = `{start_of_verse}
[G]Hello
{end_of_verse}
{chorus}
{start_of_tab}
e|---0---|
{end_of_tab}
{start_of_verse}
Hello
{end_of_verse}
`;
    const r = propagateVerseChords(input);
    assert.match(r.content, /e\|---0---\|/);
    assert.match(
      r.content,
      /\{start_of_verse\}\n\[G\]Hello\n\{end_of_verse\}\n$/,
    );
  });

  it("supports stanzas without section directives", () => {
    const r = propagateVerseChords(`{title: X}

[G]Hello [C]world

Hello world
`);
    assert.match(r.content, /\[G\]Hello \[C\]world\n\n\[G\]Hello \[C\]world/);
    assert.equal(findBlocks(r.content.split("\n")).length, 2);
  });

  it("does nothing when no chords exist", () => {
    const r = propagateVerseChords(`{start_of_verse}
A
{end_of_verse}
{start_of_verse}
B
{end_of_verse}
`);
    assert.equal(r.unchanged, true);
    assert.ok(r.notes.length > 0);
  });

  it("does not invent chords beyond the source set", () => {
    const r = propagateVerseChords(`{start_of_verse}
[Am]Line one
{end_of_verse}
{start_of_verse}
Line one
{end_of_verse}
`);
    assert.equal((r.content.match(/\[Am\]/g) ?? []).length, 2);
    assert.ok(!r.content.includes("[G]"));
  });

  it("preserves comment directives while applying chords", () => {
    const r = propagateVerseChords(`{start_of_verse}
{c: Softly}
[G]Hello
{end_of_verse}
{start_of_verse}
{c: Softly}
Hello
{end_of_verse}
`);
    assert.equal((r.content.match(/\{c: Softly\}/g) ?? []).length, 2);
    assert.match(r.content, /\{c: Softly\}\n\[G\]Hello/);
  });
});
