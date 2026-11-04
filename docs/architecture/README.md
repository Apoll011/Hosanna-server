# Hosanna Architecture

Hosanna is a **local-first worship planning platform**: churches organize songs and services in **Studio**, musicians use them offline in the **Flutter app**, and both sync through this **API**. Marketing sites sit outside the data plane.

## Docs in this folder

| Doc | What it covers |
|-----|----------------|
| [system-overview.md](./system-overview.md) | Entire ecosystem: repos, domains, who talks to whom |
| [diagram.md](./diagram.md) | Full Mermaid system diagram + sync sequence |
| [clients.md](./clients.md) | Studio, Flutter, marketing, MCP clients |
| [backend-internals.md](./backend-internals.md) | Express routes, services, middleware, Prisma |
| [data-and-sync.md](./data-and-sync.md) | Local stores, RxDB-style replication, trash |
| [auth-and-billing.md](./auth-and-billing.md) | Better Auth, RBAC, Stripe, entitlements |
| [external-integrations.md](./external-integrations.md) | Supabase, Firebase, AI, YouTube, email, … |
| [improvements.md](./improvements.md) | Bugs, TODOs, tech debt, and suggested fixes |
| [deploy-report.md](./deploy-report.md) | Vercel / Cloudflare / Supabase / Firebase checklist |

Related (outside this folder):

- [../mcp/README.md](../mcp/README.md) — MCP tools, OAuth, ChordPro skills
- [../ANNOTATIONS_FIREBASE.md](../ANNOTATIONS_FIREBASE.md) — Firestore annotation paths

## Mental model (one paragraph)

**Studio** and **Flutter** keep org song/folder/service/agenda data locally (IndexedDB / Drift). They push and pull against `/api/replication/*` on **Hosanna-server**. Auth and org membership are **Better Auth** (cookies or Bearer). Writes that need a paid plan go through a **Stripe** subscription gate. Live collaboration for service notes and song annotations uses **Firestore** signals on top of Postgres. **MCP** and **Logos AI** mutate the same server domain and then kick client sync. **@hosanna/chordpro** is the shared song format for Studio and the API; Flutter ports the same logic in Dart.

## Product surfaces

```
hosanna.live          → marketing (hosanna-saas)
blog.hosanna.live     → blog (hosanna-blog)
studio.hosanna.live   → Studio SPA (Hosana-dashboard)
api.hosanna.live      → this backend (@hosanna/backend)
mobile / desktop      → Flutter musician app (Hosanna)
```
