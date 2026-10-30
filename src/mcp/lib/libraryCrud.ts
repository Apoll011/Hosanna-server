import { randomUUID } from "node:crypto";
import type { McpContext } from "../context.js";
import {
  folders as folderService,
  requirePermission,
  requireWriteEntitlement,
} from "../context.js";
import { syncCache } from "../../services/syncCache.service.js";
import {
  normalizeResponsibilities,
  type OrgResponsibility,
} from "./orgDirectory.js";

const PURGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_REMINDER = { enabled: false, label: "" };

function purgeAt() {
  return new Date(Date.now() + PURGE_MS);
}

function serializeFolder(f: {
  id: string;
  name: string;
  parentId: string | null;
  color?: string;
  icon?: string;
  updatedAt: Date;
}) {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    color: f.color,
    icon: f.icon,
    updatedAt: f.updatedAt.toISOString(),
  };
}

function serializeCollection(c: {
  id: string;
  name: string;
  description: string | null;
  color?: string;
  icon?: string;
  updatedAt: Date;
  songs?: { id: string }[];
  _count?: { songs: number };
}) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    color: c.color,
    icon: c.icon,
    songCount: c._count?.songs ?? c.songs?.length ?? 0,
    updatedAt: c.updatedAt.toISOString(),
  };
}

function serializeAgenda(e: {
  id: string;
  title: string;
  date: string;
  time: string;
  type: string;
  durationMinutes: number;
  location: string | null;
  notes: string | null;
  linkedServiceId: string | null;
  responsibilities?: unknown;
  reminder?: unknown;
  updatedAt: Date;
}) {
  return {
    id: e.id,
    title: e.title,
    date: e.date,
    time: e.time,
    type: e.type,
    durationMinutes: e.durationMinutes,
    location: e.location,
    notes: e.notes,
    linkedServiceId: e.linkedServiceId,
    responsibilities: normalizeResponsibilities(e.responsibilities ?? []),
    reminder: e.reminder ?? DEFAULT_REMINDER,
    updatedAt: e.updatedAt.toISOString(),
  };
}

// ── Folders ────────────────────────────────────────────────────────────────

export async function listFolders(
  ctx: McpContext,
  parentId?: string | null,
) {
  requirePermission(ctx, "folder.access");
  const folders = await ctx.db.folder.findMany({
    where: {
      deleted: false,
      ...(parentId !== undefined ? { parentId } : {}),
    },
    select: {
      id: true,
      name: true,
      parentId: true,
      color: true,
      icon: true,
      updatedAt: true,
    },
    orderBy: { name: "asc" },
    take: 200,
  });
  return { folders: folders.map(serializeFolder), count: folders.length };
}

export async function createFolder(
  ctx: McpContext,
  args: {
    name: string;
    parentId?: string | null;
    color?: string;
    icon?: string;
  },
) {
  requirePermission(ctx, "folder.create");
  requireWriteEntitlement(ctx);
  const created = await folderService(ctx).create(
    args.name,
    args.parentId,
    args.color,
    args.icon,
  );
  return { created: true, folder: serializeFolder(created) };
}

export async function updateFolder(
  ctx: McpContext,
  args: {
    folderId: string;
    updatedAt: string;
    name?: string;
    parentId?: string | null;
    color?: string;
    icon?: string;
  },
) {
  requirePermission(ctx, "folder.update");
  requireWriteEntitlement(ctx);
  const updated = await folderService(ctx).update(
    args.folderId,
    new Date(args.updatedAt),
    args.name,
    args.parentId,
    args.color,
    args.icon,
  );
  return { updated: true, folder: serializeFolder(updated) };
}

export async function deleteFolder(
  ctx: McpContext,
  args: {
    folderId: string;
    action?: "move_to_root" | "delete_songs";
  },
) {
  requirePermission(ctx, "folder.delete");
  requireWriteEntitlement(ctx);
  const action = args.action ?? "move_to_root";
  if (action === "delete_songs") {
    const result = await folderService(ctx).deleteWithContent(args.folderId);
    return { deleted: true, folderId: args.folderId, ...result };
  }
  const result = await folderService(ctx).deleteMovingContentToRoot(
    args.folderId,
  );
  return { deleted: true, folderId: args.folderId, ...result };
}

// ── Collections ────────────────────────────────────────────────────────────

export async function listCollections(ctx: McpContext) {
  requirePermission(ctx, "collection.access");
  const collections = await ctx.db.collection.findMany({
    where: { deleted: false },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      icon: true,
      updatedAt: true,
      _count: { select: { songs: true } },
    },
    orderBy: { name: "asc" },
    take: 100,
  });
  return {
    collections: collections.map(serializeCollection),
    count: collections.length,
  };
}

export async function getCollection(
  ctx: McpContext,
  collectionId: string,
  opts?: { include?: "none" | "ids" | "songs"; page?: number; limit?: number },
) {
  requirePermission(ctx, "collection.access");
  const include = opts?.include ?? "none";
  const page = Math.max(1, opts?.page ?? 1);
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);

  const collection = await ctx.db.collection.findFirst({
    where: { id: collectionId, deleted: false },
    include: {
      _count: { select: { songs: true } },
      ...(include === "none"
        ? {}
        : {
            songs: {
              select:
                include === "ids"
                  ? { id: true }
                  : { id: true, title: true, artist: true },
              skip: (page - 1) * limit,
              take: limit,
              orderBy: { title: "asc" },
            },
          }),
    },
  });
  if (!collection) throw new Error("Collection not found");

  const songCount = collection._count?.songs ?? 0;
  const base = serializeCollection(collection);
  if (include === "none") {
    return {
      collection: base,
      tip: "Pass include=ids|songs (+ page/limit) when you need song membership.",
    };
  }

  const songs = collection.songs ?? [];
  return {
    collection: {
      ...base,
      ...(include === "ids"
        ? { songIds: songs.map((s) => s.id) }
        : { songs }),
    },
    page,
    limit,
    total: songCount,
    totalPages: Math.ceil(songCount / limit) || 1,
    nextPage: page * limit < songCount ? page + 1 : null,
  };
}

export async function createCollection(
  ctx: McpContext,
  args: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    songIds?: string[];
  },
) {
  requirePermission(ctx, "collection.create");
  requireWriteEntitlement(ctx);
  const created = await ctx.db.collection.create({
    data: {
      id: randomUUID(),
      orgId: ctx.orgId,
      name: args.name.trim(),
      description: args.description?.trim() || null,
      color: args.color ?? "default",
      icon: args.icon ?? "default",
      ...(args.songIds?.length
        ? { songs: { connect: args.songIds.map((id) => ({ id })) } }
        : {}),
    } as never,
    include: { songs: { select: { id: true } }, _count: { select: { songs: true } } },
  });
  syncCache.invalidate(ctx.orgId, "collections");
  return { created: true, collection: serializeCollection(created) };
}

export async function updateCollection(
  ctx: McpContext,
  args: {
    collectionId: string;
    updatedAt: string;
    name?: string;
    description?: string | null;
    color?: string;
    icon?: string;
  },
) {
  requirePermission(ctx, "collection.update");
  requireWriteEntitlement(ctx);
  const current = await ctx.db.collection.findFirst({
    where: { id: args.collectionId, deleted: false },
  });
  if (!current) throw new Error("Collection not found");
  if (current.updatedAt.getTime() !== new Date(args.updatedAt).getTime()) {
    throw new Error("Collection was modified elsewhere; refresh and retry with current updatedAt");
  }
  const updated = await ctx.db.collection.update({
    where: { id: args.collectionId },
    data: {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.description !== undefined
        ? { description: args.description }
        : {}),
      ...(args.color !== undefined ? { color: args.color } : {}),
      ...(args.icon !== undefined ? { icon: args.icon } : {}),
    },
    include: { songs: { select: { id: true } }, _count: { select: { songs: true } } },
  });
  syncCache.invalidate(ctx.orgId, "collections");
  return { updated: true, collection: serializeCollection(updated) };
}

export async function deleteCollection(ctx: McpContext, collectionId: string) {
  requirePermission(ctx, "collection.delete");
  requireWriteEntitlement(ctx);
  const current = await ctx.db.collection.findFirst({
    where: { id: collectionId, deleted: false },
  });
  if (!current) throw new Error("Collection not found");
  await ctx.db.collection.update({
    where: { id: collectionId },
    data: { deleted: true, purgeAt: purgeAt() },
  });
  syncCache.invalidate(ctx.orgId, "collections");
  return { deleted: true, collectionId };
}

export async function collectionAddSongs(
  ctx: McpContext,
  args: { collectionId: string; songIds: string[] },
) {
  requirePermission(ctx, "collection.update");
  requireWriteEntitlement(ctx);
  const current = await ctx.db.collection.findFirst({
    where: { id: args.collectionId, deleted: false },
  });
  if (!current) throw new Error("Collection not found");
  const updated = await ctx.db.collection.update({
    where: { id: args.collectionId },
    data: {
      songs: { connect: args.songIds.map((id) => ({ id })) },
    },
    include: { songs: { select: { id: true } }, _count: { select: { songs: true } } },
  });
  syncCache.invalidate(ctx.orgId, "collections");
  return { updated: true, collection: serializeCollection(updated) };
}

export async function collectionRemoveSongs(
  ctx: McpContext,
  args: { collectionId: string; songIds: string[] },
) {
  requirePermission(ctx, "collection.update");
  requireWriteEntitlement(ctx);
  const current = await ctx.db.collection.findFirst({
    where: { id: args.collectionId, deleted: false },
  });
  if (!current) throw new Error("Collection not found");
  const updated = await ctx.db.collection.update({
    where: { id: args.collectionId },
    data: {
      songs: { disconnect: args.songIds.map((id) => ({ id })) },
    },
    include: { songs: { select: { id: true } }, _count: { select: { songs: true } } },
  });
  syncCache.invalidate(ctx.orgId, "collections");
  return { updated: true, collection: serializeCollection(updated) };
}

// ── Agenda ─────────────────────────────────────────────────────────────────

export async function listAgenda(
  ctx: McpContext,
  args?: { from?: string; limit?: number },
) {
  requirePermission(ctx, "agenda.access");
  const since = args?.from?.trim() || new Date().toISOString().slice(0, 10);
  const events = await ctx.db.agendaEvent.findMany({
    where: { deleted: false, date: { gte: since } },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: args?.limit ?? 20,
  });
  return { events: events.map(serializeAgenda) };
}

export async function getAgendaEvent(ctx: McpContext, eventId: string) {
  requirePermission(ctx, "agenda.access");
  const event = await ctx.db.agendaEvent.findFirst({
    where: { id: eventId, deleted: false },
  });
  if (!event) throw new Error("Agenda event not found");
  return { event: serializeAgenda(event) };
}

export async function createAgendaEvent(
  ctx: McpContext,
  args: {
    title: string;
    date: string;
    time: string;
    type: string;
    durationMinutes?: number;
    location?: string;
    notes?: string;
    linkedServiceId?: string | null;
    responsibilities?: OrgResponsibility[] | unknown;
  },
) {
  requirePermission(ctx, "agenda.create");
  requireWriteEntitlement(ctx);
  const responsibilities = normalizeResponsibilities(
    args.responsibilities ?? [],
  );
  const created = await ctx.db.agendaEvent.create({
    data: {
      id: randomUUID(),
      orgId: ctx.orgId,
      title: args.title.trim(),
      date: args.date,
      time: args.time,
      type: args.type.trim(),
      durationMinutes: args.durationMinutes ?? 60,
      location: args.location?.trim() || null,
      notes: args.notes ?? null,
      linkedServiceId: args.linkedServiceId ?? null,
      reminder: DEFAULT_REMINDER,
      responsibilities,
    } as never,
  });
  syncCache.invalidate(ctx.orgId, "agendaEvents");
  return {
    created: true,
    event: serializeAgenda(created),
    warnings: responsibilityWarnings(responsibilities),
  };
}

export async function updateAgendaEvent(
  ctx: McpContext,
  args: {
    eventId: string;
    updatedAt: string;
    title?: string;
    date?: string;
    time?: string;
    type?: string;
    durationMinutes?: number;
    location?: string | null;
    notes?: string | null;
    linkedServiceId?: string | null;
    responsibilities?: OrgResponsibility[] | unknown;
  },
) {
  requirePermission(ctx, "agenda.update");
  requireWriteEntitlement(ctx);
  const current = await ctx.db.agendaEvent.findFirst({
    where: { id: args.eventId, deleted: false },
  });
  if (!current) throw new Error("Agenda event not found");
  if (current.updatedAt.getTime() !== new Date(args.updatedAt).getTime()) {
    throw new Error("Event was modified elsewhere; refresh and retry with current updatedAt");
  }
  const updated = await ctx.db.agendaEvent.update({
    where: { id: args.eventId },
    data: {
      ...(args.title !== undefined ? { title: args.title.trim() } : {}),
      ...(args.date !== undefined ? { date: args.date } : {}),
      ...(args.time !== undefined ? { time: args.time } : {}),
      ...(args.type !== undefined ? { type: args.type.trim() } : {}),
      ...(args.durationMinutes !== undefined
        ? { durationMinutes: args.durationMinutes }
        : {}),
      ...(args.location !== undefined ? { location: args.location } : {}),
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      ...(args.linkedServiceId !== undefined
        ? { linkedServiceId: args.linkedServiceId }
        : {}),
      ...(args.responsibilities !== undefined
        ? {
            responsibilities: normalizeResponsibilities(args.responsibilities),
          }
        : {}),
    } as never,
  });
  syncCache.invalidate(ctx.orgId, "agendaEvents");
  const responsibilities =
    args.responsibilities !== undefined
      ? normalizeResponsibilities(args.responsibilities)
      : normalizeResponsibilities(updated.responsibilities);
  return {
    updated: true,
    event: serializeAgenda(updated),
    warnings: responsibilityWarnings(responsibilities),
  };
}

function responsibilityWarnings(
  responsibilities: OrgResponsibility[],
): string[] {
  const warnings: string[] = [];
  for (const r of responsibilities) {
    for (const a of r.assignees) {
      if (!a.memberId) {
        warnings.push(
          `Assignee "${a.name}" on category "${r.categoryId}" has no memberId — not linked to an org member`,
        );
      }
    }
  }
  return warnings;
}

export async function deleteAgendaEvent(ctx: McpContext, eventId: string) {
  requirePermission(ctx, "agenda.delete");
  requireWriteEntitlement(ctx);
  const current = await ctx.db.agendaEvent.findFirst({
    where: { id: eventId, deleted: false },
  });
  if (!current) throw new Error("Agenda event not found");
  await ctx.db.agendaEvent.update({
    where: { id: eventId },
    data: { deleted: true, purgeAt: purgeAt() },
  });
  syncCache.invalidate(ctx.orgId, "agendaEvents");
  return { deleted: true, eventId };
}
