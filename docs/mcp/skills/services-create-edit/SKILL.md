---
name: services-create-edit
description: Create and edit Hosanna service plans with typed elements, real song references, validation, and draft-before-save.
---

# Create and edit services

## Goal

Build or modify worship service plans that validate against Hosanna’s element schema and the church’s real song library.

## When to use

- Prompts `services.create`, `services.edit`, `services.fix`, `services.complete`
- User wants to add/remove/reorder setlist items or non-song elements

## Read first

1. `hosanna://skills/hosanna-safe-data`
2. `hosanna://domain/services`
3. `hosanna://schemas/service-element-types`

## Element types

| Type | Required / typical fields |
|------|---------------------------|
| `song` | `id`, `type`, `title`, **`songId`** (UUID in library), optional `duration`, `notes` |
| `welcome` | `title`, optional `content`, `notes`, `duration` |
| `scripture` | `title`, preferably `passage` and/or `content`, `notes`, `duration` |
| `message` | `title`, `content`, `notes`, `duration` |
| `announcement` | same pattern as message |
| `custom` | `title`, `content`, … |

Every element needs a unique `id` (UUID) and should use contiguous `position` values (0-based).

## Critical rule: song references

- Song elements **must** point at a real library song via `songId`
- Discover with `songs.search` / `songs.get` — never invent UUIDs or fake titles as if they were library songs
- Prefer setting `title` to the song’s library title for readability

## Tools

| Step | Tool |
|------|------|
| List/get | `services.search`, `services.get` |
| Draft | `services.create_draft` |
| Edit proposal | `services.propose_edit` |
| Validate | `services.validate` |
| Persist | `services.save` (`create` or `update` + `updatedAt`) |

## Create workflow

1. Gather name, date (ISO), notes, desired flow (welcome → songs → message, etc.).
2. Search the library for each requested song; record ids.
3. Build elements with ids/positions.
4. `services.create_draft` → `services.validate`.
5. Present the draft; after approval `services.save` `mode=create`.

## Edit workflow

1. `services.get` — keep `updatedAt`.
2. Change only what the user asked; preserve unrelated elements.
3. `services.propose_edit` → `services.validate`.
4. Present; `services.save` `mode=update` with `serviceId` + `updatedAt`.

## Fix / complete

- Fix: resolve missing `songId`, bad types, broken ordering; explain each issue.
- Complete: suggest structural gaps (e.g. no welcome) — do not invent scripture text or songs not in the library. Scripture body may be empty unless the user provides passage/text (Studio may fetch Bible text client-side; MCP does not).

## Notes storage

Studio stores element notes **inline** on the element JSON. Prefer that over assuming the separate ServiceNote API unless the user specifically needs threaded notes.

## Done when

- `services.validate` reports `ok` (or remaining issues are disclosed)
- All song ids resolve
- User approved before save
