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

function normMeta(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Warn when DB fields diverge from ChordPro directives (Studio syncs these on save).
 */
export function mirroredMetadataWarnings(args: {
  title: string;
  artist?: string | null;
  song_number?: number | null;
  content: string;
}): string[] {
  const meta = metadataFromChordPro(args.content);
  const warnings: string[] = [];
  if (meta.title && normMeta(meta.title) !== normMeta(args.title)) {
    warnings.push(
      `Title mismatch: database "${args.title}" vs ChordPro {title: ${meta.title}}`,
    );
  }
  if (
    meta.artist &&
    args.artist != null &&
    args.artist !== "" &&
    normMeta(meta.artist) !== normMeta(args.artist)
  ) {
    warnings.push(
      `Artist mismatch: database "${args.artist}" vs ChordPro {artist: ${meta.artist}}`,
    );
  }
  if (
    meta.song_number != null &&
    args.song_number != null &&
    meta.song_number !== args.song_number
  ) {
    warnings.push(
      `song_number mismatch: database ${args.song_number} vs ChordPro {song_number: ${meta.song_number}}`,
    );
  }
  return warnings;
}

/**
 * Parse {duration:} from ChordPro into seconds.
 * Accepts plain seconds ("180"), M:SS ("3:00"), or minutes if clearly small with unit.
 */
export function durationSecondsFromChordPro(
  content: string,
): number | undefined {
  const match = content.match(/\{duration:\s*([^}]+)\}/i);
  if (!match?.[1]) return undefined;
  const raw = match[1].trim();
  if (!raw) return undefined;

  const mss = raw.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (mss) {
    const minutes = Number(mss[1]);
    const seconds = Number(mss[2]);
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && seconds < 60) {
      return minutes * 60 + seconds;
    }
  }

  const asNum = Number(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(asNum) || asNum <= 0) return undefined;
  // If tagged as minutes and small, convert.
  if (/min/i.test(raw) && asNum < 60) return Math.round(asNum * 60);
  return Math.round(asNum);
}
