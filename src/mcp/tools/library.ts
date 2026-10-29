import type { AuthInfo } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { prisma } from "../../database/prisma.js";
import type { PermissionString } from "../../permissions/index.js";
import {
  errorResult,
  jsonResult,
  requireMcpContext,
  requirePermission,
} from "../context.js";
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
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "folder.access" as PermissionString);
        const folders = await prisma.folder.findMany({
          where: {
            orgId: ctx.orgId,
            deleted: false,
            ...(parentId !== undefined ? { parentId } : {}),
          },
          select: {
            id: true,
            name: true,
            parentId: true,
            color: true,
            updatedAt: true,
          },
          orderBy: { name: "asc" },
          take: 200,
        });
        return jsonResult({ folders, count: folders.length });
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
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "collection.access" as PermissionString);
        const collections = await prisma.collection.findMany({
          where: { orgId: ctx.orgId, deleted: false },
          select: {
            id: true,
            name: true,
            description: true,
            updatedAt: true,
            _count: { select: { songs: true } },
          },
          orderBy: { name: "asc" },
          take: 100,
        });
        return jsonResult({
          collections: collections.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            songCount: c._count.songs,
            updatedAt: c.updatedAt.toISOString(),
          })),
        });
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
    async ({ from, limit }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "agenda.access" as PermissionString);
        const since =
          from?.trim() || new Date().toISOString().slice(0, 10);
        const events = await prisma.agendaEvent.findMany({
          where: {
            orgId: ctx.orgId,
            deleted: false,
            date: { gte: since },
          },
          select: {
            id: true,
            title: true,
            date: true,
            time: true,
            type: true,
            location: true,
            notes: true,
            linkedServiceId: true,
          },
          orderBy: [{ date: "asc" }, { time: "asc" }],
          take: limit ?? 20,
        });
        return jsonResult({ events });
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
        // Auth optional for metadata lookup, but prefer org session when present
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
