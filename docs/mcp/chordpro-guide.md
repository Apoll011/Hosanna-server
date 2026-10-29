# Hosanna ChordPro Guide

This guide documents ChordPro as **implemented by Hosanna** (`@hosanna/chordpro`). Support levels: **parsed** (first-class), **formatter-only** (recognized but not specially handled), **unsupported**.

Use MCP resource `hosanna://chordpro/directives` or tool `chordpro.directives` for the machine-readable manifest.

## Essentials

```chordpro
{title: Amazing Grace}
{artist: John Newton}
{key: G}
{duration: 4:30}

{start_of_verse}
[G]Amazing [C]grace, how [G]sweet the sound
{end_of_verse}

{start_of_chorus}
[C]I once was [G]lost
{end_of_chorus}
```

Essential metadata: `title`, `artist`, `key`, `duration`, `youtube`, `song_number` (Hosanna-specific fields marked below).

## Metadata directives (parsed)

| Directive    | Alias | Notes                               |
| ------------ | ----- | ----------------------------------- |
| title        | t     | Required for good library health    |
| subtitle     | st    |                                     |
| artist       | a     |                                     |
| key          | k     | Used by transpose / analysis        |
| original_key |       |                                     |
| capo         |       | Linted as numeric                   |
| tempo        |       | Linted as numeric                   |
| time         |       | Time signature                      |
| duration     |       | Hosanna — service planning defaults |
| song_number  |       | Hosanna — synced to song record     |
| youtube      |       | Hosanna — reference video           |
| ccli         |       | Stored as metadata                  |

Unknown `{name: value}` directives are stored as camelCased metadata.

## Structure

- Verse / chorus / bridge: `start_of_*` / `end_of_*` or shorthand `{verse}`, `{chorus}`, `{bridge}`
- `{chorus}` recalls the previous chorus body
- `{repeat}` marks a repeat
- Tabs: `start_of_tab` / `end_of_tab`
- Grids: `start_of_grid` / `end_of_grid` with `|`, `||`, `|:`, `:|`

## Variations (parsed)

Named arrangements live in version blocks:

```chordpro
{title: Amazing Grace}
{key: G}
[G]Amazing grace

{start_of_version: Acoustic}
{key: C}
[C]Amazing grace
{end_of_version}
```

- Variant ids are stable slugs (`Acoustic` → `acoustic`)
- Variant metadata inherits from the default and may override fields
- Select with `selectVariant(id)` in the transform pipeline or preview UI
- Nested / unclosed version blocks are recorded as parse errors

## Comments and styles (parsed)

```chordpro
{c: Softly}
{c: Watch timing|warning}
{ci: italic note}
{cb: boxed note}
```

Style suffixes use `|style` or `|style=name`. The TypeScript renderer honors styles; keep them when editing.

## Inline chords and timings

```chordpro
[G]Hello [Am@2x]world
```

`@Nx` timing annotations are preserved by source-preserving transpose.

## Transpose

- **AST:** `parseChordPro(source).transpose(n)` for analysis/preview
- **Source text (for saving):** `transposeChordProSource(source, { toKey: "A" })` or `{ semitones: 2 }` — rewrites chords and key directives without dropping lyrics/variants

## Validation

Use `lintChordPro` / MCP `chordpro.validate` for unclosed braces/brackets, block mismatches, empty/unknown chords, malformed timing, and numeric capo/tempo issues.

## Not fully supported

| Feature                                    | Level          | Notes                                                 |
| ------------------------------------------ | -------------- | ----------------------------------------------------- |
| `{define}` chord diagrams                  | formatter-only | Use instrument registry instead                       |
| Font / color / `new_page` / `column_break` | formatter-only | Not applied by Hosanna rendering                      |
| Full AST → ChordPro serializer             | partial        | `buildChordProText` only rebuilds metadata + raw body |
| Official `start_of_part` sections          | formatter-only | Prefer verse/chorus/bridge                            |

Do not invent unsupported constructs merely to match another ChordPro product.
