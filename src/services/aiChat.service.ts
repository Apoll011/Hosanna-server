import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { formatChordPro } from "@hosanna/chordpro/formatter";
import {
  convertToChordProDetailed,
  lintChordPro,
  parseChordPro,
} from "@hosanna/chordpro/parser";
import type { AuthInfo } from "@modelcontextprotocol/server";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  folders as folderService,
  getMcpContext,
  requireMcpContext,
  requirePermission,
  requireWriteEntitlement,
  services as serviceService,
  songs as songService,
} from "../mcp/context.js";
import {
  explainChordProDirective,
  getChordProCapabilities,
} from "../mcp/lib/capabilities.js";
import {
  DOC_RESOURCES,
  docsAccessReport,
  listResources,
  listSkills,
  readDoc,
  readSkill,
  SKILL_NAMES,
} from "../mcp/lib/docsAccess.js";
import {
  metadataFromChordPro,
  validateChordProContent,
} from "../mcp/lib/chordproGate.js";
import {
  clipContent,
  FULL_CONTENT_MAX,
  SEARCH_CONTENT_MAX,
} from "../mcp/lib/contentClip.js";
import { summarizeDiff } from "../mcp/lib/diff.js";
import { withClientRequestId } from "../mcp/lib/idempotency.js";
import {
  collectionAddSongs,
  collectionRemoveSongs,
  createAgendaEvent,
  createCollection,
  createFolder,
  getAgendaEvent,
  getCollection,
  listAgenda,
  listCollections,
  listFolders,
  updateAgendaEvent,
  updateCollection,
  updateFolder,
} from "../mcp/lib/libraryCrud.js";
import { searchMusicBrainzRecordings } from "../mcp/lib/musicbrainz.js";
import { propagateVerseChords } from "../mcp/lib/propagateChords.js";
import {
  serviceElementsSchema,
  validateServicePlan,
} from "../mcp/lib/serviceElements.js";
import { mapToolError } from "../mcp/lib/toolErrors.js";
import { transposeChordProSource } from "../mcp/lib/transposeSource.js";
import {
  nativeWebAuthFromRuntime,
  nativeWebFetch,
  type NativeWebAuth,
  NATIVE_WEB_CAPABILITIES,
  providerSupportsNativeFetch,
} from "../mcp/lib/nativeWeb.js";
import {
  FOLDER_COLOR_IDS,
  FOLDER_ICON_IDS,
  STUDIO_UI_CATALOG,
} from "../mcp/lib/studioUi.js";
import { searchWeb } from "../mcp/lib/webSearch.js";
import { searchYouTube } from "../mcp/lib/youtubeSearch.js";

const folderIconSchema = z.enum(FOLDER_ICON_IDS);
const folderColorSchema = z.enum(FOLDER_COLOR_IDS);
import type { AiProvider } from "./orgAiConfig.service.js";
import {
  AI_PROVIDER_DEFAULT_BASE_URL,
  OrgAiConfigService,
} from "./orgAiConfig.service.js";

export type ChatPageContext = {
  kind?:
    | "song_editor"
    | "service_editor"
    | "songs_list"
    | "services_list"
    | "explorer"
    | "collection_detail"
    | "agenda"
    | "trash"
    | "general";
  route?: string;
  songId?: string;
  serviceId?: string;
  folderId?: string | null;
  collectionId?: string | null;
  title?: string;
  updatedAt?: string;
  artist?: string;
  contentExcerpt?: string;
  contentTruncated?: boolean;
  selectedSongIds?: string[];
  selectedFolderIds?: string[];
  serviceElementsSummary?: Array<{
    id: string;
    type: string;
    title?: string;
    songId?: string;
  }>;
};

/**
 * OpenAI-compatible hosts (DeepSeek, Groq, Together, custom gateways) speak
 * Chat Completions — use `.chat()`. Official OpenAI also works via `.chat()`.
 * Anthropic / Google keep their native AI SDK providers.
 */
function buildModel(
  provider: AiProvider,
  modelId: string,
  apiKey: string,
  baseUrl?: string | null,
) {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "deepseek":
    case "openai_compatible":
    case "openai":
    default: {
      const url =
        baseUrl ||
        AI_PROVIDER_DEFAULT_BASE_URL[provider] ||
        undefined;
      const client = createOpenAI({
        apiKey,
        ...(url ? { baseURL: url } : {}),
        name: provider,
      });
      // Chat Completions path — works with DeepSeek and most OpenAI forks.
      return client.chat(modelId);
    }
  }
}

function textResult(data: unknown) {
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

/** Studio-only: stage a destructive action for the Confirm button (does not mutate). */
function deleteConfirmation(opts: {
  action:
    | "delete_song"
    | "delete_service"
    | "delete_folder"
    | "delete_collection"
    | "delete_agenda";
  id: string;
  title: string;
  detail?: string;
  folderAction?: "move_to_root" | "delete_songs";
}) {
  return {
    confirmation: {
      ...opts,
      requiresUiConfirm: true,
      message: `Staged in Studio — the user must click Confirm to ${opts.action.replace(/_/g, " ")} "${opts.title}". Do NOT claim it is deleted until they confirm.`,
    },
  };
}

function buildHosannaTools(
  authInfo: AuthInfo,
  opts?: { nativeWebAuth?: NativeWebAuth | null },
) {
  const nativeWebAuth = opts?.nativeWebAuth ?? null;
  const webBackend = nativeWebAuth
    ? `native(${nativeWebAuth.provider})→duckduckgo`
    : "duckduckgo";
  return {
    hosanna_capabilities: tool({
      description: "Summarize Hosanna tools and ChordPro feature support.",
      inputSchema: z.object({}),
      execute: async () =>
        textResult({
          features: getChordProCapabilities().features,
          skills: SKILL_NAMES.map((n) => `hosanna://skills/${n}`),
          howToReadSkills:
            "Call hosanna_skills_list then hosanna_skill_read({name}). Skill bodies are NOT auto-injected — you must read them.",
          nativeWeb: {
            active: nativeWebAuth?.provider ?? null,
            capabilities: NATIVE_WEB_CAPABILITIES,
            note: nativeWebAuth
              ? `Org AI is ${nativeWebAuth.provider} — metadata_web_search/fetch use that provider's Search & Fetch APIs.`
              : "Org AI has no native Search/Fetch; metadata_web_search uses DuckDuckGo.",
          },
          studioUi: STUDIO_UI_CATALOG,
          readAlso: [
            "hosanna://domain/library — folder/collection icon + color ids",
            "hosanna://domain/songs",
            "hosanna://domain/services",
          ],
          tools: {
            docs: [
              "hosanna_skills_list",
              "hosanna_skill_read",
              "hosanna_resources_list",
              "hosanna_resource_read",
            ],
            songs: [
              "search",
              "get",
              "get_many",
              "create_draft",
              "propose_edit",
              "propose_fix",
              "propose_transpose",
              "propose_propagate_chords",
              "save",
              "move",
              "delete",
              "restore",
            ],
            services: [
              "search",
              "get(expandSongs)",
              "propose_edit",
              "plan_suggest",
              "validate",
              "save",
              "delete",
              "restore",
            ],
            library: [
              "folders CRUD+restore",
              "collections CRUD+songs",
              "agenda CRUD",
              "trash_list",
              "studio_sync",
            ],
            metadata: [
              "musicbrainz",
              "youtube",
              `web(${webBackend})`,
              ...(nativeWebAuth &&
              providerSupportsNativeFetch(nativeWebAuth.provider)
                ? ["web_fetch"]
                : []),
            ],
            chordpro: [
              "validate",
              "format",
              "transpose",
              "convert",
              "propagate_chords",
              "directives",
            ],
          },
          note: "Studio: propose tools stage Accept/Decline in the editor; user Save there. *_delete tools only STAGE a Confirm button (do not mutate). songs_save/services_save only after explicit persist request (MCP hosts).",
        }),
    }),
    hosanna_permissions: tool({
      description: "Current user role and org entitlement.",
      inputSchema: z.object({}),
      execute: async () => {
        const ctx = getMcpContext(authInfo);
        if (!ctx) return textResult({ authenticated: false });
        return textResult({
          authenticated: true,
          userId: ctx.user.id,
          orgId: ctx.orgId,
          role: ctx.user.role,
          entitled: ctx.entitled,
        });
      },
    }),
    hosanna_skills_list: tool({
      description:
        "List skill documents with on-disk existence + preview. Then hosanna_skill_read for full SKILL.md text.",
      inputSchema: z.object({}),
      execute: async () =>
        textResult({
          skills: listSkills(),
          access: docsAccessReport(),
        }),
    }),
    hosanna_skill_read: tool({
      description:
        "Read full SKILL.md for a skill (e.g. hosanna-safe-data). Returns verbatim markdown — do not invent skill content.",
      inputSchema: z.object({
        name: z.string().describe(`One of: ${SKILL_NAMES.join(", ")}`),
      }),
      execute: async ({ name }) => {
        const skill = readSkill(name);
        return textResult({
          name: skill.name,
          uri: skill.uri,
          mimeType: "text/markdown",
          bytes: Buffer.byteLength(skill.text, "utf8"),
          text: skill.text,
        });
      },
    }),
    hosanna_resources_list: tool({
      description: "List readable hosanna:// resource URIs (docs + skills).",
      inputSchema: z.object({}),
      execute: async () => textResult({ resources: listResources() }),
    }),
    hosanna_resource_read: tool({
      description:
        "Read a hosanna:// resource by URI (skills, chordpro guide/features, domain docs, examples). Returns verbatim content.",
      inputSchema: z.object({
        uri: z.string().describe("e.g. hosanna://chordpro/guide"),
      }),
      execute: async ({ uri }) => {
        const trimmed = uri.trim();
        if (trimmed.startsWith("hosanna://skills/")) {
          const skill = readSkill(trimmed);
          return textResult({
            uri: skill.uri,
            mimeType: "text/markdown",
            text: skill.text,
          });
        }
        const caps = getChordProCapabilities();
        if (trimmed === "hosanna://chordpro/directives") {
          return textResult({
            uri: trimmed,
            mimeType: "application/json",
            text: JSON.stringify(caps.directives, null, 2),
          });
        }
        if (trimmed === "hosanna://chordpro/features") {
          return textResult({
            uri: trimmed,
            mimeType: "application/json",
            text: JSON.stringify(caps.features, null, 2),
          });
        }
        if (trimmed === "hosanna://ops/catalog") {
          return textResult({
            uri: trimmed,
            mimeType: "application/json",
            text: JSON.stringify(
              { resources: listResources(), skills: SKILL_NAMES },
              null,
              2,
            ),
          });
        }
        const entry = DOC_RESOURCES.find((r) => r.uri === trimmed);
        if (!entry?.relativePath) {
          return textResult({
            error: true,
            code: "not_found",
            message: `Unknown resource ${trimmed}`,
            hint: "Call hosanna_resources_list",
          });
        }
        const text = readDoc(entry.relativePath);
        return textResult({
          uri: trimmed,
          mimeType:
            entry.kind === "chordpro"
              ? "text/vnd.chordpro"
              : entry.kind === "json"
                ? "application/json"
                : "text/markdown",
          text,
        });
      },
    }),
    folders_list: tool({
      description: "List organization folders.",
      inputSchema: z.object({
        parentId: z.string().nullable().optional(),
      }),
      execute: async ({ parentId }) =>
        textResult(await listFolders(requireMcpContext(authInfo), parentId)),
    }),
    folders_create: tool({
      description:
        "Create a folder. color/icon must be Studio ids (see hosanna_capabilities.studioUi or hosanna://domain/library). Then call studio_sync.",
      inputSchema: z.object({
        name: z.string().min(1),
        parentId: z.string().nullable().optional(),
        color: folderColorSchema.optional(),
        icon: folderIconSchema.optional(),
      }),
      execute: async (args) =>
        textResult(await createFolder(requireMcpContext(authInfo), args)),
    }),
    folders_update: tool({
      description:
        "Rename/move/recolor a folder. Requires updatedAt. color/icon = Studio ids only (hosanna://domain/library). Use icon=default to reset. Then call studio_sync.",
      inputSchema: z.object({
        folderId: z.string(),
        updatedAt: z.string(),
        name: z.string().min(1).optional(),
        parentId: z.string().nullable().optional(),
        color: folderColorSchema.optional(),
        icon: folderIconSchema.optional(),
      }),
      execute: async (args) =>
        textResult(await updateFolder(requireMcpContext(authInfo), args)),
    }),
    studio_sync: tool({
      description:
        "Studio-only: ask the open Studio tab to pull replication now so explorer/lists show server changes immediately. Call after folders/collections/songs/services mutations. Not needed on MCP hosts.",
      inputSchema: z.object({
        reason: z
          .string()
          .optional()
          .describe("Short why, e.g. after_folder_update"),
      }),
      execute: async ({ reason }) =>
        textResult({
          studioSync: true,
          reason: reason ?? "refresh",
          note: "Studio will run triggerSyncCheck + refetch. Tell the user the UI should update shortly.",
        }),
    }),
    folders_delete: tool({
      description:
        "Stage folder soft-delete for Studio Confirm (does NOT delete yet). move_to_root (default): songs go to library root; delete_songs: recursively trash folder + songs. User must click Confirm.",
      inputSchema: z.object({
        folderId: z.string(),
        action: z.enum(["move_to_root", "delete_songs"]).optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "folder.delete");
        const folder = await folderService(ctx).getById(args.folderId);
        const folderAction = args.action ?? "move_to_root";
        return textResult(
          deleteConfirmation({
            action: "delete_folder",
            id: folder.id,
            title: folder.name,
            folderAction,
            detail:
              folderAction === "delete_songs"
                ? "Also trash songs inside this folder (and nested folders)."
                : "Songs in this folder move to library root.",
          }),
        );
      },
    }),
    folders_restore: tool({
      description: "Restore a soft-deleted folder from trash.",
      inputSchema: z.object({ folderId: z.string() }),
      execute: async ({ folderId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "folder.update");
        requireWriteEntitlement(ctx);
        const folder = await folderService(ctx).restore(folderId);
        return textResult({ restored: true, folder });
      },
    }),
    trash_list: tool({
      description: "List soft-deleted songs, folders, and services.",
      inputSchema: z.object({}),
      execute: async () => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const [songs, folders, services] = await Promise.all([
          songService(ctx).listTrashed(),
          folderService(ctx).listTrashed(),
          serviceService(ctx).listTrashed(),
        ]);
        return textResult({
          songs: songs.map((s) => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            updatedAt: s.updatedAt.toISOString(),
          })),
          folders: folders.map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId,
            updatedAt: f.updatedAt.toISOString(),
          })),
          services: services.map((s) => ({
            id: s.id,
            name: s.name,
            updatedAt: s.updatedAt.toISOString(),
          })),
        });
      },
    }),
    collections_list: tool({
      description: "List organization collections.",
      inputSchema: z.object({}),
      execute: async () =>
        textResult(await listCollections(requireMcpContext(authInfo))),
    }),
    collections_get: tool({
      description: "Get a collection with its songs.",
      inputSchema: z.object({ collectionId: z.string() }),
      execute: async ({ collectionId }) =>
        textResult(
          await getCollection(requireMcpContext(authInfo), collectionId),
        ),
    }),
    collections_create: tool({
      description:
        "Create a song collection. color/icon = Studio ids (hosanna://domain/library). Then call studio_sync.",
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        color: folderColorSchema.optional(),
        icon: folderIconSchema.optional(),
        songIds: z.array(z.string()).optional(),
      }),
      execute: async (args) =>
        textResult(await createCollection(requireMcpContext(authInfo), args)),
    }),
    collections_update: tool({
      description:
        "Update collection metadata. Requires updatedAt. color/icon = Studio ids. Then call studio_sync.",
      inputSchema: z.object({
        collectionId: z.string(),
        updatedAt: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        color: folderColorSchema.optional(),
        icon: folderIconSchema.optional(),
      }),
      execute: async (args) =>
        textResult(await updateCollection(requireMcpContext(authInfo), args)),
    }),
    collections_delete: tool({
      description:
        "Stage collection soft-delete for Studio Confirm (does NOT delete yet). Songs stay in the library. User must click Confirm.",
      inputSchema: z.object({ collectionId: z.string() }),
      execute: async ({ collectionId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "collection.delete");
        const { collection } = await getCollection(ctx, collectionId);
        return textResult(
          deleteConfirmation({
            action: "delete_collection",
            id: collection.id,
            title: collection.name,
            detail: "Songs remain in the library.",
          }),
        );
      },
    }),
    collections_add_songs: tool({
      description: "Add songs to a collection.",
      inputSchema: z.object({
        collectionId: z.string(),
        songIds: z.array(z.string()).min(1),
      }),
      execute: async (args) =>
        textResult(
          await collectionAddSongs(requireMcpContext(authInfo), args),
        ),
    }),
    collections_remove_songs: tool({
      description: "Remove songs from a collection (does not delete songs).",
      inputSchema: z.object({
        collectionId: z.string(),
        songIds: z.array(z.string()).min(1),
      }),
      execute: async (args) =>
        textResult(
          await collectionRemoveSongs(requireMcpContext(authInfo), args),
        ),
    }),
    agenda_list: tool({
      description: "List upcoming agenda events.",
      inputSchema: z.object({
        from: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (args) =>
        textResult(await listAgenda(requireMcpContext(authInfo), args)),
    }),
    agenda_get: tool({
      description: "Get a single agenda event.",
      inputSchema: z.object({ eventId: z.string() }),
      execute: async ({ eventId }) =>
        textResult(await getAgendaEvent(requireMcpContext(authInfo), eventId)),
    }),
    agenda_create: tool({
      description:
        "Create an agenda event (org-local date/time, no timezone conversion).",
      inputSchema: z.object({
        title: z.string().min(1),
        date: z.string().min(1).describe("YYYY-MM-DD org-local"),
        time: z.string().min(1).describe("HH:mm 24h org-local"),
        type: z
          .string()
          .min(1)
          .describe('Free string e.g. "Culto Dominical", "Ensaio"'),
        durationMinutes: z.number().int().positive().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        linkedServiceId: z.string().nullable().optional(),
      }),
      execute: async (args) =>
        textResult(await createAgendaEvent(requireMcpContext(authInfo), args)),
    }),
    agenda_update: tool({
      description: "Update an agenda event. Requires updatedAt.",
      inputSchema: z.object({
        eventId: z.string(),
        updatedAt: z.string(),
        title: z.string().min(1).optional(),
        date: z.string().optional(),
        time: z.string().optional(),
        type: z.string().optional(),
        durationMinutes: z.number().int().positive().optional(),
        location: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        linkedServiceId: z.string().nullable().optional(),
      }),
      execute: async (args) =>
        textResult(await updateAgendaEvent(requireMcpContext(authInfo), args)),
    }),
    agenda_delete: tool({
      description:
        "Stage agenda event soft-delete for Studio Confirm (does NOT delete yet). User must click Confirm.",
      inputSchema: z.object({ eventId: z.string() }),
      execute: async ({ eventId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "agenda.delete");
        const { event } = await getAgendaEvent(ctx, eventId);
        return textResult(
          deleteConfirmation({
            action: "delete_agenda",
            id: event.id,
            title: event.title || eventId,
          }),
        );
      },
    }),
    metadata_musicbrainz_search: tool({
      description:
        "Search MusicBrainz for title/artist/release metadata to complete song tags. Does not invent lyrics.",
      inputSchema: z.object({
        title: z.string().optional(),
        artist: z.string().optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async (args) =>
        textResult(await searchMusicBrainzRecordings(args)),
    }),
    metadata_youtube_search: tool({
      description:
        "Search YouTube for a reference video. Returns hits with `directive` like `{youtube: https://www.youtube.com/watch?v=...}` ready to paste into ChordPro. Use when completing metadata or the user asks for a YouTube link.",
      inputSchema: z.object({
        title: z.string().optional(),
        artist: z.string().optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async (args) =>
        textResult(await searchYouTube({ ...args, nativeAuth: nativeWebAuth })),
    }),
    metadata_web_search: tool({
      description: nativeWebAuth
        ? `Web search via ${nativeWebAuth.provider} Search API (falls back to DuckDuckGo). Song metadata, CCLI, reference pages.`
        : "General web search (DuckDuckGo). Switch org AI to DeepSeek to use native Search & Fetch with the same API key.",
      inputSchema: z.object({
        query: z.string().min(1).max(128),
        limit: z.number().int().min(1).max(10).optional(),
        oriQuestion: z
          .string()
          .max(128)
          .optional()
          .describe("Original user question — improves native search ranking."),
      }),
      execute: async (args) =>
        textResult(
          await searchWeb({
            query: args.query,
            limit: args.limit,
            oriQuestion: args.oriQuestion,
            nativeAuth: nativeWebAuth,
          }),
        ),
    }),
    ...(nativeWebAuth && providerSupportsNativeFetch(nativeWebAuth.provider)
      ? {
          metadata_web_fetch: tool({
            description: `Fetch a URL as Markdown via ${nativeWebAuth.provider} Fetch. Use for CCLI pages, artist pages, or when Cifra Club HTML scrape is blocked.`,
            inputSchema: z.object({
              url: z.string().url().max(8192),
            }),
            execute: async ({ url }) =>
              textResult(await nativeWebFetch(nativeWebAuth, url)),
          }),
        }
      : {}),
    chordpro_validate: tool({
      description: "Lint and parse ChordPro text.",
      inputSchema: z.object({ content: z.string() }),
      execute: async ({ content }) =>
        textResult(validateChordProContent(content)),
    }),
    chordpro_propagate_chords: tool({
      description:
        "Copy [Am]/[G]/… chord markers from the first chorded verse onto later verses at the same lyric-character offsets. Does not invent chords.",
      inputSchema: z.object({ content: z.string() }),
      execute: async ({ content }) => {
        const result = propagateVerseChords(content);
        return textResult({
          ...result,
          diff: summarizeDiff(content, result.content),
          proposal: { content: result.content },
        });
      },
    }),
    chordpro_parse_summary: tool({
      description: "Parse ChordPro for metadata, analysis, score, variants.",
      inputSchema: z.object({
        content: z.string(),
        variantId: z.string().optional(),
      }),
      execute: async ({ content, variantId }) => {
        let song = parseChordPro(content);
        if (variantId) song = song.selectVariant(variantId);
        return textResult({
          metadata: song.metadata,
          variants: (song.variants ?? []).map((v) => ({
            id: v.id,
            name: v.name,
          })),
          parseErrors: song.errors ?? [],
          diagnostics: lintChordPro(content),
          analysis: song.analyze(),
          score: song.score(),
        });
      },
    }),
    chordpro_format: tool({
      description: "Normalize ChordPro formatting. Returns a proposal for the Studio editor.",
      inputSchema: z.object({ content: z.string() }),
      execute: async ({ content }) => {
        const result = formatChordPro(content, {
          expandDirectiveAliases: true,
          normalizeNotationAliases: true,
        });
        return textResult({
          content: result.content,
          proposal: { content: result.content },
          validation: validateChordProContent(result.content),
          diff: summarizeDiff(content, result.content),
        });
      },
    }),
    chordpro_transpose: tool({
      description:
        "Source-preserving transpose. Pass exactly one of toKey or semitones. Prefer songs_propose_transpose when a songId is known. Returns a proposal for the Studio editor.",
      inputSchema: z
        .object({
          content: z.string(),
          semitones: z.number().int().optional(),
          toKey: z.string().optional(),
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
      execute: async ({ content, semitones, toKey }) => {
        const result =
          toKey != null && String(toKey).trim() !== ""
            ? transposeChordProSource(content, { toKey })
            : transposeChordProSource(content, { semitones: semitones ?? 0 });
        return textResult({
          ...result,
          proposal: { content: result.content },
          validation: validateChordProContent(result.content),
          diff: summarizeDiff(content, result.content),
        });
      },
    }),
    chordpro_convert: tool({
      description:
        "Convert UG/Cifra/plain sheets to ChordPro. Returns a proposal for the Studio editor.",
      inputSchema: z.object({ input: z.string() }),
      execute: async ({ input }) => {
        const detailed = convertToChordProDetailed(input);
        return textResult({
          content: detailed.chordpro,
          title: detailed.title,
          warnings: detailed.warnings,
          proposal: {
            content: detailed.chordpro,
            title: detailed.title,
          },
          validation: validateChordProContent(detailed.chordpro),
        });
      },
    }),
    chordpro_directives: tool({
      description: "List or explain ChordPro directives.",
      inputSchema: z.object({ name: z.string().optional() }),
      execute: async ({ name }) => {
        if (name) {
          return textResult(
            explainChordProDirective(name) ?? { error: `Unknown: ${name}` },
          );
        }
        return textResult(getChordProCapabilities());
      },
    }),
    songs_search: tool({
      description:
        "Search library by title/artist/lyrics/tags. key is exact (not enharmonic). Default page=1 limit=20. includeContent clips to 8k + truncated flag.",
      inputSchema: z.object({
        search: z.string().optional(),
        key: z.string().optional().describe("Exact key e.g. Db"),
        tag: z.string().optional(),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(50).optional(),
        includeContent: z.boolean().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const page = args.page ?? 1;
        const result = await songService(ctx).list({
          search: args.search,
          key: args.key,
          tag: args.tag,
          page,
          limit: Math.min(args.limit ?? 20, 50),
          sortBy: "title",
          sortOrder: "asc",
        });
        return textResult({
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          nextPage: result.page < result.totalPages ? result.page + 1 : null,
          songs: result.songs.map((s) => {
            if (!args.includeContent) {
              return {
                id: s.id,
                title: s.title,
                artist: s.artist,
                tags: s.tags,
                path: s.path,
                folderId: s.folderId,
                updatedAt: s.updatedAt.toISOString(),
                contentPreview: s.content.slice(0, 200),
              };
            }
            const clipped = clipContent(s.content, SEARCH_CONTENT_MAX);
            return {
              id: s.id,
              title: s.title,
              artist: s.artist,
              tags: s.tags,
              path: s.path,
              folderId: s.folderId,
              updatedAt: s.updatedAt.toISOString(),
              content: clipped.content,
              truncated: clipped.truncated,
              contentLength: clipped.contentLength,
            };
          }),
        });
      },
    }),
    songs_get: tool({
      description: "Get a song by id including ChordPro content.",
      inputSchema: z.object({ songId: z.string() }),
      execute: async ({ songId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const song = await songService(ctx).getById(songId);
        const clipped = clipContent(song.content, FULL_CONTENT_MAX);
        return textResult({
          song: {
            id: song.id,
            title: song.title,
            artist: song.artist,
            content: clipped.content,
            truncated: clipped.truncated,
            contentLength: clipped.contentLength,
            tags: song.tags,
            folderId: song.folderId,
            updatedAt: song.updatedAt.toISOString(),
          },
          validation: validateChordProContent(song.content),
        });
      },
    }),
    songs_get_many: tool({
      description: "Batch-fetch up to 20 songs by id.",
      inputSchema: z.object({
        songIds: z.array(z.string()).min(1).max(20),
        includeContent: z.boolean().optional(),
      }),
      execute: async ({ songIds, includeContent }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const songs = [];
        const missing: string[] = [];
        for (const id of songIds) {
          try {
            const song = await songService(ctx).getById(id);
            if (includeContent === false) {
              songs.push({
                id: song.id,
                title: song.title,
                artist: song.artist,
                tags: song.tags,
                updatedAt: song.updatedAt.toISOString(),
                contentPreview: song.content.slice(0, 200),
              });
            } else {
              const clipped = clipContent(song.content, FULL_CONTENT_MAX);
              songs.push({
                id: song.id,
                title: song.title,
                artist: song.artist,
                tags: song.tags,
                updatedAt: song.updatedAt.toISOString(),
                content: clipped.content,
                truncated: clipped.truncated,
                contentLength: clipped.contentLength,
              });
            }
          } catch {
            missing.push(id);
          }
        }
        return textResult({ songs, missing, count: songs.length });
      },
    }),
    songs_create_draft: tool({
      description: "Draft a new song without saving. Optional folderId.",
      inputSchema: z.object({
        title: z.string(),
        artist: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
        folderId: z.string().nullable().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.create");
        const content =
          args.content?.trim() ||
          `{title: ${args.title}}\n{artist: ${args.artist || "Unknown"}}\n{key: G}\n\n`;
        return textResult({
          proposal: {
            title: args.title,
            artist: args.artist ?? "Unknown",
            content,
            tags: args.tags ?? [],
            folderId: args.folderId ?? null,
          },
          validation: validateChordProContent(content),
        });
      },
    }),
    songs_propose_edit: tool({
      description:
        "Propose an edit to an existing song (not saved). Studio stages Accept/Decline.",
      inputSchema: z.object({
        songId: z.string(),
        content: z.string().optional(),
        title: z.string().optional(),
        artist: z.string().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        const current = await songService(ctx).getById(args.songId);
        const content = args.content ?? current.content;
        const meta = metadataFromChordPro(content);
        return textResult({
          proposal: {
            id: current.id,
            title: args.title ?? meta.title ?? current.title,
            artist: args.artist ?? meta.artist ?? current.artist,
            content,
            tags: current.tags,
            updatedAt: current.updatedAt.toISOString(),
          },
          validation: validateChordProContent(content),
          diff: summarizeDiff(current.content, content),
        });
      },
    }),
    songs_propose_fix: tool({
      description: "Propose format/lint fixes for a song (not saved).",
      inputSchema: z.object({ songId: z.string() }),
      execute: async ({ songId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        const current = await songService(ctx).getById(songId);
        const formatted = formatChordPro(current.content, {
          expandDirectiveAliases: true,
          normalizeNotationAliases: true,
        });
        return textResult({
          proposal: {
            id: current.id,
            title: current.title,
            artist: current.artist,
            content: formatted.content,
            updatedAt: current.updatedAt.toISOString(),
          },
          validation: validateChordProContent(formatted.content),
          diff: summarizeDiff(current.content, formatted.content),
        });
      },
    }),
    songs_propose_transpose: tool({
      description:
        "One-shot transpose of a library song. Pass exactly one of toKey or semitones. Stages proposal in Studio.",
      inputSchema: z
        .object({
          songId: z.string(),
          toKey: z.string().optional(),
          semitones: z.number().int().optional(),
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
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        const current = await songService(ctx).getById(args.songId);
        const result =
          args.toKey != null && String(args.toKey).trim() !== ""
            ? transposeChordProSource(current.content, { toKey: args.toKey })
            : transposeChordProSource(current.content, {
                semitones: args.semitones ?? 0,
              });
        return textResult({
          proposal: {
            id: current.id,
            title: current.title,
            artist: current.artist,
            content: result.content,
            updatedAt: current.updatedAt.toISOString(),
          },
          transpose: result,
          validation: validateChordProContent(result.content),
          diff: summarizeDiff(current.content, result.content),
        });
      },
    }),
    songs_propose_propagate_chords: tool({
      description:
        "Propagate verse chords onto later verses for a library song. Does not invent chords.",
      inputSchema: z.object({ songId: z.string() }),
      execute: async ({ songId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        const current = await songService(ctx).getById(songId);
        const result = propagateVerseChords(current.content);
        return textResult({
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
      },
    }),
    songs_save: tool({
      description:
        "Persist song create/update after explicit approval (MCP). Studio users usually Accept in editor then Save there. Updates need updatedAt.",
      inputSchema: z.object({
        mode: z.enum(["create", "update"]),
        songId: z.string().optional(),
        updatedAt: z.string().optional(),
        title: z.string(),
        artist: z.string().optional(),
        content: z.string(),
        folderId: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        song_number: z.number().positive().nullable().optional(),
        allowInvalid: z.boolean().optional(),
        clientRequestId: z.string().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requireWriteEntitlement(ctx);
        return textResult(
          await withClientRequestId(ctx.orgId, args.clientRequestId, async () => {
            const validation = validateChordProContent(args.content);
            if (!validation.ok && !args.allowInvalid) {
              return mapToolError(new Error("Validation failed"), {
                current: { validation },
              });
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
              return {
                saved: true,
                song: {
                  id: created.id,
                  title: created.title,
                  updatedAt: created.updatedAt.toISOString(),
                },
              };
            }
            requirePermission(ctx, "song.update");
            if (!args.songId || !args.updatedAt) {
              return mapToolError(
                new Error("songId and updatedAt required"),
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
              return {
                saved: true,
                song: {
                  id: updated.id,
                  title: updated.title,
                  updatedAt: updated.updatedAt.toISOString(),
                },
              };
            } catch (error) {
              let current: unknown;
              try {
                const song = await songService(ctx).getById(args.songId);
                current = {
                  id: song.id,
                  title: song.title,
                  artist: song.artist,
                  content: song.content,
                  updatedAt: song.updatedAt.toISOString(),
                };
              } catch {
                /* ignore */
              }
              return mapToolError(error, { current, field: "updatedAt" });
            }
          }),
        );
      },
    }),
    songs_move: tool({
      description: "Move a song to another folder (or root). Requires updatedAt.",
      inputSchema: z.object({
        songId: z.string(),
        updatedAt: z.string(),
        folderId: z.string().nullable(),
      }),
      execute: async ({ songId, updatedAt, folderId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        requireWriteEntitlement(ctx);
        try {
          const moved = await songService(ctx).move(
            songId,
            new Date(updatedAt),
            folderId,
          );
          return textResult({
            moved: true,
            song: {
              id: moved.id,
              title: moved.title,
              folderId: moved.folderId,
              updatedAt: moved.updatedAt.toISOString(),
            },
          });
        } catch (error) {
          let current: unknown;
          try {
            const song = await songService(ctx).getById(songId);
            current = {
              id: song.id,
              title: song.title,
              folderId: song.folderId,
              updatedAt: song.updatedAt.toISOString(),
            };
          } catch {
            /* ignore */
          }
          return textResult(mapToolError(error, { current, field: "updatedAt" }));
        }
      },
    }),
    songs_delete: tool({
      description:
        "Stage song soft-delete (trash) for Studio Confirm — does NOT delete. Call when the user wants to delete; Studio shows a Confirm button. Never claim deleted until they click Confirm.",
      inputSchema: z.object({ songId: z.string() }),
      execute: async ({ songId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.delete");
        const song = await songService(ctx).getById(songId);
        return textResult(
          deleteConfirmation({
            action: "delete_song",
            id: song.id,
            title: song.title,
            detail: song.artist ? `Artist: ${song.artist}` : undefined,
          }),
        );
      },
    }),
    songs_restore: tool({
      description: "Restore a soft-deleted song from trash.",
      inputSchema: z.object({ songId: z.string() }),
      execute: async ({ songId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.update");
        requireWriteEntitlement(ctx);
        const song = await songService(ctx).restore(songId);
        return textResult({
          restored: true,
          song: song
            ? {
                id: song.id,
                title: song.title,
                updatedAt: song.updatedAt.toISOString(),
              }
            : { id: songId },
        });
      },
    }),
    services_search: tool({
      description: "List services in the organization.",
      inputSchema: z.object({
        archived: z.boolean().optional(),
        search: z.string().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.access");
        let list = await serviceService(ctx).list({
          archived: args.archived ?? false,
        });
        if (args.search?.trim()) {
          const q = args.search.toLowerCase();
          list = list.filter((s) => s.name.toLowerCase().includes(q));
        }
        return textResult({ services: list, total: list.length });
      },
    }),
    services_get: tool({
      description:
        "Get a service plan with elements. expandSongs attaches song metadata for song elements (avoids N+1 songs_get).",
      inputSchema: z.object({
        serviceId: z.string(),
        expandSongs: z.boolean().optional(),
        includeSongContent: z.boolean().optional(),
      }),
      execute: async ({ serviceId, expandSongs, includeSongContent }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.access");
        const service = await serviceService(ctx).getByIdSerialized(serviceId);
        const validation = await validateServicePlan(
          service.elements,
          songService(ctx),
        );
        let expandedSongs: unknown[] | undefined;
        if (expandSongs) {
          const rawElements = Array.isArray(service.elements)
            ? service.elements
            : [];
          const ids = [
            ...new Set(
              rawElements
                .map((el) =>
                  el && typeof el === "object" && "songId" in el
                    ? String((el as { songId?: unknown }).songId ?? "")
                    : "",
                )
                .filter((id) => id.length > 0),
            ),
          ].slice(0, 40);
          expandedSongs = [];
          for (const id of ids) {
            try {
              const song = await songService(ctx).getById(id);
              expandedSongs.push({
                id: song.id,
                title: song.title,
                artist: song.artist,
                updatedAt: song.updatedAt.toISOString(),
                ...(includeSongContent
                  ? {
                      content: song.content.slice(0, SEARCH_CONTENT_MAX),
                      truncated: song.content.length > SEARCH_CONTENT_MAX,
                      contentLength: song.content.length,
                    }
                  : { contentPreview: song.content.slice(0, 200) }),
              });
            } catch {
              expandedSongs.push({ id, missing: true });
            }
          }
        }
        return textResult({ service, validation, expandedSongs });
      },
    }),
    services_validate: tool({
      description:
        "Validate service elements and song references. elements must match service element schema (id, type, title, …).",
      inputSchema: z.object({ elements: serviceElementsSchema }),
      execute: async ({ elements }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.access");
        return textResult(
          await validateServicePlan(elements, songService(ctx)),
        );
      },
    }),
    services_plan_suggest: tool({
      description: "Suggest a draft service plan from the library (not saved).",
      inputSchema: z.object({
        name: z.string().optional(),
        date: z.string(),
        theme: z.string().optional(),
        maxSongs: z.number().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.create");
        requirePermission(ctx, "song.access");
        const max = Math.min(args.maxSongs ?? 5, 12);
        const library = await songService(ctx).list({
          search: args.theme,
          page: 1,
          limit: max * 3,
          sortBy: "title",
          sortOrder: "asc",
        });
        const picked = library.songs.slice(0, max);
        const elements = [
          {
            id: randomUUID(),
            type: "welcome" as const,
            title: "Welcome",
            content: args.theme ? `Theme: ${args.theme}` : "Welcome",
            position: 0,
          },
          ...picked.map((s, i) => ({
            id: randomUUID(),
            type: "song" as const,
            title: s.title,
            songId: s.id,
            content: s.artist,
            position: i + 1,
          })),
          {
            id: randomUUID(),
            type: "message" as const,
            title: "Message",
            content: args.theme ?? "Message",
            position: picked.length + 1,
          },
        ];
        return textResult({
          proposal: {
            name: args.name ?? "Service draft",
            date: args.date,
            notes: args.theme ? `Theme: ${args.theme}` : "",
            elements,
          },
          reasoning: {
            candidatesFound: library.total,
            songsSelected: picked.map((s) => ({
              id: s.id,
              title: s.title,
              artist: s.artist,
            })),
          },
          validation: await validateServicePlan(elements, songService(ctx)),
        });
      },
    }),
    services_propose_edit: tool({
      description:
        "Propose an edit to an existing service plan (not saved). Studio stages it in the editor.",
      inputSchema: z.object({
        serviceId: z.string(),
        name: z.string().optional(),
        notes: z.string().optional(),
        elements: serviceElementsSchema.optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.update");
        const current = await serviceService(ctx).getByIdSerialized(
          args.serviceId,
        );
        const elements =
          args.elements ??
          (Array.isArray(current.elements) ? current.elements : []);
        return textResult({
          proposal: {
            id: current.id,
            name: args.name ?? current.name,
            notes: args.notes ?? current.notes ?? "",
            elements,
            updatedAt:
              current.updatedAt instanceof Date
                ? current.updatedAt.toISOString()
                : new Date(current.updatedAt).toISOString(),
          },
          validation: await validateServicePlan(elements, songService(ctx)),
        });
      },
    }),
    services_save: tool({
      description:
        "Persist service create/update after explicit approval. Updates need updatedAt.",
      inputSchema: z.object({
        mode: z.enum(["create", "update"]),
        serviceId: z.string().optional(),
        updatedAt: z.string().optional(),
        name: z.string().min(1),
        date: z.string().min(1),
        notes: z.string().optional(),
        elements: serviceElementsSchema.optional(),
        archived: z.boolean().optional(),
        allowInvalid: z.boolean().optional(),
        clientRequestId: z.string().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requireWriteEntitlement(ctx);
        return textResult(
          await withClientRequestId(ctx.orgId, args.clientRequestId, async () => {
            const elements = args.elements ?? [];
            const validation = await validateServicePlan(
              elements,
              songService(ctx),
            );
            if (!validation.ok && !args.allowInvalid) {
              return {
                error: true,
                code: "validation",
                message: "Validation failed",
                retryable: false,
                validation,
              };
            }
            if (args.mode === "create") {
              requirePermission(ctx, "service.create");
              const created = await serviceService(ctx).create({
                name: args.name,
                date: new Date(args.date),
                notes: args.notes,
                elements,
              });
              return { saved: true, service: created, validation };
            }
            requirePermission(ctx, "service.update");
            if (!args.serviceId || !args.updatedAt) {
              return mapToolError(
                new Error("serviceId and updatedAt required"),
              );
            }
            try {
              const updated = await serviceService(ctx).update(
                args.serviceId,
                new Date(args.updatedAt),
                {
                  name: args.name,
                  date: new Date(args.date),
                  notes: args.notes,
                  elements,
                  archived: args.archived,
                },
              );
              return { saved: true, service: updated, validation };
            } catch (error) {
              let current: unknown;
              try {
                current = await serviceService(ctx).getByIdSerialized(
                  args.serviceId,
                );
              } catch {
                /* ignore */
              }
              return mapToolError(error, { current, field: "updatedAt" });
            }
          }),
        );
      },
    }),
    services_delete: tool({
      description:
        "Stage service soft-delete for Studio Confirm — does NOT delete. Studio shows a Confirm button. Never claim deleted until they click Confirm.",
      inputSchema: z.object({ serviceId: z.string() }),
      execute: async ({ serviceId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.delete");
        const service = await serviceService(ctx).getById(serviceId);
        return textResult(
          deleteConfirmation({
            action: "delete_service",
            id: service.id,
            title: service.name,
          }),
        );
      },
    }),
    services_restore: tool({
      description: "Restore a soft-deleted service from trash.",
      inputSchema: z.object({ serviceId: z.string() }),
      execute: async ({ serviceId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.update");
        requireWriteEntitlement(ctx);
        const service = await serviceService(ctx).restore(serviceId);
        return textResult({ restored: true, service });
      },
    }),
  };
}

/**
 * Studio chat system — intentionally shorter than MCP host instructions.
 * Avoids mandatory skill/resource loading that burns tokens on trivial edits.
 */
const STUDIO_CHAT_SYSTEM = `You are Hosanna AI in the Studio chat for church song libraries and service planning.

## Style (strict)
- Be brief. Prefer doing over asking. One short sentence + tools beats essays.
- Do NOT paste full ChordPro bodies into chat. Call propose/edit tools; the Studio editor shows accept/decline.
- Prefer pageContext ids + updatedAt. Do NOT call list/search just to discover the open song/service/folder.
- Skills/docs are NOT in your context until you read them: hosanna_skills_list → hosanna_skill_read, or hosanna_resource_read. Never invent skill contents — quote what the tool returns.
- For clear requests (transpose to D, repeat a section 2×, duplicate last verse, fix chords, complete metadata, create folder/event), act immediately with a sensible default. Ask at most ONE question only when blocked.
- Do not offer multiple options when the user already chose (e.g. "transpose into D").
- ChordPro/song content edits: use propose tools (prefer songs_propose_transpose / songs_propose_edit). Studio stages Accept/Decline in the editor. After Accept, the user saves in the editor — only call songs_save / services_save if they explicitly ask to persist via chat/MCP.
- Library structural edits (folders, collections, agenda create/update, move song, add songs to collection): do them with tools when the request is clear. After those mutations, call \`studio_sync\` so the explorer refreshes immediately.
- Folder/collection \`icon\` and \`color\` must be Studio ids only (see hosanna_capabilities.studioUi or hosanna://domain/library). Never invent Lucide names. Use \`icon=default\` / \`color=default\` to reset.
- Deletes (songs/services/folders/collections/agenda): call the matching \`*_delete\` tool immediately when the user asks to delete — it only STAGES a Confirm button in Studio and does not delete. Do NOT ask for chat confirmation ("are you sure?") and do NOT claim the item is deleted until the user clicks Confirm. If they already confirmed in chat, still only stage the button.
- When the user says "repeat" / "2x" a verse or chorus: duplicate that section's body in the ChordPro (or add \`{c: 2x}\` if they ask for a note only). Prefer physical duplication when they ask to "write a copy".
- On stale/concurrency errors, use the returned \`current\` object (do not re-fetch blindly).

## Capabilities (use them)
- Songs: search/get/get_many, draft, propose_edit/fix/transpose, save, move, delete, restore; trash_list
- Services: search/get (expandSongs), propose_edit, plan_suggest, validate, save, delete, restore
- Folders: list/create/update/delete/restore (icon/color ids from studioUi)
- Collections: list/get/create/update/delete, add_songs/remove_songs (same icon/color ids)
- Agenda: list/get/create/update/delete
- studio_sync: pull replication in this Studio tab after library mutations
- Metadata: MusicBrainz, YouTube (for \`{youtube:}\`), DuckDuckGo web search; ChordPro validate/format/transpose/convert/propagate
- When completing metadata: MusicBrainz for title/artist/release; YouTube search for \`{youtube: URL}\` (use hits[].directive); web search for extra confirmation. If \`metadata_web_fetch\` is available (DeepSeek org AI), use it to read CCLI/artist pages or Cifra URLs blocked by Akamai. Call metadata tools one at a time (MusicBrainz rate-limits parallel bursts with 503). If a tool returns 403/503, report the structured error — do not claim success. Propose the ChordPro edit — do not invent lyrics.
- Unknown Studio UI constants (icons, colors, etc.): call hosanna_capabilities or hosanna_resource_read on hosanna://domain/library — do not guess.

## Hard rules
- Never invent lyrics, chords, or library songs. Ask when content is missing.
- Never silently delete or rewrite unrelated content.
- Respect permissions and \`updatedAt\` concurrency on updates/saves.
`;

function contextBlock(page?: ChatPageContext): string {
  if (!page) return "";
  const excerpt = page.contentExcerpt
    ? page.contentExcerpt.slice(0, 12_000)
    : "";
  return `

## Current Studio page context
Prefer these ids/updatedAt over discovery tools.
${JSON.stringify(
  {
    kind: page.kind ?? "general",
    route: page.route,
    songId: page.songId,
    serviceId: page.serviceId,
    folderId: page.folderId,
    collectionId: page.collectionId,
    title: page.title,
    artist: page.artist,
    updatedAt: page.updatedAt,
    contentTruncated: page.contentTruncated,
    selectedSongIds: page.selectedSongIds,
    selectedFolderIds: page.selectedFolderIds,
    serviceElementsSummary: page.serviceElementsSummary,
  },
  null,
  2,
)}
${excerpt ? `\n### Content excerpt${page.contentTruncated ? " (truncated)" : ""}\n\`\`\`chordpro\n${excerpt}\n\`\`\`` : ""}
`;
}

export class AiChatService {
  private config = new OrgAiConfigService();

  async streamChat(opts: {
    orgId: string;
    authInfo: AuthInfo;
    messages: UIMessage[];
    pageContext?: ChatPageContext;
  }) {
    const runtime = await this.config.getRuntimeConfig(opts.orgId);
    const model = buildModel(
      runtime.provider,
      runtime.model,
      runtime.apiKey,
      runtime.baseUrl,
    );
    const nativeWebAuth = nativeWebAuthFromRuntime(runtime);
    const tools = buildHosannaTools(opts.authInfo, { nativeWebAuth });
    const system = STUDIO_CHAT_SYSTEM + contextBlock(opts.pageContext);
    const modelMessages = await convertToModelMessages(opts.messages);

    return streamText({
      model,
      system,
      messages: modelMessages as ModelMessage[],
      tools,
      stopWhen: stepCountIs(8),
    });
  }
}
