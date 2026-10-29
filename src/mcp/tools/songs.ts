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
import {
  clipContent,
  FULL_CONTENT_MAX,
  SEARCH_CONTENT_MAX,
} from "../lib/contentClip.js";
import { summarizeDiff } from "../lib/diff.js";
import { withClientRequestId } from "../lib/idempotency.js";
import { propagateVerseChords } from "../lib/propagateChords.js";
import { transposeChordProSource } from "../lib/transposeSource.js";

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
    "songs_search",
    {
      title: "Search songs",
      description:
        "Search the org library by title/artist/lyrics/tags (combined). key is exact metadata key string (not enharmonic-normalized). Default page=1, limit=20 (max 100). includeContent clips bodies to 8k chars and sets truncated.",
      inputSchema: z.object({
        search: z
          .string()
          .optional()
          .describe("Matches title, artist, lyrics content, and tags"),
        key: z
          .string()
          .optional()
          .describe("Exact key filter as stored (e.g. Db not C#)"),
        tag: z.string().optional(),
        folder: z.string().optional().describe("Folder id filter"),
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
        const nextPage =
          result.page < result.totalPages ? result.page + 1 : null;
        return jsonResult({
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          nextPage,
          songs: result.songs.map((s) => {
            const base = serializeSong(s);
            if (!args.includeContent) {
              const { content: _c, ...rest } = base;
              return {
                ...rest,
                contentPreview: s.content.slice(0, 200),
              };
            }
            const clipped = clipContent(s.content, SEARCH_CONTENT_MAX);
            return {
              ...base,
              content: clipped.content,
              truncated: clipped.truncated,
              contentLength: clipped.contentLength,
            };
          }),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_search_lyrics",
    {
      title: "Search song lyrics (ignore chords)",
      description:
        "Search lyrics after stripping ChordPro chords and directives. Query \"Pois só Tu és o Deus eterno\" matches \"Pois [D9]só Tu és o [C#m]Deus eterno\". Prefer this over songs_search when the user quotes plain lyrics.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Plain lyrics / phrase without chord markers"),
        folder: z.string().optional().describe("Folder id filter"),
        page: z.number().int().positive().optional().default(1),
        limit: z.number().int().positive().max(100).optional().default(20),
        includeContent: z.boolean().optional().default(false),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const result = await songService(ctx).searchLyrics({
          query: args.query,
          folder: args.folder,
          page: args.page,
          limit: args.limit,
        });
        const nextPage =
          result.page < result.totalPages ? result.page + 1 : null;
        return jsonResult({
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          nextPage,
          query: args.query,
          songs: result.songs.map((s) => {
            const base = serializeSong(s);
            if (!args.includeContent) {
              const { content: _c, ...rest } = base;
              return {
                ...rest,
                contentPreview: s.content.slice(0, 200),
              };
            }
            const clipped = clipContent(s.content, SEARCH_CONTENT_MAX);
            return {
              ...base,
              content: clipped.content,
              truncated: clipped.truncated,
              contentLength: clipped.contentLength,
            };
          }),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_get",
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
        const clipped = clipContent(song.content, FULL_CONTENT_MAX);
        return jsonResult({
          song: {
            ...serializeSong(song),
            content: clipped.content,
            truncated: clipped.truncated,
            contentLength: clipped.contentLength,
          },
          validation: validateChordProContent(song.content),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_get_many",
    {
      title: "Get many songs",
      description:
        "Batch-fetch up to 20 songs by id. Set includeContent=false for metadata-only (cheaper).",
      inputSchema: z.object({
        songIds: z.array(z.string().uuid()).min(1).max(20),
        includeContent: z.boolean().optional().default(true),
      }),
    },
    async ({ songIds, includeContent }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const songs = [];
        const missing: string[] = [];
        for (const id of songIds) {
          try {
            const song = await songService(ctx).getById(id);
            if (!includeContent) {
              const { content: _c, ...rest } = serializeSong(song);
              songs.push({
                ...rest,
                contentPreview: song.content.slice(0, 200),
              });
            } else {
              const clipped = clipContent(song.content, FULL_CONTENT_MAX);
              songs.push({
                ...serializeSong(song),
                content: clipped.content,
                truncated: clipped.truncated,
                contentLength: clipped.contentLength,
              });
            }
          } catch {
            missing.push(id);
          }
        }
        return jsonResult({ songs, missing, count: songs.length });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_create_draft",
    {
      title: "Create song draft",
      description:
        "Build and validate a new song proposal without saving. Present to the user before songs_save.",
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
          next: "Call songs_save with mode=create after user approval.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_propose_edit",
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
          next: "Call songs_save with mode=update after user approval.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_propose_fix",
    {
      title: "Propose song fix",
      description:
        "Lint/format an existing song and propose corrections without inventing lyrics. Does not save. Studio stages Accept/Decline.",
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
            "In Studio, Accept in the editor then user Save; songs_save only if asked to persist via MCP.",
          ],
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_propose_transpose",
    {
      title: "Propose transpose",
      description:
        "One-shot: load song, source-preserving transpose, return staged proposal + diff. Pass exactly one of toKey or semitones.",
      inputSchema: z
        .object({
          songId: z.string().uuid(),
          toKey: z.string().optional().describe("Target key, e.g. D or Bb"),
          semitones: z
            .number()
            .int()
            .optional()
            .describe("Signed semitone shift, e.g. 2 or -5"),
        })
        .superRefine((v, ctx) => {
          const hasKey = v.toKey != null && String(v.toKey).trim() !== "";
          const hasSemi = v.semitones != null;
          if (hasKey === hasSemi) {
            ctx.addIssue({
              code: "custom",
              message: "Provide exactly one of toKey or semitones",
            });
          }
        }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        const current = await songService(ctx).getById(args.songId);
        const result =
          args.toKey != null && String(args.toKey).trim() !== ""
            ? transposeChordProSource(current.content, { toKey: args.toKey })
            : transposeChordProSource(current.content, {
                semitones: args.semitones ?? 0,
              });
        return jsonResult({
          proposal: {
            id: current.id,
            title: current.title,
            artist: current.artist,
            content: result.content,
            tags: current.tags,
            folderId: current.folderId,
            song_number: current.song_number,
            updatedAt: current.updatedAt.toISOString(),
          },
          transpose: result,
          validation: validateChordProContent(result.content),
          diff: summarizeDiff(current.content, result.content),
          next: "Studio stages Accept/Decline; songs_save only after explicit persist request.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_propose_propagate_chords",
    {
      title: "Propose propagate chords",
      description:
        "Copy [chord] markers from the first chorded verse onto later verses. Does not invent chords. Returns a proposal.",
      inputSchema: z.object({ songId: z.string().uuid() }),
    },
    async ({ songId }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        const current = await songService(ctx).getById(songId);
        const result = propagateVerseChords(current.content);
        return jsonResult({
          proposal: {
            id: current.id,
            title: current.title,
            artist: current.artist,
            content: result.content,
            updatedAt: current.updatedAt.toISOString(),
          },
          ...result,
          validation: validateChordProContent(result.content),
          diff: summarizeDiff(current.content, result.content),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_save",
    {
      title: "Save song",
      description:
        "Persist a validated song create or update after explicit user approval (MCP hosts). Studio users usually Accept in the editor then Save there.",
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
        clientRequestId: z
          .string()
          .optional()
          .describe("Idempotency key to dedupe retries"),
      }),
    },
    async (args) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requireWriteEntitlement(ctx);
        return await withClientRequestId(ctx.orgId, args.clientRequestId, async () => {
          const validation = validateChordProContent(args.content);
          if (!validation.ok && !args.allowInvalid) {
            return jsonResult(
              {
                error: true,
                code: "validation",
                message: "ChordPro validation failed",
                retryable: false,
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
              {
                error: true,
                code: "validation",
                message: "songId and updatedAt are required for update",
                retryable: false,
              },
              true,
            );
          }
          try {
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
            let current: unknown;
            try {
              current = serializeSong(await songService(ctx).getById(args.songId));
            } catch {
              /* ignore */
            }
            return errorResult(error, { current, field: "updatedAt" });
          }
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_move",
    {
      title: "Move song",
      description: "Move a song to another folder (or root). Requires updatedAt.",
      inputSchema: z.object({
        songId: z.string().uuid(),
        updatedAt: z.string(),
        folderId: z.string().uuid().nullable(),
      }),
    },
    async ({ songId, updatedAt, folderId }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        requireWriteEntitlement(ctx);
        try {
          const moved = await songService(ctx).move(
            songId,
            new Date(updatedAt),
            folderId,
          );
          return jsonResult({
            moved: true,
            song: serializeSong(moved),
          });
        } catch (error) {
          let current: unknown;
          try {
            current = serializeSong(await songService(ctx).getById(songId));
          } catch {
            /* ignore */
          }
          return errorResult(error, { current, field: "updatedAt" });
        }
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "songs_delete",
    {
      title: "Delete song",
      description:
        "Soft-delete a song (moves to trash). Requires explicit user confirmation before calling.",
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

  server.registerTool(
    "songs_restore",
    {
      title: "Restore song",
      description: "Restore a soft-deleted song from trash.",
      inputSchema: z.object({ songId: z.string().uuid() }),
    },
    async ({ songId }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        requireWriteEntitlement(ctx);
        const song = await songService(ctx).restore(songId);
        return jsonResult({
          restored: true,
          song: song ? serializeSong(song as never) : { id: songId },
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
