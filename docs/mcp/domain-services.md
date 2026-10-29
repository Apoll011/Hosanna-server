# Domain rules — Services

- A **service** is a worship plan: `name`, `date`, `notes`, and `elements` (JSON array).
- Element types: `welcome`, `scripture`, `message`, `announcement`, `custom`, `song`.
- Song elements **must** include a valid `songId` that exists in the org library.
- Ordering uses optional `position` (0-based). Prefer contiguous positions.
- Studio embeds element `notes` in the element JSON. Separate `ServiceNote` API exists but Studio primarily uses embedded notes.
- Soft-delete and subscription write gates match songs.
- MCP workflow: create_draft / propose_edit / plan_suggest → `services.validate` → user approval → `services.save`.
- Do not invent songs that are not in the library; search first with `songs.search`.
