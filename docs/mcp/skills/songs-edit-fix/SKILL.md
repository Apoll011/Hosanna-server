---
name: songs-edit-fix
description: Edit or fix existing Hosanna songs while preserving lyrics and meaning.
---

# Edit and fix songs

## Goal
Apply requested edits or repair ChordPro problems without inventing or silently dropping content.

## Tools
- `songs.get` → `songs.propose_edit` or `songs.propose_fix` → `chordpro.validate` → `songs.save`

## Workflow
1. Load the current song.
2. For fixes: run `songs.propose_fix` and explain diagnostics.
3. For edits: change only what the user asked; keep variants, comments, and unrelated metadata.
4. Show the diff preview from the proposal tool.
5. Save only after approval, passing `updatedAt` for concurrency.

## Constraints
- Never invent missing lyrics or chords.
- Prefer formatting/lint fixes over deleting ambiguous lines — ask the user when meaning is unclear.
