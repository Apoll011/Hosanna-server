import type { McpServer } from "@modelcontextprotocol/server";
import {
  convertToChordProDetailed,
  lintChordPro,
  parseChordPro,
  toChordPro,
} from "@hosanna/chordpro/parser";
import { formatChordPro } from "@hosanna/chordpro/formatter";
import { z } from "zod";
import {
  explainChordProDirective,
  getChordProCapabilities,
} from "../lib/capabilities.js";
import { validateChordProContent } from "../lib/chordproGate.js";
import { summarizeDiff } from "../lib/diff.js";
import { propagateVerseChords } from "../lib/propagateChords.js";
import { transposeChordProSource } from "../lib/transposeSource.js";
import { errorResult, jsonResult } from "../context.js";

export function registerChordProTools(server: McpServer): void {
  server.registerTool(
    "chordpro_validate",
    {
      title: "Validate ChordPro",
      description:
        "Lint and parse ChordPro text; return diagnostics and parse errors without saving.",
      inputSchema: z.object({
        content: z.string().describe("ChordPro document text"),
      }),
    },
    async ({ content }) => {
      try {
        return jsonResult(validateChordProContent(content));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "chordpro_propagate_chords",
    {
      title: "Propagate verse chords",
      description:
        "Copy chord markers from the first chorded verse onto later verses, anchored to words/syllables (lines that already have chords are untouched; identical choruses are copied exactly). Does not invent chords. Returns a DRAFT: read `review` (`check` lines need fixing) and `skipped`, correct the content yourself, then submit it with songs_propose_edit.",
      inputSchema: z.object({
        content: z.string().describe("Full ChordPro document"),
      }),
    },
    async ({ content }) => {
      try {
        const { content: draftContent, ...report } =
          propagateVerseChords(content);
        return jsonResult({
          draft: { content: draftContent },
          ...report,
          diff: summarizeDiff(content, draftContent),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "chordpro_parse_summary",
    {
      title: "Parse ChordPro summary",
      description:
        "Parse ChordPro and return metadata, analysis, score, and variant list (no full AST).",
      inputSchema: z.object({
        content: z.string(),
        variantId: z
          .string()
          .optional()
          .describe("Optional variant id/slug to select before analysis"),
      }),
    },
    async ({ content, variantId }) => {
      try {
        let song = parseChordPro(content);
        if (variantId) song = song.selectVariant(variantId);
        return jsonResult({
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
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "chordpro_format",
    {
      title: "Format ChordPro",
      description: "Normalize ChordPro directives and chord spelling.",
      inputSchema: z.object({
        content: z.string(),
        expandDirectiveAliases: z.boolean().optional().default(true),
        normalizeNotationAliases: z.boolean().optional().default(true),
      }),
    },
    async ({ content, expandDirectiveAliases, normalizeNotationAliases }) => {
      try {
        const result = formatChordPro(content, {
          expandDirectiveAliases,
          normalizeNotationAliases,
        });
        return jsonResult({
          content: result.content,
          changes: result.changes,
          warnings: result.warnings,
          validation: validateChordProContent(result.content),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "chordpro_transpose",
    {
      title: "Transpose ChordPro",
      description:
        "Source-preserving transpose by semitones or to a target key. Returns proposed text + lint.",
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
    },
    async ({ content, semitones, toKey }) => {
      try {
        const result =
          toKey != null && String(toKey).trim() !== ""
            ? transposeChordProSource(content, { toKey })
            : transposeChordProSource(content, { semitones: semitones! });
        return jsonResult({
          ...result,
          proposal: { content: result.content },
          validation: validateChordProContent(result.content),
          diff: summarizeDiff(content, result.content),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "chordpro_convert",
    {
      title: "Convert to ChordPro",
      description:
        "Convert Ultimate Guitar / Cifra Club / plain chord sheets into ChordPro.",
      inputSchema: z.object({
        input: z.string(),
        detailed: z
          .boolean()
          .optional()
          .default(true)
          .describe("When true, return conversion diagnostics"),
      }),
    },
    async ({ input, detailed }) => {
      try {
        if (detailed) {
          const result = convertToChordProDetailed(input);
          return jsonResult({
            content: result.chordpro,
            title: result.title,
            detectedSource: result.detectedSource,
            warnings: result.warnings,
            validation: validateChordProContent(result.chordpro),
          });
        }
        const content = toChordPro(input);
        return jsonResult({
          content,
          validation: validateChordProContent(content),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "chordpro_directives",
    {
      title: "ChordPro directives",
      description:
        "List or explain Hosanna ChordPro directives and support levels from the capability manifest.",
      inputSchema: z.object({
        name: z
          .string()
          .optional()
          .describe("Directive name or alias to explain; omit to list all"),
        category: z
          .enum([
            "metadata",
            "comment",
            "structure",
            "notation",
            "layout",
            "other",
          ])
          .optional(),
      }),
    },
    async ({ name, category }) => {
      try {
        if (name) {
          const directive = explainChordProDirective(name);
          if (!directive) {
            return jsonResult(
              {
                error: `Unknown directive: ${name}`,
                hint: "Use chordpro_directives without name to list known directives.",
              },
              true,
            );
          }
          return jsonResult(directive);
        }
        const manifest = getChordProCapabilities();
        const directives = category
          ? manifest.directives.filter((d) => d.category === category)
          : manifest.directives;
        return jsonResult({
          version: manifest.version,
          directives,
          features: manifest.features,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
