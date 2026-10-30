import type { AuthInfo } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  errorResult,
  folders as folderService,
  getMcpContext,
  jsonResult,
  requireMcpContext,
  requirePermission,
  requireWriteEntitlement,
  services as serviceService,
  songs as songService,
} from "../context.js";
import {
  collectionAddSongs,
  collectionRemoveSongs,
  createAgendaEvent,
  createCollection,
  createFolder,
  deleteAgendaEvent,
  deleteCollection,
  deleteFolder,
  getAgendaEvent,
  getCollection,
  listAgenda,
  listCollections,
  listFolders,
  updateAgendaEvent,
  updateCollection,
  updateFolder,
} from "../lib/libraryCrud.js";
import { withClientRequestId } from "../lib/idempotency.js";
import { searchMusicBrainzRecordings } from "../lib/musicbrainz.js";
import {
  nativeWebFetch,
  providerSupportsNativeFetch,
  resolveNativeWebAuth,
} from "../lib/nativeWeb.js";
import { FOLDER_COLOR_IDS, FOLDER_ICON_IDS } from "../lib/studioUi.js";
import { searchWeb } from "../lib/webSearch.js";
import { searchYouTube } from "../lib/youtubeSearch.js";

const folderIconSchema = z.enum(FOLDER_ICON_IDS);
const folderColorSchema = z.enum(FOLDER_COLOR_IDS);

async function nativeAuthForTools(authInfo?: AuthInfo) {
  const ctx = getMcpContext(authInfo);
  if (!ctx) return null;
  return resolveNativeWebAuth(ctx.orgId);
}

export function registerLibraryTools(
  server: McpServer,
  authInfo?: AuthInfo,
): void {
  server.registerTool(
    "folders_list",
    {
      title: "List folders",
      description: "List organization folders (library tree).",
      inputSchema: z.object({
        parentId: z.string().nullable().optional(),
      }),
    },
    async ({ parentId }) => {
      try {
        return jsonResult(
          await listFolders(requireMcpContext(authInfo), parentId),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "folders_create",
    {
      title: "Create folder",
      description:
        "Create a folder. color/icon must be Studio ids from hosanna://domain/library (e.g. music, book-open, default).",
      inputSchema: z.object({
        name: z.string().min(1),
        parentId: z.string().uuid().nullable().optional(),
        color: folderColorSchema.optional(),
        icon: folderIconSchema.optional(),
      }),
    },
    async (args) => {
      try {
        return jsonResult(await createFolder(requireMcpContext(authInfo), args));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "folders_update",
    {
      title: "Update folder",
      description:
        "Rename/move/recolor a folder. Requires updatedAt. color/icon = Studio ids only (hosanna://domain/library). Use icon=default to reset.",
      inputSchema: z.object({
        folderId: z.string().uuid(),
        updatedAt: z.string(),
        name: z.string().min(1).optional(),
        parentId: z.string().uuid().nullable().optional(),
        color: folderColorSchema.optional(),
        icon: folderIconSchema.optional(),
      }),
    },
    async (args) => {
      try {
        return jsonResult(await updateFolder(requireMcpContext(authInfo), args));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "folders_delete",
    {
      title: "Delete folder",
      description:
        "Soft-delete a folder. Requires explicit user confirmation. action=move_to_root (default): songs in this folder move to library root; nested child folders are NOT recursively moved (only this folder is trashed). action=delete_songs: recursively soft-deletes this folder, nested folders, and their songs.",
      inputSchema: z.object({
        folderId: z.string().uuid(),
        action: z.enum(["move_to_root", "delete_songs"]).optional(),
      }),
    },
    async (args) => {
      try {
        return jsonResult(await deleteFolder(requireMcpContext(authInfo), args));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "collections_list",
    {
      title: "List collections",
      description: "List organization song collections.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult(await listCollections(requireMcpContext(authInfo)));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "collections_get",
    {
      title: "Get collection",
      description:
        "Get a collection. Default is metadata + songCount only. Pass include=ids|songs (+ page/limit) for membership.",
      inputSchema: z.object({
        collectionId: z.string().uuid(),
        include: z.enum(["none", "ids", "songs"]).optional().default("none"),
        page: z.number().int().positive().optional().default(1),
        limit: z.number().int().positive().max(100).optional().default(50),
      }),
    },
    async ({ collectionId, include, page, limit }) => {
      try {
        return jsonResult(
          await getCollection(requireMcpContext(authInfo), collectionId, {
            include,
            page,
            limit,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "collections_create",
    {
      title: "Create collection",
      description:
        "Create a song collection. color/icon = Studio ids from hosanna://domain/library.",
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        color: folderColorSchema.optional(),
        icon: folderIconSchema.optional(),
        songIds: z.array(z.string().uuid()).optional(),
      }),
    },
    async (args) => {
      try {
        return jsonResult(
          await createCollection(requireMcpContext(authInfo), args),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "collections_update",
    {
      title: "Update collection",
      description:
        "Update collection metadata. Requires updatedAt. color/icon = Studio ids (hosanna://domain/library).",
      inputSchema: z.object({
        collectionId: z.string().uuid(),
        updatedAt: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        color: folderColorSchema.optional(),
        icon: folderIconSchema.optional(),
      }),
    },
    async (args) => {
      try {
        return jsonResult(
          await updateCollection(requireMcpContext(authInfo), args),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "collections_delete",
    {
      title: "Delete collection",
      description: "Soft-delete a collection (songs stay in the library).",
      inputSchema: z.object({ collectionId: z.string().uuid() }),
    },
    async ({ collectionId }) => {
      try {
        return jsonResult(
          await deleteCollection(requireMcpContext(authInfo), collectionId),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "collections_add_songs",
    {
      title: "Add songs to collection",
      description: "Connect songs to a collection.",
      inputSchema: z.object({
        collectionId: z.string().uuid(),
        songIds: z.array(z.string().uuid()).min(1),
      }),
    },
    async (args) => {
      try {
        return jsonResult(
          await collectionAddSongs(requireMcpContext(authInfo), args),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "collections_remove_songs",
    {
      title: "Remove songs from collection",
      description: "Disconnect songs from a collection (does not delete songs).",
      inputSchema: z.object({
        collectionId: z.string().uuid(),
        songIds: z.array(z.string().uuid()).min(1),
      }),
    },
    async (args) => {
      try {
        return jsonResult(
          await collectionRemoveSongs(requireMcpContext(authInfo), args),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "agenda_list",
    {
      title: "List agenda events",
      description: "List upcoming organization agenda events.",
      inputSchema: z.object({
        from: z
          .string()
          .optional()
          .describe("YYYY-MM-DD lower bound (defaults to today)"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async (args) => {
      try {
        return jsonResult(await listAgenda(requireMcpContext(authInfo), args));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "agenda_get",
    {
      title: "Get agenda event",
      description: "Get a single agenda event by id.",
      inputSchema: z.object({ eventId: z.string().uuid() }),
    },
    async ({ eventId }) => {
      try {
        return jsonResult(
          await getAgendaEvent(requireMcpContext(authInfo), eventId),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  const agendaAssigneeSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    memberId: z
      .string()
      .optional()
      .describe("Better Auth member id from members_list / me"),
    avatarUrl: z.string().optional(),
  });
  const agendaResponsibilitySchema = z.object({
    id: z.string().optional(),
    categoryId: z
      .string()
      .min(1)
      .describe(
        "From org_get.responsibilityCategories (leader, musicians, preacher, …)",
      ),
    assignees: z.array(agendaAssigneeSchema).default([]),
  });

  server.registerTool(
    "agenda_create",
    {
      title: "Create agenda event",
      description:
        "Create an agenda event (org-local date/time). Pass responsibilities with real memberIds from members_list/me (categoryIds from org_get).",
      inputSchema: z.object({
        title: z.string().min(1),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
          .describe("Calendar date YYYY-MM-DD (org-local, no TZ)"),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm")
          .describe("Local time HH:mm (24h), e.g. 09:30"),
        type: z
          .string()
          .min(1)
          .describe('Free string, e.g. "Culto Dominical", "Ensaio", "Rehearsal"'),
        durationMinutes: z.number().int().positive().max(900).optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        linkedServiceId: z.string().uuid().nullable().optional(),
        responsibilities: z.array(agendaResponsibilitySchema).optional(),
        clientRequestId: z
          .string()
          .min(1)
          .optional()
          .describe("Idempotency key — retries return the same result"),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        const { clientRequestId, ...createArgs } = args;
        return await withClientRequestId(ctx.orgId, clientRequestId, async () =>
          jsonResult(await createAgendaEvent(ctx, createArgs)),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "agenda_update",
    {
      title: "Update agenda event",
      description:
        "Update an agenda event. Requires updatedAt. responsibilities replaces the full list when provided.",
      inputSchema: z.object({
        eventId: z.string().uuid(),
        updatedAt: z.string(),
        title: z.string().min(1).optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
          .optional(),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm")
          .optional(),
        type: z.string().optional(),
        durationMinutes: z.number().int().positive().max(900).optional(),
        location: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        linkedServiceId: z.string().uuid().nullable().optional(),
        responsibilities: z.array(agendaResponsibilitySchema).optional(),
      }),
    },
    async (args) => {
      try {
        return jsonResult(
          await updateAgendaEvent(requireMcpContext(authInfo), args),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "agenda_delete",
    {
      title: "Delete agenda event",
      description: "Soft-delete an agenda event.",
      inputSchema: z.object({ eventId: z.string().uuid() }),
    },
    async ({ eventId }) => {
      try {
        return jsonResult(
          await deleteAgendaEvent(requireMcpContext(authInfo), eventId),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "trash_list",
    {
      title: "List trash",
      description:
        "List soft-deleted songs, folders, and services. Paginated per type (default limit 20).",
      inputSchema: z.object({
        page: z.number().int().positive().optional().default(1),
        limit: z.number().int().positive().max(50).optional().default(20),
        type: z
          .enum(["all", "songs", "folders", "services"])
          .optional()
          .default("all"),
      }),
    },
    async ({ page, limit, type }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const [songs, folders, services] = await Promise.all([
          type === "folders" || type === "services"
            ? Promise.resolve([])
            : songService(ctx).listTrashed(),
          type === "songs" || type === "services"
            ? Promise.resolve([])
            : folderService(ctx).listTrashed(),
          type === "songs" || type === "folders"
            ? Promise.resolve([])
            : serviceService(ctx).listTrashed(),
        ]);
        const slice = <T,>(rows: T[]) => {
          const total = rows.length;
          const start = (page - 1) * limit;
          return {
            items: rows.slice(start, start + limit),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
            nextPage: page * limit < total ? page + 1 : null,
          };
        };
        const songPage = slice(
          songs.map((s) => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            updatedAt: s.updatedAt.toISOString(),
            purgeAt: s.purgeAt?.toISOString() ?? null,
          })),
        );
        const folderPage = slice(
          folders.map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId,
            updatedAt: f.updatedAt.toISOString(),
            purgeAt: f.purgeAt?.toISOString() ?? null,
          })),
        );
        const servicePage = slice(
          services.map((s) => ({
            id: s.id,
            name: s.name,
            updatedAt: s.updatedAt.toISOString(),
            purgeAt:
              "purgeAt" in s && s.purgeAt instanceof Date
                ? s.purgeAt.toISOString()
                : null,
          })),
        );
        return jsonResult({
          songs: songPage,
          folders: folderPage,
          services: servicePage,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "folders_restore",
    {
      title: "Restore folder",
      description: "Restore a soft-deleted folder from trash.",
      inputSchema: z.object({ folderId: z.string().uuid() }),
    },
    async ({ folderId }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "folder.update");
        requireWriteEntitlement(ctx);
        const folder = await folderService(ctx).restore(folderId);
        return jsonResult({ restored: true, folder });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "metadata_musicbrainz_search",
    {
      title: "Search MusicBrainz",
      description:
        "Look up recording metadata (title, artist, release) on MusicBrainz to help complete song metadata. Does not invent lyrics.",
      inputSchema: z.object({
        title: z.string().optional(),
        artist: z.string().optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
    },
    async (args) => {
      try {
        if (authInfo) {
          try {
            requireMcpContext(authInfo);
          } catch {
            /* allow unauthenticated metadata search */
          }
        }
        const result = await searchMusicBrainzRecordings(args);
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "metadata_youtube_search",
    {
      title: "Search YouTube",
      description:
        "Find a reference video for ChordPro `{youtube: URL}`. Returns hits with ready-to-paste `directive` values. Prefer YouTube API when YOUTUBE_API_KEY is set.",
      inputSchema: z.object({
        title: z.string().optional(),
        artist: z.string().optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
    },
    async (args) => {
      try {
        const nativeAuth = await nativeAuthForTools(authInfo);
        return jsonResult(await searchYouTube({ ...args, nativeAuth }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "metadata_web_search",
    {
      title: "Web search",
      description:
        "Web search for song metadata, CCLI, artist pages, or reference links. Uses DeepSeek Search when the org AI provider is DeepSeek; otherwise DuckDuckGo.",
      inputSchema: z.object({
        query: z.string().min(1).max(128),
        limit: z.number().int().min(1).max(10).optional(),
        oriQuestion: z.string().max(128).optional(),
      }),
    },
    async (args) => {
      try {
        const nativeAuth = await nativeAuthForTools(authInfo);
        return jsonResult(
          await searchWeb({
            query: args.query,
            limit: args.limit,
            oriQuestion: args.oriQuestion,
            nativeAuth,
          }),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "metadata_web_fetch",
    {
      title: "Fetch web page",
      description:
        "Fetch a URL as Markdown via the org AI provider's native Fetch API (DeepSeek). Useful when HTML scrapes are blocked (e.g. Cifra Club Akamai).",
      inputSchema: z.object({
        url: z.string().url().max(8192),
      }),
    },
    async ({ url }) => {
      try {
        const nativeAuth = await nativeAuthForTools(authInfo);
        if (
          !nativeAuth ||
          !providerSupportsNativeFetch(nativeAuth.provider)
        ) {
          return errorResult(
            new Error(
              "Native web fetch unavailable. Set org AI provider to DeepSeek (with API key) to enable Fetch.",
            ),
          );
        }
        return jsonResult(await nativeWebFetch(nativeAuth, url));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
