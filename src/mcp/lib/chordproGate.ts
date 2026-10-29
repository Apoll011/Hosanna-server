import {
  lintChordPro,
  parseChordPro,
  type ChordProDiagnostic,
} from "@hosanna/chordpro/parser";

export interface ChordProValidationReport {
  ok: boolean;
  diagnostics: ChordProDiagnostic[];
  parseErrors: string[];
  metadata: Record<string, string | undefined>;
  variantCount: number;
  analysis: ReturnType<ReturnType<typeof parseChordPro>["analyze"]> | null;
  score: ReturnType<ReturnType<typeof parseChordPro>["score"]> | null;
}

export function validateChordProContent(
  content: string,
): ChordProValidationReport {
  const diagnostics = lintChordPro(content);
  const song = parseChordPro(content);
  const parseErrors = song.errors ?? [];
  const errorDiagnostics = diagnostics.filter((d) => d.severity === "error");

  return {
    ok: errorDiagnostics.length === 0 && parseErrors.length === 0,
    diagnostics,
    parseErrors,
    metadata: song.metadata ?? {},
    variantCount: song.variants?.length ?? 0,
    analysis: song.analyze(),
    score: song.score(),
  };
}

/** Extract title/artist/song_number from ChordPro for song records. */
export function metadataFromChordPro(content: string): {
  title?: string;
  artist?: string;
  song_number?: number | null;
} {
  const song = parseChordPro(content);
  const meta = song.metadata ?? {};
  const rawNumber = meta.songNumber ?? meta.song_number;
  let song_number: number | null | undefined;
  if (rawNumber != null && String(rawNumber).trim() !== "") {
    const n = Number(rawNumber);
    song_number = Number.isFinite(n) && n > 0 ? n : null;
  }
  return {
    title: meta.title?.trim() || undefined,
    artist: meta.artist?.trim() || undefined,
    song_number,
  };
}
