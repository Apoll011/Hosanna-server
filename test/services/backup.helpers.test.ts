import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLiveRow,
  sortFoldersParentsFirst,
} from "../../src/services/backup.helpers.js";

describe("backup helpers", () => {
  it("isLiveRow skips soft-deleted and tombstoned rows", () => {
    assert.equal(isLiveRow({ id: "a" }), true);
    assert.equal(isLiveRow({ deleted: false }), true);
    assert.equal(isLiveRow({ deleted: true }), false);
    assert.equal(isLiveRow({ _deleted: true }), false);
    assert.equal(isLiveRow(null), false);
    assert.equal(isLiveRow(undefined), false);
  });

  it("sortFoldersParentsFirst puts ancestors before descendants", () => {
    const folders = [
      { id: "c", parentId: "b" },
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
    ];
    const sorted = sortFoldersParentsFirst(folders);
    assert.deepEqual(
      sorted.map((f) => f.id),
      ["a", "b", "c"],
    );
  });
});
