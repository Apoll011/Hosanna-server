# Hosanna Studio Backend

Production REST API for Hosanna Studio and the Flutter musician app: songs,
folders, collections, worship services, agenda, replication sync, AI, and MCP.
Backed by PostgreSQL (Supabase) via Prisma. Auth is **Better Auth** (cookies +
Bearer), not legacy JWT admin tokens.

This project is API-only — no frontend assets are served. Studio
(`studio.hosanna.live`) and the Flutter app talk to this server over HTTP.

## Architecture

End-to-end system docs (Studio, Flutter, marketing, sync, auth, integrations):

- **[docs/architecture/](docs/architecture/README.md)** — index
- [System overview](docs/architecture/system-overview.md)
- [Mermaid diagrams](docs/architecture/diagram.md)
- [Clients](docs/architecture/clients.md) · [Backend internals](docs/architecture/backend-internals.md)
- [Data & sync](docs/architecture/data-and-sync.md) · [Auth & billing](docs/architecture/auth-and-billing.md)
- [External integrations](docs/architecture/external-integrations.md)
- [Improvements / TODOs / bugs](docs/architecture/improvements.md)
- [Deploy report](docs/architecture/deploy-report.md) — Vercel / Cloudflare checklist

## Stack

Node.js, TypeScript, Express, Prisma ORM, PostgreSQL, Zod, Better Auth,
Stripe, `@hosanna/chordpro`, Model Context Protocol (`@modelcontextprotocol/server`).

## MCP server

Hosanna exposes an MCP interface for AI clients (songs, services, ChordPro):

- **HTTP:** `POST /mcp` (Streamable HTTP). Auth is optional for ChordPro tools; song/service tools need an org context.
- **OAuth 2.1:** Better Auth MCP plugin — clients discover `/.well-known/oauth-protected-resource[/mcp]` (and AS metadata), then authorize via Studio (`STUDIO_URL/login` → `/oauth/consent`). Set `MCP_RESOURCE_URL` to the exact public `/mcp` URL clients use (audience binding). Session Bearer tokens still work. Claude / ChatGPT / Cursor need DCR (`allowDynamicClientRegistration`) plus CORS/trustedOrigins for their hosts.
- **Propagate chords:** `chordpro.propagate_chords` copies `[Am]` / `[G]` / … from the first chorded verse onto later verses at the same lyric offsets (does not invent chords).
- **stdio:** `HOSANNA_BEARER_TOKEN=<token> npm run mcp`

Resources live under `hosanna://…` (guide, schemas, skills). Task prompts include `songs.*` and `services.*`. Workflow skills are in `docs/mcp/skills/` and also served as MCP resources.

## Project layout

```
src/
  config/          env loading
  database/        Prisma client singleton
  lib/             Better Auth, email, i18n, …
  middleware/      auth guards, Zod validation, error handler, subscription
  mcp/             MCP tools, resources, prompts (HTTP + stdio)
  permissions/     RBAC statements + roles
  repositories/    Prisma data-access layer
  routes/          Express routers
  services/        business logic
  validators/      Zod schemas
  utils/
  types/
  index.mts        app entrypoint
docs/architecture/ Ecosystem diagrams + architecture guides
docs/mcp/          ChordPro guide, domain docs, and AI workflow skills
                   (copied to dist/mcp/docs on build for Vercel/Docker)
prisma/
  schema.prisma
  migrations/
```

## Running with Docker (recommended)

```bash
cp .env.example .env
# edit .env — see Environment variables below
docker compose --env-file .env up --build
```

This starts Postgres + the API on `http://localhost:3000`. The container's
entrypoint runs `prisma migrate deploy` automatically before booting.

## Running locally (without Docker)

```bash
npm install
cp .env.example .env   # fill required vars from .env.example
npx prisma generate
npx prisma migrate deploy
npm run dev             # tsx watch, http://localhost:3000
```

## Environment variables

See **`.env.example`** for the full list. Required at process start (`src/config/env.ts`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (prefer Supabase pooler `:6543`) |
| `BETTER_AUTH_SECRET` | Session signing (`openssl rand -hex 32`) |
| `PUBLIC_APP_URL` | Public API origin (auth issuer base) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Org billing |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | Avatars + Supabase client |
| `RESEND_API_KEY` | Transactional email |

Important optional: `STUDIO_URL`, `MCP_RESOURCE_URL`, `CRON_SECRET`, `FCM_*`,
`AI_SETTINGS_ENCRYPTION_KEY`, `YOUTUBE_API_KEY`, `CORS_ORIGIN`,
`RATE_LIMIT_DISABLED`, `DIRECT_URL` (migrations).

For live note pings and **song annotation sync**, set `FCM_PROJECT_ID`,
`FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY`, enable Firestore, and deploy
`firestore.rules` (see
[docs/ANNOTATIONS_FIREBASE.md](docs/ANNOTATIONS_FIREBASE.md)). Firebase Storage
is not required.

## Scripts

- `npm run dev` — watch mode (tsx)
- `npm run build` / `npm start` — compile to `dist/` and run
- `npm test` — unit / contract tests
- `npm run prisma:migrate:dev` — create/apply a migration in development
- `npm run prisma:migrate` — apply pending migrations (production)
- `npm run typecheck` — `tsc --noEmit`
