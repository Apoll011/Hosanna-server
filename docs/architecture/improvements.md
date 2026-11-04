# Improvements, bugs, and TODOs

Living backlog from an architecture pass across all Hosanna repos (server, Studio, Flutter, chordpro, saas, blog). Items are evidence-based (code/docs), not speculative product ideas.

**Suggested order:** data integrity → security → Flutter sync policy → env/docs/auth cleanup → version alignment → polish.

---

## Critical (data integrity)

### 1. Backup export/restore ignores collections and agenda events

| | |
|--|--|
| **Where** | `Hosanna-server/src/services/backup.service.ts` |
| **What** | `export()` only loads folders/songs/services. `restore()` `deleteMany`s only those three, then recreates them. `collections` and `agendaEvents` are left in place. |
| **Why it hurts** | A “full replace” can leave stale collections/agenda while wiping songs/services — silent tenant corruption. |
| **Also** | Unfinished TODO at line 31: `Dont restore the ones to be deleted` (soft-deleted rows can be restored). |
| **Fix** | Include collections + agendaEvents in export/restore; delete them in the same transaction; skip soft-deleted rows; bump backup format version; add a contract test. |

### 2. Folder “move content to root” never reparents child folders

| | |
|--|--|
| **Where** | `Hosanna-server/src/services/folder.service.ts` → `deleteMovingContentToRoot` |
| **What** | Songs are disconnected to root; nested folders stay under the soft-deleted parent. Explicit `//TODO: move the folders to....` |
| **Why it hurts** | Orphaned folder tree / broken explorer after “delete folder, keep content”. |
| **Fix** | Reparent direct child folders to root (or recurse), then soft-delete; regression test. |

---

## High

### 3. Firestore annotations / note pings are world-readable

| | |
|--|--|
| **Where** | `Hosanna-server/firestore.rules` (`allow read: if true` on annotations + realtime notes); inline canvas in `src/lib/firestore.ts` |
| **What** | Clients can read annotation docs (including optional inline `canvasDataBase64` up to ~700KB) without Hosanna/Firebase auth if they know IDs. |
| **Why it hurts** | Team annotation payloads are effectively public by ID. Documented in `docs/ANNOTATIONS_FIREBASE.md` but still open. |
| **Fix** | Firebase Auth custom tokens + rule on `request.auth`, **or** keep Firestore metadata-only (no inline bytes) and always fetch canvas via authenticated API. |

### 4. Flutter replication push never uploads (dirty never set)

| | |
|--|--|
| **Where** | `Hosanna/lib/core/db/tables.dart` (`dirty`); `lib/core/sync/adapters.dart` / `sync_controller.dart` |
| **What** | Push path exists and clears dirty on ack, but **no** `dirty: true` is ever written under `lib/`. Sync still calls `pushAll`. |
| **Why it hurts** | Looks bidirectional; offline/local edits would silently never leave the device. |
| **Fix** | Either mark dirty on every local mutation and test push end-to-end, **or** make push a no-op and document pull-only until Flutter is write-capable. |

### 5. Flutter has no `agendaEvents` sync (Studio does)

| | |
|--|--|
| **Where** | Flutter adapters: songs/folders/collections/services only. Studio replicates `agendaEvents`. Server cron sends agenda FCM. |
| **Why it hurts** | Mobile never sees the org agenda; reminders may land with no calendar context. |
| **Fix** | Add Drift table + replication adapter + UI, **or** product-doc “agenda is Studio-only” and keep FCM deep-links only. |

### 6. Studio still has dead JWT refresh against a removed endpoint

| | |
|--|--|
| **Where** | `Hosana-dashboard/src/api/client.ts` — `hosanna_access_token` / `hosanna_refresh_token`, `POST …/auth/refresh` |
| **What** | No `/auth/refresh` on the server. Auth is Better Auth cookies (`credentials: "include"`). `setTokens` unused. `downloadSong` attaches Bearer without credentials. |
| **Why it hurts** | Dual-auth remnant; 401 + stale refresh hits a dead route; confusing for new contributors. |
| **Fix** | Delete refresh/token localStorage path; use session cookies everywhere; fix or remove `downloadSong`. |

### 7. Server README / `.env.example` out of sync with runtime

| | |
|--|--|
| **Where** | `Hosanna-server/README.md`, `.env.example`, `src/config/env.ts` |
| **What** | README still mentions JWT secrets, `SEED_ADMIN_*`, missing `API_DOCUMENTATION.md`, missing `prisma/seed.ts` (`npm run prisma:seed` fails). `.env.example` omits required `GOOGLE_CLIENT_*`, `STRIPE_*`, `TURNSTILE_SECRET_KEY`, `SUPABASE_SECRET_KEY`, etc. that `env.ts` requires. |
| **Why it hurts** | Fresh setups follow the wrong auth model and miss secrets. |
| **Fix** | Align `.env.example` with `env.ts`; rewrite README for Better Auth; restore seed or remove the script; replace/remove `API_DOCUMENTATION.md` pointer (architecture docs + OpenAPI if added). |

### 8. `@hosanna/chordpro` version skew

| | |
|--|--|
| **Where** | `hosanna-shared` **1.7.2**; Studio `^1.7.1`; server `^1.6.2` |
| **Why it hurts** | AI/MCP lint/format on server can disagree with Studio editor/renderer. |
| **Fix** | Bump server (+ Studio lock) to published shared version; pin/check in CI. |

---

## Medium

### 9. Unused Supabase client in Flutter

- `Supabase.initialize` in `Hosanna/lib/main.dart`; provider unused by features.
- Cost: startup, empty dart-defines, confusion with Better Auth + Firebase.
- **Fix:** remove package + init, or adopt for a real use (e.g. storage).

### 10. Hardcoded plan prices (can drift from Stripe)

- Studio: `Hosana-dashboard/src/lib/subscriptions.ts` (`PLAN_PRICING`)
- Marketing: `hosanna-saas` landing hardcoded €12 / €120
- Stripe price IDs live in server `lib/auth.ts`
- **Fix:** single source of truth (config or Stripe Price retrieve) for saas + Studio.

### 11. `CORS_ORIGIN` env unused; rate limit production-only

- `.env.example` / docker-compose set `CORS_ORIGIN`; `src/index.mts` uses a hardcoded allowlist + `*.hosanna.live`.
- Global rate limit only when `NODE_ENV === "production"`.
- **Fix:** wire or drop `CORS_ORIGIN`; document staging rate-limit behavior (esp. Vercel per-isolate).

### 12. Studio MainLayout double-fetches archived services

- `MainLayout.tsx`: both queries call `useServices(true)` (TODO-ish redundancy).
- **Fix:** one query + derived active/archived lists (as `ServicesPage` does).

### 13. Studio `.env.example` wrong vars; `FLAG_KEY` dead

- Example uses `API_URL` / `FLAG_KEY`; code needs `VITE_API_URL`, Turnstile, PostHog.
- `FLAG_KEY` unused in `src/` (PostHog flags used elsewhere).
- **Fix:** fix example; delete or wire `FLAG_KEY`.

### 14. Thin test coverage on highest-risk paths

- Server tests: MCP/AI helpers — **not** replication, backup, folder delete, auth.
- Studio: lint/typecheck only — no app test suite.
- Flutter: parser/widget tests — no sync/dirty/annotation tests.
- saas/blog: no tests.
- **Fix:** start with backup + replication + folder-delete contract tests.

### 15. Blog privacy page is template lorem; GTM placeholder

- `hosanna-blog/src/content/pages/privacy-policy.md` — Themefisher lorem.
- GTM enabled=false, `GTM-XXXXXX`.
- README still sells generic Astro/Sitepins template; copyright param “Embrace”.
- **Fix:** real policy (or link saas privacy); enable GTM only with a real ID; rewrite README.

---

## Low / polish

| Item | Where | Notes |
|------|-------|-------|
| Backup notification missing `href` | `backup.service.ts` ~114 | `// TODO: add href` |
| Router export typo `anotationRouter` | `serviceSongAnnotation.routes.ts` | Cosmetic |
| `INVALID_REFRESH_TOKEN` leftover | `src/utils/errors.ts` | JWT-era dead code |
| MCP tool error aliases deprecated | `mcp/lib/toolErrors.ts` | Keep until old Studio clients gone, then drop |
| Demo mode vs org slug `"demo"` | Studio `src/demo/*` | Ensure no collision with real org |
| Coming-soon feature UI | Studio `FeaturesTab` | Product, not a bug — track intentionally |
| Android `google-services.json` committed | Flutter android | Normal; restrict/rotate API keys in GCP |
| Studio/server app version minor skew | 2.22.3 vs 2.22.1 | Keep release notes aligned |
| Flutter dual cookie + Bearer | Intentional for mobile | Don’t reintroduce Studio refresh tokens |

---

## Code TODOs already in tree (track here)

```
Hosanna-server/src/services/folder.service.ts:135   //TODO: move the folders to....
Hosanna-server/src/services/backup.service.ts:31    //TODO: Dont restore the ones to be deleted
Hosanna-server/src/services/backup.service.ts:114   // TODO: add href
```

---

## Docs & cleanup checklist

- [ ] Point all onboarding at `docs/architecture/` (already linked from README — finish env/seed rewrite)
- [ ] Remove references to `API_DOCUMENTATION.md` or generate OpenAPI from routes
- [ ] Restore or delete `prisma:seed` script + `SEED_ADMIN_*` docs
- [ ] Align chordpro versions across server / Studio / published package
- [ ] Rewrite `hosanna-blog` README for Hosanna (not Themefisher)
- [ ] Document Flutter sync as pull-only **until** dirty/push lands
- [ ] Document agenda as Studio-only **or** ship Flutter agenda sync
- [ ] Replace blog privacy lorem before public traffic
- [ ] Delete Studio dead auth refresh + unused `downloadSong` (or fix credentials)

---

## Nice-to-have improvements (not bugs)

These are improvements spotted while mapping the system — lower urgency, higher product leverage:

1. **OpenAPI / typed client** — generate Studio + Flutter clients from one schema; kill drift.
2. **Replication observability** — metrics on pull lag, conflict rate, syncCache hit rate (MCP already has an in-process tool timing ring buffer).
3. **Idempotent backup restore** — include annotations/notes policy explicitly (exclude or export).
4. **Flutter offline writes** — once dirty/push works: local song edits, favorites as optional sync.
5. **Unify ChordPro** — consider code-gen or shared golden tests between Dart port and `@hosanna/chordpro` so transpose/lint stay identical.
6. **Marketing ↔ product CTAs** — ensure saas plan params match Stripe price IDs after pricing single-source.
7. **E2E smoke** — auth → org → sync pull → open song (Studio Playwright + Flutter integration).
8. **MCP tool catalog docs** — keep `docs/mcp` and Studio AI `studioSync` tool list in one generated source.
9. **Rate limits on Vercel** — document that in-memory limiters are per-isolate; consider Redis/Upstash for global caps.
10. **Supabase Storage avatars** — document CDN/cache headers and cleanup on user delete.

---

## Status legend

| Tag | Meaning |
|-----|---------|
| Critical | Can corrupt tenant data |
| High | Security hole, silent wrong behavior, or broken setup |
| Medium | Debt that will bite soon |
| Low | Cleanup / polish |
| Nice-to-have | Forward-looking, not currently broken |
