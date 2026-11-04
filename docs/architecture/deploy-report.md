# Deploy report — Vercel, Cloudflare, and friends

What to configure and verify after the architecture fixes in this folder. Treat this as an ops checklist, not a migration script.

## Surface → host map

| Surface      | Repo               | Typical host                                            | Notes                                   |
| ------------ | ------------------ | ------------------------------------------------------- | --------------------------------------- |
| API          | `Hosanna-server`   | **Vercel** (`api.hosanna.live`)                         | Fluid / serverless Express; also Docker |
| Studio       | `Hosana-dashboard` | **Vercel** and/or **Cloudflare Workers** assets         | SPA; `wrangler.jsonc` + `vercel.json`   |
| Marketing    | `hosanna-saas`     | **Vercel** (`hosanna.live`)                             | Static + prerender                      |
| Blog         | `hosanna-blog`     | **Cloudflare Workers** (preferred) or Netlify           | `wrangler.jsonc` / `netlify.toml`       |
| DB / storage | —                  | **Supabase**                                            | Postgres pooler + `avatars` bucket      |
| Push / live  | —                  | **Firebase**                                            | FCM + Firestore rules                   |
| Auth extras  | —                  | **Google OAuth**, **Turnstile**, **Stripe**, **Resend** |                                         |

---

## 1. Hosanna-server (Vercel)

### Project settings

- Root: `Hosanna-server`
- Build: `npm run build` → output used by Vercel Node (see `vercel.json`)
- Env: copy from updated `.env.example` — **Better Auth**, not JWT

### Required env (production)

```
DATABASE_URL          # Supabase pooler :6543
DIRECT_URL            # migrations if needed
BETTER_AUTH_SECRET
PUBLIC_APP_URL=https://api.hosanna.live
STUDIO_URL=https://studio.hosanna.live
MCP_RESOURCE_URL=https://api.hosanna.live/mcp   # must match client URL exactly
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
TURNSTILE_SECRET_KEY
SUPABASE_URL / SUPABASE_SECRET_KEY
RESEND_API_KEY / EMAIL_FROM
CRON_SECRET
```

Optional but recommended: `FCM_*`, `AI_SETTINGS_ENCRYPTION_KEY`, `YOUTUBE_API_KEY`,
`BETTER_AUTH_API_KEY`, `CORS_ORIGIN` (extra origins), `PLAN_PRICE_*` overrides,
`DB_POOL_MAX=5` on Vercel.

### Crons (`vercel.json`)

- `/api/cron/purge-trash` — daily
- `/api/cron/agenda-reminders` — daily ~09:00

Both need `Authorization: Bearer $CRON_SECRET`.

### After deploy

1. `GET https://api.hosanna.live/api/health`
2. `GET https://api.hosanna.live/api/billing/pricing` (public — used by Studio + marketing)
3. Hit Studio login (cookies + Turnstile)
4. Confirm Stripe webhook endpoint points at Better Auth (`/api/auth/...` webhook path from Better Auth Stripe plugin)
5. Confirm MCP well-known + `/mcp` with `MCP_RESOURCE_URL`

### Rate limits

Enabled whenever `NODE_ENV !== "development"` (unless `RATE_LIMIT_DISABLED=true`).
On Vercel Fluid, limiters are **per isolate** — fine as a safety net; use Upstash/Redis later if you need global caps.

---

## 2. Studio (`Hosana-dashboard`)

### Vercel

- Framework: Vite SPA
- Env:
  - `VITE_API_URL=https://api.hosanna.live/api`
  - `VITE_TURNSTILE_SITE_KEY=...`
  - `VITE_PUBLIC_POSTHOG_KEY` / `HOST` / optional `DEV`
- SPA rewrite already in `vercel.json`

### Cloudflare Workers (alternate / staging)

- `wrangler.jsonc` serves `./dist` as SPA (`not_found_handling: single-page-application`)
- Build: `npm run build` then `wrangler deploy`
- Set the same `VITE_*` at **build** time (Vite inlines them)

### Cookie / CORS

API must allow `https://studio.hosanna.live` (built-in) and any preview host via
`CORS_ORIGIN` or `*.hosanna.live`. Better Auth cookie prefix `hosanna` with
cross-subdomain on `hosanna.live`.

---

## 3. Marketing (`hosanna-saas` on Vercel)

- `VITE_DASHBOARD_URL=https://studio.hosanna.live`
- `VITE_API_URL=https://api.hosanna.live/api` (plan prices from `/billing/pricing`)
- Vercel Analytics already in the app

---

## 4. Blog (`hosanna-blog` on Cloudflare)

- Preferred: `pnpm run deploy:cf-workers`
- Privacy page now mirrors the real Hosanna policy (no Themefisher lorem)
- GTM remains **off** until you set a real `gtm_id` and `"enable": true` in `src/config/config.json`
- Copyright param set to Hosanna

---

## 5. Firebase

1. Deploy `firestore.rules` (`firebase deploy --only firestore:rules`)
2. Keep FCM service account in API env
3. **Still open (improvement #3):** annotation docs are world-readable — plan Firebase Auth custom tokens or metadata-only Firestore before treating annotations as private

---

## 6. Supabase

1. Run Prisma migrations against `DIRECT_URL`
2. Ensure `avatars` bucket exists; service role = `SUPABASE_SECRET_KEY`
3. Pooler URL for runtime; keep `DB_POOL_MAX` low on Vercel

---

## 7. Stripe / Turnstile / Google / Resend

| Vendor    | Action                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------ |
| Stripe    | Webhook → API Better Auth Stripe route; price IDs in `lib/auth.ts`; display via `/api/billing/pricing` |
| Turnstile | Site key → Studio `VITE_TURNSTILE_*`; secret → API                                                     |
| Google    | OAuth client authorized for Studio + API origins; Flutter SHA / iOS URL schemes                        |
| Resend    | Domain `hosanna.live` verified; `EMAIL_FROM`                                                           |

---

## 8. Release order (suggested)

1. Deploy **API** (env + pricing + backup/folder fixes)
2. Smoke health + pricing + auth
3. Deploy **Studio** (cookie client, no JWT refresh)
4. Deploy **saas** (pricing fetch)
5. Deploy **blog** (privacy)
6. Ship **Flutter** store build (agenda sync, no Supabase client)

---

## 9. Still open for you

- **Firestore annotation ACL** (improvements #3) — security, not deploy config
- Enable **blog GTM** when you have a container ID
- Consider **Redis rate limits** if abuse appears on Vercel
- Align Studio/server semver tags on each release
- Re-enable skipped Flutter router shell tests once CircleAvatar test user is fixed
