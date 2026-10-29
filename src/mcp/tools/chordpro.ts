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
import { propagateVerseComments } from "../lib/propagateComments.js";
import { transposeChordProSource } from "../lib/transposeSource.js";
import { errorResult, jsonResult } from "../context.js";

export function registerChordProTools(server: McpServer): void {
  server.registerTool(
    "chordpro.validate",
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
    "chordpro.propagate_notes",
    {
      title: "Propagate verse notes",
      description:
        "Copy {c:}/{ci:}/{cb:} performance notes from the first annotated verse onto other verses at the same relative lyric/chord positions. Does not invent new notes — only mirrors existing ones.",
      inputSchema: z.object({
        content: z.string().describe("Full ChordPro document"),
      }),
    },
    async ({ content }) => {
      try {
        const result = propagateVerseComments(content);
        return jsonResult({
          ...result,
          diff: summarizeDiff(content, result.content),
          proposal: { content: result.content },
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "chordpro.parse_summary",
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
    "chordpro.format",
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
    "chordpro.transpose",
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
        .refine((v) => v.semitones != null || v.toKey != null, {
          message: "Provide semitones or toKey",
        }),
    },
    async ({ content, semitones, toKey }) => {
      try {
        const result =
          toKey != null
            ? transposeChordProSource(content, { toKey })
            : transposeChordProSource(content, { semitones: semitones! });
        return jsonResult({
          ...result,
          validation: validateChordProContent(result.content),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "chordpro.convert",
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
    "chordpro.directives",
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
                hint: "Use chordpro.directives without name to list known directives.",
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
