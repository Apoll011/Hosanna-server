import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, tool, type LanguageModel, type ModelMessage } from "ai";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { validateChordProContent } from "../mcp/lib/chordproGate.js";
import { searchMusicBrainzRecordings } from "../mcp/lib/musicbrainz.js";
import {
  nativeWebAuthFromRuntime,
  type NativeWebAuth,
} from "../mcp/lib/nativeWeb.js";
import { searchWeb } from "../mcp/lib/webSearch.js";
import {
  getYouTubeDuration,
  searchYouTube,
} from "../mcp/lib/youtubeSearch.js";
import { prisma } from "../database/prisma.js";
import { AppError } from "../utils/errors.js";
import {
  AI_PROVIDER_DEFAULT_BASE_URL,
  type AiProvider,
  OrgAiConfigService,
} from "./orgAiConfig.service.js";

export type SongImportSourceType = "photo" | "gallery" | "pdf";

export type SongImportStep = {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
};

export type SongImportDiagnostic = {
  severity: string;
  message: string;
  line?: number;
};

export type SongImportDuplicate = {
  id: string;
  title: string;
  artist: string;
  score: number;
};

export type SongImportDraft = {
  title: string;
  artist: string;
  content: string;
  key?: string;
  tempo?: string;
  timeSignature?: string;
  confidence?: number;
  warnings: string[];
  diagnostics?: SongImportDiagnostic[];
  possibleDuplicates?: SongImportDuplicate[];
  youtube?: string;
  ccli?: string;
  composer?: string;
  copyright?: string;
  subtitle?: string;
  duration?: string;
};

export type SongImportCancelCode =
  | "not_a_song"
  | "unreadable"
  | "blank"
  | "wrong_content"
  | "multiple_unclear";

export type SongImportJob = {
  id: string;
  orgId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  steps: SongImportStep[];
  result?: SongImportDraft;
  errorMessage?: string;
  /** Present when status is cancelled. */
  cancelCode?: SongImportCancelCode;
  cancelReason?: string;
  cancelledBy?: "ai" | "user";
  /** Set by DELETE cancel — checked between pipeline stages. */
  abortRequested?: boolean;
  createdAt: number;
  updatedAt: number;
};

class ImportCancelledError extends Error {
  readonly code: SongImportCancelCode;
  constructor(code: SongImportCancelCode, reason: string) {
    super(reason);
    this.name = "ImportCancelledError";
    this.code = code;
  }
}

class UserCancelledError extends Error {
  constructor() {
    super("Import cancelled by user.");
    this.name = "UserCancelledError";
  }
}

type CreateInput = {
  orgId: string;
  sourceType: SongImportSourceType;
  imageBase64: string;
  imageMimeType: string;
  /** Extra page screenshots (multi-page PDF), base64 without data-URL prefix OK. */
  imagesBase64?: string[];
  imageMimeTypes?: string[];
  pdfBase64?: string;
  fileName?: string;
};

const draftSchema = z.object({
  title: z.string().min(1).describe("Song title"),
  artist: z
    .string()
    .describe("Artist or songwriter; empty string if unknown"),
  key: z.string().optional().describe("Musical key, e.g. G or Am"),
  tempo: z
    .union([z.string(), z.number()])
    .optional()
    .describe("Tempo marking or BPM"),
  timeSignature: z.string().optional().describe("Time signature, e.g. 4/4"),
  youtube: z
    .string()
    .optional()
    .describe("YouTube watch URL for {youtube:} when a clear match exists"),
  ccli: z.string().optional().describe("CCLI song number when confirmed"),
  composer: z.string().optional().describe("Composer / writers if known"),
  copyright: z.string().optional().describe("Copyright / publisher line"),
  subtitle: z.string().optional().describe("Subtitle or alternate title"),
  duration: z
    .string()
    .optional()
    .describe("Song duration like 4:35 when known from YouTube/web"),
  album: z.string().optional().describe("Release / album title if known"),
  content: z
    .string()
    .min(1)
    .describe(
      "Full ChordPro with metadata directives ({title},{artist},{key},{youtube},{ccli},…) and lyric lines with [Chords]",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Confidence 0-1 in the extraction"),
  notes: z
    .string()
    .optional()
    .describe("Short warning or note about uncertainty"),
});

type DraftFields = z.infer<typeof draftSchema>;

const cancelSchema = z.object({
  code: z
    .enum([
      "not_a_song",
      "unreadable",
      "blank",
      "wrong_content",
      "multiple_unclear",
    ])
    .describe(
      "not_a_song=photo of something else; unreadable=too blurry/dark; blank=empty page; wrong_content=text but not a chord/lyric sheet; multiple_unclear=several songs mixed with no clear primary",
    ),
  reason: z
    .string()
    .min(1)
    .max(400)
    .describe("Short user-facing explanation of why import was cancelled"),
});

type CancelFields = z.infer<typeof cancelSchema>;

const JOB_TTL_MS = 30 * 60 * 1000;
const jobs = new Map<string, SongImportJob>();

function pruneJobsSafe() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

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
    case "openai_compatible": {
      // DeepSeek rejects json_schema; we use tool calls for structure instead.
      // deepseek-flash defaults to thinking mode, which rejects forced
      // tool_choice — disable thinking on every import request.
      const url = baseUrl || AI_PROVIDER_DEFAULT_BASE_URL[provider];
      if (!url) {
        throw AppError.badRequest(
          "baseUrl is required for this AI provider.",
        );
      }
      return createOpenAICompatible({
        name: provider,
        apiKey,
        baseURL: url,
        supportsStructuredOutputs: false,
        ...(provider === "deepseek"
          ? {
              transformRequestBody: (body: Record<string, unknown>) => ({
                ...body,
                reasoning_effort: "none",
                thinking: { type: "disabled" },
              }),
            }
          : {}),
      }).chatModel(modelId);
    }
    case "openai":
    default: {
      const url =
        baseUrl || AI_PROVIDER_DEFAULT_BASE_URL[provider] || undefined;
      const client = createOpenAI({
        apiKey,
        ...(url ? { baseURL: url } : {}),
        name: provider,
      });
      return client.chat(modelId);
    }
  }
}

function parseDraftJson(text: string): DraftFields | null {
  const raw = text.trim();
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [
    fence?.[1]?.trim(),
    raw,
    (() => {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) return raw.slice(start, end + 1);
      return undefined;
    })(),
  ].filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    try {
      const parsed = draftSchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
    } catch {
      /* try next */
    }
  }
  return null;
}

type GenerateOpts = {
  model: LanguageModel;
  provider: AiProvider;
  temperature?: number;
  maxOutputTokens?: number;
  messages?: ModelMessage[];
  prompt?: string;
};

function providerExtras(provider: AiProvider) {
  return provider === "deepseek" || provider === "openai_compatible"
    ? ({ reasoning: "none" as const } as const)
    : {};
}

function appendTextToMessages(
  messages: ModelMessage[],
  text: string,
): ModelMessage[] {
  return messages.map((m) => {
    if (m.role !== "user") return m;
    if (typeof m.content === "string") {
      return { ...m, content: `${m.content}\n\n${text}` };
    }
    return {
      ...m,
      content: [...m.content, { type: "text" as const, text }],
    };
  });
}

/**
 * Extract pass: submit a draft OR cancel when the image is not a valid song.
 * Thinking is disabled for DeepSeek so tool_choice works.
 */
async function analyzeSheetMusic(
  opts: GenerateOpts,
): Promise<{ kind: "draft"; draft: DraftFields } | { kind: "cancel"; cancel: CancelFields }> {
  const promptBase = opts.prompt ?? "";
  const messages = opts.messages;
  const tools = {
    submit_song_draft: tool({
      description:
        "Submit the ChordPro song draft when the image clearly shows a worship song / chord-lyric sheet.",
      inputSchema: draftSchema,
    }),
    cancel_import: tool({
      description:
        "Cancel the import when the image is NOT a usable song sheet (random photo, blank page, unreadable blur, menu/receipt, unrelated document, etc.). Prefer this over inventing a song.",
      inputSchema: cancelSchema,
    }),
  };

  try {
    const result = await generateText({
      model: opts.model,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      ...providerExtras(opts.provider),
      ...(messages ? { messages } : { prompt: promptBase }),
      tools,
      // Must call one of the tools; model picks draft vs cancel.
      toolChoice: "required",
    });

    const cancelCall = result.toolCalls.find(
      (c) => c.toolName === "cancel_import",
    );
    if (cancelCall && "input" in cancelCall && cancelCall.input != null) {
      return { kind: "cancel", cancel: cancelSchema.parse(cancelCall.input) };
    }

    const draftCall = result.toolCalls.find(
      (c) => c.toolName === "submit_song_draft",
    );
    if (draftCall && "input" in draftCall && draftCall.input != null) {
      return { kind: "draft", draft: draftSchema.parse(draftCall.input) };
    }

    const fromText = parseDraftJson(result.text ?? "");
    if (fromText) return { kind: "draft", draft: fromText };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      !/tool[_\s-]?choice|thinking mode|response_format/i.test(msg) &&
      opts.provider !== "deepseek" &&
      opts.provider !== "openai_compatible"
    ) {
      throw err;
    }
  }

  // JSON fallback — allow explicit cancel object or draft.
  const jsonHint = [
    "Respond with a single JSON object only (no markdown).",
    'To cancel: {"cancel":true,"code":"not_a_song|unreadable|blank|wrong_content|multiple_unclear","reason":"..."}.',
    'To submit a draft: {"title":"...","artist":"...","content":"...","confidence":0-1,...}.',
    "The word json must appear because some providers require it.",
  ].join(" ");

  const retry = await generateText({
    model: opts.model,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
    ...providerExtras(opts.provider),
    ...(messages
      ? { messages: appendTextToMessages(messages, jsonHint) }
      : { prompt: `${promptBase}\n\n${jsonHint}` }),
  });

  const raw = retry.text?.trim() ?? "";
  try {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fence?.[1]?.trim() || raw;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    const jsonText =
      start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
    const obj = JSON.parse(jsonText) as Record<string, unknown>;
    if (obj.cancel === true || obj.cancel_import === true) {
      return { kind: "cancel", cancel: cancelSchema.parse(obj) };
    }
    if (typeof obj.code === "string" && typeof obj.reason === "string" && !obj.content) {
      return { kind: "cancel", cancel: cancelSchema.parse(obj) };
    }
    const draft = draftSchema.safeParse(obj);
    if (draft.success) return { kind: "draft", draft: draft.data };
  } catch {
    /* fall through */
  }

  const parsed = parseDraftJson(raw);
  if (parsed) return { kind: "draft", draft: parsed };

  throw new Error(
    "Model returned neither a song draft nor a cancel decision.",
  );
}

/**
 * Verify/enrich pass — always submit an improved draft (no cancel).
 */
async function generateSongDraft(opts: GenerateOpts): Promise<DraftFields> {
  const promptBase = opts.prompt ?? "";
  const messages = opts.messages;

  try {
    const result = await generateText({
      model: opts.model,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      ...providerExtras(opts.provider),
      ...(messages ? { messages } : { prompt: promptBase }),
      tools: {
        submit_song_draft: tool({
          description:
            "Submit the improved ChordPro song draft with metadata.",
          inputSchema: draftSchema,
        }),
      },
      toolChoice: { type: "tool", toolName: "submit_song_draft" },
    });

    const call = result.toolCalls.find(
      (c) => c.toolName === "submit_song_draft",
    );
    if (call && "input" in call && call.input != null) {
      return draftSchema.parse(call.input);
    }

    const fromText = parseDraftJson(result.text ?? "");
    if (fromText) return fromText;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      !/tool[_\s-]?choice|thinking mode|response_format/i.test(msg) &&
      opts.provider !== "deepseek" &&
      opts.provider !== "openai_compatible"
    ) {
      throw err;
    }
  }

  const jsonHint =
    "Respond with a single JSON object only (no markdown) with keys: title, artist, key, tempo, timeSignature, youtube, ccli, composer, copyright, subtitle, duration, album, content, confidence, notes. The word json must appear because some providers require it.";

  const retry = await generateText({
    model: opts.model,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
    ...providerExtras(opts.provider),
    ...(messages
      ? { messages: appendTextToMessages(messages, jsonHint) }
      : { prompt: `${promptBase}\n\n${jsonHint}` }),
  });

  const parsed = parseDraftJson(retry.text ?? "");
  if (!parsed) {
    throw new Error(
      "Model returned no song draft tool call and text was not valid JSON.",
    );
  }
  return parsed;
}

function initialSteps(): SongImportStep[] {
  return [
    { id: "process", label: "Process the file", done: false, active: true },
    {
      id: "extract",
      label: "Extract lyrics and chords",
      done: false,
      active: false,
    },
    {
      id: "metadata",
      label: "Identify metadata (title, key, …)",
      done: false,
      active: false,
    },
    {
      id: "verify",
      label: "Verify online & enrich metadata",
      done: false,
      active: false,
    },
    { id: "draft", label: "Prepare the draft", done: false, active: false },
  ];
}

function markStep(job: SongImportJob, id: string, state: "active" | "done") {
  job.steps = job.steps.map((s) => {
    if (s.id === id) {
      return {
        ...s,
        active: state === "active",
        done: state === "done" ? true : s.done,
      };
    }
    if (state === "active") {
      return { ...s, active: false };
    }
    return s;
  });
  job.updatedAt = Date.now();
}

function publicJob(job: SongImportJob) {
  return {
    id: job.id,
    status: job.status,
    steps: job.steps,
    result: job.result,
    errorMessage: job.errorMessage,
    cancelCode: job.cancelCode,
    cancelReason: job.cancelReason,
    cancelledBy: job.cancelledBy,
  };
}

function stripDataUrl(raw: string): string {
  const idx = raw.indexOf("base64,");
  return idx >= 0 ? raw.slice(idx + "base64,".length) : raw;
}

function upsertDirective(
  content: string,
  name: string,
  value?: string | null,
): string {
  const trimmed = value?.toString().trim();
  if (!trimmed) return content;
  const re = new RegExp(`\\{${name}:\\s*[^}]*\\}`, "i");
  const directive = `{${name}: ${trimmed}}`;
  if (re.test(content)) return content.replace(re, directive);
  if (/\{title:\s*[^}]*\}/i.test(content)) {
    return content.replace(/\{title:\s*[^}]*\}/i, (m) => `${m}\n${directive}`);
  }
  return `${directive}\n${content}`;
}

function readDirective(content: string, name: string): string | undefined {
  const m = content.match(new RegExp(`\\{${name}:\\s*([^}]*)\\}`, "i"));
  const v = m?.[1]?.trim();
  return v || undefined;
}

/** Ensure ChordPro header carries every confirmed metadata field. */
function applyDraftMetadata(fields: DraftFields): DraftFields {
  let content = fields.content.trim();
  const title = fields.title.trim();
  const artist = (fields.artist || "").trim();
  content = upsertDirective(content, "title", title);
  content = upsertDirective(content, "artist", artist || undefined);
  content = upsertDirective(content, "key", fields.key);
  content = upsertDirective(content, "tempo", fields.tempo?.toString());
  content = upsertDirective(content, "time", fields.timeSignature);
  content = upsertDirective(content, "youtube", fields.youtube);
  content = upsertDirective(content, "ccli", fields.ccli);
  content = upsertDirective(content, "composer", fields.composer);
  content = upsertDirective(content, "copyright", fields.copyright);
  content = upsertDirective(content, "subtitle", fields.subtitle);
  content = upsertDirective(content, "duration", fields.duration);
  content = upsertDirective(content, "album", fields.album);
  return { ...fields, title, artist, content };
}

function toImportDraft(
  fields: DraftFields,
  extraWarnings: string[] = [],
): SongImportDraft {
  const normalized = applyDraftMetadata(fields);
  const warnings = [...extraWarnings];
  if (normalized.notes) warnings.push(normalized.notes);
  const content = normalized.content.trim();
  return {
    title: normalized.title.trim(),
    artist: (normalized.artist || "").trim(),
    content,
    key: normalized.key?.toString() || readDirective(content, "key"),
    tempo: normalized.tempo?.toString() || readDirective(content, "tempo"),
    timeSignature:
      normalized.timeSignature || readDirective(content, "time"),
    confidence: normalized.confidence,
    warnings,
    youtube: normalized.youtube || readDirective(content, "youtube"),
    ccli: normalized.ccli || readDirective(content, "ccli"),
    composer: normalized.composer || readDirective(content, "composer"),
    copyright: normalized.copyright || readDirective(content, "copyright"),
    subtitle: normalized.subtitle || readDirective(content, "subtitle"),
    duration: normalized.duration || readDirective(content, "duration"),
  };
}

function assertNotAborted(job: SongImportJob) {
  if (job.abortRequested) {
    throw new UserCancelledError();
  }
}

async function findPossibleDuplicates(
  orgId: string,
  title: string,
  artist: string,
): Promise<SongImportDuplicate[]> {
  const t = title.trim();
  if (!t) return [];
  const rows = await prisma.song.findMany({
    where: {
      orgId,
      deleted: false,
      OR: [
        { title: { equals: t, mode: "insensitive" } },
        { title: { contains: t, mode: "insensitive" } },
        ...(artist.trim()
          ? [
              {
                AND: [
                  { title: { contains: t.split(/\s+/)[0]!, mode: "insensitive" as const } },
                  {
                    artist: {
                      contains: artist.trim(),
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    select: { id: true, title: true, artist: true },
    take: 8,
  });
  const titleLower = t.toLowerCase();
  const artistLower = artist.trim().toLowerCase();
  return rows
    .map((r) => {
      const rt = r.title.toLowerCase();
      const ra = (r.artist || "").toLowerCase();
      let score = 0;
      if (rt === titleLower) score += 0.7;
      else if (rt.includes(titleLower) || titleLower.includes(rt)) score += 0.4;
      if (artistLower && ra === artistLower) score += 0.3;
      else if (artistLower && ra.includes(artistLower)) score += 0.15;
      return {
        id: r.id,
        title: r.title,
        artist: r.artist || "",
        score: Math.min(1, score),
      };
    })
    .filter((d) => d.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

type OnlineEvidence = {
  block: string;
  youtubeUrl?: string;
  duration?: string;
  artistHint?: string;
  sources: string[];
};

async function gatherOnlineEvidence(
  draft: SongImportDraft,
  nativeAuth: NativeWebAuth | null,
): Promise<OnlineEvidence> {
  const title = draft.title;
  const artist = draft.artist;
  const sources: string[] = [];
  const sections: string[] = [];
  let youtubeUrl: string | undefined;
  let duration: string | undefined;
  let artistHint: string | undefined;

  const [mbRes, ytRes, webRes, ccliRes] = await Promise.allSettled([
    searchMusicBrainzRecordings({
      title,
      artist: artist || undefined,
      limit: 5,
    }),
    searchYouTube({
      title,
      artist: artist || undefined,
      limit: 5,
      nativeAuth,
    }),
    searchWeb({
      query: [title, artist, "worship song lyrics"].filter(Boolean).join(" "),
      limit: 5,
      oriQuestion: `Song metadata for ${title}`,
      nativeAuth,
    }),
    searchWeb({
      query: [title, artist, "CCLI"].filter(Boolean).join(" "),
      limit: 3,
      oriQuestion: `CCLI number for ${title}`,
      nativeAuth,
    }),
  ]);

  if (mbRes.status === "fulfilled") {
    sources.push("MusicBrainz");
    const lines = mbRes.value.hits.slice(0, 4).map((h, i) => {
      if (i === 0 && !artist && h.artist) artistHint = h.artist;
      return `${i + 1}. "${h.title}" — ${h.artist}${
        h.release ? ` (release: ${h.release})` : ""
      }${h.firstReleaseDate ? ` [${h.firstReleaseDate}]` : ""} score=${h.score}`;
    });
    sections.push(
      "MusicBrainz recordings:\n" + (lines.join("\n") || "(none)"),
    );
  } else {
    sections.push(
      `MusicBrainz: skipped (${mbRes.reason instanceof Error ? mbRes.reason.message : String(mbRes.reason)})`,
    );
  }

  if (ytRes.status === "fulfilled") {
    sources.push(`YouTube (${ytRes.value.provider})`);
    const lines = ytRes.value.hits.slice(0, 4).map((h, i) => {
      if (i === 0) youtubeUrl = h.url;
      return `${i + 1}. ${h.title}${h.channel ? ` — ${h.channel}` : ""}\n   ${h.url}\n   directive: ${h.directive}`;
    });
    sections.push(
      "YouTube hits (prefer official / lyric video when clear):\n" +
        (lines.join("\n") || "(none)"),
    );
    if (youtubeUrl) {
      try {
        const dur = await getYouTubeDuration(youtubeUrl);
        if (dur?.duration) {
          duration = dur.duration;
          sections.push(`YouTube duration for top hit: ${dur.duration}`);
        }
      } catch {
        /* optional */
      }
    }
  } else {
    sections.push(
      `YouTube: skipped (${ytRes.reason instanceof Error ? ytRes.reason.message : String(ytRes.reason)})`,
    );
  }

  if (webRes.status === "fulfilled") {
    sources.push(`Web (${webRes.value.provider})`);
    const lines = webRes.value.results.slice(0, 4).map(
      (h, i) =>
        `${i + 1}. ${h.title}\n${h.url}\n${h.snippet || h.summary || ""}`,
    );
    sections.push("Web search:\n" + (lines.join("\n\n") || "(none)"));
  } else {
    sections.push(
      `Web search: skipped (${webRes.reason instanceof Error ? webRes.reason.message : String(webRes.reason)})`,
    );
  }

  if (ccliRes.status === "fulfilled") {
    sources.push(`CCLI web (${ccliRes.value.provider})`);
    const lines = ccliRes.value.results.slice(0, 3).map(
      (h, i) =>
        `${i + 1}. ${h.title}\n${h.url}\n${h.snippet || h.summary || ""}`,
    );
    sections.push(
      "CCLI / licensing search (only set {ccli:} when the number is explicit):\n" +
        (lines.join("\n\n") || "(none)"),
    );
  }

  return {
    block: sections.join("\n\n"),
    youtubeUrl,
    duration,
    artistHint,
    sources,
  };
}

export class SongImportService {
  private readonly config = new OrgAiConfigService();

  getJob(orgId: string, id: string) {
    pruneJobsSafe();
    const job = jobs.get(id);
    if (!job || job.orgId !== orgId) {
      throw AppError.notFound("SONG_NOT_FOUND", "Import job not found.");
    }
    return publicJob(job);
  }

  /** Request abort; in-flight pipeline stops at the next stage boundary. */
  cancelJob(orgId: string, id: string) {
    pruneJobsSafe();
    const job = jobs.get(id);
    if (!job || job.orgId !== orgId) {
      throw AppError.notFound("SONG_NOT_FOUND", "Import job not found.");
    }
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      return publicJob(job);
    }
    job.abortRequested = true;
    job.status = "cancelled";
    job.cancelledBy = "user";
    job.cancelReason = "Import cancelled by user.";
    job.errorMessage = job.cancelReason;
    job.updatedAt = Date.now();
    return publicJob(job);
  }

  async createJob(input: CreateInput) {
    pruneJobsSafe();
    if (!input.imageBase64?.trim()) {
      throw AppError.badRequest("imageBase64 is required.");
    }
    if (input.sourceType === "pdf" && !input.pdfBase64?.trim()) {
      throw AppError.badRequest("pdfBase64 is required for PDF imports.");
    }

    const id = randomUUID();
    const job: SongImportJob = {
      id,
      orgId: input.orgId,
      status: "queued",
      steps: initialSteps(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    jobs.set(id, job);

    // Return immediately; client polls GET for real step progress.
    void this.run(job, input).catch((err) => {
      if (job.status === "cancelled" && job.cancelledBy === "user") return;
      if (err instanceof UserCancelledError) {
        job.status = "cancelled";
        job.cancelledBy = "user";
        job.cancelReason = err.message;
        job.errorMessage = err.message;
      } else if (err instanceof ImportCancelledError) {
        job.status = "cancelled";
        job.cancelledBy = "ai";
        job.cancelCode = err.code;
        job.cancelReason = err.message;
        job.errorMessage = err.message;
      } else {
        job.status = "failed";
        job.errorMessage =
          err instanceof Error ? err.message : "Import failed unexpectedly.";
      }
      job.updatedAt = Date.now();
    });

    // Kick status to running so the first poll is not stuck on queued.
    job.status = "running";
    job.updatedAt = Date.now();
    return publicJob(job);
  }

  private async run(job: SongImportJob, input: CreateInput) {
    try {
      assertNotAborted(job);
      job.status = "running";
      markStep(job, "process", "active");

      const runtime = await this.config.getRuntimeConfig(input.orgId);
      assertNotAborted(job);
      const model = buildModel(
        runtime.provider,
        runtime.model,
        runtime.apiKey,
        runtime.baseUrl,
      );

      markStep(job, "process", "done");
      assertNotAborted(job);
      markStep(job, "extract", "active");

      const primaryBytes = Buffer.from(
        stripDataUrl(input.imageBase64),
        "base64",
      );
      const primaryMime = input.imageMimeType || "image/jpeg";
      const extraImages = (input.imagesBase64 ?? [])
        .map((raw, i) => ({
          bytes: Buffer.from(stripDataUrl(raw), "base64"),
          mime: input.imageMimeTypes?.[i] || "image/png",
        }))
        .filter((img) => img.bytes.length > 0);
      const pageCount = 1 + extraImages.length;

      const extractPrompt = [
        "You are Logos, Hosanna's worship-song assistant.",
        `Inspect the attached image(s) (${pageCount} page${pageCount > 1 ? "s" : ""}).`,
        "If it is clearly NOT a usable song / chord-lyric sheet (random photo, blank page, blurry unreadable, menu, receipt, sermon notes without chords/lyrics, etc.), call cancel_import with a short reason.",
        "If it IS a song sheet, call submit_song_draft with ChordPro content spanning all pages. Do not invent verses you cannot see.",
        "content MUST be valid ChordPro with {title}, {artist}, {key}, optional {tempo}/{time}, and lyric lines with [Chords].",
        "Set confidence honestly (0-1).",
        input.fileName ? `Original filename: ${input.fileName}` : "",
        input.sourceType === "pdf"
          ? `Source type: PDF (${pageCount} page screenshot${pageCount > 1 ? "s" : ""}).`
          : `Source type: ${input.sourceType}.`,
      ]
        .filter(Boolean)
        .join("\n");

      const analysis = await analyzeSheetMusic({
        model,
        provider: runtime.provider,
        temperature: runtime.temperature ?? 0.2,
        maxOutputTokens: runtime.maxOutputTokens ?? 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: extractPrompt },
              {
                type: "file",
                data: primaryBytes,
                mediaType: primaryMime,
              },
              ...extraImages.map((img) => ({
                type: "file" as const,
                data: img.bytes,
                mediaType: img.mime,
              })),
            ],
          },
        ],
      });

      assertNotAborted(job);

      if (analysis.kind === "cancel") {
        throw new ImportCancelledError(
          analysis.cancel.code,
          analysis.cancel.reason,
        );
      }

      const lyricBody = analysis.draft.content
        .replace(/\{[^}]+\}/g, "")
        .replace(/\[[^\]]*\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (lyricBody.length < 8) {
        throw new ImportCancelledError(
          "blank",
          "Could not find readable lyrics or chords on this image.",
        );
      }

      markStep(job, "extract", "done");
      assertNotAborted(job);
      markStep(job, "metadata", "active");

      let draft = toImportDraft(analysis.draft);

      markStep(job, "metadata", "done");
      assertNotAborted(job);
      markStep(job, "verify", "active");

      try {
        const nativeAuth = nativeWebAuthFromRuntime(runtime);
        const evidence = await gatherOnlineEvidence(draft, nativeAuth);
        assertNotAborted(job);

        const verifyPrompt = [
          "You are Logos verifying a ChordPro draft and enriching metadata from online evidence.",
          "Correct obvious OCR mistakes in title/artist/lyrics/chords when the evidence is clear.",
          "Fill every ChordPro metadata field you can confidently support: title, artist, key, tempo, time, youtube, ccli, composer, copyright, subtitle, duration, album.",
          "Put those values BOTH in the structured fields AND as {directive:} lines in content.",
          "For youtube: use a full watch URL from the YouTube hits when it clearly matches the song — prefer official / lyric videos.",
          "For ccli: only set when an explicit CCLI song number appears in the evidence.",
          "Do not invent lyrics or chords. If evidence is weak, keep the visual draft, lower confidence, and note it.",
          "Call submit_song_draft with the improved draft.",
          "",
          `Draft title: ${draft.title}`,
          `Draft artist: ${draft.artist}`,
          `Draft key: ${draft.key ?? ""}`,
          evidence.artistHint && !draft.artist
            ? `Artist hint from MusicBrainz: ${evidence.artistHint}`
            : "",
          evidence.youtubeUrl
            ? `Suggested YouTube URL: ${evidence.youtubeUrl}`
            : "",
          evidence.duration ? `Suggested duration: ${evidence.duration}` : "",
          "",
          "Current ChordPro:",
          draft.content,
          "",
          "Online evidence:",
          evidence.block || "(none)",
        ]
          .filter(Boolean)
          .join("\n");

        const verifiedDraft = await generateSongDraft({
          model,
          provider: runtime.provider,
          temperature: 0.1,
          maxOutputTokens: runtime.maxOutputTokens ?? 4096,
          prompt: verifyPrompt,
        });
        assertNotAborted(job);

        const merged: DraftFields = {
          ...verifiedDraft,
          title: verifiedDraft.title.trim() || draft.title,
          artist:
            (verifiedDraft.artist || "").trim() ||
            draft.artist ||
            evidence.artistHint ||
            "",
          key: verifiedDraft.key || draft.key,
          tempo: verifiedDraft.tempo || draft.tempo,
          timeSignature: verifiedDraft.timeSignature || draft.timeSignature,
          youtube:
            verifiedDraft.youtube ||
            readDirective(verifiedDraft.content, "youtube") ||
            evidence.youtubeUrl,
          ccli:
            verifiedDraft.ccli || readDirective(verifiedDraft.content, "ccli"),
          composer:
            verifiedDraft.composer ||
            readDirective(verifiedDraft.content, "composer"),
          copyright:
            verifiedDraft.copyright ||
            readDirective(verifiedDraft.content, "copyright"),
          subtitle:
            verifiedDraft.subtitle ||
            readDirective(verifiedDraft.content, "subtitle"),
          duration:
            verifiedDraft.duration ||
            readDirective(verifiedDraft.content, "duration") ||
            evidence.duration,
          album:
            verifiedDraft.album ||
            readDirective(verifiedDraft.content, "album"),
          content: verifiedDraft.content.trim() || draft.content,
          confidence: verifiedDraft.confidence ?? draft.confidence,
        };

        draft = toImportDraft(merged, [
          ...draft.warnings,
          `Verified & enriched online (${evidence.sources.join(", ") || "search"}).`,
        ]);
      } catch (err) {
        if (
          err instanceof UserCancelledError ||
          err instanceof ImportCancelledError
        ) {
          throw err;
        }
        draft.warnings.push(
          `Online verification skipped: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      markStep(job, "verify", "done");
      assertNotAborted(job);
      markStep(job, "draft", "active");

      const validation = validateChordProContent(draft.content);
      draft.diagnostics = [
        ...validation.parseErrors.map((message) => ({
          severity: "error",
          message,
        })),
        ...validation.diagnostics.map((d) => ({
          severity: d.severity,
          message: d.message,
          line: typeof d.line === "number" ? d.line : undefined,
        })),
      ];
      if (!validation.ok) {
        const msgs = [
          ...validation.parseErrors,
          ...validation.diagnostics
            .filter((d) => d.severity === "error")
            .map((d) => d.message),
        ];
        draft.warnings.push(
          `ChordPro validation warnings: ${msgs.join("; ") || "see content"}`,
        );
      }

      if (!/\{title:/i.test(draft.content)) {
        draft.content = `{title: ${draft.title}}\n${draft.content}`;
      }
      if (draft.artist && !/\{artist:/i.test(draft.content)) {
        draft.content = draft.content.replace(
          /\{title:[^}]*\}/i,
          (m) => `${m}\n{artist: ${draft.artist}}`,
        );
      }

      try {
        draft.possibleDuplicates = await findPossibleDuplicates(
          input.orgId,
          draft.title,
          draft.artist,
        );
      } catch {
        draft.possibleDuplicates = [];
      }

      assertNotAborted(job);
      job.result = draft;
      markStep(job, "draft", "done");
      job.status = "completed";
      job.updatedAt = Date.now();
    } catch (err) {
      if (job.abortRequested || err instanceof UserCancelledError) {
        job.status = "cancelled";
        job.cancelledBy = "user";
        job.cancelReason = "Import cancelled by user.";
        job.errorMessage = job.cancelReason;
      } else if (err instanceof ImportCancelledError) {
        job.status = "cancelled";
        job.cancelledBy = "ai";
        job.cancelCode = err.code;
        job.cancelReason = err.message;
        job.errorMessage = err.message;
      } else {
        job.status = "failed";
        job.errorMessage =
          err instanceof Error ? err.message : "Import failed unexpectedly.";
      }
      job.updatedAt = Date.now();
    }
  }
}
