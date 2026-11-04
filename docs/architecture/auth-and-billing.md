# Auth, RBAC, and billing

## Better Auth

Configured in `src/lib/auth.ts` with the Prisma adapter.

### Sign-in methods

- Email / password (min 8; reset + welcome emails via Resend)
- Google OAuth (`GOOGLE_CLIENT_ID` / `SECRET`)
- Captcha: Cloudflare Turnstile
- Optional 2FA (email OTP)
- HaveIBeenPwned + Better Auth Infra **sentinel**

### Session transport

| Mechanism | Used by |
|-----------|---------|
| Cookie prefix `hosanna` (cross-subdomain on `hosanna.live`) | Studio (primary), Flutter |
| `Authorization: Bearer <session token>` | Flutter, MCP, API clients |
| `set-auth-token` response header | Flutter TokenStore / SessionStore |
| JWE cookie cache (~15 min) | Performance |

Session extras: `fcm`, `notify`, `activeOrganizationId`, `activeTeamId`.

**API rule:** after public health/cron/auth, `authenticate` requires a valid session **and** an active organization for domain routes.

### Plugins (server)

`i18n`, `dash`, `admin`, `inbox` (`better-inbox`), `bearer`, `jwt`, `mcp` (OAuth 2.1), `cimd` (Claude client metadata), `haveIBeenPwned`, `sentinel`, `captcha`, `twoFactor`, `organization` (teams + custom roles), `stripe`.

### MCP OAuth

- Login/consent UX on Studio (`STUDIO_URL/login`, `/oauth/consent`)
- Resource audience must equal `MCP_RESOURCE_URL`
- DCR + CIMD; scopes include `openid profile email offline_access`
- JWT verified via `/api/auth/jwks`

## Organizations and roles

Organizations are the tenant boundary. Teams are optional subgroups.

**Roles** (`src/permissions/roles.ts`):

| Role | Typical use |
|------|-------------|
| `owner` | Full control + billing |
| `admin` | Org admin without ownership transfer constraints |
| `teamLeader` | Lead a team |
| `editor` | Edit library / services |
| `musician` / `member` | Consume + limited edit |
| `guest` | Minimal access |

Permission statements cover: song, service, folder, collection, agenda, settings, ai, export, backup, billing, notification, plus Better Auth org defaults.

Middleware: `requirePermission` / `requireAll` / `requireAny` / `requireRole`.

## Billing (Stripe)

Via `@better-auth/stripe`:

- Plan name: **`cloud`** (monthly + annual price IDs)
- 14-day trial
- Subscriptions are **org-scoped** (`referenceId` = organization id)
- Checkout: promo codes, ToS consent
- Webhooks handled under `/api/auth` (`STRIPE_WEBHOOK_SECRET`)
- Lifecycle emails + org notifications (trial start/end/expire, subscribe, cancel)

### Entitlement gate

- `GET /api/billing/entitlement` → `{ entitled }`
- `requireSubscription` middleware blocks **non-GET writes** on gated routes when the org is not active/trialing
- Studio onboarding also checks trial/subscription before entering the main shell

Studio client uses `authClient.subscription.*` (list, upgrade, portal); display prices live in Studio `lib/subscriptions.ts`.

## Flutter / Studio session lifecycle (summary)

1. Sign in → session cookie ± bearer token
2. List / create org → `setActive`
3. Check entitlement
4. Start replication against org-scoped data
5. On logout: clear session + wipe local DB (Studio `CacheHydrationProvider`; Flutter clear on org switch / sign-out paths)
6. On org switch: reset local store + checkpoints, then sync again

## Email

Transactional mail goes through **Resend** + Handlebars templates (`email.service.ts`): auth, org invites, billing events.
