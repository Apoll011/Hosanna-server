---
name: songs-transpose-arrange
description: Transpose and arrange songs using Hosanna's real ChordPro capabilities.
---

# Transpose and arrange

## Transpose
1. `songs.get`
2. `chordpro.transpose` with `toKey` or `semitones` (source-preserving)
3. `songs.propose_edit` with returned content
4. Validate and present; save after approval

Preserve lyrics, section markers, variants, and non-key metadata.

## Arrange
Supported: sections, repeats, chorus recall, grids/tabs, named variants, chord placement.
Not supported as first-class: `{define}`, page layout fonts/colors.

Read `hosanna://chordpro/features` before promising a feature.
