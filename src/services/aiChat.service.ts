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
import { prisma } from "../database/prisma.js";
import {
  getMcpContext,
  requireMcpContext,
  requirePermission,
  requireWriteEntitlement,
  services as serviceService,
  songs as songService,
} from "../mcp/context.js";
import { searchMusicBrainzRecordings } from "../mcp/lib/musicbrainz.js";
import type { PermissionString } from "../permissions/index.js";
import {
  explainChordProDirective,
  getChordProCapabilities,
} from "../mcp/lib/capabilities.js";
import {
  metadataFromChordPro,
  validateChordProContent,
} from "../mcp/lib/chordproGate.js";
import { summarizeDiff } from "../mcp/lib/diff.js";
import { propagateVerseChords } from "../mcp/lib/propagateChords.js";
import { validateServicePlan } from "../mcp/lib/serviceElements.js";
import { transposeChordProSource } from "../mcp/lib/transposeSource.js";
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
    | "general";
  route?: string;
  songId?: string;
  serviceId?: string;
  title?: string;
  contentExcerpt?: string;
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

function buildHosannaTools(authInfo: AuthInfo) {
  return {
    hosanna_capabilities: tool({
      description: "Summarize Hosanna tools, resources, prompts, and skills.",
      inputSchema: z.object({}),
      execute: async () =>
        textResult({
          features: getChordProCapabilities().features,
          note: "Use draft/propose tools before songs.save / services.save.",
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
    folders_list: tool({
      description: "List organization folders.",
      inputSchema: z.object({
        parentId: z.string().nullable().optional(),
      }),
      execute: async ({ parentId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "folder.access" as PermissionString);
        const folders = await prisma.folder.findMany({
          where: {
            orgId: ctx.orgId,
            deleted: false,
            ...(parentId !== undefined ? { parentId } : {}),
          },
          select: { id: true, name: true, parentId: true },
          orderBy: { name: "asc" },
          take: 200,
        });
        return textResult({ folders });
      },
    }),
    collections_list: tool({
      description: "List organization collections.",
      inputSchema: z.object({}),
      execute: async () => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "collection.access" as PermissionString);
        const collections = await prisma.collection.findMany({
          where: { orgId: ctx.orgId, deleted: false },
          select: {
            id: true,
            name: true,
            description: true,
            _count: { select: { songs: true } },
          },
          orderBy: { name: "asc" },
          take: 100,
        });
        return textResult({
          collections: collections.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            songCount: c._count.songs,
          })),
        });
      },
    }),
    agenda_list: tool({
      description: "List upcoming agenda events.",
      inputSchema: z.object({
        from: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ from, limit }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "agenda.access" as PermissionString);
        const since = from?.trim() || new Date().toISOString().slice(0, 10);
        const events = await prisma.agendaEvent.findMany({
          where: { orgId: ctx.orgId, deleted: false, date: { gte: since } },
          select: {
            id: true,
            title: true,
            date: true,
            time: true,
            type: true,
            location: true,
          },
          orderBy: [{ date: "asc" }, { time: "asc" }],
          take: limit ?? 20,
        });
        return textResult({ events });
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
        "Source-preserving transpose by semitones or toKey. Returns a proposal for the Studio editor.",
      inputSchema: z.object({
        content: z.string(),
        semitones: z.number().optional(),
        toKey: z.string().optional(),
      }),
      execute: async ({ content, semitones, toKey }) => {
        const result =
          toKey != null
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
      description: "Search the organization song library.",
      inputSchema: z.object({
        search: z.string().optional(),
        key: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().optional(),
        includeContent: z.boolean().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "song.access");
        const result = await songService(ctx).list({
          search: args.search,
          key: args.key,
          tag: args.tag,
          page: 1,
          limit: Math.min(args.limit ?? 20, 50),
          sortBy: "title",
          sortOrder: "asc",
        });
        return textResult({
          total: result.total,
          songs: result.songs.map((s) => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            tags: s.tags,
            path: s.path,
            content: args.includeContent ? s.content : undefined,
            contentPreview: s.content.slice(0, 200),
          })),
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
        return textResult({
          song: {
            id: song.id,
            title: song.title,
            artist: song.artist,
            content: song.content,
            tags: song.tags,
            updatedAt: song.updatedAt.toISOString(),
          },
          validation: validateChordProContent(song.content),
        });
      },
    }),
    songs_create_draft: tool({
      description: "Draft a new song without saving.",
      inputSchema: z.object({
        title: z.string(),
        artist: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
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
          },
          validation: validateChordProContent(content),
        });
      },
    }),
    songs_propose_edit: tool({
      description: "Propose an edit to an existing song (not saved).",
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
    songs_save: tool({
      description:
        "Persist song create/update after user approval. Updates need updatedAt.",
      inputSchema: z.object({
        mode: z.enum(["create", "update"]),
        songId: z.string().optional(),
        updatedAt: z.string().optional(),
        title: z.string(),
        artist: z.string().optional(),
        content: z.string(),
        tags: z.array(z.string()).optional(),
        allowInvalid: z.boolean().optional(),
      }),
      execute: async (args) => {
        const ctx = requireMcpContext(authInfo);
        requireWriteEntitlement(ctx);
        const validation = validateChordProContent(args.content);
        if (!validation.ok && !args.allowInvalid) {
          return textResult({ error: "Validation failed", validation });
        }
        if (args.mode === "create") {
          requirePermission(ctx, "song.create");
          const created = await songService(ctx).create({
            title: args.title,
            artist: args.artist,
            content: args.content,
            tags: args.tags,
          });
          return textResult({
            saved: true,
            song: {
              id: created.id,
              title: created.title,
              updatedAt: created.updatedAt.toISOString(),
            },
          });
        }
        requirePermission(ctx, "song.update");
        if (!args.songId || !args.updatedAt) {
          return textResult({ error: "songId and updatedAt required" });
        }
        const updated = await songService(ctx).update(
          args.songId,
          new Date(args.updatedAt),
          {
            title: args.title,
            artist: args.artist,
            content: args.content,
            tags: args.tags,
          },
        );
        return textResult({
          saved: true,
          song: {
            id: updated.id,
            title: updated.title,
            updatedAt: updated.updatedAt.toISOString(),
          },
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
      description: "Get a service plan with elements.",
      inputSchema: z.object({ serviceId: z.string() }),
      execute: async ({ serviceId }) => {
        const ctx = requireMcpContext(authInfo);
        requirePermission(ctx, "service.access");
        const service = await serviceService(ctx).getByIdSerialized(serviceId);
        const validation = await validateServicePlan(
          service.elements,
          songService(ctx),
        );
        return textResult({ service, validation });
      },
    }),
    services_validate: tool({
      description: "Validate service elements and song references.",
      inputSchema: z.object({ elements: z.array(z.any()) }),
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
        elements: z.array(z.any()).optional(),
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
- For clear requests (transpose to D, repeat a section 2×, duplicate last verse, fix chords, complete metadata), act immediately with a sensible default. Ask at most ONE question only when blocked.
- Never call discovery/capability tools for trivial edits when page context already has the song/service content.
- Do not offer multiple options when the user already chose (e.g. "transpose into D").
- Never save without explicit user approval. Prefer propose tools; Studio stages the proposal in the editor.
- When the user says "repeat" / "2x" a verse or chorus: duplicate that section's body in the ChordPro (or add \`{c: 2x}\` if they ask for a note only). Prefer physical duplication when they ask to "write a copy".

## Hard rules
- Never invent lyrics, chords, or library songs. Ask when content is missing.
- Never silently delete or rewrite unrelated content.
- Use tools for folders, collections, agenda, MusicBrainz metadata, ChordPro, songs, and services as needed.
- Respect permissions and \`updatedAt\` concurrency on saves.
`;

function contextBlock(page?: ChatPageContext): string {
  if (!page) return "";
  const excerpt = page.contentExcerpt
    ? page.contentExcerpt.slice(0, 12_000)
    : "";
  return `

## Current Studio page context
${JSON.stringify(
  {
    kind: page.kind ?? "general",
    route: page.route,
    songId: page.songId,
    serviceId: page.serviceId,
    title: page.title,
  },
  null,
  2,
)}
${excerpt ? `\n### Content excerpt\n\`\`\`chordpro\n${excerpt}\n\`\`\`` : ""}
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
    const tools = buildHosannaTools(opts.authInfo);
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
