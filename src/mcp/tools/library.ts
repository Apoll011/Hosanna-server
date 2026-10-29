import type { AuthInfo } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  errorResult,
  folders as folderService,
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
import { searchMusicBrainzRecordings } from "../lib/musicbrainz.js";
import { searchWeb } from "../lib/webSearch.js";
import { searchYouTube } from "../lib/youtubeSearch.js";

export function registerLibraryTools(
  server: McpServer,
  authInfo?: AuthInfo,
): void {
  server.registerTool(
    "folders.list",
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
    "folders.create",
    {
      title: "Create folder",
      description: "Create a folder in the library tree.",
      inputSchema: z.object({
        name: z.string().min(1),
        parentId: z.string().uuid().nullable().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
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
    "folders.update",
    {
      title: "Update folder",
      description: "Rename/move/recolor a folder. Requires updatedAt for concurrency.",
      inputSchema: z.object({
        folderId: z.string().uuid(),
        updatedAt: z.string(),
        name: z.string().min(1).optional(),
        parentId: z.string().uuid().nullable().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
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
    "folders.delete",
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
    "collections.list",
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
    "collections.get",
    {
      title: "Get collection",
      description: "Get a collection with its song ids/titles.",
      inputSchema: z.object({ collectionId: z.string().uuid() }),
    },
    async ({ collectionId }) => {
      try {
        return jsonResult(
          await getCollection(requireMcpContext(authInfo), collectionId),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "collections.create",
    {
      title: "Create collection",
      description: "Create a song collection, optionally with initial song ids.",
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
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
    "collections.update",
    {
      title: "Update collection",
      description: "Update collection metadata. Requires updatedAt.",
      inputSchema: z.object({
        collectionId: z.string().uuid(),
        updatedAt: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
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
    "collections.delete",
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
    "collections.add_songs",
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
    "collections.remove_songs",
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
    "agenda.list",
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
    "agenda.get",
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

  server.registerTool(
    "agenda.create",
    {
      title: "Create agenda event",
      description: "Create an agenda event (org-local date/time, no timezone conversion).",
      inputSchema: z.object({
        title: z.string().min(1),
        date: z
          .string()
          .min(1)
          .describe("Calendar date YYYY-MM-DD (org-local, no TZ)"),
        time: z
          .string()
          .min(1)
          .describe("Local time HH:mm (24h), e.g. 09:30"),
        type: z
          .string()
          .min(1)
          .describe('Free string, e.g. "Culto Dominical", "Ensaio", "Rehearsal"'),
        durationMinutes: z.number().int().positive().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        linkedServiceId: z.string().uuid().nullable().optional(),
      }),
    },
    async (args) => {
      try {
        return jsonResult(
          await createAgendaEvent(requireMcpContext(authInfo), args),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "agenda.update",
    {
      title: "Update agenda event",
      description: "Update an agenda event. Requires updatedAt.",
      inputSchema: z.object({
        eventId: z.string().uuid(),
        updatedAt: z.string(),
        title: z.string().min(1).optional(),
        date: z.string().optional(),
        time: z.string().optional(),
        type: z.string().optional(),
        durationMinutes: z.number().int().positive().optional(),
        location: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        linkedServiceId: z.string().uuid().nullable().optional(),
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
    "agenda.delete",
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
    "trash.list",
    {
      title: "List trash",
      description: "List soft-deleted songs, folders, and services.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const [songs, folders, services] = await Promise.all([
          songService(ctx).listTrashed(),
          folderService(ctx).listTrashed(),
          serviceService(ctx).listTrashed(),
        ]);
        return jsonResult({
          songs: songs.map((s) => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            updatedAt: s.updatedAt.toISOString(),
            purgeAt: s.purgeAt?.toISOString() ?? null,
          })),
          folders: folders.map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId,
            updatedAt: f.updatedAt.toISOString(),
            purgeAt: f.purgeAt?.toISOString() ?? null,
          })),
          services: services.map((s) => ({
            id: s.id,
            name: s.name,
            updatedAt: s.updatedAt.toISOString(),
            purgeAt:
              "purgeAt" in s && s.purgeAt instanceof Date
                ? s.purgeAt.toISOString()
                : null,
          })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "folders.restore",
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
    "metadata.musicbrainz_search",
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
    "metadata.youtube_search",
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
        if (authInfo) {
          try {
            requireMcpContext(authInfo);
          } catch {
            /* allow unauthenticated metadata search */
          }
        }
        return jsonResult(await searchYouTube(args));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "metadata.web_search",
    {
      title: "Web search",
      description:
        "General web search (DuckDuckGo) for song metadata, CCLI, artist pages, or reference links.",
      inputSchema: z.object({
        query: z.string().min(1),
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
        return jsonResult(await searchWeb(args));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
