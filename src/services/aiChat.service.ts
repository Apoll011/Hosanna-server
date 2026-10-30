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
  APICallError,
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AI_LIMITS,
  customInstructionsPromptBlock,
  MEMORY_USAGE_PROMPT,
  memoryPromptBlock,
  toolBudgetNotice,
  type ToolBudgetState,
} from "./aiBehavior.js";
import { AiMemoryService } from "./aiMemory.service.js";
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
  durationSecondsFromChordPro,
  metadataFromChordPro,
  mirroredMetadataWarnings,
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
import {
  FOLDER_SONGS_MAX_LIMIT,
  listSongsInFolder,
} from "../mcp/lib/folderSongs.js";
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
  getMe,
  getMember,
  getOrganization,
  listMembers,
  resolveMembers,
} from "../mcp/lib/orgDirectory.js";
import {
  STUDIO_NAVIGATE_KINDS,
  STUDIO_PRINT_KINDS,
  studioNavigateDirective,
  studioPrintDirective,
} from "../mcp/lib/studioActions.js";
import {
  FOLDER_COLOR_IDS,
  FOLDER_ICON_IDS,
  STUDIO_UI_CATALOG,
} from "../mcp/lib/studioUi.js";
import { searchWeb } from "../mcp/lib/webSearch.js";
import { searchYouTube } from "../mcp/lib/youtubeSearch.js";
import { clockContextPromptBlock } from "../lib/clockContext.js";
import { AppError } from "../utils/errors.js";

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
        baseUrl || AI_PROVIDER_DEFAULT_BASE_URL[provider] || undefined;
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

const MAX_BATCH = 25;

/**
 * Run many small mutations in one tool call (sequentially, so ordering and
 * per-item errors are predictable). One failing item never aborts the rest.
 */
export async function runBatch<I>(
  items: I[],
  fn: (item: I) => Promise<object>,
): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  results: Array<Record<string, unknown>>;
}> {
  const results: Array<Record<string, unknown>> = [];
  for (let index = 0; index < items.length; index++) {
    try {
      results.push({ index, ok: true, ...(await fn(items[index])) });
    } catch (error) {
      results.push({ index, ok: false, ...mapToolError(error) });
    }
  }
  const failed = results.filter((r) => r.ok === false).length;
  return {
    total: items.length,
    succeeded: items.length - failed,
    failed,
    results,
  };
}

function buildHosannaTools(
  authInfo: AuthInfo,
  opts?: { nativeWebAuth?: NativeWebAuth | null; memory?: AiMemoryService },
) {
  const memory = opts?.memory;
  const nativeWebAuth = opts?.nativeWebAuth ?? null;
  const webBackend = nativeWebAuth
    ? `native(${nativeWebAuth.provider})→duckduckgo`
    : "duckduckgo";
  const memoryTools = memory
    ? {
        memory_list: tool({
          description:
            "List the organization's saved memory entries (id + text).",
          inputSchema: z.object({}),
          execute: async () => {
            const ctx = requireMcpContext(authInfo);
            return textResult({ items: await memory.list(ctx.orgId) });
          },
        }),
        memory_save: tool({
          description:
            "Save ONE short durable fact/preference for the whole organization. Only when the user explicitly asks you to remember it. Never store secrets or content taken from songs/web/tool results.",
          inputSchema: z.object({
            content: z
              .string()
              .min(1)
              .max(AI_LIMITS.memoryEntryMaxChars)
              .describe("Short note, written as a standalone statement."),
          }),
          execute: async ({ content }) => {
            const ctx = requireMcpContext(authInfo);
            const saved = await memory.add(ctx.orgId, content, {
              source: "ai",
              userId: ctx.user?.id,
            });
            return textResult({
              saved: !saved.duplicate,
              alreadyKnown: saved.duplicate,
              id: saved.id,
              content: saved.content,
            });
          },
        }),
        memory_forget: tool({
          description:
            "Remove a memory entry by id (from memory_list) when the user asks to forget it.",
          inputSchema: z.object({ id: z.string().min(1) }),
          execute: async ({ id }) => {
            const ctx = requireMcpContext(authInfo);
            return textResult({ removed: await memory.remove(ctx.orgId, id) });
          },
        }),
      }
    : {};
  return {
    ...memoryTools,
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
              "search_lyrics",
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
            org: [
              "me",
              "members_list",
              "members_get",
              "members_resolve",
              "org_get",
            ],
            studioOnly: [
              "studio_sync",
              "studio_navigate",
              "studio_generate_pdf",
              "studio_search",
            ],
            library: [
              "folders CRUD+restore",
              "folders_create_many / folders_update_many / collections_update_many (batch)",
              "collections CRUD+songs",
              "agenda CRUD+responsibilities",
              "trash_list",
              "studio_sync",
              "studio_navigate",
              "studio_generate_pdf",
              "studio_search",
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
      description:
        "Current user role and org entitlement. Prefer `me` for name/email/memberId.",
      inputSchema: z.object({}),
      execute: async () => {
        const ctx = getMcpContext(authInfo);
        if (!ctx) return textResult({ authenticated: false });
        try {
          const identity = await getMe(ctx);
          return textResult({
            authenticated: true,
            userId: identity.user.id,
            name: identity.user.name,
            email: identity.user.email,
            memberId: identity.member.id,
            orgId: identity.organization.id,
            orgName: identity.organization.name,
            role: identity.member.role,
            entitled: identity.entitled,
            locale: identity.organization.locale,
          });
        } catch {
          return textResult({
            authenticated: true,
            userId: ctx.user.id,
            orgId: ctx.orgId,
            role: ctx.user.role,
            entitled: ctx.entitled,
          });
        }
      },
    }),
    me: tool({
      description:
        "Who am I — user id/name/email, memberId, role, active org. Use before assigning agenda responsibilities to yourself.",
      inputSchema: z.object({}),
      execute: async () => textResult(await getMe(requireMcpContext(authInfo))),
    }),
    members_list: tool({
      description:
        "List org members (memberId, userId, name, email, role). Resolve people for agenda responsibilities.",
      inputSchema: z.object({
        search: z.string().optional(),
        role: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
      }),
      execute: async (args) =>
        textResult(await listMembers(requireMcpContext(authInfo), args)),
    }),
    members_get: tool({
      description: "Get one member by memberId, userId, or name.",
      inputSchema: z.object({
        memberId: z.string().optional(),
        userId: z.string().optional(),
        name: z.string().optional(),
      }),
      execute: async (args) =>
        textResult(await getMember(requireMcpContext(authInfo), args)),
    }),
    members_resolve: tool({
      description:
        "Preflight before agenda: map names → memberIds. Returns resolved[] / unresolved[].",
      inputSchema: z.object({
        names: z
          .array(
            z.object({
              name: z.string().min(1),
              category: z.string().optional(),
            }),
          )
          .min(1)
          .max(40),
      }),
      execute: async ({ names }) =>
        textResult(await resolveMembers(requireMcpContext(authInfo), names)),
    }),
    org_get: tool({
      description:
        "Active org profile + responsibilityCategories (leader, musicians, preacher, …). No org switch.",
      inputSchema: z.object({}),
      execute: async () =>
        textResult(await getOrganization(requireMcpContext(authInfo))),
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
        "Create a folder. color/icon must be Studio ids (see hosanna_capabilities.studioUi or hosanna://domain/library). Studio refreshes automatically after this (do NOT call studio_sync).",
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
        "Rename/move/recolor a folder. Requires updatedAt. color/icon = Studio ids only (hosanna://domain/library). Use icon=default to reset. Studio refreshes automatically after this (do NOT call studio_sync).",
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
    folders_create_many: tool({
      description: `Create up to ${MAX_BATCH} folders in ONE call (prefer this over repeated folders_create). Same color/icon rules as folders_create. Per-item results; Studio refreshes automatically.`,
      inputSchema: z.object({
        folders: z
          .array(
            z.object({
              name: z.string().min(1),
              parentId: z.string().nullable().optional(),
              color: folderColorSchema.optional(),
              icon: folderIconSchema.optional(),
            }),
          )
          .min(1)
          .max(MAX_BATCH),
      }),
      execute: async ({ folders }) => {
        const ctx = requireMcpContext(authInfo);
        return textResult(await runBatch(folders, (f) => createFolder(ctx, f)));
      },
    }),
    folders_update_many: tool({
      description: `Rename/move/recolor up to ${MAX_BATCH} folders in ONE call (prefer this over repeated folders_update when changing several folders). Each item needs folderId + updatedAt (from folders_list). Per-item results; Studio refreshes automatically.`,
      inputSchema: z.object({
        updates: z
          .array(
            z.object({
              folderId: z.string(),
              updatedAt: z.string(),
              name: z.string().min(1).optional(),
              parentId: z.string().nullable().optional(),
              color: folderColorSchema.optional(),
              icon: folderIconSchema.optional(),
            }),
          )
          .min(1)
          .max(MAX_BATCH),
      }),
      execute: async ({ updates }) => {
        const ctx = requireMcpContext(authInfo);
        return textResult(await runBatch(updates, (u) => updateFolder(ctx, u)));
      },
    }),
    collections_update_many: tool({
      description: `Update metadata (name/description/color/icon) of up to ${MAX_BATCH} collections in ONE call. Each item needs collectionId + updatedAt. Per-item results; Studio refreshes automatically.`,
      inputSchema: z.object({
        updates: z
          .array(
            z.object({
              collectionId: z.string(),
              updatedAt: z.string(),
              name: z.string().min(1).optional(),
              description: z.string().nullable().optional(),
              color: folderColorSchema.optional(),
              icon: folderIconSchema.optional(),
            }),
          )
          .min(1)
          .max(MAX_BATCH),
      }),
      execute: async ({ updates }) => {
        const ctx = requireMcpContext(authInfo);
        return textResult(
          await runBatch(updates, (u) => updateCollection(ctx, u)),
        );
      },
    }),
    suggest_followups: tool({
      description:
        "Studio chat UI only: show 2-3 short clickable follow-up prompts under your final answer (same language as the user). Call at most once, as the LAST tool call of a turn, only when natural next steps exist. Never use it for questions you need answered.",
      inputSchema: z.object({
        options: z
          .array(z.string().min(2).max(80))
          .min(1)
          .max(4)
          .describe("Short imperative prompts the user can click to send."),
      }),
      execute: async ({ options }) => textResult({ shown: options.length }),
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
    studio_navigate: tool({
      description:
        "Studio-only: navigate the open Studio tab to a page (song/service/folder/collection/agenda/list/settings). Prefer kind+id over inventing routes.",
      inputSchema: z.object({
        kind: z.enum(STUDIO_NAVIGATE_KINDS),
        id: z
          .string()
          .optional()
          .describe(
            "Entity id when kind is song/service/folder/collection/agenda",
          ),
        route: z
          .string()
          .optional()
          .describe(
            "Optional absolute path under the org slug when kind=route",
          ),
        reason: z.string().optional(),
      }),
      execute: async (args) =>
        textResult(
          studioNavigateDirective({
            kind: args.kind,
            id: args.id,
            route: args.route,
            reason: args.reason,
          }),
        ),
    }),
    studio_generate_pdf: tool({
      description:
        "Studio-only: open the print/PDF modal for song(s), service(s), folder, collection, or agenda event. Resolves ids in the open Studio tab.",
      inputSchema: z.object({
        kind: z.enum(STUDIO_PRINT_KINDS),
        ids: z
          .array(z.string().min(1))
          .min(1)
          .describe("One or more entity ids to print"),
        title: z.string().optional(),
        options: z
          .object({
            showChords: z.boolean().optional(),
            twoColumnLayout: z.boolean().optional(),
            fontSize: z.number().optional(),
            showChurchHeader: z.boolean().optional(),
            showMetadata: z.boolean().optional(),
            includeServiceSongs: z.boolean().optional(),
            includeFolderSongs: z.boolean().optional(),
            includeCollectionSongs: z.boolean().optional(),
            pageBreakBetweenItems: z.boolean().optional(),
          })
          .optional(),
        reason: z.string().optional(),
      }),
      execute: async (args) =>
        textResult(
          studioPrintDirective({
            kind: args.kind,
            ids: args.ids,
            title: args.title,
            options: args.options,
            reason: args.reason,
          }),
        ),
    }),
    studio_search: tool({
      description:
        'Studio-oriented global search across songs, services (incl. archived when asked), folders, collections, and agenda. Prefer this when the user says "find X in Studio".',
      inputSchema: z.object({
        query: z.string().min(1),
        types: z
          .array(z.enum(["song", "service", "folder", "collection", "agenda"]))
          .optional()
          .describe("Defaults to all types"),
        includeArchivedServices: z.boolean().optional().default(true),
        limitPerType: z.number().int().positive().max(20).optional().default(8),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        const q = args.query.trim().toLowerCase();
        const types = new Set(
          args.types?.length
            ? args.types
            : (["song", "service", "folder", "collection", "agenda"] as const),
        );
        const limit = args.limitPerType ?? 8;
        const hits: Array<{
          type: string;
          id: string;
          title: string;
          subtitle?: string;
          archived?: boolean;
        }> = [];

        if (types.has("song")) {
          requirePermission(ctx, "song.access");
          const songs = await songService(ctx).list({
            search: args.query,
            page: 1,
            limit,
            sortBy: "title",
            sortOrder: "asc",
          });
          for (const s of songs.songs) {
            hits.push({
              type: "song",
              id: s.id,
              title: s.title,
              subtitle: s.artist || undefined,
            });
          }
        }

        if (types.has("service")) {
          requirePermission(ctx, "service.access");
          let services = await serviceService(ctx).list({
            includeArchived: args.includeArchivedServices ?? true,
          });
          services = services.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              (s.notes ?? "").toLowerCase().includes(q),
          );
          for (const s of services.slice(0, limit)) {
            hits.push({
              type: "service",
              id: s.id,
              title: s.name,
              subtitle: s.date ? String(s.date).slice(0, 10) : undefined,
              archived: s.archived,
            });
          }
        }

        if (types.has("folder")) {
          requirePermission(ctx, "folder.access");
          const { folders } = await listFolders(ctx);
          for (const f of folders
            .filter((f) => f.name.toLowerCase().includes(q))
            .slice(0, limit)) {
            hits.push({ type: "folder", id: f.id, title: f.name });
          }
        }

        if (types.has("collection")) {
          requirePermission(ctx, "collection.access");
          const { collections } = await listCollections(ctx);
          for (const c of collections
            .filter(
              (c) =>
                c.name.toLowerCase().includes(q) ||
                (c.description ?? "").toLowerCase().includes(q),
            )
            .slice(0, limit)) {
            hits.push({
              type: "collection",
              id: c.id,
              title: c.name,
              subtitle: c.description || undefined,
            });
          }
        }

        if (types.has("agenda")) {
          requirePermission(ctx, "agenda.access");
          const { events } = await listAgenda(ctx, { limit: 100 });
          for (const e of events
            .filter(
              (e) =>
                e.title.toLowerCase().includes(q) ||
                e.type.toLowerCase().includes(q) ||
                (e.notes ?? "").toLowerCase().includes(q) ||
                e.location?.toLowerCase().includes(q),
            )
            .slice(0, limit)) {
            hits.push({
              type: "agenda",
              id: e.id,
              title: e.title,
              subtitle: `${e.date} ${e.time} · ${e.type}`,
            });
          }
        }

        return textResult({
          query: args.query,
          total: hits.length,
          hits,
          tip: "Use studio_navigate({ kind, id }) to open a hit, or studio_generate_pdf({ kind, ids }) to print.",
        });
      },
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
      description:
        "List soft-deleted songs, folders, and services. Paginated per type.",
      inputSchema: z.object({
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(50).optional(),
        type: z.enum(["all", "songs", "folders", "services"]).optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const page = args.page ?? 1;
        const limit = Math.min(args.limit ?? 20, 50);
        const type = args.type ?? "all";
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
        const slice = <T>(rows: T[]) => {
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
        return textResult({
          songs: slice(
            songs.map((s) => ({
              id: s.id,
              title: s.title,
              artist: s.artist,
              updatedAt: s.updatedAt.toISOString(),
            })),
          ),
          folders: slice(
            folders.map((f) => ({
              id: f.id,
              name: f.name,
              parentId: f.parentId,
              updatedAt: f.updatedAt.toISOString(),
            })),
          ),
          services: slice(
            services.map((s) => ({
              id: s.id,
              name: s.name,
              updatedAt: s.updatedAt.toISOString(),
            })),
          ),
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
      description:
        "Get a collection. Default metadata + songCount only; include=ids|songs for membership (paginated).",
      inputSchema: z.object({
        collectionId: z.string(),
        include: z.enum(["none", "ids", "songs"]).optional(),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async ({ collectionId, include, page, limit }) =>
        textResult(
          await getCollection(requireMcpContext(authInfo), collectionId, {
            include: include ?? "none",
            page,
            limit,
          }),
        ),
    }),
    collections_create: tool({
      description:
        "Create a song collection. color/icon = Studio ids (hosanna://domain/library). Studio refreshes automatically after this (do NOT call studio_sync).",
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
        "Update collection metadata. Requires updatedAt. color/icon = Studio ids. Studio refreshes automatically after this (do NOT call studio_sync).",
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
        const { collection } = await getCollection(ctx, collectionId, {
          include: "none",
        });
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
        textResult(await collectionAddSongs(requireMcpContext(authInfo), args)),
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
        "Create an agenda event. Pass responsibilities with real memberIds from members_list/me (categoryIds from org_get).",
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
        responsibilities: z
          .array(
            z.object({
              id: z.string().optional(),
              categoryId: z.string().min(1),
              assignees: z
                .array(
                  z.object({
                    id: z.string().optional(),
                    name: z.string().min(1),
                    memberId: z.string().optional(),
                    avatarUrl: z.string().optional(),
                  }),
                )
                .default([]),
            }),
          )
          .optional(),
      }),
      execute: async (args) =>
        textResult(await createAgendaEvent(requireMcpContext(authInfo), args)),
    }),
    agenda_update: tool({
      description:
        "Update an agenda event. Requires updatedAt. responsibilities replaces the full list when set.",
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
        responsibilities: z
          .array(
            z.object({
              id: z.string().optional(),
              categoryId: z.string().min(1),
              assignees: z
                .array(
                  z.object({
                    id: z.string().optional(),
                    name: z.string().min(1),
                    memberId: z.string().optional(),
                    avatarUrl: z.string().optional(),
                  }),
                )
                .default([]),
            }),
          )
          .optional(),
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
      description:
        "Normalize ChordPro formatting. Returns a proposal for the Studio editor.",
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
    songs_list_in_folder: tool({
      description:
        'List the songs inside one folder (metadata only: id, title, artist, key, song_number, tags — no lyrics; use songs_get / songs_get_many for content). folderId from folders_list; omit/null/"root" = songs in no folder. recursive=true includes nested subfolders (whole library if no folderId). Also returns the folder\'s direct subfolders. Default title asc, page=1, limit=50 (max 100).',
      inputSchema: z.object({
        folderId: z.string().nullable().optional(),
        recursive: z.boolean().optional(),
        sortBy: z
          .enum(["title", "artist", "updatedAt", "song_number"])
          .optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
        page: z.number().int().positive().optional(),
        limit: z
          .number()
          .int()
          .positive()
          .max(FOLDER_SONGS_MAX_LIMIT)
          .optional(),
      }),
      execute: async (args) =>
        textResult(await listSongsInFolder(requireMcpContext(authInfo), args)),
    }),
    songs_search_lyrics: tool({
      description:
        'Search lyrics ignoring ChordPro chords/directives. Query "Pois só Tu és o Deus eterno" matches "Pois [D9]só Tu és o [C#m]Deus eterno". Prefer when the user quotes plain lyrics.',
      inputSchema: z.object({
        query: z.string().min(1),
        folder: z.string().optional(),
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().max(50).optional(),
        includeContent: z.boolean().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const result = await songService(ctx).searchLyrics({
          query: args.query,
          folder: args.folder,
          page: args.page ?? 1,
          limit: Math.min(args.limit ?? 20, 50),
        });
        return textResult({
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          nextPage: result.page < result.totalPages ? result.page + 1 : null,
          query: args.query,
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
        const validation = validateChordProContent(content);
        const metadataWarnings = mirroredMetadataWarnings({
          title: args.title,
          artist: args.artist ?? "Unknown",
          content,
        });
        return textResult({
          proposal: {
            title: args.title,
            artist: args.artist ?? "Unknown",
            content,
            tags: args.tags ?? [],
            folderId: args.folderId ?? null,
          },
          validation: {
            ...validation,
            ok: validation.ok && metadataWarnings.length === 0,
            metadataWarnings,
          },
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
          await withClientRequestId(
            ctx.orgId,
            args.clientRequestId,
            async () => {
              const validation = validateChordProContent(args.content);
              const metadataWarnings = mirroredMetadataWarnings({
                title: args.title,
                artist: args.artist,
                song_number: args.song_number,
                content: args.content,
              });
              if (
                (!validation.ok || metadataWarnings.length > 0) &&
                !args.allowInvalid
              ) {
                return mapToolError(
                  new Error(metadataWarnings[0] ?? "Validation failed"),
                  {
                    current: {
                      validation: { ...validation, metadataWarnings },
                    },
                  },
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
                return mapToolError(new Error("songId and updatedAt required"));
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
            },
            (({ clientRequestId: _c, ...rest }) => rest)(args),
          ),
        );
      },
    }),
    songs_move: tool({
      description:
        "Move a song to another folder (or root). Requires updatedAt.",
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
          return textResult(
            mapToolError(error, { current, field: "updatedAt" }),
          );
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
      description:
        "List/search services (metadata only). Use services_get for elements. archived / includeArchived; rows include archived + elementCount.",
      inputSchema: z.object({
        archived: z.boolean().optional(),
        includeArchived: z.boolean().optional(),
        search: z.string().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.access");
        let list = await serviceService(ctx).list({
          archived: args.archived ?? false,
          includeArchived: args.includeArchived ?? false,
          metadataOnly: true,
        });
        if (args.search?.trim()) {
          const q = args.search.toLowerCase();
          list = list.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              (s.notes ?? "").toLowerCase().includes(q),
          );
        }
        return textResult({
          services: list,
          total: list.length,
          tip: "Metadata only — call services_get for elements.",
        });
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
        const service = await serviceService(ctx).getByIdForMcp(serviceId);
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
        const missingFromExpand = (expandedSongs ?? [])
          .filter(
            (s): s is { id: string; missing: true } =>
              Boolean(s) &&
              typeof s === "object" &&
              (s as { missing?: boolean }).missing === true,
          )
          .map((s) => s.id);
        const missingSongIds = [
          ...new Set([...validation.missingSongIds, ...missingFromExpand]),
        ];
        return textResult({
          service,
          validation: {
            ok: validation.ok,
            errors: validation.errors,
            warnings: validation.warnings,
            missingSongIds,
            durationUnit: validation.durationUnit,
          },
          expandedSongs,
          missingSongIds,
        });
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
            duration: 60,
          },
          ...picked.map((s, i) => ({
            id: randomUUID(),
            type: "song" as const,
            title: s.title,
            songId: s.id,
            notes: s.artist || undefined,
            position: i + 1,
            duration: durationSecondsFromChordPro(s.content) ?? 210,
          })),
          {
            id: randomUUID(),
            type: "message" as const,
            title: "Message",
            content: args.theme ?? "Message",
            position: picked.length + 1,
            duration: 1500,
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
        const { clientRequestId, ...payload } = args;
        return textResult(
          await withClientRequestId(
            ctx.orgId,
            clientRequestId,
            async () => {
              const elements = args.elements ?? [];
              const validation = await validateServicePlan(
                elements,
                songService(ctx),
              );
              if (!validation.ok && !args.allowInvalid) {
                return {
                  error: true,
                  code: "validation_error",
                  message: "Validation failed",
                  retryable: false,
                  validation,
                };
              }
              if (args.mode === "create") {
                requirePermission(ctx, "service.create");
                const created = await serviceService(ctx).create({
                  name: args.name,
                  date: new Date(`${args.date.slice(0, 10)}T12:00:00.000Z`),
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
                    date: new Date(`${args.date.slice(0, 10)}T12:00:00.000Z`),
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
            },
            payload,
          ),
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
const STUDIO_CHAT_SYSTEM = `You are Logos, the friendly AI assistant inside Hosanna Studio chat, for church song libraries and service planning. Stay warm, concise and practical.

## Style (strict)
- Be brief. Prefer doing over asking. One short sentence + tools beats essays.
- Do NOT paste full ChordPro bodies into chat. Call propose/edit tools; the Studio editor shows accept/decline.
- Prefer pageContext ids + updatedAt. Do NOT call list/search just to discover the open song/service/folder.
- Skills/docs are NOT in your context until you read them: hosanna_skills_list → hosanna_skill_read, or hosanna_resource_read. Never invent skill contents — quote what the tool returns.
- For clear requests (transpose to D, repeat a section 2×, duplicate last verse, fix chords, complete metadata, create folder/event), act immediately with a sensible default. Ask at most ONE question only when blocked.
- Do not offer multiple options when the user already chose (e.g. "transpose into D").
- ChordPro/song content edits: use propose tools (prefer songs_propose_transpose / songs_propose_edit). Studio stages Accept/Decline in the editor. After Accept, the user saves in the editor — only call songs_save / services_save if they explicitly ask to persist via chat/MCP.
- Library structural edits (folders, collections, agenda create/update, move song, add songs to collection): do them with tools when the request is clear. Studio refreshes the explorer automatically after mutations — do NOT call \`studio_sync\`.
- Changing several folders/collections at once: use \`folders_update_many\` / \`folders_create_many\` / \`collections_update_many\` in ONE call instead of many single calls. Items fail independently — report any failed index honestly.
- At the end of a turn, when natural next steps exist, you MAY call \`suggest_followups\` once (last tool call) with 2-3 short clickable prompts. Never use it for questions you need answered; do not repeat them in the text.
- Folder/collection \`icon\` and \`color\` must be Studio ids only (see hosanna_capabilities.studioUi or hosanna://domain/library). Never invent Lucide names. Use \`icon=default\` / \`color=default\` to reset.
- Deletes (songs/services/folders/collections/agenda): call the matching \`*_delete\` tool immediately when the user asks to delete — it only STAGES a Confirm button in Studio and does not delete. Do NOT ask for chat confirmation ("are you sure?") and do NOT claim the item is deleted until the user clicks Confirm. If they already confirmed in chat, still only stage the button.
- When the user says "repeat" / "2x" a verse or chorus: duplicate that section's body in the ChordPro (or add \`{c: 2x}\` if they ask for a note only). Prefer physical duplication when they ask to "write a copy".
- On stale/concurrency errors, use the returned \`current\` object (do not re-fetch blindly).

## Capabilities (use them)
- Songs: search, search_lyrics (plain lyrics ignoring chords), get/get_many, draft, propose_edit/fix/transpose, save, move, delete, restore; trash_list
- Services: search/get (expandSongs), propose_edit, plan_suggest, validate, save, delete, restore
- People/org: me, members_list, members_get, members_resolve, org_get. Resolve people before agenda assignees.
- Record status: draft = not persisted; saved/verified = in DB. Never call a draft "saved".
- Folders: list/create/update/delete/restore (icon/color ids from studioUi)
- Collections: list/get/create/update/delete, add_songs/remove_songs (same icon/color ids)
- Agenda: list/get/create/update/delete — set responsibilities with real memberIds (not only notes on service elements)
- Services: services_search supports archived / includeArchived (rows include archived flag)
- Studio-only UX: studio_navigate (open pages), studio_generate_pdf (print modal), studio_search (global find across library), suggest_followups (clickable chips)
- Metadata: MusicBrainz, YouTube (for \`{youtube:}\`), DuckDuckGo web search; ChordPro validate/format/transpose/convert/propagate
- When completing metadata: MusicBrainz for title/artist/release; YouTube search for \`{youtube: URL}\` (use hits[].directive); web search for extra confirmation. If \`metadata_web_fetch\` is available (DeepSeek org AI), use it to read CCLI/artist pages or Cifra URLs blocked by Akamai. Call metadata tools one at a time (MusicBrainz rate-limits parallel bursts with 503). If a tool returns 403/503, report the structured error — do not claim success. Propose the ChordPro edit — do not invent lyrics.
- Unknown Studio UI constants (icons, colors, etc.): call hosanna_capabilities or hosanna_resource_read on hosanna://domain/library — do not guess.

## Hard rules
- Never invent lyrics, chords, or library songs. Ask when content is missing.
- Never silently delete or rewrite unrelated content.
- Respect permissions and \`updatedAt\` concurrency on updates/saves.
- Service element \`duration\` is **seconds** (not minutes). Prefer real \`memberId\`s on agenda assignees.
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

/**
 * Hard safety net on model↔tool round trips. The real limit is the org's
 * `maxToolCalls` (see `toolBudgetNotice`); this only guards against runaway
 * loops, e.g. models that ignore the disabled tools.
 */
export function chatStepSafetyLimit(maxToolCalls: number): number {
  return maxToolCalls + 3;
}

const LOCALE_NAMES: Record<string, string> = {
  pt: "European Portuguese (pt-PT)",
  en: "English",
  es: "Spanish",
};

export function localePromptBlock(locale?: string): string {
  const name = locale ? LOCALE_NAMES[locale] : undefined;
  if (!name) return "";
  return `

## Language
The user's Studio language is ${name}. Reply in that language unless the user writes in another one. Keep ChordPro directives, ids and tool arguments in their canonical form.
`;
}

/**
 * Safe, user-facing message for a stream error. Provider internals (URLs,
 * request bodies, keys) are never forwarded.
 */
export function describeChatError(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 401 || status === 403) {
      return "The AI provider rejected the API key. Check the AI settings for this organization.";
    }
    if (status === 404) {
      return "The configured AI model was not found. Check the model name in AI settings.";
    }
    if (status === 429) {
      return "The AI provider is rate-limiting requests. Wait a moment and try again.";
    }
    if (status && status >= 500) {
      return "The AI provider is temporarily unavailable. Please try again.";
    }
    return "The AI provider could not process this request.";
  }
  return "Something went wrong while generating the reply. Please try again.";
}

export class AiChatService {
  private config = new OrgAiConfigService();
  private memory = new AiMemoryService();

  async streamChat(opts: {
    orgId: string;
    authInfo: AuthInfo;
    messages: UIMessage[];
    pageContext?: ChatPageContext;
    locale?: string;
    abortSignal?: AbortSignal;
  }) {
    const runtime = await this.config.getRuntimeConfig(opts.orgId);
    const model = buildModel(
      runtime.provider,
      runtime.model,
      runtime.apiKey,
      runtime.baseUrl,
    );
    const nativeWebAuth = nativeWebAuthFromRuntime(runtime);
    const memoryEntries = runtime.memoryEnabled
      ? await this.memory.list(opts.orgId)
      : [];
    const tools = buildHosannaTools(opts.authInfo, {
      nativeWebAuth,
      memory: runtime.memoryEnabled ? this.memory : undefined,
    });
    const system =
      STUDIO_CHAT_SYSTEM +
      (runtime.memoryEnabled ? MEMORY_USAGE_PROMPT : "") +
      customInstructionsPromptBlock(runtime.instructions) +
      memoryPromptBlock(memoryEntries) +
      localePromptBlock(opts.locale) +
      clockContextPromptBlock() +
      contextBlock(opts.pageContext);
    const modelMessages = await convertToModelMessages(opts.messages);

    const budget: ToolBudgetState = {
      max: runtime.maxToolCalls,
      used: 0,
      limitReached: false,
    };

    return {
      model: { provider: runtime.provider, id: runtime.model },
      budget,
      result: streamText({
        model,
        system,
        messages: modelMessages as ModelMessage[],
        tools: tools as ToolSet,
        ...(runtime.temperature != null && {
          temperature: runtime.temperature,
        }),
        ...(runtime.maxOutputTokens != null && {
          maxOutputTokens: runtime.maxOutputTokens,
        }),
        stopWhen: stepCountIs(chatStepSafetyLimit(budget.max)),
        prepareStep: ({ steps, initialInstructions }) => {
          budget.used = steps.reduce((n, s) => n + s.toolCalls.length, 0);
          const notice = toolBudgetNotice(budget.used, budget.max);
          if (!notice) return undefined;
          const base =
            typeof initialInstructions === "string"
              ? initialInstructions
              : system;
          if (!notice.final) return { instructions: base + notice.text };
          budget.limitReached = true;
          return {
            instructions: base + notice.text,
            toolChoice: "none",
            activeTools: [],
          };
        },
        abortSignal: opts.abortSignal,
      }),
    };
  }
}
