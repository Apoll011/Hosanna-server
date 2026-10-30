/**
 * Machine-readable ChordPro capability manifest for Hosanna.
 *
 * Support levels:
 * - parsed: structurally handled by the parser / transform pipeline
 * - formatter-only: recognized by the formatter (normalize/warn) but not
 *   specially handled by the parser beyond generic metadata storage
 * - unsupported: known ChordPro concepts that Hosanna does not implement
 */

export type DirectiveSupportLevel =
  | "parsed"
  | "formatter-only"
  | "unsupported";

export type FeatureSupportLevel =
  | "implemented"
  | "partial"
  | "not_implemented";

export interface ChordProDirectiveCapability {
  name: string;
  aliases?: string[];
  category: "metadata" | "comment" | "structure" | "notation" | "layout" | "other";
  support: DirectiveSupportLevel;
  description: string;
  hosannaSpecific?: boolean;
  example?: string;
}

export interface ChordProFeatureCapability {
  id: string;
  name: string;
  support: FeatureSupportLevel;
  description: string;
}

export interface ChordProCapabilityManifest {
  version: string;
  directives: ChordProDirectiveCapability[];
  features: ChordProFeatureCapability[];
}

const DIRECTIVES: ChordProDirectiveCapability[] = [
  {
    name: "title",
    aliases: ["t"],
    category: "metadata",
    support: "parsed",
    description: "Song title.",
    example: "{title: Amazing Grace}",
  },
  {
    name: "subtitle",
    aliases: ["st"],
    category: "metadata",
    support: "parsed",
    description: "Subtitle or secondary title.",
  },
  {
    name: "artist",
    aliases: ["a"],
    category: "metadata",
    support: "parsed",
    description: "Performing artist.",
  },
  {
    name: "composer",
    category: "metadata",
    support: "parsed",
    description: "Stored as metadata (generic camelCase fallback for unknown names also applies).",
  },
  {
    name: "lyricist",
    category: "metadata",
    support: "parsed",
    description: "Stored as free-form metadata.",
  },
  {
    name: "key",
    aliases: ["k"],
    category: "metadata",
    support: "parsed",
    description: "Declared musical key. Used by transpose and analysis.",
    example: "{key: G}",
  },
  {
    name: "original_key",
    category: "metadata",
    support: "parsed",
    description: "Original key before transposition.",
  },
  {
    name: "capo",
    category: "metadata",
    support: "parsed",
    description: "Capo position. Numeric values are linted.",
  },
  {
    name: "tempo",
    category: "metadata",
    support: "parsed",
    description: "Tempo in BPM. Numeric values are linted.",
  },
  {
    name: "time",
    aliases: ["time_signature", "timesignature"],
    category: "metadata",
    support: "parsed",
    description: "Time signature.",
  },
  {
    name: "duration",
    category: "metadata",
    support: "parsed",
    description: "Song duration (Hosanna uses this for service planning defaults).",
    hosannaSpecific: true,
  },
  {
    name: "song_number",
    category: "metadata",
    support: "parsed",
    description: "Catalog / hymnal number. Synced to song.song_number in Hosanna.",
    hosannaSpecific: true,
  },
  {
    name: "ccli",
    category: "metadata",
    support: "parsed",
    description: "CCLI song number stored as metadata.",
  },
  {
    name: "youtube",
    category: "metadata",
    support: "parsed",
    description: "YouTube URL or video id for reference playback.",
    hosannaSpecific: true,
  },
  {
    name: "comment",
    aliases: ["c"],
    category: "comment",
    support: "parsed",
    description:
      "Inline comment. Optional style suffix via |style or |style=name (e.g. |warning).",
    example: "{c: Softly|warning}",
  },
  {
    name: "comment_italic",
    aliases: ["ci"],
    category: "comment",
    support: "parsed",
    description: "Italic comment line.",
  },
  {
    name: "comment_box",
    aliases: ["cb"],
    category: "comment",
    support: "parsed",
    description: "Boxed comment line.",
  },
  {
    name: "start_of_verse",
    aliases: ["sov"],
    category: "structure",
    support: "parsed",
    description: "Begin a verse section.",
  },
  {
    name: "end_of_verse",
    aliases: ["eov"],
    category: "structure",
    support: "parsed",
    description: "End a verse section.",
  },
  {
    name: "start_of_chorus",
    aliases: ["soc"],
    category: "structure",
    support: "parsed",
    description: "Begin a chorus section.",
  },
  {
    name: "end_of_chorus",
    aliases: ["eoc"],
    category: "structure",
    support: "parsed",
    description: "End a chorus section.",
  },
  {
    name: "start_of_bridge",
    aliases: ["sob"],
    category: "structure",
    support: "parsed",
    description: "Begin a bridge section.",
  },
  {
    name: "end_of_bridge",
    aliases: ["eob"],
    category: "structure",
    support: "parsed",
    description: "End a bridge section.",
  },
  {
    name: "chorus",
    aliases: ["ch"],
    category: "structure",
    support: "parsed",
    description: "Recall the previous chorus body.",
  },
  {
    name: "verse",
    aliases: ["v"],
    category: "structure",
    support: "parsed",
    description: "Shorthand verse marker.",
  },
  {
    name: "bridge",
    aliases: ["b"],
    category: "structure",
    support: "parsed",
    description: "Shorthand bridge marker.",
  },
  {
    name: "repeat",
    aliases: ["re"],
    category: "structure",
    support: "parsed",
    description: "Repeat marker.",
  },
  {
    name: "start_of_tab",
    aliases: ["sot"],
    category: "notation",
    support: "parsed",
    description: "Begin a tablature block.",
  },
  {
    name: "end_of_tab",
    aliases: ["eot"],
    category: "notation",
    support: "parsed",
    description: "End a tablature block.",
  },
  {
    name: "start_of_grid",
    aliases: ["sog"],
    category: "notation",
    support: "parsed",
    description: "Begin a chord grid / measure block.",
  },
  {
    name: "end_of_grid",
    aliases: ["eog"],
    category: "notation",
    support: "parsed",
    description: "End a chord grid block.",
  },
  {
    name: "start_of_version",
    aliases: ["sov_ver"],
    category: "structure",
    support: "parsed",
    description:
      "Begin a named arrangement variant. Body inherits default metadata; select with selectVariant(id).",
    example: "{start_of_version: Acoustic}",
  },
  {
    name: "end_of_version",
    aliases: ["eov_ver"],
    category: "structure",
    support: "parsed",
    description: "End a named arrangement variant.",
  },
  {
    name: "new_song",
    aliases: ["ns"],
    category: "structure",
    support: "parsed",
    description: "Marker separating multiple songs in one document.",
  },
  {
    name: "start_of_part",
    category: "structure",
    support: "formatter-only",
    description:
      "Emitted by some converters; parser treats unknown section-like names as generic metadata unless they match verse/chorus/bridge/tab/grid.",
  },
  {
    name: "end_of_part",
    category: "structure",
    support: "formatter-only",
    description: "Formatter-known; not a first-class parser section type.",
  },
  {
    name: "new_page",
    aliases: ["np"],
    category: "layout",
    support: "formatter-only",
    description: "Recognized by the formatter; not used by Hosanna rendering.",
  },
  {
    name: "column_break",
    category: "layout",
    support: "formatter-only",
    description: "Recognized by the formatter; not used by Hosanna rendering.",
  },
  {
    name: "define",
    category: "notation",
    support: "formatter-only",
    description:
      "Official ChordPro chord definitions are not first-class in Hosanna; fingerings come from the instrument registry / chord dictionary.",
  },
  {
    name: "chord",
    category: "notation",
    support: "formatter-only",
    description: "Formatter-known; not specially parsed.",
  },
  {
    name: "textfont",
    category: "layout",
    support: "formatter-only",
    description: "Font/layout directives are not applied by Hosanna.",
  },
  {
    name: "textsize",
    category: "layout",
    support: "formatter-only",
    description: "Font/layout directives are not applied by Hosanna.",
  },
  {
    name: "chordfont",
    category: "layout",
    support: "formatter-only",
    description: "Font/layout directives are not applied by Hosanna.",
  },
];

const FEATURES: ChordProFeatureCapability[] = [
  {
    id: "inline_chords",
    name: "Inline chords",
    support: "implemented",
    description: "[G] lyrics with optional timing [Am@2x].",
  },
  {
    id: "sections",
    name: "Verse / chorus / bridge sections",
    support: "implemented",
    description: "Block and shorthand section markers.",
  },
  {
    id: "variants",
    name: "Named versions / variations",
    support: "implemented",
    description:
      "{start_of_version}…{end_of_version} with inheritance, slug ids, and selectVariant().",
  },
  {
    id: "grids",
    name: "Chord grids / measures",
    support: "implemented",
    description: "Grid blocks with |, ||, |:, :| barlines.",
  },
  {
    id: "tabs",
    name: "Tablature blocks",
    support: "implemented",
    description: "start_of_tab / end_of_tab.",
  },
  {
    id: "comment_styles",
    name: "Comment style suffixes",
    support: "implemented",
    description: "{c: text|warning} and |style=name (TypeScript renderer).",
  },
  {
    id: "lint",
    name: "Lint / validation",
    support: "implemented",
    description: "lintChordPro reports unclosed braces, bad chords, block mismatches, etc.",
  },
  {
    id: "format",
    name: "Formatter",
    support: "implemented",
    description: "formatChordPro normalizes directives and chord spelling.",
  },
  {
    id: "transpose_ast",
    name: "AST transpose pipeline",
    support: "implemented",
    description: "parseChordPro(source).transpose(n) and related chainable ops.",
  },
  {
    id: "transpose_source",
    name: "Source-preserving transpose",
    support: "implemented",
    description:
      "transposeChordProSource rewrites chords and key directives without losing unrelated text.",
  },
  {
    id: "analyze_score",
    name: "Analyze and library score",
    support: "implemented",
    description: "analyze() and score() on SongAST.",
  },
  {
    id: "txt_convert",
    name: "TXT / UG / CifraClub conversion",
    support: "implemented",
    description: "convertToChordProDetailed / toChordPro / detectSourceFormat.",
  },
  {
    id: "ast_serialize",
    name: "Full AST → ChordPro serializer",
    support: "partial",
    description:
      "buildChordProText only rebuilds metadata header + raw body string; no full AST round-trip.",
  },
  {
    id: "chord_define",
    name: "Official {define} chord diagrams",
    support: "not_implemented",
    description: "Use instrument registry / chord dictionary instead.",
  },
  {
    id: "layout_directives",
    name: "Page/layout directives",
    support: "not_implemented",
    description: "new_page, column_break, fonts/colors are not applied.",
  },
];

/** Current capability manifest for Hosanna ChordPro. */
export function getChordProCapabilities(): ChordProCapabilityManifest {
  return {
    version: "1.7.0",
    directives: DIRECTIVES,
    features: FEATURES,
  };
}

/** Look up a single directive by name or alias (case-insensitive). */
export function explainChordProDirective(
  nameOrAlias: string,
): ChordProDirectiveCapability | undefined {
  const needle = nameOrAlias.trim().toLowerCase();
  return DIRECTIVES.find(
    (d) =>
      d.name === needle ||
      d.aliases?.some((a) => a.toLowerCase() === needle),
  );
}
