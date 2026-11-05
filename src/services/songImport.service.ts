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

export type SongImportDraft = {
  title: string;
  artist: string;
  content: string;
  key?: string;
  tempo?: string;
  timeSignature?: string;
  confidence?: number;
  warnings: string[];
};

export type SongImportJob = {
  id: string;
  orgId: string;
  status: "queued" | "running" | "completed" | "failed";
  steps: SongImportStep[];
  result?: SongImportDraft;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
};

type CreateInput = {
  orgId: string;
  sourceType: SongImportSourceType;
  imageBase64: string;
  imageMimeType: string;
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

/**
 * Structured draft via forced tool call (skyhack-style). DeepSeek thinking is
 * disabled in buildModel so tool_choice is accepted. Falls back to plain JSON
 * text if the model ignores the tool.
 */
async function generateSongDraft(opts: {
  model: LanguageModel;
  provider: AiProvider;
  temperature?: number;
  maxOutputTokens?: number;
  messages?: ModelMessage[];
  prompt?: string;
}): Promise<DraftFields> {
  const promptBase = opts.prompt ?? "";
  const messages = opts.messages;

  try {
    const result = await generateText({
      model: opts.model,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      // Keep thinking off even if transformRequestBody is skipped by a proxy.
      ...(opts.provider === "deepseek" || opts.provider === "openai_compatible"
        ? { reasoning: "none" as const }
        : {}),
      ...(messages ? { messages } : { prompt: promptBase }),
      tools: {
        submit_song_draft: tool({
          description:
            "Submit the ChordPro song draft with title, artist, metadata, and content. Always call this tool with the final draft — do not reply with plain text or markdown JSON.",
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
    // Thinking mode / tool_choice rejection → JSON-only retry.
    if (
      !/tool[_\s-]?choice|thinking mode|response_format/i.test(msg) &&
      opts.provider !== "deepseek" &&
      opts.provider !== "openai_compatible"
    ) {
      throw err;
    }
  }

  const jsonHint =
    'Respond with a single JSON object only (no markdown) with keys: title, artist, key, tempo, timeSignature, youtube, ccli, composer, copyright, subtitle, duration, album, content, confidence, notes. The word json must appear because some providers require it.';

  const retry = await generateText({
    model: opts.model,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxOutputTokens,
    ...(opts.provider === "deepseek" || opts.provider === "openai_compatible"
      ? { reasoning: "none" as const }
      : {}),
    ...(messages
      ? {
          messages: messages.map((m) => {
            if (m.role !== "user" || typeof m.content === "string") {
              return m.role === "user" && typeof m.content === "string"
                ? { ...m, content: `${m.content}\n\n${jsonHint}` }
                : m;
            }
            return {
              ...m,
              content: [
                ...m.content,
                { type: "text" as const, text: jsonHint },
              ],
            };
          }),
        }
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
  return {
    title: normalized.title.trim(),
    artist: (normalized.artist || "").trim(),
    content: normalized.content.trim(),
    key: normalized.key?.toString() || readDirective(normalized.content, "key"),
    tempo:
      normalized.tempo?.toString() ||
      readDirective(normalized.content, "tempo"),
    timeSignature:
      normalized.timeSignature || readDirective(normalized.content, "time"),
    confidence: normalized.confidence,
    warnings,
  };
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

    // Await the pipeline so the draft survives serverless (Vercel) and the
    // mobile progress screen can finish on the create response. GET polling
    // still works for clients that disconnect mid-request and retry.
    try {
      await this.run(job, input);
    } catch (err) {
      job.status = "failed";
      job.errorMessage =
        err instanceof Error ? err.message : "Import failed unexpectedly.";
      job.updatedAt = Date.now();
    }

    return publicJob(job);
  }

  private async run(job: SongImportJob, input: CreateInput) {
    job.status = "running";
    markStep(job, "process", "active");

    const runtime = await this.config.getRuntimeConfig(input.orgId);
    const model = buildModel(
      runtime.provider,
      runtime.model,
      runtime.apiKey,
      runtime.baseUrl,
    );

    markStep(job, "process", "done");
    markStep(job, "extract", "active");

    const imageBytes = Buffer.from(stripDataUrl(input.imageBase64), "base64");
    const mime = input.imageMimeType || "image/jpeg";

    const extractPrompt = [
      "You are Logos, Hosanna's worship-song assistant.",
      "Extract a ChordPro song from the attached sheet-music image (and note if a PDF was the source).",
      "Call submit_song_draft with the result. Do not invent verses you cannot see — prefer shorter accurate content over hallucination.",
      "content MUST be valid ChordPro with {title}, {artist}, {key}, optional {tempo}/{time}, and lyric lines with [Chords].",
      input.fileName ? `Original filename: ${input.fileName}` : "",
      input.sourceType === "pdf"
        ? "Source type: PDF (image is a screenshot of page 1)."
        : `Source type: ${input.sourceType}.`,
    ]
      .filter(Boolean)
      .join("\n");

    const extractedDraft = await generateSongDraft({
      model,
      provider: runtime.provider,
      temperature: runtime.temperature ?? 0.2,
      maxOutputTokens: runtime.maxOutputTokens ?? 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: extractPrompt },
            { type: "file", data: imageBytes, mediaType: mime },
          ],
        },
      ],
    });

    markStep(job, "extract", "done");
    markStep(job, "metadata", "active");

    let draft = toImportDraft(extractedDraft);

    markStep(job, "metadata", "done");
    markStep(job, "verify", "active");

    // Online verify + enrich metadata (YouTube, MusicBrainz, CCLI, web).
    try {
      const nativeAuth = nativeWebAuthFromRuntime(runtime);
      const evidence = await gatherOnlineEvidence(draft, nativeAuth);

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
        evidence.youtubeUrl ? `Suggested YouTube URL: ${evidence.youtubeUrl}` : "",
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

      // Merge structured fields; fall back to extraction + search hints.
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
          verifiedDraft.album || readDirective(verifiedDraft.content, "album"),
        content: verifiedDraft.content.trim() || draft.content,
        confidence: verifiedDraft.confidence ?? draft.confidence,
      };

      draft = toImportDraft(merged, [
        ...draft.warnings,
        `Verified & enriched online (${evidence.sources.join(", ") || "search"}).`,
      ]);
    } catch (err) {
      draft.warnings.push(
        `Online verification skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    markStep(job, "verify", "done");
    markStep(job, "draft", "active");

    const validation = validateChordProContent(draft.content);
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

    // Ensure required directives exist.
    if (!/\{title:/i.test(draft.content)) {
      draft.content = `{title: ${draft.title}}\n${draft.content}`;
    }
    if (draft.artist && !/\{artist:/i.test(draft.content)) {
      draft.content = draft.content.replace(
        /\{title:[^}]*\}/i,
        (m) => `${m}\n{artist: ${draft.artist}}`,
      );
    }

    job.result = draft;
    markStep(job, "draft", "done");
    job.status = "completed";
    job.updatedAt = Date.now();
  }
}
