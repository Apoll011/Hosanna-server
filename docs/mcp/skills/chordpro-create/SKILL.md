---
name: chordpro-create
description: Create valid Hosanna ChordPro documents using supported syntax, validation, and draft-before-save.
---

# Create ChordPro documents

## Goal

Produce a complete, valid ChordPro song for Hosanna that the team can open in Studio, transpose, and put on a service plan — without inventing unsupported ChordPro features or fabricating lyrics.

## When to use

- User wants a new song from scratch
- User pastes incomplete lyrics/chords and wants a proper ChordPro document
- Prompt `songs_create` or `songs_complete` (for new unfinished docs)

## Read first

1. `hosanna://skills/hosanna-safe-data`
2. `hosanna://chordpro/guide`
3. `hosanna://chordpro/examples/valid`
4. Optionally `hosanna://chordpro/directives` or tool `chordpro_directives`

## Essential metadata

Ask for anything missing that you cannot safely infer:

| Field       | Directive            | Required?                        |
| ----------- | -------------------- | -------------------------------- |
| Title       | `{title:}` / `{t:}`  | Yes                              |
| Artist      | `{artist:}` / `{a:}` | Strongly preferred               |
| Key         | `{key:}` / `{k:}`    | Preferred (needed for transpose) |
| Duration    | `{duration:}`        | Optional; helps service planning |
| YouTube     | `{youtube:}`         | Optional                         |
| Song number | `{song_number:}`     | Optional; Hosanna-specific       |

Do **not** invent CCLI numbers, YouTube links, or hymnal numbers the user did not give.

## Document skeleton

```chordpro
{title: Song Title}
{artist: Artist Name}
{key: G}
{tempo: 72}
{duration: 4:30}

{start_of_verse}
[G]Line of [C]lyrics here
{end_of_verse}

{start_of_chorus}
[D]Chorus [G]line
{end_of_chorus}

{start_of_bridge}
[Em]Bridge [C]line
{end_of_bridge}
```

Use aliases if helpful (`{sov}`…`{eov}`, `{soc}`…`{eoc}`, `{sob}`…`{eob}`). Prefer matching open/close tags.

## Workflow

1. Gather title, artist, key, lyrics, and chords from the user.
2. Draft ChordPro using **parsed** directives only (see features resource).
3. `chordpro_validate` — fix errors/warnings that you can fix without inventing content.
4. Optionally `chordpro_format` for normalization.
5. `songs_create_draft` with title/artist/content/tags/folder if known.
6. Present the full proposal (content + validation summary) to the user.
7. Only after explicit approval: `songs_save` with `mode=create`.

## What you may infer vs must ask

**Safe to infer (structural):**

- Missing `{end_of_verse}` when the next section starts
- Placing `{title:}` / `{artist:}` at the top from stated metadata
- Using verse/chorus/bridge when the user names those sections

**Must ask / never invent:**

- Lyrics or chords the user did not supply
- Extra verses “to make it complete”
- Keys, tempos, durations unless stated or clearly present in source text

## Unsupported — do not use as if supported

- `{define}` chord diagrams (formatter-only)
- Font/color/`new_page`/`column_break` layout directives
- Treating `start_of_part` as a first-class Hosanna section (prefer verse/chorus/bridge)

If the user asks for these, explain the limitation and offer a supported alternative.

## Common mistakes

- Calling `songs_save` before validation or approval
- Leaving unclosed `{start_of_*}` blocks
- Putting chords above lyrics Word-style instead of `[Chord]lyric` inline
- Inventing metadata “for completeness”
- Using grids/tabs when a simple verse would do (unless the user asked)

## Done when

- Document validates (`chordpro_validate` ok, or remaining issues are disclosed)
- User has seen the proposal
- Save only happens after approval (or user explicitly asked to save now)
