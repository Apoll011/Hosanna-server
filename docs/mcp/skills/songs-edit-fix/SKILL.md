---
name: songs-edit-fix
description: Edit or fix existing Hosanna songs while preserving lyrics, meaning, variants, and unrelated metadata.
---

# Edit and fix songs

## Goal

Apply the user’s requested changes — or repair ChordPro problems — while preserving original lyrics, musical meaning, variants, and unrelated metadata. Never invent missing lines.

## When to use

- Prompt `songs.edit`, `songs.fix`, or `songs.complete` on an existing song
- User reports “broken ChordPro”, bad directives, or wants a targeted rewrite

## Read first

1. `hosanna://skills/hosanna-safe-data`
2. For syntax questions: `hosanna://skills/chordpro-directives-variants`
3. `hosanna://domain/songs`

## Tools

| Step | Tool |
|------|------|
| Load | `songs.get` |
| Inspect | `chordpro.validate`, `chordpro.parse_summary` |
| Edit proposal | `songs.propose_edit` |
| Fix proposal | `songs.propose_fix` (format + lint-oriented) |
| Persist | `songs.save` with `mode=update`, `songId`, and `updatedAt` |

## Edit workflow

1. `songs.get` — note `updatedAt`, content, title, artist, tags.
2. Make **only** the requested changes. Leave variants, comments, grids/tabs, and unrelated metadata alone unless asked.
3. `songs.propose_edit` with the new content (and metadata fields if changed).
4. Show the proposal’s `diff.preview` and validation to the user in plain language.
5. After approval: `songs.save` (`mode=update`, pass the proposal’s `updatedAt`).

If `updatedAt` conflicts, reload with `songs.get` and re-propose — do not force overwrite.

## Fix workflow

1. `songs.get` + `chordpro.validate` / `songs.propose_fix`.
2. Explain each issue (unclosed braces, bad chords, mismatched blocks, etc.).
3. Prefer mechanical fixes: close blocks, expand aliases, normalize spacing via format.
4. If a “fix” would require guessing lyrics or chords, **ask** instead of inventing.
5. Present before/after; save only after approval.

## Preserve

- Exact lyric wording and line breaks unless the user asked to change them
- Named versions (`{start_of_version}`…`{end_of_version}`)
- Comment text and style suffixes (`|warning`)
- Timing annotations (`[Am@2x]`)
- Unknown/custom metadata directives already in the file

## Never

- Fabricate verses, bridges, or “missing” chords to silence lint
- Silently drop sections you do not understand
- Change key via rewrite without using transpose skill/tools when the user asked to transpose
- Save without showing the proposal

## Complete (unfinished document)

Distinguish:

- **Structural** gaps you can close safely (missing `end_of_*`, missing `{title:}` if title is known from the song record)
- **Musical/lyrical** gaps that require the user

Say clearly what you inferred vs what you need from them.

## Done when

- Diff is understandable
- Validation is clean or residual issues are listed with reasons
- User approved before any `songs.save`
