import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, tool, type LanguageModel, type ModelMessage } from "ai";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { validateChordProContent } from "../mcp/lib/chordproGate.js";
import { searchWeb } from "../mcp/lib/webSearch.js";
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
  content: z
    .string()
    .min(1)
    .describe(
      "Full ChordPro body with {title}/{artist}/{key} and lyric lines with [Chords]",
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
    'Respond with a single JSON object only (no markdown) with keys: title, artist, key, tempo, timeSignature, content, confidence, notes. The word json must appear because some providers require it.';

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
      label: "Verify online (reduce hallucinations)",
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

function toImportDraft(
  fields: DraftFields,
  extraWarnings: string[] = [],
): SongImportDraft {
  const warnings = [...extraWarnings];
  if (fields.notes) warnings.push(fields.notes);
  return {
    title: fields.title.trim(),
    artist: (fields.artist || "").trim(),
    content: fields.content.trim(),
    key: fields.key?.toString(),
    tempo: fields.tempo?.toString(),
    timeSignature: fields.timeSignature,
    confidence: fields.confidence,
    warnings,
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

    // Web verify to reduce hallucinations.
    try {
      const query = [draft.title, draft.artist, "lyrics chords"]
        .filter(Boolean)
        .join(" ")
        .trim();
      const search = await searchWeb({
        query,
        limit: 5,
        oriQuestion: `Verify worship song sheet: ${draft.title}`,
      });
      const snippets = search.results
        .slice(0, 4)
        .map(
          (h, i) =>
            `${i + 1}. ${h.title}\n${h.url}\n${h.snippet || h.summary || ""}`,
        )
        .join("\n\n");

      const verifyPrompt = [
        "You are Logos verifying a ChordPro draft against web search hits.",
        "Correct obvious OCR mistakes in title/artist/lyrics/chords when the web evidence is clear.",
        "If the web does not confirm the song, keep the visual draft and set a lower confidence; add a short warning in notes.",
        "Call submit_song_draft with the improved draft.",
        "",
        `Draft title: ${draft.title}`,
        `Draft artist: ${draft.artist}`,
        `Draft key: ${draft.key ?? ""}`,
        "",
        "Current ChordPro:",
        draft.content,
        "",
        "Web search hits:",
        snippets || "(none)",
      ].join("\n");

      const verifiedDraft = await generateSongDraft({
        model,
        provider: runtime.provider,
        temperature: 0.1,
        maxOutputTokens: runtime.maxOutputTokens ?? 4096,
        prompt: verifyPrompt,
      });

      draft = toImportDraft(verifiedDraft, [
        ...draft.warnings,
        `Verified against web (${search.provider}).`,
      ]);
      // Prefer non-empty prior fields if the verify pass blanks them.
      draft.title = draft.title || extractedDraft.title.trim();
      draft.artist = draft.artist || (extractedDraft.artist || "").trim();
      draft.content = draft.content || extractedDraft.content.trim();
      draft.key = draft.key || extractedDraft.key?.toString();
      draft.tempo = draft.tempo || extractedDraft.tempo?.toString();
      draft.timeSignature =
        draft.timeSignature || extractedDraft.timeSignature;
      draft.confidence = draft.confidence ?? extractedDraft.confidence;
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
