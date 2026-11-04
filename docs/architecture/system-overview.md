# System overview

Hosanna is not a single app — it is a small constellation of repos that share one API, one auth system, and one ChordPro contract.

## Repositories

| Path / package                         | Role                           | Stack                                       |
| -------------------------------------- | ------------------------------ | ------------------------------------------- |
| `Hosanna-server` · `@hosanna/backend`  | Production REST + MCP API      | Express, Prisma, Better Auth, Vercel/Docker |
| `Hosana-dashboard` · `@hosanna/studio` | Studio SPA (planning, org, AI) | Preact/Vite PWA, IndexedDB replication      |
| `Hosanna`                              | Musician mobile/desktop app    | Flutter, Riverpod, Drift/SQLite             |
| `hosanna-shared` · `@hosanna/chordpro` | Shared ChordPro engine         | TypeScript (parser, editor, renderer, diff) |
| `hosanna-saas` · `@hosanna/saas`       | Marketing / landing            | Vite, React, TanStack Router                |
| `hosanna-blog`                         | Content / SEO blog             | Astro, MDX, Cloudflare Workers / Netlify    |

Spelling note: the Studio folder is historically `Hosana-dashboard` (one “n”); the product name is **Hosanna**.

## Domains

| Host                  | Serves          |
| --------------------- | --------------- |
| `hosanna.live`        | Marketing site  |
| `blog.hosanna.live`   | Blog            |
| `studio.hosanna.live` | Studio frontend |
| `api.hosanna.live`    | This backend    |

Dev / staging variants (e.g. `dev-api.hosanna.live`) follow the same split.

## How the pieces fit

1. **Marketing** (`saas` + `blog`) explains the product and funnels people into Studio signup. They do **not** call the product API or hold tenant data.
2. **Studio** is the planning surface: folders, ChordPro editor, services, agenda, teams, billing, Logos AI, MCP OAuth consent. UI is local-first over IndexedDB; sync and auth hit the API.
3. **Flutter** is the stage surface: offline song library, reader, metronome, service order, annotations, push. Same API auth + replication protocol; ChordPro logic is a Dart port of `@hosanna/chordpro`.
4. **Hosanna-server** is the single source of truth for orgs, membership, billing, and replicated domain data. It also hosts MCP, AI chat tools, scrapers, backup, and crons.
5. **@hosanna/chordpro** keeps song text semantics consistent between Studio UI, server AI/MCP tools, and (via port) mobile rendering.

## Data that syncs vs data that does not

**Replicated (RxDB-style HTTP):**

- `songs`, `folders`, `collections`, `services`, `agendaEvents`

**API + optional Firestore (not replication collections):**

- Service notes (privacy / private notes)
- Service song annotations (canvas + realtime)
- Notifications / inbox
- Org AI settings & memory
- Auth, org membership, Stripe subscription

**Client-local only:**

- Flutter metronome, favorites/recents prefs
- Studio print/layout preferences, demo-mode DB
- Sync checkpoints (localStorage / SharedPreferences / IDB)

## Trust and tenancy

- Every domain row is scoped by **organization** (`orgId`).
- The Prisma extension `forOrganization(orgId)` injects tenant filters on Folder, Collection, Song, Service, ServiceNote, AgendaEvent.
- API requests require an authenticated session with an **active organization**.
- Roles (owner → guest) gate permissions; Stripe entitlement gates non-GET writes on core resources.

## Deploy shape

| Component           | Typical host                                                      |
| ------------------- | ----------------------------------------------------------------- |
| API                 | Vercel Fluid function **or** Docker (`docker-compose` + Postgres) |
| Studio              | Static SPA — Vercel rewrite or Cloudflare Workers assets          |
| Marketing           | Vercel                                                            |
| Blog                | Cloudflare Workers static **or** Netlify                          |
| Database            | Supabase Postgres (pooler `:6543`, direct `:5432` for migrations) |
| Avatars             | Supabase Storage bucket `avatars`                                 |
| Push / live signals | Firebase (FCM + Firestore)                                        |

## Version alignment

Studio and backend versions track closely (e.g. Studio `2.22.x`, backend `2.22.x`). ChordPro is published independently (`@hosanna/chordpro`); server and Studio pin different minor versions but share the same package family. Flutter carries its own app version and a Dart ChordPro port that should stay behavior-compatible with the shared package.
