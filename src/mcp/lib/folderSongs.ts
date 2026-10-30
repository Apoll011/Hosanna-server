import type { McpContext } from "../context.js";
import { requirePermission } from "../context.js";
import { AppError } from "../../utils/errors.js";

export const FOLDER_SONGS_MAX_LIMIT = 100;
export const FOLDER_SONGS_DEFAULT_LIMIT = 50;

export type FolderSongsSort = "title" | "artist" | "updatedAt" | "song_number";

export type FolderSongsArgs = {
  /** Folder id. Omit, null or "root" for songs that are in no folder. */
  folderId?: string | null;
  /** Also include songs from every nested subfolder. */
  recursive?: boolean;
  sortBy?: FolderSongsSort;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

type FolderNode = { id: string; name: string; parentId: string | null };

const KEY_DIRECTIVE = /\{key:\s*([^}]+)\}/i;

export function extractKey(content: string): string | null {
  const match = content.match(KEY_DIRECTIVE);
  return match ? match[1].trim() : null;
}

/** `root` / null / undefined all mean "no folder". */
export function normalizeFolderId(
  folderId: string | null | undefined,
): string | null {
  return !folderId || folderId === "root" ? null : folderId;
}

/** Ids of `rootId` plus every folder nested below it (cycle-safe). */
export function collectFolderIds(
  folders: readonly FolderNode[],
  rootId: string,
): string[] {
  const children = new Map<string, string[]>();
  for (const f of folders) {
    if (!f.parentId) continue;
    const list = children.get(f.parentId) ?? [];
    list.push(f.id);
    children.set(f.parentId, list);
  }
  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift() as string;
    for (const child of children.get(id) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return [...seen];
}

/** Breadcrumb names from the top-level folder down to `folderId`. */
export function folderTrail(
  folders: readonly FolderNode[],
  folderId: string,
): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const trail: string[] = [];
  const seen = new Set<string>();
  let cur = byId.get(folderId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    trail.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return trail;
}

type SortableSong = {
  title: string;
  artist: string;
  song_number: number | null;
  updatedAt: Date;
};

export function sortSongs<T extends SortableSong>(
  songs: T[],
  sortBy: FolderSongsSort,
  order: "asc" | "desc",
): T[] {
  const dir = order === "asc" ? 1 : -1;
  const text = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  return [...songs].sort((a, b) => {
    let cmp: number;
    switch (sortBy) {
      case "artist":
        cmp = text(a.artist, b.artist) || text(a.title, b.title);
        break;
      case "updatedAt":
        cmp = a.updatedAt.getTime() - b.updatedAt.getTime();
        break;
      case "song_number": {
        // Songs without a number always sink to the bottom.
        if (a.song_number == null && b.song_number == null) {
          cmp = text(a.title, b.title);
          return cmp;
        }
        if (a.song_number == null) return 1;
        if (b.song_number == null) return -1;
        cmp = a.song_number - b.song_number || text(a.title, b.title);
        break;
      }
      default:
        cmp = text(a.title, b.title);
    }
    return cmp * dir;
  });
}

/**
 * List the songs of one folder (optionally including nested folders), with
 * the folder's own subfolders. Metadata only — no lyrics/chords — so it stays
 * cheap even for big folders; use songs_get / songs_get_many for content.
 */
export async function listSongsInFolder(
  ctx: McpContext,
  args: FolderSongsArgs,
) {
  requirePermission(ctx, "song.access");
  const folderId = normalizeFolderId(args.folderId);
  const recursive = args.recursive ?? false;
  const sortBy = args.sortBy ?? "title";
  const sortOrder = args.sortOrder ?? "asc";
  const page = Math.max(1, Math.floor(args.page ?? 1));
  const limit = Math.min(
    Math.max(Math.floor(args.limit ?? FOLDER_SONGS_DEFAULT_LIMIT), 1),
    FOLDER_SONGS_MAX_LIMIT,
  );

  if (folderId || recursive) requirePermission(ctx, "folder.access");

  const folders: FolderNode[] =
    folderId || recursive
      ? await ctx.db.folder.findMany({
          where: { deleted: false },
          select: { id: true, name: true, parentId: true },
        })
      : [];

  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined;
  if (folderId && !folder) {
    throw AppError.notFound(
      "FOLDER_NOT_FOUND",
      `Folder ${folderId} not found. Use folders_list to find folder ids.`,
    );
  }

  const scopeIds: string[] | null = folderId
    ? recursive
      ? collectFolderIds(folders, folderId)
      : [folderId]
    : recursive
      ? null // root + recursive = the whole library
      : [];

  const where =
    scopeIds === null
      ? { deleted: false }
      : scopeIds.length === 0
        ? { deleted: false, folderId: null }
        : { deleted: false, folderId: { in: scopeIds } };

  const rows = await ctx.db.song.findMany({
    where,
    select: {
      id: true,
      title: true,
      artist: true,
      content: true,
      tags: true,
      path: true,
      folderId: true,
      song_number: true,
      updatedAt: true,
    },
  });

  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const sorted = sortSongs(rows, sortBy, sortOrder);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const slice = sorted.slice((page - 1) * limit, page * limit);

  const subfolders = folderId
    ? folders.filter((f) => f.parentId === folderId)
    : (
        await ctx.db.folder.findMany({
          where: { deleted: false, parentId: null },
          select: { id: true, name: true, parentId: true },
        })
      ).map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }));
  subfolders.sort((a, b) => a.name.localeCompare(b.name));

  return {
    folder: folder
      ? {
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          trail: folderTrail(folders, folder.id),
        }
      : { id: null, name: "Library root", parentId: null, trail: [] },
    recursive,
    total,
    page,
    limit,
    totalPages,
    nextPage: page < totalPages ? page + 1 : null,
    subfolders: subfolders.map((f) => ({ id: f.id, name: f.name })),
    songs: slice.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      key: extractKey(s.content),
      song_number: s.song_number,
      tags: s.tags,
      path: s.path,
      folderId: s.folderId,
      ...(recursive && s.folderId
        ? { folderName: folderName.get(s.folderId) ?? null }
        : {}),
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
}
