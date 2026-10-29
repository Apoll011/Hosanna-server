---
name: chordpro-directives-variants
description: Explain and correctly use Hosanna ChordPro directives, comment styles, and named variations with accurate support levels.
---

# Directives and variations

## Goal

Give accurate explanations and edits based on what Hosanna **actually** implements — not a generic ChordPro wiki. Always distinguish parsed vs formatter-only vs unsupported.

## When to use

- Prompt `songs.explain_chordpro` or `songs.arrange`
- User asks “how does X work in Hosanna?”
- Before using uncommon directives in create/edit flows

## Read / call

1. Tool `chordpro.directives` (with or without `name`)
2. Resource `hosanna://chordpro/features`
3. Resource `hosanna://chordpro/guide`
4. Examples: `hosanna://chordpro/examples/variants`, `…/grids`, `…/valid`

## Support levels

| Level | Meaning | How to talk about it |
|-------|---------|----------------------|
| `parsed` | First-class in parser/transforms | Safe to recommend and use |
| `formatter-only` | Known to formatter; not special in parser/renderer | Mention as limited / not fully supported |
| `implemented` / `partial` / `not_implemented` | Feature matrix | Be explicit about gaps |

## Core structure (parsed)

- Sections: `start_of_verse` / `chorus` / `bridge` (+ end tags) or shorthand `{verse}`, `{chorus}`, `{bridge}`
- `{chorus}` alone recalls the previous chorus body
- `{repeat}` marks repeats
- Tabs: `start_of_tab`…`end_of_tab`
- Grids: `start_of_grid`…`end_of_grid` with `|`, `||`, `|:`, `:|`

## Metadata (parsed)

`title`, `subtitle`, `artist`, `key`, `original_key`, `capo`, `tempo`, `time`, `duration`, `song_number`, `youtube`, `ccli`, …

Unknown `{name: value}` becomes camelCased metadata — fine for extras, but prefer documented names.

Hosanna-specific of note: `duration`, `song_number`, `youtube`.

## Comments and styles (parsed)

```chordpro
{c: Softly}
{c: Watch the pickup|warning}
{ci: subtle dynamic}
{cb: boxed note}
```

Style suffixes: `|style` or `|style=name`. Preserve them when editing. The TypeScript renderer honors styles.

## Variations / versions (parsed — often under-documented elsewhere)

```chordpro
{title: Amazing Grace}
{key: G}
[G]Amazing grace

{start_of_version: Acoustic}
{key: C}
[C]Amazing grace
{end_of_version}
```

Rules:

- Variant ids are stable slugs (`Acoustic` → `acoustic`)
- Metadata inherits from the default; variants may override (e.g. key)
- Preview/select via `selectVariant` / Studio variant dropdown — not a separate DB field
- Nested or unclosed version blocks are errors — fix structure, don’t delete lyric content inside

Example resource: `hosanna://chordpro/examples/variants`.

## Inline chords and timings

```chordpro
[G]Hello [Am@2x]world
```

`@Nx` timings are preserved by source-preserving transpose (`chordpro.transpose`).

## Not fully supported — be honest

| Feature | Reality |
|---------|---------|
| `{define}` / official chord defs | Formatter-only; use instrument registry in clients |
| Fonts, colors, `new_page`, `column_break` | Not applied by Hosanna rendering |
| Full AST → text serializer | Partial (`buildChordProText` is metadata + raw body only) |
| `start_of_part` | Prefer verse/chorus/bridge |

When arranging, if the user asks for unsupported behavior, say so and propose the closest supported approach.

## Explaining a directive

1. `chordpro.directives` with `name` (aliases work, e.g. `t`, `soc`).
2. Give a short description, an example, and the support level.
3. Mention Hosanna-specific behavior when `hosannaSpecific` is true.

## Done when

- Answer matches the capability manifest / guide
- Limitations are stated clearly
- Examples are copy-pasteable ChordPro that Hosanna can parse
