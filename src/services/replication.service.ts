/**
 * RxDB Replication Service
 *
 * Implements the server-side logic for RxDB's HTTP pull/push replication
 * protocol. Each collection (songs, folders, services) shares the same
 * checkpoint format: `{ updatedAt: number; id: string }`.
 *
 * Pull: returns documents changed *after* the checkpoint, ordered by
 *       (updatedAt ASC, id ASC), limited to `batchSize`.
 *
 * Push: receives an array of change rows from the client, each containing
 *       `{ newDocumentState, assumedMasterState? }`. Performs conflict
 *       detection and returns conflicting server documents.
 *
 * Deletions go to trash first: `deleted: true` + `purgeAt` (now + 30 days) is
 * set and pushed/pulled as regular fields so clients can list/restore trashed
 * items locally. Rows are only hard-removed once `purgeAt` expires (see
 * cron.routes.ts `/purge-trash`); RxDB's reserved `_deleted` tombstone is
 * therefore always `false` on the wire for rows returned by pull.
 */

import { v4 as uuid } from "uuid";
import type { OrgScopedPrisma } from "../database/prisma.js";
import { syncCache } from "./syncCache.service.js";

// ── Checkpoint type ────────────────────────────────────────────────────────
export interface ReplicationCheckpoint {
  updatedAt: number; // Unix epoch milliseconds
  id: string;
}

// ── Pull request / response types ──────────────────────────────────────────
export interface PullRequest {
  checkpoint: ReplicationCheckpoint | null;
  limit: number;
}

export interface PullResponse<T> {
  documents: T[];
  checkpoint: ReplicationCheckpoint | null;
}

// ── Push request / response types ──────────────────────────────────────────
export interface ChangeRow<T> {
  newDocumentState: T;
  assumedMasterState?: T | null;
}

export interface PushRequest<T> {
  changeRows: ChangeRow<T>[];
}

// ── Collection names we replicate ──────────────────────────────────────────
export type ReplicatedCollection = "songs" | "folders" | "services";

// ── Helpers ────────────────────────────────────────────────────────────────

function getDelegate(db: OrgScopedPrisma, collection: ReplicatedCollection) {
  return db[
    collection === "songs"
      ? "song"
      : collection === "folders"
        ? "folder"
        : "service"
  ] as any;
}

/**
 * Convert a Prisma row to the RxDB wire format (dates → ISO).
 *
 * Prisma's `deleted` field is a trash flag (soft-deleted, recoverable until
 * `purgeAt`), not RxDB's reserved tombstone — it is sent through as a plain
 * `deleted` property. RxDB's own `_deleted` is reserved for rows that are
 * truly gone; since a purged row is hard-deleted (see cron.routes.ts) and
 * therefore never returned here, live rows always report `_deleted: false`.
 */
function toWireDoc(doc: any, collection: ReplicatedCollection): any {
  let out: any = { ...doc };
  if (out.createdAt instanceof Date)
    out.createdAt = out.createdAt.toISOString();
  if (out.updatedAt instanceof Date)
    out.updatedAt = out.updatedAt.toISOString();
  if (out.date instanceof Date) out.date = out.date.toISOString();
  if (out.purgeAt instanceof Date) out.purgeAt = out.purgeAt.toISOString();
  out.isDeleted = !!out.deleted;
  out._deleted = false;
  // Strip server-only fields
  delete out.orgId;
  delete out.org;
  delete out.delete;

  if (collection === "folders") {
    out = {
      ...out,
      songCount: doc._count?.songs ?? 0,
      folderCount: doc._count?.children ?? 0,
    };

    delete out._count;
  }

  return out;
}

function hasConflict(serverDoc: any, assumed: any): boolean {
  if (!assumed) return false;
  const sTime =
    serverDoc.updatedAt instanceof Date
      ? serverDoc.updatedAt.getTime()
      : new Date(serverDoc.updatedAt).getTime();
  const aTime =
    assumed.updatedAt instanceof Date
      ? assumed.updatedAt.getTime()
      : new Date(assumed.updatedAt).getTime();
  return sTime !== aTime;
}

// ── Generic pull ───────────────────────────────────────────────────────────

async function pull(
  db: OrgScopedPrisma,
  collection: ReplicatedCollection,
  checkpoint: ReplicationCheckpoint | null,
  limit: number,
): Promise<PullResponse<any>> {
  const delegate = getDelegate(db, collection);

  const where: any = {};
  if (checkpoint) {
    const cpDate = new Date(checkpoint.updatedAt);
    where.OR = [
      { updatedAt: { gt: cpDate } },
      { updatedAt: cpDate, id: { gt: checkpoint.id } },
    ];
  }

  const docs = await delegate.findMany({
    where,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,

    ...(collection === "folders"
      ? {
          include: {
            _count: {
              select: {
                songs: true,
                children: true,
              },
            },
          },
        }
      : {}),
  });

  const newCheckpoint: ReplicationCheckpoint | null =
    docs.length > 0
      ? {
          updatedAt: new Date(docs[docs.length - 1].updatedAt).getTime(),
          id: docs[docs.length - 1].id,
        }
      : checkpoint;

  return {
    documents: docs.map((doc: any) => {
      return toWireDoc(doc, collection);
    }),
    checkpoint: newCheckpoint,
  };
}

// ── Push: songs ────────────────────────────────────────────────────────────

async function pushSongs(
  db: OrgScopedPrisma,
  tenantId: string,
  rows: ChangeRow<any>[],
): Promise<any[]> {
  const conflicts: any[] = [];

  for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
    const existing = await db.song.findUnique({ where: { id: doc.id } });

    if (existing) {
      if (assumed && hasConflict(existing, assumed)) {
        conflicts.push(toWireDoc(existing, "songs"));
        continue;
      }
      if (doc._deleted) {
        await db.song.update({
          where: { id: doc.id },
          data: { deleted: true },
        });
      } else {
        await db.song.update({
          where: { id: doc.id },
          data: {
            title: doc.title,
            artist: doc.artist ?? "Unknown Artist",
            content: doc.content,
            folderId: doc.folderId ?? null,
            path: doc.path,
            tags: doc.tags ?? [],
            song_number: doc.song_number ?? null,
            deleted: !!doc.isDeleted,
            purgeAt: doc.purgeAt ? new Date(doc.purgeAt) : null,
          },
        });
      }
    } else if (!doc._deleted) {
      await db.song.create({
        data: {
          id: doc.id || uuid(),
          title: doc.title,
          artist: doc.artist ?? "Unknown Artist",
          content: doc.content ?? "",
          folderId: doc.folderId ?? null,
          path: doc.path ?? `${doc.title}.pro`,
          tags: doc.tags ?? [],
          song_number: doc.song_number ?? null,
          deleted: !!doc.isDeleted,
          purgeAt: doc.purgeAt ? new Date(doc.purgeAt) : null,
        } as any,
      });
    }
  }

  syncCache.invalidate(tenantId);
  return conflicts;
}

// ── Push: folders ──────────────────────────────────────────────────────────

async function pushFolders(
  db: OrgScopedPrisma,
  tenantId: string,
  rows: ChangeRow<any>[],
): Promise<any[]> {
  const conflicts: any[] = [];

  for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
    const existing = await db.folder.findUnique({
      where: { id: doc.id },
      include: {
        _count: {
          select: {
            songs: true,
            children: true,
          },
        },
      },
    });

    if (existing) {
      if (assumed && hasConflict(existing, assumed)) {
        conflicts.push(toWireDoc(existing, "folders"));
        continue;
      }
      if (doc._deleted) {
        await db.folder.update({
          where: { id: doc.id },
          data: { deleted: true },
        });
      } else {
        await db.folder.update({
          where: { id: doc.id },
          data: {
            name: doc.name,
            parentId: doc.parentId ?? null,
            color: doc.color ?? "default",
            icon: doc.icon ?? "default",
            deleted: !!doc.isDeleted,
            purgeAt: doc.purgeAt ? new Date(doc.purgeAt) : null,
          },
        });
      }
    } else if (!doc._deleted) {
      await db.folder.create({
        data: {
          id: doc.id || uuid(),
          name: doc.name,
          parentId: doc.parentId ?? null,
          color: doc.color ?? "default",
          icon: doc.icon ?? "default",
          deleted: !!doc.isDeleted,
          purgeAt: doc.purgeAt ? new Date(doc.purgeAt) : null,
        } as any,
      });
    }
  }

  syncCache.invalidate(tenantId);
  return conflicts;
}

// ── Push: services ─────────────────────────────────────────────────────────

async function pushServices(
  db: OrgScopedPrisma,
  tenantId: string,
  rows: ChangeRow<any>[],
): Promise<any[]> {
  const conflicts: any[] = [];

  for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
    const existing = await db.service.findUnique({ where: { id: doc.id } });

    if (existing) {
      if (assumed && hasConflict(existing, assumed)) {
        conflicts.push(toWireDoc(existing, "services"));
        continue;
      }
      if (doc._deleted) {
        await db.service.update({
          where: { id: doc.id },
          data: { deleted: true },
        });
      } else {
        await db.service.update({
          where: { id: doc.id },
          data: {
            name: doc.name,
            date: doc.date ? new Date(doc.date) : undefined,
            notes: doc.notes ?? null,
            elements: doc.elements ?? [],
            archived: doc.archived ?? false,
            deleted: !!doc.isDeleted,
            purgeAt: doc.purgeAt ? new Date(doc.purgeAt) : null,
          },
        });
      }
    } else if (!doc._deleted) {
      await db.service.create({
        data: {
          id: doc.id || uuid(),
          name: doc.name,
          date: doc.date ? new Date(doc.date) : new Date(),
          notes: doc.notes ?? "",
          elements: doc.elements ?? [],
          archived: doc.archived ?? false,
          deleted: !!doc.isDeleted,
          purgeAt: doc.purgeAt ? new Date(doc.purgeAt) : null,
        } as any,
      });
    }
  }

  syncCache.invalidate(tenantId);
  return conflicts;
}

// ── Public API ─────────────────────────────────────────────────────────────

const pushHandlers: Record<
  ReplicatedCollection,
  (db: OrgScopedPrisma, tid: string, rows: ChangeRow<any>[]) => Promise<any[]>
> = { songs: pushSongs, folders: pushFolders, services: pushServices };

export class ReplicationService {
  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly tenantId: string,
  ) {}

  pull(collection: ReplicatedCollection, req: PullRequest) {
    return pull(
      this.db,
      collection,
      req.checkpoint,
      Math.min(req.limit || 100, 500),
    );
  }

  push(collection: ReplicatedCollection, req: PushRequest<any>) {
    return pushHandlers[collection](this.db, this.tenantId, req.changeRows);
  }
}
