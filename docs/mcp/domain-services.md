# Domain rules — Services

- A **service** is a worship plan: `name`, `date`, `notes`, and `elements` (JSON array).
- Element types: `welcome`, `scripture`, `message`, `announcement`, `custom`, `song`.
- Song elements **must** include a valid `songId` that exists in the org library.
- Ordering uses optional `position` (0-based). Prefer contiguous positions.
- Studio embeds element `notes` in the element JSON. Separate `ServiceNote` API exists but Studio primarily uses embedded notes.
- Soft-delete and subscription write gates match songs.
- MCP workflow: create_draft / propose_edit / plan_suggest → `services_validate` → user approval → `services_save`.
- Do not invent songs that are not in the library; search first with `songs_search` (or `songs_search_lyrics` for plain lyric quotes).
- Service elements have **no** assignee fields. Company roles (leader, musicians, preacher, …) live on the **agenda event** `responsibilities` array — resolve people with `me` / `members_list` and category ids from `org_get`.
