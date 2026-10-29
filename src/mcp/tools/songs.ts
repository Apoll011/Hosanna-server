import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { formatChordPro } from "@hosanna/chordpro/formatter";
import { z } from "zod";
import {
  errorResult,
  jsonResult,
  requireMcpContext,
  requirePermission,
  requireWriteEntitlement,
  songs as songService,
} from "../context.js";
import {
  metadataFromChordPro,
  validateChordProContent,
} from "../lib/chordproGate.js";
import { summarizeDiff } from "../lib/diff.js";

function serializeSong(song: {
  id: string;
  title: string;
  artist: string;
  content: string;
  path: string;
  tags: string[];
  folderId: string | null;
  song_number: number | null;
  updatedAt: Date;
  createdAt: Date;
}) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    content: song.content,
    path: song.path,
    tags: song.tags,
    folderId: song.folderId,
    song_number: song.song_number,
    updatedAt: song.updatedAt.toISOString(),
    createdAt: song.createdAt.toISOString(),
  };
}

export function registerSongTools(
  server: McpServer,
  authInfo?: AuthInfo,
): void {
  server.registerTool(
    "songs.search",
    {
      title: "Search songs",
      description: "Search the active organization's song library.",
      inputSchema: z.object({
        search: z.string().optional(),
        key: z.string().optional(),
        tag: z.string().optional(),
        folder: z.string().optional(),
        page: z.number().int().positive().optional().default(1),
        limit: z.number().int().positive().max(100).optional().default(20),
        includeContent: z.boolean().optional().default(false),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const result = await songService(ctx).list({
          search: args.search,
          key: args.key,
          tag: args.tag,
          folder: args.folder,
          page: args.page,
          limit: args.limit,
          sortBy: "title",
          sortOrder: "asc",
        });
        return jsonResult({
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          songs: result.songs.map((s) => {
            const base = serializeSong(s);
            if (!args.includeContent) {
              const { content: _c, ...rest } = base;
              return {
                ...rest,
                contentPreview: s.content.slice(0, 200),
              };
            }
            return base;
          }),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs.get",
    {
      title: "Get song",
      description: "Retrieve a song by id, including full ChordPro content.",
      inputSchema: z.object({
        songId: z.string().uuid(),
      }),
    },
    async ({ songId }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const song = await songService(ctx).getById(songId);
        return jsonResult({
          song: serializeSong(song),
          validation: validateChordProContent(song.content),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs.create_draft",
    {
      title: "Create song draft",
      description:
        "Build and validate a new song proposal without saving. Present to the user before songs.save.",
      inputSchema: z.object({
        title: z.string().min(1),
        artist: z.string().optional(),
        content: z.string().optional(),
        folderId: z.string().uuid().nullable().optional(),
        tags: z.array(z.string()).optional(),
        song_number: z.number().positive().nullable().optional(),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.create");
        const content =
          args.content?.trim() ||
          `{title: ${args.title}}\n{artist: ${args.artist || "Unknown"}}\n{key: G}\n\n`;
        const meta = metadataFromChordPro(content);
        const validation = validateChordProContent(content);
        return jsonResult({
          proposal: {
            title: args.title || meta.title || "Untitled",
            artist: args.artist ?? meta.artist ?? "Unknown",
            content,
            folderId: args.folderId ?? null,
            tags: args.tags ?? [],
            song_number: args.song_number ?? meta.song_number ?? null,
          },
          validation,
          next: "Call songs.save with mode=create after user approval.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs.propose_edit",
    {
      title: "Propose song edit",
      description:
        "Load a song, apply content/metadata changes, validate, and return a diff proposal (not saved).",
      inputSchema: z.object({
        songId: z.string().uuid(),
        content: z.string().optional(),
        title: z.string().optional(),
        artist: z.string().optional(),
        tags: z.array(z.string()).optional(),
        folderId: z.string().uuid().nullable().optional(),
        song_number: z.number().positive().nullable().optional(),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        const current = await songService(ctx).getById(args.songId);
        const content = args.content ?? current.content;
        const meta = metadataFromChordPro(content);
        const proposal = {
          id: current.id,
          title: args.title ?? meta.title ?? current.title,
          artist: args.artist ?? meta.artist ?? current.artist,
          content,
          tags: args.tags ?? current.tags,
          folderId:
            args.folderId === undefined ? current.folderId : args.folderId,
          song_number:
            args.song_number === undefined
              ? (meta.song_number ?? current.song_number)
              : args.song_number,
          updatedAt: current.updatedAt.toISOString(),
        };
        return jsonResult({
          proposal,
          validation: validateChordProContent(content),
          diff: summarizeDiff(current.content, content),
          next: "Call songs.save with mode=update after user approval.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs.propose_fix",
    {
      title: "Propose song fix",
      description:
        "Lint/format an existing song and propose corrections without inventing lyrics. Does not save.",
      inputSchema: z.object({
        songId: z.string().uuid(),
        applyFormat: z.boolean().optional().default(true),
      }),
    },
    async ({ songId, applyFormat }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        const current = await songService(ctx).getById(songId);
        const before = validateChordProContent(current.content);
        let proposed = current.content;
        let formatChanges: unknown[] = [];
        if (applyFormat) {
          const formatted = formatChordPro(current.content, {
            expandDirectiveAliases: true,
            normalizeNotationAliases: true,
          });
          proposed = formatted.content;
          formatChanges = formatted.changes;
        }
        const after = validateChordProContent(proposed);
        return jsonResult({
          songId,
          issuesBefore: {
            diagnostics: before.diagnostics,
            parseErrors: before.parseErrors,
          },
          proposal: {
            id: current.id,
            title: current.title,
            artist: current.artist,
            content: proposed,
            tags: current.tags,
            folderId: current.folderId,
            song_number: current.song_number,
            updatedAt: current.updatedAt.toISOString(),
          },
          formatChanges,
          validation: after,
          diff: summarizeDiff(current.content, proposed),
          notes: [
            "Do not invent missing lyrics or chords.",
            "Review remaining diagnostics before songs.save.",
          ],
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs.save",
    {
      title: "Save song",
      description:
        "Persist a validated song create or update. Requires prior user approval of a draft/proposal.",
      inputSchema: z.object({
        mode: z.enum(["create", "update"]),
        songId: z.string().uuid().optional(),
        updatedAt: z
          .string()
          .optional()
          .describe("ISO timestamp for optimistic concurrency on update"),
        title: z.string().min(1),
        artist: z.string().optional(),
        content: z.string(),
        folderId: z.string().uuid().nullable().optional(),
        tags: z.array(z.string()).optional(),
        song_number: z.number().positive().nullable().optional(),
        allowInvalid: z
          .boolean()
          .optional()
          .default(false)
          .describe("Allow save despite ChordPro lint errors"),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requireWriteEntitlement(ctx);
        const validation = validateChordProContent(args.content);
        if (!validation.ok && !args.allowInvalid) {
          return jsonResult(
            {
              error: "ChordPro validation failed",
              validation,
              hint: "Fix issues or set allowInvalid=true after user confirmation.",
            },
            true,
          );
        }

        if (args.mode === "create") {
          requirePermission(ctx, "song.create");
          const created = await songService(ctx).create({
            title: args.title,
            artist: args.artist,
            content: args.content,
            folderId: args.folderId,
            tags: args.tags,
            song_number: args.song_number,
          });
          return jsonResult({
            saved: true,
            song: serializeSong(created),
            validation,
          });
        }

        requirePermission(ctx, "song.update");
        if (!args.songId || !args.updatedAt) {
          return jsonResult(
            { error: "songId and updatedAt are required for update" },
            true,
          );
        }
        const updated = await songService(ctx).update(
          args.songId,
          new Date(args.updatedAt),
          {
            title: args.title,
            artist: args.artist,
            content: args.content,
            folderId: args.folderId,
            tags: args.tags,
            song_number: args.song_number,
          },
        );
        return jsonResult({
          saved: true,
          song: serializeSong(updated),
          validation,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs.delete",
    {
      title: "Delete song",
      description: "Soft-delete a song (moves to trash).",
      inputSchema: z.object({
        songId: z.string().uuid(),
      }),
    },
    async ({ songId }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.delete");
        requireWriteEntitlement(ctx);
        await songService(ctx).delete(songId);
        return jsonResult({ deleted: true, songId });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
