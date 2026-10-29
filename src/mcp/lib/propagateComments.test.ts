import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { propagateVerseComments } from "./propagateComments.js";

describe("propagateVerseComments", () => {
  it("copies first-verse comments onto later verses at the same slots", () => {
    const input = `{title: Test}
{start_of_verse}
{c: Softly}
[G]Line one
{c: Build|warning}
[C]Line two
{end_of_verse}
{start_of_verse}
[G]Other one
[C]Other two
{end_of_verse}
`;
    const result = propagateVerseComments(input);
    assert.equal(result.unchanged, false);
    assert.equal(result.versesUpdated, 1);
    assert.equal(result.commentsCopied, 2);
    assert.match(result.content, /\{start_of_verse\}\n\{c: Softly\}\n\[G\]Other one/);
    assert.match(
      result.content,
      /\{c: Build\|warning\}\n\[C\]Other two/,
    );
  });

  it("does nothing when no comments exist", () => {
    const input = `{start_of_verse}
[G]A
{end_of_verse}
{start_of_verse}
[G]B
{end_of_verse}
`;
    const result = propagateVerseComments(input);
    assert.equal(result.unchanged, true);
    assert.equal(result.versesUpdated, 0);
  });

  it("does not invent notes", () => {
    const input = `{start_of_verse}
{c: Softly}
[G]A
{end_of_verse}
{start_of_verse}
[G]B
{end_of_verse}
`;
    const result = propagateVerseComments(input);
    assert.ok(result.content.includes("{c: Softly}"));
    assert.equal((result.content.match(/\{c: Softly\}/g) ?? []).length, 2);
    assert.ok(!result.content.includes("{c: Loudly}"));
  });
});
