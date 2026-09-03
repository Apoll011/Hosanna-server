/**
 * RxDB Replication Service
 *
 * Implements high-performance server-side logic for RxDB's HTTP pull/push
 * replication protocol across collections: songs, folders, services, agendaEvents.
 *
 * Checkpoint format: `{ updatedAt: number; id: string }`
 *
 * Pull:
 *  - Queries changed documents with composite index `(orgId, updatedAt, id)`
 *  - Uses lean field selection and batch folder count aggregation (avoiding N+1 counts)
 *
 * Push:
 *  - Batch fetches all candidate records in a single query (eliminating 2*N sequential queries)
 *  - Runs mutations inside an interactive transaction for ACID consistency
 *  - Detects conflicts before executing updates
 *  - Invalidates syncCache atomically only when state was modified
 */

import { v4 as uuid } from "uuid";
import type { OrgScopedPrisma, OrgScopedTx } from "../database/prisma.js";
import { syncCache } from "./syncCache.service.js";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

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

export interface PullAllRequest {
  checkpoints: MultiPullCheckpoints;
  limit?: number;
}

export type MultiPullCheckpoints = Partial<
  Record<ReplicatedCollection, ReplicationCheckpoint | null>
>;
export type MultiPullLimits =
  | Partial<Record<ReplicatedCollection, number>>
  | number;
export type MultiPullResponse<T> = Record<ReplicatedCollection, PullResponse<T>>;

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
export type ReplicatedCollection =
  | "songs"
  | "folders"
  | "services"
  | "agendaEvents";

export const ALL_COLLECTIONS: readonly ReplicatedCollection[] = [
  "songs",
  "folders",
  "services",
  "agendaEvents",
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

const DELEGATE_BY_COLLECTION = {
  songs: "song",
  folders: "folder",
  services: "service",
  agendaEvents: "agendaEvent",
} as const;

const DEFAULT_REMINDER = Object.freeze({ enabled: false, label: "" });

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? null : d;
}

function toTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  const time = new Date(value as string | number).getTime();
  return isNaN(time) ? null : time;
}

function toWireSong(doc: any): any {
  return {
    id: doc.id,
    title: doc.title,
    artist: doc.artist,
    content: doc.content,
    folderId: doc.folderId ?? null,
    path: doc.path,
    tags: doc.tags ?? [],
    song_number: doc.song_number ?? null,
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : doc.createdAt,
    updatedAt:
      doc.updatedAt instanceof Date
        ? doc.updatedAt.toISOString()
        : doc.updatedAt,
    purgeAt:
      doc.purgeAt instanceof Date
        ? doc.purgeAt.toISOString()
        : (doc.purgeAt ?? null),
    isDeleted: Boolean(doc.deleted),
    _deleted: false,
  };
}

function toWireFolder(doc: any, songCount = 0, folderCount = 0): any {
  return {
    id: doc.id,
    name: doc.name,
    parentId: doc.parentId ?? null,
    color: doc.color,
    icon: doc.icon,
    songCount: doc._count?.songs ?? songCount,
    folderCount: doc._count?.children ?? folderCount,
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : doc.createdAt,
    updatedAt:
      doc.updatedAt instanceof Date
        ? doc.updatedAt.toISOString()
        : doc.updatedAt,
    purgeAt:
      doc.purgeAt instanceof Date
        ? doc.purgeAt.toISOString()
        : (doc.purgeAt ?? null),
    isDeleted: Boolean(doc.deleted),
    _deleted: false,
  };
}

function toWireService(doc: any): any {
  return {
    id: doc.id,
    name: doc.name,
    date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
    notes: doc.notes ?? "",
    elements: doc.elements ?? [],
    archived: Boolean(doc.archived),
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : doc.createdAt,
    updatedAt:
      doc.updatedAt instanceof Date
        ? doc.updatedAt.toISOString()
        : doc.updatedAt,
    purgeAt:
      doc.purgeAt instanceof Date
        ? doc.purgeAt.toISOString()
        : (doc.purgeAt ?? null),
    isDeleted: Boolean(doc.deleted),
    _deleted: false,
  };
}

function toWireAgendaEvent(doc: any): any {
  return {
    id: doc.id,
    date: doc.date,
    title: doc.title,
    type: doc.type,
    time: doc.time,
    durationMinutes: doc.durationMinutes,
    location: doc.location ?? null,
    notes: doc.notes ?? null,
    reminder: doc.reminder ?? DEFAULT_REMINDER,
    linkedServiceId: doc.linkedServiceId ?? null,
    responsibilities: doc.responsibilities ?? [],
    createdAt:
      doc.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : doc.createdAt,
    updatedAt:
      doc.updatedAt instanceof Date
        ? doc.updatedAt.toISOString()
        : doc.updatedAt,
    purgeAt:
      doc.purgeAt instanceof Date
        ? doc.purgeAt.toISOString()
        : (doc.purgeAt ?? null),
    isDeleted: Boolean(doc.deleted),
    _deleted: false,
  };
}

export function toWireDoc(
  doc: any,
  collection: ReplicatedCollection,
  counts?: { songCount: number; folderCount: number },
): any {
  switch (collection) {
    case "songs":
      return toWireSong(doc);
    case "folders":
      return toWireFolder(doc, counts?.songCount, counts?.folderCount);
    case "services":
      return toWireService(doc);
    case "agendaEvents":
      return toWireAgendaEvent(doc);
  }
}

function hasConflict(serverDoc: any, assumed: any): boolean {
  if (!assumed) return false;
  const sTime = toTimestamp(serverDoc.updatedAt);
  const aTime = toTimestamp(assumed.updatedAt);
  if (sTime === null || aTime === null) return true;
  return sTime !== aTime;
}

function buildCheckpointWhere(checkpoint: ReplicationCheckpoint | null) {
  if (!checkpoint) return {};
  const checkpointDate = new Date(checkpoint.updatedAt);
  return {
    OR: [
      { updatedAt: { gt: checkpointDate } },
      {
        updatedAt: checkpointDate,
        id: { gt: checkpoint.id },
      },
    ],
  };
}

// ── Generic pull ───────────────────────────────────────────────────────────

async function pullOne(
  db: OrgScopedPrisma,
  collection: ReplicatedCollection,
  checkpoint: ReplicationCheckpoint | null,
  limit: number,
): Promise<PullResponse<any>> {
  const delegateName = DELEGATE_BY_COLLECTION[collection];
  const delegate = (db as any)[delegateName];
  const where = buildCheckpointWhere(checkpoint);

  if (collection === "folders") {
    // Lean fetch without subquery JOINs in the main query
    const docs = await delegate.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit,
    });

    if (docs.length === 0) {
      return { documents: [], checkpoint };
    }

    const folderIds = docs.map((d: any) => d.id);

    // Batch aggregate child songs and child folders in parallel
    const [songCounts, folderCounts] = await Promise.all([
      db.song.groupBy({
        by: ["folderId"],
        where: { folderId: { in: folderIds } },
        _count: { _all: true },
      }),
      db.folder.groupBy({
        by: ["parentId"],
        where: { parentId: { in: folderIds } },
        _count: { _all: true },
      }),
    ]);

    const songCountMap = new Map<string, number>();
    for (const sc of songCounts) {
      if (sc.folderId) songCountMap.set(sc.folderId, sc._count._all);
    }

    const folderCountMap = new Map<string, number>();
    for (const fc of folderCounts) {
      if (fc.parentId) folderCountMap.set(fc.parentId, fc._count._all);
    }

    const last = docs[docs.length - 1];
    const newCheckpoint: ReplicationCheckpoint = {
      updatedAt: new Date(last.updatedAt).getTime(),
      id: last.id,
    };

    const documents = docs.map((doc: any) =>
      toWireFolder(
        doc,
        songCountMap.get(doc.id) ?? 0,
        folderCountMap.get(doc.id) ?? 0,
      ),
    );

    return { documents, checkpoint: newCheckpoint };
  }

  const docs = await delegate.findMany({
    where,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  if (docs.length === 0) {
    return { documents: [], checkpoint };
  }

  const last = docs[docs.length - 1];
  const newCheckpoint: ReplicationCheckpoint = {
    updatedAt: new Date(last.updatedAt).getTime(),
    id: last.id,
  };

  const documents = docs.map((doc: any) => toWireDoc(doc, collection));
  return { documents, checkpoint: newCheckpoint };
}

/**
 * Pulls all replicated collections in a single round trip (concurrently),
 * returning per-collection documents + checkpoints.
 */
export async function pullAll(
  db: OrgScopedPrisma,
  checkpoints: MultiPullCheckpoints = {},
  limits: MultiPullLimits = DEFAULT_LIMIT,
  collections: readonly ReplicatedCollection[] = ALL_COLLECTIONS,
): Promise<MultiPullResponse<any>> {
  const results = await Promise.all(
    collections.map((collection) => {
      const limit =
        typeof limits === "number"
          ? limits
          : (limits[collection] ?? DEFAULT_LIMIT);
      return pullOne(db, collection, checkpoints[collection] ?? null, limit);
    }),
  );

  const response = {} as MultiPullResponse<any>;
  for (let i = 0; i < collections.length; i++) {
    response[collections[i]] = results[i];
  }
  return response;
}

// Keep the old single-collection signature around for backward compatibility
export const pull = pullOne;

// ── Push: songs ────────────────────────────────────────────────────────────

async function pushSongs(
  db: OrgScopedPrisma,
  tenantId: string,
  rows: ChangeRow<any>[],
): Promise<any[]> {
  if (rows.length === 0) return [];

  const candidateIds = rows
    .map((r) => r.newDocumentState?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const existingList =
    candidateIds.length > 0
      ? await db.song.findMany({ where: { id: { in: candidateIds } } })
      : [];

  const existingMap = new Map<string, any>();
  for (const item of existingList) {
    existingMap.set(item.id, item);
  }

  const conflicts: any[] = [];
  let mutationCount = 0;

  await db.$transaction(async (tx: OrgScopedTx) => {
    for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
      if (!doc || typeof doc !== "object") continue;

      const existing = doc.id ? existingMap.get(doc.id) : undefined;

      if (existing) {
        if (assumed && hasConflict(existing, assumed)) {
          conflicts.push(toWireSong(existing));
          continue;
        }

        mutationCount++;
        if (doc._deleted) {
          await tx.song.update({
            where: { id: doc.id },
            data: { deleted: true },
          });
        } else {
          await tx.song.update({
            where: { id: doc.id },
            data: {
              title: doc.title,
              artist: doc.artist ?? "Unknown Artist",
              content: doc.content ?? "",
              folderId: doc.folderId ?? null,
              path: doc.path ?? `${doc.title}.pro`,
              tags: Array.isArray(doc.tags) ? doc.tags : [],
              song_number: doc.song_number ?? null,
              deleted: Boolean(doc.isDeleted),
              purgeAt: parseDate(doc.purgeAt),
            },
          });
        }
      } else if (!doc._deleted) {
        mutationCount++;
        const newId = doc.id || uuid();
        await tx.song.create({
          data: {
            id: newId,
            title: doc.title,
            artist: doc.artist ?? "Unknown Artist",
            content: doc.content ?? "",
            folderId: doc.folderId ?? null,
            path: doc.path ?? `${doc.title}.pro`,
            tags: Array.isArray(doc.tags) ? doc.tags : [],
            song_number: doc.song_number ?? null,
            deleted: Boolean(doc.isDeleted),
            purgeAt: parseDate(doc.purgeAt),
          } as any,
        });
      }
    }
  });

  if (mutationCount > 0) {
    syncCache.invalidate(tenantId);
  }
  return conflicts;
}

// ── Push: folders ──────────────────────────────────────────────────────────

async function pushFolders(
  db: OrgScopedPrisma,
  tenantId: string,
  rows: ChangeRow<any>[],
): Promise<any[]> {
  if (rows.length === 0) return [];

  const candidateIds = rows
    .map((r) => r.newDocumentState?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const existingList =
    candidateIds.length > 0
      ? await db.folder.findMany({
          where: { id: { in: candidateIds } },
          include: {
            _count: {
              select: {
                songs: true,
                children: true,
              },
            },
          },
        })
      : [];

  const existingMap = new Map<string, any>();
  for (const item of existingList) {
    existingMap.set(item.id, item);
  }

  const conflicts: any[] = [];
  let mutationCount = 0;

  await db.$transaction(async (tx: OrgScopedTx) => {
    for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
      if (!doc || typeof doc !== "object") continue;

      const existing = doc.id ? existingMap.get(doc.id) : undefined;

      if (existing) {
        if (assumed && hasConflict(existing, assumed)) {
          conflicts.push(toWireFolder(existing));
          continue;
        }

        mutationCount++;
        if (doc._deleted) {
          await tx.folder.update({
            where: { id: doc.id },
            data: { deleted: true },
          });
        } else {
          await tx.folder.update({
            where: { id: doc.id },
            data: {
              name: doc.name,
              parentId: doc.parentId ?? null,
              color: doc.color ?? "default",
              icon: doc.icon ?? "default",
              deleted: Boolean(doc.isDeleted),
              purgeAt: parseDate(doc.purgeAt),
            },
          });
        }
      } else if (!doc._deleted) {
        mutationCount++;
        const newId = doc.id || uuid();
        await tx.folder.create({
          data: {
            id: newId,
            name: doc.name,
            parentId: doc.parentId ?? null,
            color: doc.color ?? "default",
            icon: doc.icon ?? "default",
            deleted: Boolean(doc.isDeleted),
            purgeAt: parseDate(doc.purgeAt),
          } as any,
        });
      }
    }
  });

  if (mutationCount > 0) {
    syncCache.invalidate(tenantId);
  }
  return conflicts;
}

// ── Push: services ─────────────────────────────────────────────────────────

async function pushServices(
  db: OrgScopedPrisma,
  tenantId: string,
  rows: ChangeRow<any>[],
): Promise<any[]> {
  if (rows.length === 0) return [];

  const candidateIds = rows
    .map((r) => r.newDocumentState?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const existingList =
    candidateIds.length > 0
      ? await db.service.findMany({ where: { id: { in: candidateIds } } })
      : [];

  const existingMap = new Map<string, any>();
  for (const item of existingList) {
    existingMap.set(item.id, item);
  }

  const conflicts: any[] = [];
  let mutationCount = 0;

  await db.$transaction(async (tx: OrgScopedTx) => {
    for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
      if (!doc || typeof doc !== "object") continue;

      const existing = doc.id ? existingMap.get(doc.id) : undefined;

      if (existing) {
        if (assumed && hasConflict(existing, assumed)) {
          conflicts.push(toWireService(existing));
          continue;
        }

        mutationCount++;
        if (doc._deleted) {
          await tx.service.update({
            where: { id: doc.id },
            data: { deleted: true },
          });
        } else {
          await tx.service.update({
            where: { id: doc.id },
            data: {
              name: doc.name,
              date: parseDate(doc.date) ?? undefined,
              notes: doc.notes ?? null,
              elements: Array.isArray(doc.elements) ? doc.elements : [],
              archived: Boolean(doc.archived),
              deleted: Boolean(doc.isDeleted),
              purgeAt: parseDate(doc.purgeAt),
            },
          });
        }
      } else if (!doc._deleted) {
        mutationCount++;
        const newId = doc.id || uuid();
        await tx.service.create({
          data: {
            id: newId,
            name: doc.name,
            date: parseDate(doc.date) ?? new Date(),
            notes: doc.notes ?? "",
            elements: Array.isArray(doc.elements) ? doc.elements : [],
            archived: Boolean(doc.archived),
            deleted: Boolean(doc.isDeleted),
            purgeAt: parseDate(doc.purgeAt),
          } as any,
        });
      }
    }
  });

  if (mutationCount > 0) {
    syncCache.invalidate(tenantId);
  }
  return conflicts;
}

// ── Push: agenda events ────────────────────────────────────────────────────

async function pushAgendaEvents(
  db: OrgScopedPrisma,
  tenantId: string,
  rows: ChangeRow<any>[],
): Promise<any[]> {
  if (rows.length === 0) return [];

  const candidateIds = rows
    .map((r) => r.newDocumentState?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const existingList =
    candidateIds.length > 0
      ? await db.agendaEvent.findMany({ where: { id: { in: candidateIds } } })
      : [];

  const existingMap = new Map<string, any>();
  for (const item of existingList) {
    existingMap.set(item.id, item);
  }

  const conflicts: any[] = [];
  let mutationCount = 0;

  await db.$transaction(async (tx: OrgScopedTx) => {
    for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
      if (!doc || typeof doc !== "object") continue;

      const existing = doc.id ? existingMap.get(doc.id) : undefined;

      if (existing) {
        if (assumed && hasConflict(existing, assumed)) {
          conflicts.push(toWireAgendaEvent(existing));
          continue;
        }

        mutationCount++;
        if (doc._deleted) {
          await tx.agendaEvent.update({
            where: { id: doc.id },
            data: { deleted: true },
          });
        } else {
          await tx.agendaEvent.update({
            where: { id: doc.id },
            data: {
              date: doc.date,
              title: doc.title,
              type: doc.type,
              time: doc.time,
              durationMinutes: Number(doc.durationMinutes) || 0,
              location: doc.location ?? null,
              notes: doc.notes ?? null,
              reminder: doc.reminder ?? DEFAULT_REMINDER,
              linkedServiceId: doc.linkedServiceId ?? null,
              responsibilities: Array.isArray(doc.responsibilities)
                ? doc.responsibilities
                : [],
              deleted: Boolean(doc.isDeleted),
              purgeAt: parseDate(doc.purgeAt),
            },
          });
        }
      } else if (!doc._deleted) {
        mutationCount++;
        const newId = doc.id || uuid();
        await tx.agendaEvent.create({
          data: {
            id: newId,
            date: doc.date,
            title: doc.title,
            type: doc.type,
            time: doc.time,
            durationMinutes: Number(doc.durationMinutes) || 0,
            location: doc.location ?? null,
            notes: doc.notes ?? null,
            reminder: doc.reminder ?? DEFAULT_REMINDER,
            linkedServiceId: doc.linkedServiceId ?? null,
            responsibilities: Array.isArray(doc.responsibilities)
              ? doc.responsibilities
              : [],
            deleted: Boolean(doc.isDeleted),
            purgeAt: parseDate(doc.purgeAt),
          } as any,
        });
      }
    }
  });

  if (mutationCount > 0) {
    syncCache.invalidate(tenantId);
  }
  return conflicts;
}

// ── Public API ─────────────────────────────────────────────────────────────

const pushHandlers: Record<
  ReplicatedCollection,
  (db: OrgScopedPrisma, tid: string, rows: ChangeRow<any>[]) => Promise<any[]>
> = {
  songs: pushSongs,
  folders: pushFolders,
  services: pushServices,
  agendaEvents: pushAgendaEvents,
};

export class ReplicationService {
  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly tenantId: string,
  ) {}

  pull(collection: ReplicatedCollection, req: PullRequest) {
    const limit = Math.max(1, Math.min(req.limit || DEFAULT_LIMIT, MAX_LIMIT));
    return pullOne(this.db, collection, req.checkpoint, limit);
  }

  pullAll(req: PullAllRequest) {
    const collections =
      req.checkpoints && Object.keys(req.checkpoints).length > 0
        ? (Object.keys(req.checkpoints) as ReplicatedCollection[])
        : ALL_COLLECTIONS;

    const limit = Math.max(1, Math.min(req.limit || DEFAULT_LIMIT, MAX_LIMIT));
    return pullAll(this.db, req.checkpoints, limit, collections);
  }

  push(collection: ReplicatedCollection, req: PushRequest<any>) {
    const handler = pushHandlers[collection];
    if (!handler) {
      throw new Error(`Unsupported replication collection: ${collection}`);
    }
    return handler(this.db, this.tenantId, req.changeRows || []);
  }
}

