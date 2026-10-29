/**
 * Propagate ChordPro chord markers (`[Am]`, `[G]`, …) from the first
 * chorded verse onto later verses at the same lyric-character offsets.
 * Does not invent chords — only reuses the source verse’s chord sequence.
 */

const COMMENT_RE = /^\s*\{(c|ci|cb|comment|comment_italic|comment_box)\s*:/i;
const DIRECTIVE_RE = /^\s*\{[^}]+\}\s*$/;
const VERSE_START_RE = /^\s*\{(?:start_of_verse|verse)(?:\s*:|\s*\}|\s*$)/i;
const VERSE_END_RE = /^\s*\{end_of_verse\s*\}/i;
const SECTION_START_RE =
  /^\s*\{(?:start_of_(?:chorus|bridge|tab|grid|version)|chorus|bridge)\b/i;
const CHORD_TOKEN_RE = /\[([^\]]*)\]/g;

type ChordAnchor = {
  /** Chord text inside brackets (may include timing, e.g. Am@2x). */
  chord: string;
  /** Index into the lyric-only string where this chord sits. */
  at: number;
};

type VerseRange = {
  startLine: number;
  endLine: number;
  bodyStart: number;
  bodyEnd: number;
};

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function isStructuralLine(line: string): boolean {
  return COMMENT_RE.test(line) || DIRECTIVE_RE.test(line);
}

function findVerses(lines: string[]): VerseRange[] {
  const verses: VerseRange[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!VERSE_START_RE.test(lines[i]!)) {
      i++;
      continue;
    }
    const startLine = i;
    const bodyStart = i + 1;
    i++;
    while (i < lines.length) {
      const line = lines[i]!;
      if (VERSE_END_RE.test(line)) break;
      if (VERSE_START_RE.test(line) || SECTION_START_RE.test(line)) break;
      i++;
    }
    const bodyEnd = i;
    const endLine = VERSE_END_RE.test(lines[i] ?? "") ? i : bodyEnd - 1;
    verses.push({ startLine, endLine, bodyStart, bodyEnd });
    if (VERSE_END_RE.test(lines[i] ?? "")) i++;
  }
  return verses;
}

/** Strip chord markers; keep lyric / other text. */
export function stripChords(line: string): string {
  return line.replace(CHORD_TOKEN_RE, "");
}

export function parseChordLine(line: string): {
  lyrics: string;
  anchors: ChordAnchor[];
} {
  const anchors: ChordAnchor[] = [];
  let lyrics = "";
  let last = 0;
  CHORD_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHORD_TOKEN_RE.exec(line))) {
    lyrics += line.slice(last, m.index);
    anchors.push({ chord: m[1] ?? "", at: lyrics.length });
    last = m.index + m[0].length;
  }
  lyrics += line.slice(last);
  return { lyrics, anchors };
}

export function applyChordAnchors(
  targetLine: string,
  anchors: ChordAnchor[],
): string {
  const plain = stripChords(targetLine);
  if (anchors.length === 0) return plain;
  // Insert from the end so earlier indices stay valid.
  const sorted = [...anchors].sort((a, b) => b.at - a.at);
  let result = plain;
  for (const a of sorted) {
    const at = Math.min(Math.max(0, a.at), result.length);
    result = `${result.slice(0, at)}[${a.chord}]${result.slice(at)}`;
  }
  return result;
}

function contentLineIndices(body: string[]): number[] {
  const idxs: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const line = body[i]!;
    if (isBlank(line) || isStructuralLine(line)) continue;
    idxs.push(i);
  }
  return idxs;
}

function bodyHasChords(body: string[]): boolean {
  return body.some((l) => !isStructuralLine(l) && /\[[^\]]*\]/.test(l));
}

function applyChordsToBody(
  body: string[],
  sourceBody: string[],
): { body: string[]; chordsApplied: number } {
  const sourceIdxs = contentLineIndices(sourceBody);
  const targetIdxs = contentLineIndices(body);
  const out = [...body];
  let chordsApplied = 0;

  const n = Math.min(sourceIdxs.length, targetIdxs.length);
  for (let i = 0; i < n; i++) {
    const srcLine = sourceBody[sourceIdxs[i]!]!;
    const { anchors } = parseChordLine(srcLine);
    if (anchors.length === 0) continue;
    const tgtIdx = targetIdxs[i]!;
    const next = applyChordAnchors(out[tgtIdx]!, anchors);
    if (next !== out[tgtIdx]) {
      out[tgtIdx] = next;
      chordsApplied += anchors.length;
    }
  }
  return { body: out, chordsApplied };
}

export function propagateVerseChords(content: string): {
  content: string;
  unchanged: boolean;
  sourceVerseIndex: number;
  versesUpdated: number;
  chordsCopied: number;
} {
  const lines = content.split("\n");
  const verses = findVerses(lines);
  if (verses.length < 2) {
    return {
      content,
      unchanged: true,
      sourceVerseIndex: -1,
      versesUpdated: 0,
      chordsCopied: 0,
    };
  }

  const sourceIdx = verses.findIndex((v) =>
    bodyHasChords(lines.slice(v.bodyStart, v.bodyEnd)),
  );
  if (sourceIdx < 0) {
    return {
      content,
      unchanged: true,
      sourceVerseIndex: -1,
      versesUpdated: 0,
      chordsCopied: 0,
    };
  }

  const sourceBody = lines.slice(
    verses[sourceIdx]!.bodyStart,
    verses[sourceIdx]!.bodyEnd,
  );

  let versesUpdated = 0;
  let chordsCopied = 0;
  const next = [...lines];
  for (let vi = verses.length - 1; vi >= 0; vi--) {
    if (vi === sourceIdx) continue;
    const v = verses[vi]!;
    const body = next.slice(v.bodyStart, v.bodyEnd);
    const applied = applyChordsToBody(body, sourceBody);
    if (applied.body.join("\n") === body.join("\n")) continue;
    next.splice(v.bodyStart, v.bodyEnd - v.bodyStart, ...applied.body);
    versesUpdated++;
    chordsCopied += applied.chordsApplied;
  }

  const result = next.join("\n");
  return {
    content: result,
    unchanged: result === content,
    sourceVerseIndex: sourceIdx,
    versesUpdated,
    chordsCopied,
  };
}

/** Exported for tests — detect verse boundaries. */
export function __testFindVerses(content: string) {
  return findVerses(content.split("\n"));
}
