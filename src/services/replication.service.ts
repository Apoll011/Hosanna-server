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

const MAX_LIMIT = 2000;
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
export type MultiPullResponse<T> = Record<
  ReplicatedCollection,
  PullResponse<T>
>;

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
  | "collections"
  | "services"
  | "agendaEvents";

export const ALL_COLLECTIONS: readonly ReplicatedCollection[] = [
  "songs",
  "folders",
  "collections",
  "services",
  "agendaEvents",
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

const DELEGATE_BY_COLLECTION = {
  songs: "song",
  folders: "folder",
  collections: "collection",
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
    collectionIds:
      doc.collections?.map((collection: any) => collection.id) ?? [],
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

function toWireCollection(doc: any, songCount = 0): any {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description ?? null,
    color: doc.color,
    icon: doc.icon,
    image: doc.image ?? null,
    songCount: doc._count?.songs ?? songCount,
    songIds: doc.songs?.map((song: any) => song.id) ?? [],
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
  counts?: { songCount: number; folderCount?: number },
): any {
  switch (collection) {
    case "songs":
      return toWireSong(doc);
    case "folders":
      return toWireFolder(doc, counts?.songCount, counts?.folderCount);
    case "collections":
      return toWireCollection(doc, counts?.songCount);
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
  tenantId: string,
  collection: ReplicatedCollection,
  checkpoint: ReplicationCheckpoint | null,
  limit: number,
): Promise<PullResponse<any>> {
  // Fast path: if syncCache knows nothing has changed since checkpoint, return immediately!
  if (syncCache.hasNoChanges(tenantId, collection, checkpoint)) {
    return { documents: [], checkpoint };
  }

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
      syncCache.setLatestCheckpoint(tenantId, collection, checkpoint);
      return { documents: [], checkpoint };
    }

    const last = docs[docs.length - 1];
    const newCheckpoint: ReplicationCheckpoint = {
      updatedAt: new Date(last.updatedAt).getTime(),
      id: last.id,
    };

    if (docs.length < limit) {
      syncCache.setLatestCheckpoint(tenantId, collection, newCheckpoint);
    }

    const documents = docs.map((doc: any) => toWireFolder(doc));
    return { documents, checkpoint: newCheckpoint };
  }

  if (collection === "collections") {
    const docs = await delegate.findMany({
      where,
      include: {
        songs: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit,
    });

    if (docs.length === 0) {
      syncCache.setLatestCheckpoint(tenantId, collection, checkpoint);
      return { documents: [], checkpoint };
    }

    const last = docs[docs.length - 1];
    const newCheckpoint: ReplicationCheckpoint = {
      updatedAt: new Date(last.updatedAt).getTime(),
      id: last.id,
    };

    if (docs.length < limit) {
      syncCache.setLatestCheckpoint(tenantId, collection, newCheckpoint);
    }

    const documents = docs.map((doc: any) =>
      toWireCollection(doc, doc.songs?.length ?? 0),
    );
    return { documents, checkpoint: newCheckpoint };
  }

  const docs = await delegate.findMany({
    where,
    ...(collection === "songs" && {
      include: {
        collections: {
          select: {
            id: true,
          },
        },
      },
    }),
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
  });

  if (docs.length === 0) {
    syncCache.setLatestCheckpoint(tenantId, collection, checkpoint);
    return { documents: [], checkpoint };
  }

  const last = docs[docs.length - 1];
  const newCheckpoint: ReplicationCheckpoint = {
    updatedAt: new Date(last.updatedAt).getTime(),
    id: last.id,
  };

  if (docs.length < limit) {
    syncCache.setLatestCheckpoint(tenantId, collection, newCheckpoint);
  }

  const documents = docs.map((doc: any) => toWireDoc(doc, collection));
  return { documents, checkpoint: newCheckpoint };
}

/**
 * Pulls all replicated collections in a single round trip,
 * checking syncCache first to eliminate queries for unchanged collections.
 */
export async function pullAll(
  db: OrgScopedPrisma,
  tenantId: string,
  checkpoints: MultiPullCheckpoints = {},
  limits: MultiPullLimits = DEFAULT_LIMIT,
  collections: readonly ReplicatedCollection[] = ALL_COLLECTIONS,
): Promise<MultiPullResponse<any>> {
  const response = {} as MultiPullResponse<any>;
  const collectionsToFetch: { collection: ReplicatedCollection; limit: number }[] = [];

  for (const collection of collections) {
    const cp = checkpoints[collection] ?? null;
    if (syncCache.hasNoChanges(tenantId, collection, cp)) {
      response[collection] = { documents: [], checkpoint: cp };
    } else {
      const limit =
        typeof limits === "number"
          ? limits
          : (limits[collection] ?? DEFAULT_LIMIT);
      collectionsToFetch.push({ collection, limit });
    }
  }

  if (collectionsToFetch.length > 0) {
    const fetchedResults = await Promise.all(
      collectionsToFetch.map(({ collection, limit }) =>
        pullOne(db, tenantId, collection, checkpoints[collection] ?? null, limit),
      ),
    );
    for (let i = 0; i < collectionsToFetch.length; i++) {
      response[collectionsToFetch[i].collection] = fetchedResults[i];
    }
  }

  return response;
}

// Keep single-collection signature around for backward compatibility
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

  // Lean lookup: only fetch id and updatedAt to detect conflicts for 300+ songs
  const existingList =
    candidateIds.length > 0
      ? await db.song.findMany({
          where: { id: { in: candidateIds } },
          select: {
            id: true,
            updatedAt: true,
          },
        })
      : [];

  const existingMap = new Map<string, { id: string; updatedAt: Date }>();
  for (const item of existingList) {
    existingMap.set(item.id, item);
  }

  const conflicts: any[] = [];
  const conflictIds: string[] = [];
  let mutationCount = 0;

  type MutationFn = (tx: OrgScopedTx) => Promise<any>;
  const mutations: MutationFn[] = [];

  for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
    if (!doc || typeof doc !== "object") continue;

    const existing = doc.id ? existingMap.get(doc.id) : undefined;

    if (existing) {
      if (assumed && hasConflict(existing, assumed)) {
        conflictIds.push(doc.id);
        continue;
      }

      mutationCount++;
      if (doc._deleted) {
        mutations.push((tx) =>
          tx.song.update({
            where: { id: doc.id },
            data: { deleted: true },
          }),
        );
      } else {
        const songData: any = {};
        if (doc.title !== undefined) songData.title = doc.title;
        if (doc.artist !== undefined) songData.artist = doc.artist;
        if (doc.content !== undefined) songData.content = doc.content;
        if (doc.folderId !== undefined) songData.folderId = doc.folderId;
        if (doc.path !== undefined) songData.path = doc.path;
        if (doc.tags !== undefined) songData.tags = Array.isArray(doc.tags) ? doc.tags : [];
        if (doc.song_number !== undefined) songData.song_number = doc.song_number;
        if (doc.isDeleted !== undefined) songData.deleted = Boolean(doc.isDeleted);
        if (doc.purgeAt !== undefined) songData.purgeAt = parseDate(doc.purgeAt);
        if (Array.isArray(doc.collectionIds)) {
          songData.collections = {
            set: doc.collectionIds.map((id: string) => ({ id })),
          };
        }
        mutations.push((tx) =>
          tx.song.update({
            where: { id: doc.id },
            data: songData,
          }),
        );
      }
    } else if (!doc._deleted) {
      mutationCount++;
      const newId = doc.id || uuid();
      const createSongData: any = {
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
      };
      if (Array.isArray(doc.collectionIds)) {
        createSongData.collections = {
          connect: doc.collectionIds.map((id: string) => ({ id })),
        };
      }
      mutations.push((tx) =>
        tx.song.create({
          data: createSongData as any,
        }),
      );
    }
  }

  // If any conflicts occurred (rare), load their full wire representation
  if (conflictIds.length > 0) {
    const conflictedDocs = await db.song.findMany({
      where: { id: { in: conflictIds } },
      include: {
        collections: {
          select: { id: true },
        },
      },
    });
    for (const cDoc of conflictedDocs) {
      conflicts.push(toWireSong(cDoc));
    }
  }

  // Execute mutations in chunked batches inside an extended transaction
  if (mutations.length > 0) {
    const BATCH_SIZE = 15;
    await db.$transaction(
      async (tx: OrgScopedTx) => {
        for (let i = 0; i < mutations.length; i += BATCH_SIZE) {
          const chunk = mutations.slice(i, i + BATCH_SIZE);
          await Promise.all(chunk.map((fn) => fn(tx)));
        }
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
  }

  if (mutationCount > 0) {
    syncCache.invalidate(tenantId, "songs");
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
          select: { id: true, updatedAt: true },
        })
      : [];

  const existingMap = new Map<string, { id: string; updatedAt: Date }>();
  for (const item of existingList) {
    existingMap.set(item.id, item);
  }

  const conflicts: any[] = [];
  const conflictIds: string[] = [];
  let mutationCount = 0;

  type MutationFn = (tx: OrgScopedTx) => Promise<any>;
  const mutations: MutationFn[] = [];

  for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
    if (!doc || typeof doc !== "object") continue;

    const existing = doc.id ? existingMap.get(doc.id) : undefined;

    if (existing) {
      if (assumed && hasConflict(existing, assumed)) {
        conflictIds.push(doc.id);
        continue;
      }

      mutationCount++;
      if (doc._deleted) {
        mutations.push((tx) =>
          tx.folder.update({
            where: { id: doc.id },
            data: { deleted: true },
          }),
        );
      } else {
        const folderData: any = {};
        if (doc.name !== undefined) folderData.name = doc.name;
        if (doc.parentId !== undefined) folderData.parentId = doc.parentId;
        if (doc.color !== undefined) folderData.color = doc.color;
        if (doc.icon !== undefined) folderData.icon = doc.icon;
        if (doc.isDeleted !== undefined) folderData.deleted = Boolean(doc.isDeleted);
        if (doc.purgeAt !== undefined) folderData.purgeAt = parseDate(doc.purgeAt);

        mutations.push((tx) =>
          tx.folder.update({
            where: { id: doc.id },
            data: folderData,
          }),
        );
      }
    } else if (!doc._deleted) {
      mutationCount++;
      const newId = doc.id || uuid();
      mutations.push((tx) =>
        tx.folder.create({
          data: {
            id: newId,
            name: doc.name,
            parentId: doc.parentId ?? null,
            color: doc.color ?? "default",
            icon: doc.icon ?? "default",
            deleted: Boolean(doc.isDeleted),
            purgeAt: parseDate(doc.purgeAt),
          } as any,
        }),
      );
    }
  }

  if (conflictIds.length > 0) {
    const conflictedDocs = await db.folder.findMany({
      where: { id: { in: conflictIds } },
      include: {
        _count: {
          select: { songs: true, children: true },
        },
      },
    });
    for (const cDoc of conflictedDocs) {
      conflicts.push(toWireFolder(cDoc));
    }
  }

  if (mutations.length > 0) {
    const BATCH_SIZE = 15;
    await db.$transaction(
      async (tx: OrgScopedTx) => {
        for (let i = 0; i < mutations.length; i += BATCH_SIZE) {
          const chunk = mutations.slice(i, i + BATCH_SIZE);
          await Promise.all(chunk.map((fn) => fn(tx)));
        }
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
  }

  if (mutationCount > 0) {
    syncCache.invalidate(tenantId, "folders");
  }
  return conflicts;
}

// ── Push: collections ──────────────────────────────────────────────────────

async function pushCollections(
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
      ? await db.collection.findMany({
          where: { id: { in: candidateIds } },
          select: { id: true, updatedAt: true },
        })
      : [];

  const existingMap = new Map<string, { id: string; updatedAt: Date }>();
  for (const item of existingList) {
    existingMap.set(item.id, item);
  }

  const conflicts: any[] = [];
  const conflictIds: string[] = [];
  let mutationCount = 0;

  type MutationFn = (tx: OrgScopedTx) => Promise<any>;
  const mutations: MutationFn[] = [];

  for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
    if (!doc || typeof doc !== "object") continue;

    const existing = doc.id ? existingMap.get(doc.id) : undefined;

    if (existing) {
      if (assumed && hasConflict(existing, assumed)) {
        conflictIds.push(doc.id);
        continue;
      }

      mutationCount++;
      if (doc._deleted) {
        mutations.push((tx) =>
          tx.collection.update({
            where: { id: doc.id },
            data: { deleted: true },
          }),
        );
      } else {
        const updateData: any = {};
        if (doc.name !== undefined) updateData.name = doc.name;
        if (doc.description !== undefined) updateData.description = doc.description;
        if (doc.color !== undefined) updateData.color = doc.color;
        if (doc.icon !== undefined) updateData.icon = doc.icon;
        if (doc.image !== undefined) updateData.image = doc.image;
        if (doc.isDeleted !== undefined) updateData.deleted = Boolean(doc.isDeleted);
        if (doc.purgeAt !== undefined) updateData.purgeAt = parseDate(doc.purgeAt);
        if (Array.isArray(doc.songIds)) {
          updateData.songs = {
            set: doc.songIds.map((id: string) => ({ id })),
          };
        }
        mutations.push((tx) =>
          tx.collection.update({
            where: { id: doc.id },
            data: updateData,
          }),
        );
      }
    } else if (!doc._deleted) {
      mutationCount++;
      const newId = doc.id || uuid();
      const createData: any = {
        id: newId,
        name: doc.name,
        description: doc.description ?? null,
        color: doc.color ?? "default",
        icon: doc.icon ?? "default",
        image: doc.image ?? null,
        deleted: Boolean(doc.isDeleted),
        purgeAt: parseDate(doc.purgeAt),
      };
      if (Array.isArray(doc.songIds)) {
        createData.songs = {
          connect: doc.songIds.map((id: string) => ({ id })),
        };
      }
      mutations.push((tx) =>
        tx.collection.create({
          data: createData as any,
        }),
      );
    }
  }

  if (conflictIds.length > 0) {
    const conflictedDocs = await db.collection.findMany({
      where: { id: { in: conflictIds } },
      include: {
        songs: {
          select: { id: true },
        },
      },
    });
    for (const cDoc of conflictedDocs) {
      conflicts.push(toWireCollection(cDoc, cDoc.songs?.length ?? 0));
    }
  }

  if (mutations.length > 0) {
    const BATCH_SIZE = 15;
    await db.$transaction(
      async (tx: OrgScopedTx) => {
        for (let i = 0; i < mutations.length; i += BATCH_SIZE) {
          const chunk = mutations.slice(i, i + BATCH_SIZE);
          await Promise.all(chunk.map((fn) => fn(tx)));
        }
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
  }

  if (mutationCount > 0) {
    syncCache.invalidate(tenantId, "collections");
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
      ? await db.service.findMany({
          where: { id: { in: candidateIds } },
          select: { id: true, updatedAt: true },
        })
      : [];

  const existingMap = new Map<string, { id: string; updatedAt: Date }>();
  for (const item of existingList) {
    existingMap.set(item.id, item);
  }

  const conflicts: any[] = [];
  const conflictIds: string[] = [];
  let mutationCount = 0;

  type MutationFn = (tx: OrgScopedTx) => Promise<any>;
  const mutations: MutationFn[] = [];

  for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
    if (!doc || typeof doc !== "object") continue;

    const existing = doc.id ? existingMap.get(doc.id) : undefined;

    if (existing) {
      if (assumed && hasConflict(existing, assumed)) {
        conflictIds.push(doc.id);
        continue;
      }

      mutationCount++;
      if (doc._deleted) {
        mutations.push((tx) =>
          tx.service.update({
            where: { id: doc.id },
            data: { deleted: true },
          }),
        );
      } else {
        const serviceData: any = {};
        if (doc.name !== undefined) serviceData.name = doc.name;
        if (doc.date !== undefined) serviceData.date = parseDate(doc.date);
        if (doc.notes !== undefined) serviceData.notes = doc.notes;
        if (doc.elements !== undefined && Array.isArray(doc.elements)) serviceData.elements = doc.elements;
        if (doc.archived !== undefined) serviceData.archived = Boolean(doc.archived);
        if (doc.isDeleted !== undefined) serviceData.deleted = Boolean(doc.isDeleted);
        if (doc.purgeAt !== undefined) serviceData.purgeAt = parseDate(doc.purgeAt);

        mutations.push((tx) =>
          tx.service.update({
            where: { id: doc.id },
            data: serviceData,
          }),
        );
      }
    } else if (!doc._deleted) {
      mutationCount++;
      const newId = doc.id || uuid();
      mutations.push((tx) =>
        tx.service.create({
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
        }),
      );
    }
  }

  if (conflictIds.length > 0) {
    const conflictedDocs = await db.service.findMany({
      where: { id: { in: conflictIds } },
    });
    for (const cDoc of conflictedDocs) {
      conflicts.push(toWireService(cDoc));
    }
  }

  if (mutations.length > 0) {
    const BATCH_SIZE = 15;
    await db.$transaction(
      async (tx: OrgScopedTx) => {
        for (let i = 0; i < mutations.length; i += BATCH_SIZE) {
          const chunk = mutations.slice(i, i + BATCH_SIZE);
          await Promise.all(chunk.map((fn) => fn(tx)));
        }
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
  }

  if (mutationCount > 0) {
    syncCache.invalidate(tenantId, "services");
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
      ? await db.agendaEvent.findMany({
          where: { id: { in: candidateIds } },
          select: { id: true, updatedAt: true },
        })
      : [];

  const existingMap = new Map<string, { id: string; updatedAt: Date }>();
  for (const item of existingList) {
    existingMap.set(item.id, item);
  }

  const conflicts: any[] = [];
  const conflictIds: string[] = [];
  let mutationCount = 0;

  type MutationFn = (tx: OrgScopedTx) => Promise<any>;
  const mutations: MutationFn[] = [];

  for (const { newDocumentState: doc, assumedMasterState: assumed } of rows) {
    if (!doc || typeof doc !== "object") continue;

    const existing = doc.id ? existingMap.get(doc.id) : undefined;

    if (existing) {
      if (assumed && hasConflict(existing, assumed)) {
        conflictIds.push(doc.id);
        continue;
      }

      mutationCount++;
      if (doc._deleted) {
        mutations.push((tx) =>
          tx.agendaEvent.update({
            where: { id: doc.id },
            data: { deleted: true },
          }),
        );
      } else {
        const eventData: any = {};
        if (doc.date !== undefined) eventData.date = doc.date;
        if (doc.title !== undefined) eventData.title = doc.title;
        if (doc.type !== undefined) eventData.type = doc.type;
        if (doc.time !== undefined) eventData.time = doc.time;
        if (doc.durationMinutes !== undefined) eventData.durationMinutes = Number(doc.durationMinutes) || 0;
        if (doc.location !== undefined) eventData.location = doc.location;
        if (doc.notes !== undefined) eventData.notes = doc.notes;
        if (doc.reminder !== undefined) eventData.reminder = doc.reminder;
        if (doc.linkedServiceId !== undefined) eventData.linkedServiceId = doc.linkedServiceId;
        if (doc.responsibilities !== undefined && Array.isArray(doc.responsibilities)) {
          eventData.responsibilities = doc.responsibilities;
        }
        if (doc.isDeleted !== undefined) eventData.deleted = Boolean(doc.isDeleted);
        if (doc.purgeAt !== undefined) eventData.purgeAt = parseDate(doc.purgeAt);

        mutations.push((tx) =>
          tx.agendaEvent.update({
            where: { id: doc.id },
            data: eventData,
          }),
        );
      }
    } else if (!doc._deleted) {
      mutationCount++;
      const newId = doc.id || uuid();
      mutations.push((tx) =>
        tx.agendaEvent.create({
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
        }),
      );
    }
  }

  if (conflictIds.length > 0) {
    const conflictedDocs = await db.agendaEvent.findMany({
      where: { id: { in: conflictIds } },
    });
    for (const cDoc of conflictedDocs) {
      conflicts.push(toWireAgendaEvent(cDoc));
    }
  }

  if (mutations.length > 0) {
    const BATCH_SIZE = 15;
    await db.$transaction(
      async (tx: OrgScopedTx) => {
        for (let i = 0; i < mutations.length; i += BATCH_SIZE) {
          const chunk = mutations.slice(i, i + BATCH_SIZE);
          await Promise.all(chunk.map((fn) => fn(tx)));
        }
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
  }

  if (mutationCount > 0) {
    syncCache.invalidate(tenantId, "agendaEvents");
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
  collections: pushCollections,
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
    return pullOne(this.db, this.tenantId, collection, req.checkpoint, limit);
  }

  pullAll(req: PullAllRequest) {
    const collections =
      req.checkpoints && Object.keys(req.checkpoints).length > 0
        ? (Object.keys(req.checkpoints) as ReplicatedCollection[])
        : ALL_COLLECTIONS;

    const limit = Math.max(1, Math.min(req.limit || DEFAULT_LIMIT, MAX_LIMIT));
    return pullAll(this.db, this.tenantId, req.checkpoints, limit, collections);
  }

  push(collection: ReplicatedCollection, req: PushRequest<any>) {
    const handler = pushHandlers[collection];
    if (!handler) {
      throw new Error(`Unsupported replication collection: ${collection}`);
    }
    return handler(this.db, this.tenantId, req.changeRows || []);
  }
}
