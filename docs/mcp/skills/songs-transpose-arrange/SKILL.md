---
name: songs-transpose-arrange
description: Transpose songs with source-preserving tools and arrange sections/variants within real Hosanna ChordPro capabilities.
---

# Transpose and arrange

## Goal

Change key or arrangement using Hosanna’s real ChordPro capabilities while preserving lyrics, structure, variants, and unrelated metadata.

## When to use

- Prompt `songs_transpose` or `songs_arrange`
- User asks for a different key, capo discussion, section order, or alternate version

## Read first

1. `hosanna://skills/hosanna-safe-data`
2. `hosanna://skills/chordpro-directives-variants`
3. `hosanna://chordpro/features`
4. For variants: `hosanna://chordpro/examples/variants`

## Transpose

### Preferred tool

`chordpro_transpose` with either:

- `toKey`: target key spelling (e.g. `"A"`, `"Bb"`)
- `semitones`: signed interval

This uses **source-preserving** rewrite: chords in `[…]` (including timings) and `{key:}` / `{original_key:}` update; lyrics, comments, version blocks, and unknown directives stay intact.

### Workflow

1. `songs_get`
2. Note current key from content or metadata
3. `chordpro_transpose` → inspect `content`, `semitones`, `fromKey`, `toKey`, `validation`
4. `songs_propose_edit` with transposed content
5. Present proposal; `songs_save` only after approval

### Preserve during transpose

- Lyrics and hyphenation
- Section markers and variants (bodies transpose; structure remains)
- Comments and style suffixes
- Non-key metadata (`title`, `artist`, `youtube`, …)

### Do not

- Manually regex-rewrite chords if `chordpro_transpose` is available
- Round-trip through AST serialization (no full serializer) for saveable text
- Change arrangement while “just transposing” unless asked

## Arrange

Supported arrangements:

- Add/reorder/rename verse, chorus, bridge sections
- `{chorus}` recall and `{repeat}`
- Grids and tabs when musically needed
- Named versions (`start_of_version` / `end_of_version`) for Acoustic / Capo / language variants
- Chord placement adjustments the user requested

Not first-class:

- `{define}` diagrams
- Page layout fonts/colors/`new_page`
- Inventing alternate lyrics for a “new arrangement”

### Arrange workflow

1. Confirm what “arrange” means (structure vs variant vs chord voicing).
2. Read features; refuse or reframe unsupported asks.
3. `songs_get` → edit → `songs_propose_edit` → validate → present → save after approval.

### Variants tip

Put shared default body outside versions; put only what differs inside `{start_of_version: Name}`…`{end_of_version}`. Override `{key:}` inside a version when that arrangement’s key differs.

## Capo note

Studio preview capo is often display-only. Persist capo with `{capo: N}` in content when the user wants it stored; do not confuse preview settings with library content.

## Done when

- Transposed/arranged text validates
- Diff shows only intended musical/structure changes
- User approved before save
