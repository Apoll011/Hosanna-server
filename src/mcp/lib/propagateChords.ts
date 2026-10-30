/**
 * Chord propagation: reuse chords from a chorded block on later blocks of the
 * same song. Never invents chords.
 *
 * Chords are anchored to WORDS / SYLLABLES (not raw character offsets), so
 * verses with different lyrics still land on the matching word or syllable.
 * Lines that already have chords are never touched.
 *
 * The result is a DRAFT: every changed line is reported in `review` with a
 * confidence, and callers (the AI) are expected to read it, fix any line that
 * is marked `check` and only then propose the final content.
 */

const COMMENT_RE = /^\s*\{(c|ci|cb|comment|comment_italic|comment_box)\s*:/i;
const DIRECTIVE_RE = /^\s*\{[^}]+\}\s*$/;
const DIRECTIVE_NAME_RE = /^\s*\{\s*([a-z_]+)\s*(?::[^}]*)?\}\s*$/i;
const CHORD_TOKEN_RE = /\[([^\]]*)\]/g;
const HAS_CHORD_RE = /\[[^\]]*\]/;

type BlockKind = "verse" | "chorus" | "bridge" | "stanza";

const START: Record<string, BlockKind> = {
  start_of_verse: "verse",
  sov: "verse",
  verse: "verse",
  v: "verse",
  start_of_chorus: "chorus",
  soc: "chorus",
  start_of_bridge: "bridge",
  sob: "bridge",
  bridge: "bridge",
  b: "bridge",
};
const END = new Set([
  "end_of_verse",
  "eov",
  "end_of_chorus",
  "eoc",
  "end_of_bridge",
  "eob",
]);
/** Blocks whose content must never be touched. */
const OPAQUE_START = new Set([
  "start_of_tab",
  "sot",
  "start_of_grid",
  "sog",
  "start_of_part",
]);
const OPAQUE_END = new Set([
  "end_of_tab",
  "eot",
  "end_of_grid",
  "eog",
  "end_of_part",
]);
const VERSION_START = new Set(["start_of_version", "sov_ver"]);
const VERSION_END = new Set(["end_of_version", "eov_ver"]);

export type ChordAnchor = {
  /** Chord text inside brackets (may include timing, e.g. Am@2x). */
  chord: string;
  /** Index into the lyric-only string where this chord sits. */
  at: number;
};

export type PropagateBlock = {
  kind: BlockKind;
  /** 1-based index among blocks of this kind (document order). */
  ordinal: number;
  /** First/last+1 line index of the body. */
  bodyStart: number;
  bodyEnd: number;
};

export type PropagateReviewEntry = {
  /** e.g. "verse 2" */
  block: string;
  /** 1-based line number in the draft content. */
  line: number;
  source: string;
  result: string;
  mode: "exact" | "aligned";
  /** `check` = placement is a guess; the AI must verify / fix it. */
  confidence: "high" | "check";
  reason?: string;
};

export type PropagateResult = {
  content: string;
  unchanged: boolean;
  /** 0-based index among verse-like blocks of the first chorded verse (-1 none). */
  sourceVerseIndex: number;
  versesUpdated: number;
  chordsCopied: number;
  /** Every line that received chords. */
  review: PropagateReviewEntry[];
  /** Lines in `review` flagged `check`. */
  needsReview: number;
  /** Lines that could NOT be filled (no matching source line, etc.). */
  skipped: Array<{ block: string; line: number; text: string; reason: string }>;
  notes: string[];
  next: string;
};

/* ------------------------------ line helpers ------------------------------ */

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function isStructuralLine(line: string): boolean {
  return COMMENT_RE.test(line) || DIRECTIVE_RE.test(line);
}

function directiveName(line: string): string | null {
  const m = DIRECTIVE_NAME_RE.exec(line);
  return m ? m[1]!.toLowerCase() : null;
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

/** Insert anchors into a plain lyric line (existing chords are stripped first). */
export function applyChordAnchors(
  targetLine: string,
  anchors: ChordAnchor[],
): string {
  const plain = stripChords(targetLine);
  if (anchors.length === 0) return plain;
  // Insert from the end (stable for equal positions) so indices stay valid.
  const indexed = anchors.map((a, i) => ({ a, i }));
  indexed.sort((x, y) => y.a.at - x.a.at || y.i - x.i);
  let result = plain;
  for (const { a } of indexed) {
    const at = Math.min(Math.max(0, a.at), result.length);
    result = `${result.slice(0, at)}[${a.chord}]${result.slice(at)}`;
  }
  return result;
}

function contentLineIndices(lines: string[], start: number, end: number) {
  const idxs: number[] = [];
  for (let i = start; i < end; i++) {
    const line = lines[i]!;
    if (isBlank(line) || isStructuralLine(line)) continue;
    idxs.push(i);
  }
  return idxs;
}

function normalizeLyrics(line: string): string {
  return stripChords(line)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/* --------------------------- word / syllable model -------------------------- */

type Word = { start: number; end: number };

function wordsOf(text: string): Word[] {
  const out: Word[] = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

const VOWEL = /[aeiouyáàâãäéèêëíìîïóòôõöúùûüæœ]/i;
const GOOD_ONSET = new Set([
  "ch",
  "lh",
  "nh",
  "qu",
  "gu",
  "pr",
  "br",
  "tr",
  "dr",
  "cr",
  "gr",
  "fr",
  "pl",
  "bl",
  "cl",
  "fl",
  "gl",
  "sh",
  "th",
  "ph",
  "st",
]);

/**
 * Heuristic syllable start offsets for one word (works well enough for
 * Portuguese / Spanish / English lyrics; always includes 0).
 */
export function syllableStarts(word: string): number[] {
  const chars = [...word];
  const starts = [0];
  let i = 0;
  // skip leading consonants (onset of syllable 0)
  while (i < chars.length && !VOWEL.test(chars[i]!)) i++;
  while (i < chars.length) {
    // consume vowel group
    while (i < chars.length && VOWEL.test(chars[i]!)) i++;
    // consonant cluster
    const clusterStart = i;
    while (i < chars.length && !VOWEL.test(chars[i]!)) i++;
    if (i >= chars.length) break; // trailing consonants belong to last syllable
    const n = i - clusterStart;
    let boundary = clusterStart;
    if (n >= 2) {
      const lastTwo = chars
        .slice(i - 2, i)
        .join("")
        .toLowerCase();
      boundary = GOOD_ONSET.has(lastTwo) ? i - 2 : i - 1;
    } else if (n === 1) {
      boundary = clusterStart;
    }
    starts.push(boundary);
  }
  // Character offsets (UTF-16) from code-point offsets.
  const unit = (cp: number) => chars.slice(0, cp).join("").length;
  return starts.map(unit);
}

function syllableIndex(starts: number[], offset: number): number {
  let k = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]! <= offset) k = i;
  }
  return k;
}

type AlignOutcome = {
  anchors: ChordAnchor[];
  confidence: "high" | "check";
  reason?: string;
};

function alignAnchors(
  srcLyrics: string,
  anchors: ChordAnchor[],
  tgt: string,
): AlignOutcome | null {
  const sw = wordsOf(srcLyrics);
  const tw = wordsOf(tgt);
  if (sw.length === 0 || tw.length === 0) return null;

  const reasons = new Set<string>();
  const countGap =
    Math.abs(sw.length - tw.length) / Math.max(sw.length, tw.length);
  if (sw.length !== tw.length) {
    reasons.add(`word count differs (${sw.length} → ${tw.length})`);
  }
  if (countGap > 0.4) reasons.add("lines have very different lengths");

  const mapped: ChordAnchor[] = [];
  const tgtEnd = tgt.trimEnd().length;

  for (const a of anchors) {
    // Which source word does this chord belong to?
    let wi = sw.findIndex((w) => a.at < w.end);
    let inWord = 0;
    let trailing = false;
    if (wi < 0) {
      trailing = true;
      wi = sw.length - 1;
    } else if (a.at > sw[wi]!.start) {
      inWord = a.at - sw[wi]!.start;
    }

    if (trailing) {
      mapped.push({ chord: a.chord, at: tgtEnd });
      continue;
    }

    const twi =
      sw.length === tw.length
        ? wi
        : sw.length > 1
          ? Math.round((wi * (tw.length - 1)) / (sw.length - 1))
          : 0;
    const srcWord = srcLyrics.slice(sw[wi]!.start, sw[wi]!.end);
    const tgtWord = tgt.slice(tw[twi]!.start, tw[twi]!.end);

    if (inWord === 0) {
      mapped.push({ chord: a.chord, at: tw[twi]!.start });
      continue;
    }

    const ss = syllableStarts(srcWord);
    const ts = syllableStarts(tgtWord);
    const k = syllableIndex(ss, inWord);
    if (ss[k] !== inWord) reasons.add("chord sits mid-syllable in the source");
    if (ss.length !== ts.length) {
      reasons.add(`syllable count differs ("${srcWord}" → "${tgtWord}")`);
    }
    const tk = Math.min(k, ts.length - 1);
    mapped.push({ chord: a.chord, at: tw[twi]!.start + ts[tk]! });
  }

  // Two chords collapsing onto the same spot is almost always wrong.
  for (let i = 1; i < mapped.length; i++) {
    if (
      mapped[i]!.at === mapped[i - 1]!.at &&
      anchors[i]!.at !== anchors[i - 1]!.at
    ) {
      reasons.add("two chords landed on the same position");
    }
  }

  return {
    anchors: mapped,
    confidence: reasons.size === 0 ? "high" : "check",
    reason: reasons.size ? [...reasons].join("; ") : undefined,
  };
}

/* ------------------------------ block detection ----------------------------- */

export function findBlocks(lines: string[]): PropagateBlock[] {
  const blocks: PropagateBlock[] = [];
  const counts: Record<BlockKind, number> = {
    verse: 0,
    chorus: 0,
    bridge: 0,
    stanza: 0,
  };
  const push = (kind: BlockKind, bodyStart: number, bodyEnd: number) => {
    counts[kind]++;
    blocks.push({ kind, ordinal: counts[kind], bodyStart, bodyEnd });
  };

  let open: { kind: BlockKind; bodyStart: number } | null = null;
  let stanzaStart = -1;
  let opaque = 0;
  let inVersion = false;

  const closeOpen = (end: number) => {
    if (open) push(open.kind, open.bodyStart, end);
    open = null;
  };
  const closeStanza = (end: number) => {
    if (stanzaStart >= 0 && !inVersion) push("stanza", stanzaStart, end);
    stanzaStart = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const name =
      isStructuralLine(line) && !COMMENT_RE.test(line)
        ? directiveName(line)
        : null;

    if (name && OPAQUE_START.has(name)) {
      closeOpen(i);
      closeStanza(i);
      opaque++;
      continue;
    }
    if (name && OPAQUE_END.has(name)) {
      opaque = Math.max(0, opaque - 1);
      continue;
    }
    if (opaque > 0) continue;

    if (name && VERSION_START.has(name)) {
      closeOpen(i);
      closeStanza(i);
      inVersion = true;
      continue;
    }
    if (name && VERSION_END.has(name)) {
      inVersion = false;
      continue;
    }

    if (name && (name === "chorus" || name === "ch")) {
      // Recall directive: no body of its own.
      closeOpen(i);
      closeStanza(i);
      continue;
    }

    if (name && name in START) {
      closeOpen(i);
      closeStanza(i);
      if (!inVersion) open = { kind: START[name]!, bodyStart: i + 1 };
      else open = null;
      continue;
    }
    if (name && END.has(name)) {
      closeOpen(i);
      continue;
    }

    if (open || inVersion) continue;

    // Implicit stanza outside any explicit block.
    if (isBlank(line)) {
      closeStanza(i);
    } else if (!isStructuralLine(line) && stanzaStart < 0) {
      stanzaStart = i;
    }
  }
  closeOpen(lines.length);
  closeStanza(lines.length);
  return blocks;
}

function blockLabel(b: PropagateBlock): string {
  return b.kind === "stanza" ? `stanza ${b.ordinal}` : `${b.kind} ${b.ordinal}`;
}

function blockHasChords(lines: string[], b: PropagateBlock): boolean {
  return contentLineIndices(lines, b.bodyStart, b.bodyEnd).some((i) =>
    HAS_CHORD_RE.test(lines[i]!),
  );
}

function fullyChorded(lines: string[], b: PropagateBlock): boolean {
  const idxs = contentLineIndices(lines, b.bodyStart, b.bodyEnd);
  return idxs.length > 0 && idxs.every((i) => HAS_CHORD_RE.test(lines[i]!));
}

function blockLyricsKey(lines: string[], b: PropagateBlock): string {
  return contentLineIndices(lines, b.bodyStart, b.bodyEnd)
    .map((i) => normalizeLyrics(lines[i]!))
    .join("\n");
}

/* ------------------------------- main routine ------------------------------- */

export function propagateVerseChords(content: string): PropagateResult {
  const lines = content.split("\n");
  const blocks = findBlocks(lines);
  const out = [...lines];
  const review: PropagateReviewEntry[] = [];
  const skipped: PropagateResult["skipped"] = [];
  const notes: string[] = [];
  const touchedBlocks = new Set<PropagateBlock>();
  let chordsCopied = 0;

  const verseLike = blocks.filter(
    (b) => b.kind === "verse" || b.kind === "stanza",
  );
  const chorded = (b: PropagateBlock) => blockHasChords(lines, b);
  const sourceVerse = verseLike.find(chorded);
  const sourceVerseIndex = sourceVerse ? verseLike.indexOf(sourceVerse) : -1;

  const fillLine = (
    block: PropagateBlock,
    srcIdx: number,
    tgtIdx: number,
    allowAligned: boolean,
  ): void => {
    const srcLine = lines[srcIdx]!;
    const tgtLine = lines[tgtIdx]!;
    if (HAS_CHORD_RE.test(tgtLine)) return; // never overwrite existing chords
    const { lyrics, anchors } = parseChordLine(srcLine);
    if (anchors.length === 0) return;
    const tgtPlain = tgtLine;

    let result: string;
    let mode: "exact" | "aligned";
    let confidence: "high" | "check" = "high";
    let reason: string | undefined;

    if (lyrics === tgtPlain) {
      result = applyChordAnchors(tgtPlain, anchors);
      mode = "exact";
    } else if (!allowAligned) {
      skipped.push({
        block: blockLabel(block),
        line: tgtIdx + 1,
        text: tgtLine,
        reason: "lyrics differ from the source line",
      });
      return;
    } else {
      const aligned = alignAnchors(lyrics, anchors, tgtPlain);
      if (!aligned) {
        skipped.push({
          block: blockLabel(block),
          line: tgtIdx + 1,
          text: tgtLine,
          reason: "no words to anchor chords to",
        });
        return;
      }
      result = applyChordAnchors(tgtPlain, aligned.anchors);
      mode = "aligned";
      confidence = aligned.confidence;
      reason = aligned.reason;
    }
    if (result === tgtLine) return;
    out[tgtIdx] = result;
    chordsCopied += anchors.length;
    touchedBlocks.add(block);
    review.push({
      block: blockLabel(block),
      line: tgtIdx + 1,
      source: srcLine,
      result,
      mode,
      confidence,
      ...(reason ? { reason } : {}),
    });
  };

  const fillBlock = (
    target: PropagateBlock,
    source: PropagateBlock,
    allowAligned: boolean,
  ) => {
    const srcIdxs = contentLineIndices(lines, source.bodyStart, source.bodyEnd);
    const tgtIdxs = contentLineIndices(lines, target.bodyStart, target.bodyEnd);
    tgtIdxs.forEach((tgtIdx, i) => {
      if (HAS_CHORD_RE.test(lines[tgtIdx]!)) return;
      const srcIdx = srcIdxs[i];
      if (srcIdx === undefined) {
        skipped.push({
          block: blockLabel(target),
          line: tgtIdx + 1,
          text: lines[tgtIdx]!,
          reason: "source block has no matching line",
        });
        return;
      }
      if (!HAS_CHORD_RE.test(lines[srcIdx]!)) {
        skipped.push({
          block: blockLabel(target),
          line: tgtIdx + 1,
          text: lines[tgtIdx]!,
          reason: "source line has no chords",
        });
        return;
      }
      fillLine(target, srcIdx, tgtIdx, allowAligned);
    });
  };

  const chordedBlocks = blocks.filter(chorded);
  const done = new Set<PropagateBlock>();

  // Pass 1 — identical lyrics anywhere (typically repeated choruses): exact copy.
  for (const target of blocks) {
    if (fullyChorded(lines, target)) continue;
    const key = blockLyricsKey(lines, target);
    if (!key) continue;
    const source = chordedBlocks.find(
      (s) => s !== target && chorded(s) && blockLyricsKey(lines, s) === key,
    );
    if (source) {
      fillBlock(target, source, true);
      done.add(target);
    }
  }

  // Pass 2 — verses/stanzas: align the first chorded verse onto the others.
  if (sourceVerse) {
    for (const target of verseLike) {
      if (
        target === sourceVerse ||
        done.has(target) ||
        fullyChorded(lines, target)
      )
        continue;
      fillBlock(target, sourceVerse, true);
      done.add(target);
    }
  }

  // Pass 3 — other choruses with different words: only when there is a single
  // chorded chorus to learn from (otherwise it would be a guess).
  const chorusSources = blocks.filter((b) => b.kind === "chorus" && chorded(b));
  if (chorusSources.length === 1) {
    for (const target of blocks) {
      if (
        target.kind !== "chorus" ||
        done.has(target) ||
        target === chorusSources[0] ||
        fullyChorded(lines, target)
      )
        continue;
      fillBlock(target, chorusSources[0]!, true);
      done.add(target);
    }
  }

  // Bridges / leftovers with unmatched lyrics are reported, not guessed.
  for (const b of blocks) {
    if (done.has(b) || chorded(b) || fullyChorded(lines, b)) continue;
    if (contentLineIndices(lines, b.bodyStart, b.bodyEnd).length === 0)
      continue;
    notes.push(
      `${blockLabel(b)} (line ${b.bodyStart + 1}) has no chords and no matching source — write its chords yourself or ask the user.`,
    );
  }

  // Verbatim repeated choruses: suggest {chorus}.
  const seenChoruses = new Map<string, PropagateBlock>();
  for (const b of blocks.filter((x) => x.kind === "chorus")) {
    const key = lines.slice(b.bodyStart, b.bodyEnd).join("\n").trim();
    if (!key) continue;
    const first = seenChoruses.get(key);
    if (first) {
      notes.push(
        `${blockLabel(b)} repeats ${blockLabel(first)} verbatim — you may replace it with {chorus} (only if the user wants a recall instead of a full copy).`,
      );
    } else {
      seenChoruses.set(key, b);
    }
  }

  const result = out.join("\n");
  const needsReview = review.filter((r) => r.confidence === "check").length;

  if (!chordedBlocks.length) {
    notes.push(
      "No block in this song has chords yet — there is nothing to propagate.",
    );
  }

  return {
    content: result,
    unchanged: result === content,
    sourceVerseIndex,
    versesUpdated: touchedBlocks.size,
    chordsCopied,
    review,
    needsReview,
    skipped,
    notes,
    next: "This is a DRAFT, not a proposal. Read `review` and `skipped`: re-place any chord marked `check` (put it on the right word/syllable yourself), fill `skipped` lines if the chords are obvious from the source, then submit ONE final edit with songs_propose_edit. Never submit the raw draft unchecked.",
  };
}

/** Exported for tests — detect block boundaries. */
export function __testFindVerses(content: string) {
  return findBlocks(content.split("\n"));
}
