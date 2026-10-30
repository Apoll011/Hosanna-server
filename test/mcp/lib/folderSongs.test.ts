import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectFolderIds,
  extractKey,
  folderTrail,
  normalizeFolderId,
  sortSongs,
} from "../../../src/mcp/lib/folderSongs.js";

const folders = [
  { id: "a", name: "Worship", parentId: null },
  { id: "b", name: "Fast", parentId: "a" },
  { id: "c", name: "Slow", parentId: "a" },
  { id: "d", name: "Old", parentId: "c" },
  { id: "x", name: "Other", parentId: null },
];

describe("folderSongs helpers", () => {
  it("normalizes root-ish folder ids", () => {
    assert.equal(normalizeFolderId(undefined), null);
    assert.equal(normalizeFolderId(null), null);
    assert.equal(normalizeFolderId("root"), null);
    assert.equal(normalizeFolderId("abc"), "abc");
  });

  it("collects a folder and all descendants", () => {
    assert.deepEqual(collectFolderIds(folders, "a").sort(), [
      "a",
      "b",
      "c",
      "d",
    ]);
    assert.deepEqual(collectFolderIds(folders, "d"), ["d"]);
  });

  it("survives cyclic parent links", () => {
    const cyclic = [
      { id: "p", name: "P", parentId: "q" },
      { id: "q", name: "Q", parentId: "p" },
    ];
    assert.deepEqual(collectFolderIds(cyclic, "p").sort(), ["p", "q"]);
    assert.equal(folderTrail(cyclic, "p").length, 2);
  });

  it("builds a breadcrumb trail", () => {
    assert.deepEqual(folderTrail(folders, "d"), ["Worship", "Slow", "Old"]);
    assert.deepEqual(folderTrail(folders, "missing"), []);
  });

  it("extracts the key directive", () => {
    assert.equal(extractKey("{title: T}\n{key: Db}\n"), "Db");
    assert.equal(extractKey("{title: T}"), null);
  });

  it("sorts case/accent-insensitively and numbers last", () => {
    const d = (s: string) => new Date(s);
    const songs = [
      {
        title: "beta",
        artist: "Z",
        song_number: null,
        updatedAt: d("2026-01-02"),
      },
      {
        title: "Alpha",
        artist: "Y",
        song_number: 2,
        updatedAt: d("2026-01-03"),
      },
      {
        title: "alpha 10",
        artist: "X",
        song_number: 1,
        updatedAt: d("2026-01-01"),
      },
      {
        title: "Alpha 2",
        artist: "X",
        song_number: null,
        updatedAt: d("2026-01-04"),
      },
    ];
    assert.deepEqual(
      sortSongs(songs, "title", "asc").map((s) => s.title),
      ["Alpha", "Alpha 2", "alpha 10", "beta"],
    );
    assert.deepEqual(
      sortSongs(songs, "title", "desc").map((s) => s.title),
      ["beta", "alpha 10", "Alpha 2", "Alpha"],
    );
    assert.deepEqual(
      sortSongs(songs, "song_number", "asc").map((s) => s.song_number),
      [1, 2, null, null],
    );
    assert.equal(sortSongs(songs, "updatedAt", "desc")[0].title, "Alpha 2");
    assert.equal(sortSongs(songs, "artist", "asc")[0].artist, "X");
  });
});
