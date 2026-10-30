/**
 * ChordPro-aware lyric search helpers.
 * Strip chord markers and most directives so queries like
 * "Pois só Tu és o Deus eterno" match "Pois [D9]só Tu és o [C#m]Deus eterno".
 */

const CHORD_TOKEN_RE = /\[[^\]]*]/g;
const DIRECTIVE_RE = /\{[^}]*\}/g;
const WS_RE = /\s+/g;

/** Plain lyrics for matching (lowercase, collapsed whitespace). */
export function stripChordProForSearch(content: string): string {
  return content
    .replace(DIRECTIVE_RE, " ")
    .replace(CHORD_TOKEN_RE, "")
    .replace(WS_RE, " ")
    .trim()
    .toLowerCase();
}

export function normalizeLyricQuery(query: string): string {
  return query.replace(WS_RE, " ").trim().toLowerCase();
}

/** True if plain lyrics contain the query (chord/directive-insensitive). */
export function lyricsMatchQuery(content: string, query: string): boolean {
  const q = normalizeLyricQuery(query);
  if (!q) return false;
  return stripChordProForSearch(content).includes(q);
}
