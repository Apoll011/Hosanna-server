/** Soft-deleted / tombstoned rows are skipped on backup restore. */
export function isLiveRow(
  row: { deleted?: boolean; _deleted?: boolean } | null | undefined,
) {
  if (!row || typeof row !== "object") return false;
  return row.deleted !== true && row._deleted !== true;
}

/** Parents before children so FK inserts succeed. */
export function sortFoldersParentsFirst<
  T extends { id: string; parentId?: string | null },
>(folders: T[]): T[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const depth = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const f = byId.get(id);
    if (!f?.parentId || !byId.has(f.parentId)) return 0;
    return 1 + depth(f.parentId, seen);
  };
  return [...folders].sort((a, b) => depth(a.id) - depth(b.id));
}
