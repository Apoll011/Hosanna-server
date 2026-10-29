---
name: hosanna-safe-data
description: Work safely with Hosanna tenant data — auth, permissions, drafts, and concurrency.
---

# Safe data workflows

## Auth
- Better Auth bearer (or cookie) session with **active organization**
- Check `hosanna.permissions` before mutating
- Writes need active/trialing subscription (`entitled`)

## Isolation
Org scoping is server-side. Never treat client-supplied org ids as authorization.

## Draft before save
Always use `*_draft` / `propose_*` tools, present to the user, then `*.save`.

## Concurrency
Updates require the song/service `updatedAt` from the last read. On conflict, reload and retry.

## Do not
- Expose raw SQL or unrestricted database tools
- Bypass RBAC
- Auto-save destructive changes
- Fabricate library content
