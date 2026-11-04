# Backend internals

Package: `@hosanna/backend`. Entry: `src/index.mts`.

## Request pipeline

1. **Helmet**, **CORS** (Studio + `*.hosanna.live` + AI host origins), optional **compression** (skipped on Vercel)
2. HTTPS redirect in production when not on Vercel
3. **Better Auth** mounted at `/api/auth/*` (+ OAuth well-known aliases)
4. Body parsers (JSON / urlencoded, **5mb** for replication batches)
5. `Cache-Control: private, no-store`
6. Default locale middleware
7. Global rate limit (production): 1000 / 15 min
8. Routers: `/mcp`, `/api`
9. `notFoundHandler` → `errorHandler` → `{ error: { code, message } }`

Vercel: default export of the Express app; `maxDuration = 60`. Docker: `listen(PORT)`.

## Route map (`/api`)

| Mount | Auth | Notes |
|-------|------|-------|
| `/health` | none | DB `SELECT 1` |
| `/cron` | `CRON_SECRET` Bearer | purge-trash, agenda-reminders |
| *(authenticate from here)* | session | |
| `/billing` | session | entitlement |
| `/replication` | session | push requires subscription |
| `/songs` | session | writes gated |
| `/folders` | session | writes gated |
| `/services` | session | + nested notes |
| `/cifra` | session | scrape import |
| `/youtube` | session | duration |
| `/backup` | session | export/restore |
| `/ai` | session | chat stream, BYOK, memory |
| `/notifications` | session | inbox ± FCM |
| `/trash` | session | list / restore |
| `/annotation` | session | service song canvas |

Outside `/api`: Better Auth, OAuth discovery, `/mcp`.

## Middleware

| Module | Role |
|--------|------|
| `authenticate` | Bearer preferred, else cookie → `req.user`, `req.orgId`, `req.db`, `req.locale` |
| `requirePermission` / `requireAll` / `requireAny` / `requireRole` | RBAC |
| `requireSubscription` | Blocks non-GET writes without active/trialing Stripe sub |
| `validate` | Zod body/query/params |
| Rate limiters | health / sync / api / backup / AI chat |

## Services (business logic)

| Service | Responsibility |
|---------|----------------|
| `ReplicationService` | Pull/push for 5 collections; conflicts; soft/hard delete |
| `syncCache` | In-memory per-tenant pull short-circuit |
| `SongService` / `FolderService` / `ServiceService` | CRUD, trees, elements JSON, trash |
| `ServiceNoteService` | Threaded notes; private-note filter |
| `ServiceSongAnnotationService` | Canvas in Postgres + Firestore realtime |
| `BackupService` | Export/restore v2.1 |
| `OrgAiConfigService` | BYOK providers; AES-GCM encrypted keys |
| `AiChatService` | Streaming chat + tools (Vercel AI SDK) |
| `AiMemoryService` | Org durable memory |
| `aiBilling` | DeepSeek balance (when applicable) |
| `runAgendaReminders` | Daily FCM + idempotency ledger |
| `email.service` | Handlebars + Resend |

Repositories (`song`, `folder`, `service`, `serviceNote`) are thin Prisma accessors used by services and MCP.

## Prisma / tenancy

- Prisma 7 + `@prisma/adapter-pg` + `pg` Pool
- `attachDatabasePool` on Vercel when available
- `forOrganization(orgId)` extension scopes domain models

**Domain models:** Folder, Collection, Song, Service, ServiceSongAnnotation, ServiceNote, AgendaEvent, AgendaReminderDispatch

**Auth / org:** User, Session, Account, Verification, Notification, TwoFactor, Organization, Team, TeamMember, Member, Invitation

**Billing / AI:** Subscription, OrgAiConfig, OrgAiMemory

**OAuth / JWT:** Jwks, OauthClient, OauthResource, OauthClientResource, OauthRefreshToken, OauthAccessToken, OauthConsent, OauthClientAssertion

Soft-delete: `_deleted` + `purge_at` on songs/folders/collections/services/agenda_events. Replication indexes: `(orgId, updatedAt, id)`.

## MCP layout (`src/mcp/`)

- Transports: `http.ts` (Streamable HTTP), `stdio.ts`
- Tool groups: chordpro, discovery, library, org, services, songs, studio
- Resources: `hosanna://…` catalog, guides, skills (docs copied to `dist/mcp/docs` on build)
- Auth: optional for ChordPro; org tools need MCP OAuth / Bearer + permissions

## Cron (`vercel.json`)

| Path | Schedule | Job |
|------|----------|-----|
| `/api/cron/purge-trash` | `0 0 * * *` | Hard-delete expired soft-deletes; prune reminder ledger |
| `/api/cron/agenda-reminders` | `0 9 * * *` | FCM for events in 1 or 3 days |

Both accept GET and POST; auth is `Authorization: Bearer ${CRON_SECRET}`.

## Source tree (high level)

```
src/
  config/          env
  database/        Prisma client
  lib/             auth, fcm, firestore, resend, supabase, i18n, …
  middleware/
  mcp/             tools, resources, prompts, HTTP + stdio
  permissions/     statements + roles
  repositories/
  routes/
  services/
  validators/
  locales/
  index.mts
```
