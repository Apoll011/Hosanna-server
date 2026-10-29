---
name: hosanna-safe-data
description: Work safely with Hosanna tenant data — auth, permissions, draft-before-save, concurrency, and no fabricated library content.
---

# Safe data workflows

## Goal

Protect church data: correct tenant, correct permissions, no accidental overwrites, no invented songs/lyrics, and no writes without user approval.

## When to use

**Always** before any create/edit/fix/save/delete on songs or services. Load this skill at session start for org work.

## Auth and tenancy

1. Call `hosanna_permissions`.
2. Require `authenticated: true` with an active organization for org tools.
3. Check `entitled` before writes — inactive subscriptions are read-only.
4. Check role permissions (`song.*`, `service.*`) before attempting mutations.

Auth is Better Auth bearer (or cookie) with `activeOrganizationId`. Org scoping is enforced server-side — never treat a client-supplied org id as authorization.

Unauthenticated clients may still use pure ChordPro tools (`chordpro_validate`, `chordpro_format`, …).

For people/roles on the agenda, call `me` / `members_list` / `org_get` and set `responsibilities` on `agenda_create` / `agenda_update` (do not invent memberIds). There is no org-switch tool — the session org is fixed.

## Draft before save (mandatory)

| Intent | Do this first | Persist with |
|--------|---------------|--------------|
| New song | `songs_create_draft` | `songs_save` mode=`create` |
| Edit/fix song | `songs_propose_edit` / `songs_propose_fix` | `songs_save` mode=`update` |
| New service | `services_create_draft` or `services_plan_suggest` | `services_save` mode=`create` |
| Edit service | `services_propose_edit` | `services_save` mode=`update` |

Present the proposal (content + validation + diff/reasoning) and wait for explicit user approval. Do not “helpfully” save in the same turn unless the user clearly ordered an immediate save.

## Concurrency

Song and service updates need the `updatedAt` from the last read/proposal.

- On conflict errors: reload, show the newer version, re-apply only with fresh consent
- Never invent or omit `updatedAt` on updates

## Validation before persist

- Songs: `chordpro_validate` (or proposal validation). Use `allowInvalid` only if the user accepts known issues.
- Services: `services_validate` — song elements must have real `songId`s.

## Content integrity

- Never fabricate lyrics, chords, verses, or library songs
- Never silently delete sections you don’t understand — ask
- Prefer preserve-and-fix over rewrite-from-scratch

## Do not

- Expose SQL or unrestricted database access
- Bypass RBAC or subscription gates
- Auto-save destructive deletes
- Claim Studio-only features (print, Ace UX, Bolls scripture fetch, canvas annotations) exist as MCP tools

## Quick preflight

```
[ ] hosanna_permissions checked
[ ] Correct skill(s) read for the job
[ ] Draft/propose done
[ ] Validation reviewed with user
[ ] User approved
[ ] save with correct mode + updatedAt (updates)
```
