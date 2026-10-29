# Domain rules — Songs

- Songs belong to an **organization** (`orgId`). Isolation is enforced by the org-scoped Prisma client; never pass org ids from the client as authority.
- ChordPro lives in `Song.content` as opaque text. Title/artist/`song_number` may also be mirrored as columns (Studio syncs title/artist/song_number from directives on save).
- Soft-delete sets `deleted` + `purgeAt` (~30 days). Trash restore is available via API.
- Updates use **optimistic concurrency** via `updatedAt`. Mismatches return conflict.
- Writes require an **active or trialing** subscription and RBAC (`song.create` / `song.update` / `song.delete`).
- MCP workflow: draft/propose → validate with `chordpro_validate` → present to user → `songs_save`.
- Plain lyric quotes (no `[Am]` markers): use `songs_search_lyrics` so chords/directives are ignored when matching.
- Never fabricate lyrics or chords. Prefer fixing structure/directives over deleting content.
