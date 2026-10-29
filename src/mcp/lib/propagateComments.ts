/**
 * Propagate ChordPro performance notes (`{c:}`, `{ci:}`, `{cb:}`) from the
 * first verse onto later verses at the same relative lyric/chord line slots.
 * Does not invent new notes — only copies existing directives.
 */

const COMMENT_RE = /^\s*\{(c|ci|cb|comment|comment_italic|comment_box)\s*:/i;
const VERSE_START_RE = /^\s*\{(?:start_of_verse|verse)(?:\s*:|\s*\}|\s*$)/i;
const VERSE_END_RE = /^\s*\{end_of_verse\s*\}/i;
const SECTION_START_RE =
  /^\s*\{(?:start_of_(?:chorus|bridge|tab|grid|version)|chorus|bridge)\b/i;
const SECTION_END_RE =
  /^\s*\{end_of_(?:chorus|bridge|tab|grid|version|verse)\s*\}/i;

type CommentPlacement = {
  /** Index among non-comment content lines in the verse body (0-based). */
  beforeContentIndex: number;
  /** Full source line including the directive. */
  line: string;
};

type VerseRange = {
  startLine: number;
  endLine: number;
  bodyStart: number;
  bodyEnd: number;
};

function isCommentLine(line: string): boolean {
  return COMMENT_RE.test(line);
}

function isBlank(line: string): boolean {
  return line.trim() === "";
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

function extractPlacements(body: string[]): CommentPlacement[] {
  const placements: CommentPlacement[] = [];
  let contentIndex = 0;
  const pending: string[] = [];

  for (const line of body) {
    if (isCommentLine(line)) {
      pending.push(line);
      continue;
    }
    if (isBlank(line)) {
      // Keep blank lines as content slots so relative spacing stays stable
      // when comments sit between blank separators — but don't attach pending
      // to blanks; flush onto the next real content line instead.
      continue;
    }
    for (const comment of pending) {
      placements.push({ beforeContentIndex: contentIndex, line: comment });
    }
    pending.length = 0;
    contentIndex++;
  }
  // Trailing comments after last lyric line
  for (const comment of pending) {
    placements.push({ beforeContentIndex: contentIndex, line: comment });
  }
  return placements;
}

function bodyHasComments(body: string[]): boolean {
  return body.some(isCommentLine);
}

function applyPlacements(body: string[], placements: CommentPlacement[]): string[] {
  if (placements.length === 0) return body;
  // Strip existing comments so we don't double-apply when re-running.
  const withoutComments = body.filter((l) => !isCommentLine(l));
  const out: string[] = [];
  let contentIndex = 0;
  let placeIdx = 0;

  const flushFor = (idx: number) => {
    while (
      placeIdx < placements.length &&
      placements[placeIdx]!.beforeContentIndex === idx
    ) {
      out.push(placements[placeIdx]!.line);
      placeIdx++;
    }
  };

  for (const line of withoutComments) {
    if (isBlank(line)) {
      out.push(line);
      continue;
    }
    flushFor(contentIndex);
    out.push(line);
    contentIndex++;
  }
  flushFor(contentIndex);
  // Any remaining placements with higher index
  while (placeIdx < placements.length) {
    out.push(placements[placeIdx]!.line);
    placeIdx++;
  }
  return out;
}

export function propagateVerseComments(content: string): {
  content: string;
  unchanged: boolean;
  sourceVerseIndex: number;
  versesUpdated: number;
  commentsCopied: number;
} {
  const lines = content.split("\n");
  const verses = findVerses(lines);
  if (verses.length < 2) {
    return {
      content,
      unchanged: true,
      sourceVerseIndex: -1,
      versesUpdated: 0,
      commentsCopied: 0,
    };
  }

  // Prefer the first verse that already has comments as the template.
  let sourceIdx = verses.findIndex((v) =>
    bodyHasComments(lines.slice(v.bodyStart, v.bodyEnd)),
  );
  if (sourceIdx < 0) {
    return {
      content,
      unchanged: true,
      sourceVerseIndex: -1,
      versesUpdated: 0,
      commentsCopied: 0,
    };
  }

  const source = verses[sourceIdx]!;
  const placements = extractPlacements(
    lines.slice(source.bodyStart, source.bodyEnd),
  );
  if (placements.length === 0) {
    return {
      content,
      unchanged: true,
      sourceVerseIndex: sourceIdx,
      versesUpdated: 0,
      commentsCopied: 0,
    };
  }

  // Rebuild from the end so line indices stay valid.
  let versesUpdated = 0;
  const next = [...lines];
  for (let vi = verses.length - 1; vi >= 0; vi--) {
    if (vi === sourceIdx) continue;
    const v = verses[vi]!;
    const body = next.slice(v.bodyStart, v.bodyEnd);
    const updated = applyPlacements(body, placements);
    if (updated.join("\n") === body.join("\n")) continue;
    next.splice(v.bodyStart, v.bodyEnd - v.bodyStart, ...updated);
    versesUpdated++;
  }

  const result = next.join("\n");
  return {
    content: result,
    unchanged: result === content,
    sourceVerseIndex: sourceIdx,
    versesUpdated,
    commentsCopied: placements.length,
  };
}

/** Exported for tests — detect verse boundaries. */
export function __testFindVerses(content: string) {
  return findVerses(content.split("\n"));
}
