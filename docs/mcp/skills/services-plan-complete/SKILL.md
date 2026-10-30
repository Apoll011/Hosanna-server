---
name: services-plan-complete
description: Plan or complete service orders from date/theme/constraints using the church's actual song library — with reasoning and approval before save.
---

# Plan and complete services

## Goal

Propose a coherent service plan grounded in the **organization’s real songs**, with clear reasoning. Never invent library content. Always wait for approval before saving.

## When to use

- Prompt `services_plan` or `services_complete`
- User gives date, theme, duration, or “put together Sunday’s set”

## Read first

1. `hosanna://skills/hosanna-safe-data`
2. `hosanna://skills/services-create-edit`
3. `hosanna://domain/services`

## Planning workflow

1. Confirm constraints: date, theme/topic, language, max songs, must-include songs, avoid list, target length.
2. Call `services_plan_suggest` with `date`, `theme`, `tags`/`key`, `maxSongs`, welcome/message flags.
3. Review `reasoning.songsSelected` and `candidatesFound`.
4. If the library match is weak:
   - Broaden search with `songs_search`
   - Ask the user for known titles
   - Do **not** fabricate songs
5. Optionally refine elements (order, scripture/message titles the user supplied).
6. `services_validate` on the final draft.
7. Present plan + reasoning; save only with `services_save` after approval.

## Completing a partial service

1. `services_get` + `services_validate`
2. List gaps: missing songIds, empty flow, no date/name, sparse positions
3. Suggest additions from library search / user requirements
4. `services_propose_edit` → present → save after approval

## Reasoning you should explain

- Why each song was chosen (theme/tag/key/search hit)
- Order rationale (e.g. opener → worship → response)
- Gaps (no matching songs in key X; ask user)

## Constraints

- Use only songs returned by search/get for this org
- Do not pull scripture text from the web unless the product exposes a tool for it (currently it does not on MCP)
- Do not auto-archive or delete services while planning
- Keep durations realistic if present; don’t invent exact timings without user input

## Example presentation

```
## Proposed service — {name} ({date})
Theme: …

1. Welcome — …
2. Song: Title (Artist) [id=…]
3. …
4. Message — …

### Why these songs
- …

### Validation
- ok / issues…

Approve to save?
```

## Done when

- Draft references only real songs
- Reasoning is clear
- User approved before any persist
