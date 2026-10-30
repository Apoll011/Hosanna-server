import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lyricsMatchQuery,
  stripChordProForSearch,
} from "../../src/lib/lyricSearch.js";

describe("lyricSearch", () => {
  it("strips chords and matches plain query", () => {
    const content =
      "{title: Exemplo}\n\nPois [D9]só Tu és o [C#m]Deus eterno,\n[Bm7]digno de [E]louvor";
    assert.equal(
      stripChordProForSearch(content).includes("pois só tu és o deus eterno"),
      true,
    );
    assert.equal(
      lyricsMatchQuery(content, "Pois só Tu és o Deus eterno"),
      true,
    );
  });

  it("does not match unrelated lyrics", () => {
    assert.equal(
      lyricsMatchQuery("[G]Hello world", "Pois só Tu és o Deus eterno"),
      false,
    );
  });
});
