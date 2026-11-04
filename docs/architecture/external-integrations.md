# External integrations

Everything outside the Hosanna repos that the product depends on.

## Data and storage

| Service | Used for | Config |
|---------|----------|--------|
| **Supabase Postgres** | Primary DB via Prisma (`DATABASE_URL` pooler, `DIRECT_URL` migrations) | `.env` |
| **Supabase Storage** | Avatar uploads (`avatars` bucket) | `SUPABASE_URL` + service client |
| **Firebase Cloud Messaging** | Push to devices; session carries `fcm` + `notify` | `FCM_*` service account |
| **Cloud Firestore** | Realtime signals: `services/{id}/realtime/notes`, `services/{id}/annotations/{songId}` | Same Firebase project; see [../ANNOTATIONS_FIREBASE.md](../ANNOTATIONS_FIREBASE.md) |

Local Docker Compose can run Postgres without Supabase for development.

## Auth and fraud

| Service | Used for |
|---------|----------|
| **Google OAuth** | Social sign-in (Studio + Flutter native ID token) |
| **Cloudflare Turnstile** | Captcha on email auth; Studio hosts captcha page |
| **Better Auth Infra (sentinel)** | Challenge / bot hardening |
| **Have I Been Pwned** | Password breach checks |

## Billing and email

| Service | Used for |
|---------|----------|
| **Stripe** | Org `cloud` subscriptions, trial, Customer Portal, webhooks |
| **Resend** | Auth, org, billing transactional email |

## AI and enrichment

| Service | Used for |
|---------|----------|
| **OpenAI / Anthropic / Google / DeepSeek** | Org BYOK via Vercel AI SDK (`/api/ai/chat` + MCP tools). Keys encrypted at rest (`AI_SETTINGS_ENCRYPTION_KEY`) |
| **DeepSeek balance API** | `/api/ai/billing` when provider is DeepSeek |
| **YouTube Data API v3** | Duration lookup, MCP metadata / `{youtube: …}` directives (`YOUTUBE_API_KEY`) |
| **MusicBrainz** | MCP metadata fallback |
| **DuckDuckGo / DeepSeek web search** | MCP / AI web search when YouTube key missing or for general search |
| **Cifra Club / Ultimate Guitar** | `/api/cifra` scrape → ChordPro-ish import |

## Analytics and deploy

| Service | Used for |
|---------|----------|
| **PostHog** | Studio product analytics (client-side) |
| **Vercel Analytics** | Marketing site |
| **Vercel** | API (Fluid) + cron; Studio/marketing SPA hosting |
| **Cloudflare Workers** | Studio/blog static assets (Wrangler); Turnstile |
| **Netlify** | Alternate blog deploy target |
| **Google Tag Manager** | Blog — wired via `astro-gtm-lite`, disabled until a real GTM id is set |

## Client → external (not via API)

Some SDKs talk to vendors directly from the device/browser:

- Flutter / Studio → **Firebase** (messaging / Firestore listeners)
- Flutter → **Google Sign-In** (native) then exchanges ID token with Better Auth
- Studio → **PostHog**
- Marketing → **Vercel Analytics**, GoFundMe iframe

The API still owns: Stripe webhooks, Resend, FCM *send*, Firestore *writes* for annotations/notes signals, LLM calls, YouTube server-side, scrapers.

## Shared library (internal package, external publish)

`@hosanna/chordpro` is published to npm and consumed by Studio and this server. It is not a third-party SaaS, but it is a **cross-repo dependency** versioned separately from the apps.

## Secrets checklist (high level)

See `.env.example` for the full list. Groups:

- Database + Supabase
- Better Auth secret + Google OAuth
- Stripe keys + webhook secret
- Resend + `EMAIL_FROM`
- Firebase service account
- `CRON_SECRET`
- `AI_SETTINGS_ENCRYPTION_KEY`
- Optional `YOUTUBE_API_KEY`, `MCP_RESOURCE_URL`, `STUDIO_URL`, `PUBLIC_APP_URL`
