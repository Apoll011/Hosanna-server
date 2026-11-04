# Improvements, bugs, and TODOs

Living backlog from an architecture pass across all Hosanna repos.

**Suggested remaining order:** Firestore annotation ACL (#3) → Redis/Upstash global rate limits.

---

## Done (this pass)

| #   | Item                                                                  | Status                                                                                                                                                     |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Backup export/restore ignores collections/agenda; soft-delete restore | **Done** — backup v2.2 in `backup.service.ts` + helpers/tests                                                                                              |
| 2   | Folder delete→root never reparents children                           | **Done** — `reparentChildren` in folder service                                                                                                            |
| 4   | Flutter push dirty never set                                          | **Done** — `mark*Dirty` APIs + `replication_dirty_test.dart`                                                                                               |
| 5   | Flutter no agendaEvents sync                                          | **Done** — Drift table, adapter, `/agenda` page, drawer link                                                                                               |
| 6   | Studio dead JWT refresh                                               | **Done** — cookie-only `ApiClient`; download uses credentials                                                                                              |
| 7   | Server README / `.env.example` stale                                  | **Done** — Better Auth env list; seed script removed                                                                                                       |
| 8   | `@hosanna/chordpro` version skew                                      | **Done** — server + Studio on `^1.7.2`                                                                                                                     |
| 9   | Unused Supabase in Flutter                                            | **Done** — package + init removed                                                                                                                          |
| 10  | Hardcoded plan prices                                                 | **Done** — `GET /api/billing/pricing` + Studio/saas fetch                                                                                                  |
| 11  | `CORS_ORIGIN` unused; rate limit prod-only                            | **Done** — env merge + rate limits outside development                                                                                                     |
| 12  | Studio MainLayout double `useServices`                                | **Done** — single query + derived archived                                                                                                                 |
| 13  | Studio `.env.example` / `FLAG_KEY`                                    | **Done** — real `VITE_*` vars                                                                                                                              |
| 14  | Thin tests / Flutter hangs                                            | **Done** — backup helpers; dirty/agenda tests; auth UI hang fixed (`AuthStatus.unauthenticated` + `pumpFrames`); router shell tests skipped (CircleAvatar) |
| 15  | Blog privacy lorem / GTM placeholder                                  | **Done** — real policy; GTM id cleared; README rewritten                                                                                                   |

See also: [deploy-report.md](./deploy-report.md).

---

## Still open

### Critical / High

### 3. Firestore annotations / note pings are world-readable

|           |                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| **Where** | `Hosanna-server/firestore.rules` (`allow read: if true`); optional inline canvas in `src/lib/firestore.ts`     |
| **Why**   | Anyone who knows IDs can read annotation payloads.                                                             |
| **Fix**   | Firebase Auth custom tokens + `request.auth`, or metadata-only Firestore + authenticated API for canvas bytes. |

---

## Low / polish (remaining)

| Item                                     | Where                    | Notes                                              |
| ---------------------------------------- | ------------------------ | -------------------------------------------------- |
| Coming-soon feature UI                   | Studio `FeaturesTab`     | Left as product tracking (not in this pass)        |
| Android `google-services.json` committed | Flutter                  | Restrict/rotate API keys in GCP                    |
| Studio/server patch skew                 | 2.22.3 vs 2.22.2         | Major.minor aligned; patch need not match          |

### Done in OpenAPI / polish follow-up

| Item                              | Status                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| MCP deprecated error aliases      | **Done** — dropped `stale` / `forbidden` / `validation` / `subscription` / `error`             |
| Demo org slug collision           | **Done** — reserved `hosanna-demo` + `demo` in Better Auth; Studio `DEMO_ORG_SLUG`             |
| Flutter CircleAvatar router tests | **Done** — `onForegroundImageError` only when image set; shell tests re-enabled                |
| OpenAPI 3.1 + typed clients       | **Done on branches** — server `feat/openapi` (`openapi/openapi.yaml`); Studio+Flutter `feat/openapi-client` |

---

## Nice-to-have

1. ~~OpenAPI / typed clients for Studio + Flutter~~ → see follow-up table above
2. ~~Replication observability~~ — deferred / cancelled for this pass
3. Idempotent backup policy for annotations/notes
4. Flutter offline song edits using `mark*Dirty`
5. Golden tests Dart ChordPro ↔ `@hosanna/chordpro`
6. Redis/Upstash global rate limits on Vercel
7. Enable blog GTM with a real container ID
8. E2E smoke: auth → org → sync → open song
