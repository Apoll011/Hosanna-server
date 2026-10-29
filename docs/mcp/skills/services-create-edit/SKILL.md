---
name: services-create-edit
description: Create and edit Hosanna service plans with typed elements and song references.
---

# Create and edit services

## Resources
- `hosanna://domain/services`
- `hosanna://schemas/service-element-types`

## Element types
`welcome` | `scripture` | `message` | `announcement` | `custom` | `song`

Song elements require a real `songId` from `songs.search` / `songs.get`.

## Workflow
1. Draft with `services.create_draft` or edit with `services.propose_edit`
2. `services.validate`
3. Present; `services.save` after approval (include `updatedAt` on update)
