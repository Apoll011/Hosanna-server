---
name: songs-validate-review
description: Validate and review songs with lint, parse, analysis, and score — without auto-saving.
---

# Validate and review songs

## Tools
- `chordpro.validate`
- `chordpro.parse_summary` (analysis + score + variants)
- `songs.get` for library songs

## Workflow
1. Validate syntax and report diagnostics by severity.
2. Summarize metadata consistency (title/artist/key vs library fields).
3. Suggest improvements; do **not** call `songs.save` unless the user asks to apply a specific fix.

## Notes
Parse is forgiving (collects errors). Lint is stricter. Use both.
