import type { AuthInfo } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  errorResult,
  jsonResult,
  requireMcpContext,
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
        "Soft-delete a folder. action=move_to_root (default) keeps songs; delete_songs trashes nested content.",
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
      description: "Create an agenda event.",
      inputSchema: z.object({
        title: z.string().min(1),
        date: z.string().min(1).describe("YYYY-MM-DD"),
        time: z.string().min(1).describe("HH:mm"),
        type: z.string().min(1),
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
}
