---
name: songs-validate-review
description: Validate and review songs with lint, parse, analysis, and score — report findings without auto-saving.
---

# Validate and review songs

## Goal

Produce a clear, actionable review of a song’s ChordPro quality and metadata consistency **without** modifying the library unless the user later asks to apply a specific fix.

## When to use

- Prompt `songs_review`
- User asks “is this song OK?” / “check my ChordPro”
- Before a large service plan, spot-check library health

## Read first

- `hosanna://chordpro/guide` (for explaining issues)
- `hosanna://skills/chordpro-directives-variants` when discussing directives
- `hosanna://domain/songs` for library field rules

## Tools

| Tool                     | Use                                 |
| ------------------------ | ----------------------------------- |
| `songs_get`              | Load library song                   |
| `chordpro_validate`      | Lint + parse errors                 |
| `chordpro_parse_summary` | Metadata, variants, analysis, score |
| `chordpro_directives`    | Explain a specific directive        |

Do **not** call `songs_save` during a pure review.

## Review checklist

1. **Syntax** — unclosed `{}` / `[]`, mismatched section/version blocks, empty/unknown chords, bad timings
2. **Structure** — has sections? chorus recall used correctly? variants closed?
3. **Metadata** — title/artist/key present; consistency with song record columns (`title`, `artist`, `song_number`)
4. **Analysis** — declared `key` vs `detectedKey`; tempo/duration if relevant
5. **Score** — use parse_summary score as a hint, not a hard gate; explain criteria in plain language
6. **Hosanna extras** — optional `youtube`, `duration`, `song_number` for planning/search

## Report format

Use a short structured report:

1. **Summary** — overall status (ok / issues / blockers)
2. **Blockers** — would break parse/preview
3. **Warnings** — quality / consistency
4. **Suggestions** — optional improvements (with example snippets)
5. **Next steps** — offer to run `songs_fix` / `songs_edit` if the user wants changes

## Lint vs parse

- Parse is **forgiving** (collects `errors[]`, still builds an AST when possible)
- Lint is **stricter** diagnostics for editor/MCP validation
- Treat lint `error` severity and parse errors as blockers for “ready to save”

## Never during review

- Auto-save “cleanup”
- Invent missing lyrics to improve the score
- Claim unsupported features are required for a good score

## Done when

- User has a readable findings list
- Each finding maps to evidence (line/directive/tool output)
- Any offered fix is opt-in
