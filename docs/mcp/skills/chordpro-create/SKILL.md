---
name: chordpro-create
description: Create valid Hosanna ChordPro documents using supported syntax and validation.
---

# Create ChordPro documents

## Goal
Produce a valid ChordPro song document for Hosanna without inventing unsupported features.

## Resources
- `hosanna://chordpro/guide`
- `hosanna://chordpro/examples/valid`
- `hosanna://chordpro/directives`

## Tools
1. Ask for title, artist, key, and any known lyrics/chords.
2. Draft using parsed directives only (`title`, `artist`, `key`, sections, etc.).
3. `chordpro.validate` then `songs.create_draft`.
4. Present proposal; `songs.save` only after approval.

## Constraints
- Prefer verse/chorus/bridge over unsupported `start_of_part`.
- Do not use `{define}` or layout fonts as if they were supported.
- Never fabricate lyrics.

## Common mistakes
- Saving before validation
- Inventing CCLI metadata the user did not provide
- Forgetting `{end_of_*}` closers
