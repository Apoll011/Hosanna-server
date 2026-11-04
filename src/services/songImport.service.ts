import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
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
  title: z.string().min(1),
  artist: z.string().default(""),
  key: z.string().optional(),
  tempo: z.union([z.string(), z.number()]).optional(),
  timeSignature: z.string().optional(),
  content: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

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
      return client.chat(modelId);
    }
  }
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
      "Return structured fields only.",
      "content MUST be valid ChordPro with {title}, {artist}, {key}, optional {tempo}/{time}, and lyric lines with [Chords].",
      "Do not invent verses you cannot see — prefer shorter accurate content over hallucination.",
      input.fileName ? `Original filename: ${input.fileName}` : "",
      input.sourceType === "pdf"
        ? "Source type: PDF (image is a screenshot of page 1)."
        : `Source type: ${input.sourceType}.`,
    ]
      .filter(Boolean)
      .join("\n");

    const extracted = await generateObject({
      model,
      schema: draftSchema,
      temperature: runtime.temperature ?? 0.2,
      maxOutputTokens: runtime.maxOutputTokens ?? 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: extractPrompt },
            { type: "image", image: imageBytes, mediaType: mime },
          ],
        },
      ],
    });

    markStep(job, "extract", "done");
    markStep(job, "metadata", "active");

    let draft: SongImportDraft = {
      title: extracted.object.title.trim(),
      artist: (extracted.object.artist || "").trim(),
      content: extracted.object.content.trim(),
      key: extracted.object.key?.toString(),
      tempo: extracted.object.tempo?.toString(),
      timeSignature: extracted.object.timeSignature,
      confidence: extracted.object.confidence,
      warnings: [],
    };
    if (extracted.object.notes) {
      draft.warnings.push(extracted.object.notes);
    }

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
        "If the web does not confirm the song, keep the visual draft and set a lower confidence; add a short warning.",
        "Return the improved ChordPro draft.",
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

      const verified = await generateObject({
        model,
        schema: draftSchema,
        temperature: 0.1,
        maxOutputTokens: runtime.maxOutputTokens ?? 4096,
        prompt: verifyPrompt,
      });

      draft = {
        title: verified.object.title.trim() || draft.title,
        artist: (verified.object.artist || draft.artist).trim(),
        content: verified.object.content.trim() || draft.content,
        key: verified.object.key?.toString() || draft.key,
        tempo: verified.object.tempo?.toString() || draft.tempo,
        timeSignature: verified.object.timeSignature || draft.timeSignature,
        confidence: verified.object.confidence ?? draft.confidence,
        warnings: [
          ...draft.warnings,
          ...(verified.object.notes ? [verified.object.notes] : []),
          `Verified against web (${search.provider}).`,
        ],
      };
    } catch (err) {
      draft.warnings.push(
        `Online verification skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // Lightweight second pass without web if search failed completely.
      try {
        await generateText({
          model,
          prompt: `Briefly sanity-check this ChordPro title "${draft.title}" — reply OK.`,
        });
      } catch {
        /* ignore */
      }
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
