# Clients

## Hosanna Studio (`Hosana-dashboard`)

**What it is:** Preact + Vite PWA for worship leaders and staff. Local-first; talks to the API with cookies.

**Key capabilities**

- Drive / folder explorer, song library, ChordPro editor (`@hosanna/chordpro` + Ace)
- Collections, services (order of worship), agenda, teams, trash
- Organization settings: members, branding, notifications, billing, AI (“Logos”)
- MCP OAuth consent page (`/oauth/consent`)
- Demo mode (local-only DB, no replication)
- PostHog analytics (prod); Cloudflare Turnstile on login

**Local data**

- Custom IndexedDB engine under `src/db/` (ex-RxDB)
- Collections: `songs`, `folders`, `collections`, `services`, `agendaEvents`
- Replication: push then pull on a ~15s interval, on `online`, and on local change bus / AI `studio_sync`

**Auth client**

- `better-auth` with plugins: i18n, dash, sentinel (infra), inbox, twoFactor, stripe, organization (+ teams)
- Session via `credentials: "include"`; org must be active; trial/subscription gates onboarding

**API base**

- `VITE_API_URL` or `localStorage.server_url`, defaulting toward `/api`
- Auth baseURL strips trailing `/api` so Better Auth hits `{origin}/api/auth/...`

---

## Hosanna Flutter app (`Hosanna`)

**What it is:** Musician-facing app (formerly Capacitor). Offline-first with Drift/SQLite.

**Shell branches**

Songs → Services → Metronome → Circle of fifths → Folders → Settings

**Auth**

- Hand-rolled Better Auth client over Dio
- Cookies (`PersistCookieJar`) **and** Bearer (`set-auth-token` → secure storage)
- Email + Turnstile (WebView to Studio captcha page) or native Google ID token → `/api/auth/sign-in/social`
- FCM token stored on the **session** (`update-session` with `fcm` / `notify`)

**Sync**

- `SyncController` + `ReplicationEngine` + adapters for songs/folders/collections/services
- Pull-first today; push path exists for dirty rows
- Org switch clears local DB + checkpoints then re-syncs
- Resume / pull-to-refresh / settings manual sync triggers

**Realtime extras**

- Firestore: annotation docs + notes ping; REST for payload
- Local `.fcv` annotation cache offline

**ChordPro**

- Dart port under `lib/features/songs/domain/chordpro/` (parser, transpose, instruments, renderer widgets)
- Does **not** import the npm package

**Configured but idle**

- `supabase_flutter` is initialized; features currently use the API / Drift / Firebase instead

---

## Marketing (`hosanna-saas`)

Static Vite/React site. CTAs point at `VITE_DASHBOARD_URL` (Studio). Vercel Analytics. No product API calls. ChordPro **guide** page is narrative only.

## Blog (`hosanna-blog`)

Astro MDX content site. Deploy via Wrangler (Cloudflare) or Netlify. GTM wired but disabled by default. Linked from marketing; no auth/API.

---

## MCP clients

External AI tools connect to `POST /mcp` (Streamable HTTP) or stdio (`npm run mcp`).

1. Discover OAuth protected resource / AS metadata
2. Authorize in Studio (`/login` → `/oauth/consent`)
3. Call MCP with audience = `MCP_RESOURCE_URL`

ChordPro tools can work without org context; library/service tools need session + permissions (+ subscription for writes). See [../mcp/README.md](../mcp/README.md).

---

## Client comparison

| Concern | Studio | Flutter | MCP |
|---------|--------|---------|-----|
| Primary UX | Plan & edit | Perform & read | Automate via AI |
| Local store | IndexedDB | Drift/SQLite | None |
| Sync | Full 5 collections | songs/folders/collections/services | N/A (direct API tools) |
| Auth transport | Cookies | Cookies + Bearer | OAuth / Bearer |
| ChordPro | `@hosanna/chordpro` | Dart port | Server-side package |
| AI | Logos UI → `/api/ai/chat` | — | MCP tools |
