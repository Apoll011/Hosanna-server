---
name: services-plan-complete
description: Plan or complete service orders using the church library and constraints.
---

# Plan and complete services

## Planning
1. Gather date, theme, duration/song count preferences.
2. `services.plan_suggest` (searches the real library).
3. Explain why each song was chosen; offer alternatives via `songs.search`.
4. Do not invent songs absent from the library.
5. Save only after approval.

## Completing
1. `services.get` + `services.validate`
2. Fill structural gaps; ask the user for musical/lyrical content you cannot know
3. Propose; save after approval
