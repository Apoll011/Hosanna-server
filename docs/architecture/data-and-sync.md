# Data model and sync

Hosanna is **local-first** for the core library: clients own a full org copy and reconcile with the server over HTTP replication. Auth, billing, notes, annotations, and AI config use normal REST (plus Firestore for live signals).

## Local stores

| Client  | Engine                      | Collections                                         |
| ------- | --------------------------- | --------------------------------------------------- |
| Studio  | IndexedDB (`src/db/engine`) | songs, folders, collections, services, agendaEvents |
| Flutter | Drift / SQLite              | songs, folders, collections, services               |

Studio also replicates `agendaEvents`. Flutter’s sync adapters today cover the four library/service collections; agenda may follow the same protocol when added on mobile.

### Local row flags

Typical fields on replicated docs:

- Domain payload (title, content, elements JSON, …)
- `updatedAt`, `id` — checkpoint / conflict identity
- Soft-delete: `isDeleted` / `purgeAt` (or server `_deleted` tombstone)
- Flutter: `dirty` marks rows waiting for push

## Replication protocol

Inspired by **RxDB HTTP replication**.

### Endpoints

- `POST /api/replication/:collection/pull`
- `POST /api/replication/:collection/push`
- `POST /api/replication/pull` — multi-collection pull

**Collections:** `songs` | `folders` | `collections` | `services` | `agendaEvents`

### Pull

1. Client sends checkpoint `{ updatedAt, id }` + `limit` (often 100)
2. Server returns documents changed after the checkpoint for the active org
3. Client upserts or applies tombstones; advances checkpoint
4. `syncCache` may skip DB work if the tenant has no new changes

### Push

1. Client sends `changeRows` with `assumedMasterState` (optimistic concurrency)
2. Requires **subscription** entitlement
3. Server applies or returns **conflicts** (client typically server-wins)
4. Flutter marks pushed rows clean; Studio clears pending diffs

### Triggers

| Studio                     | Flutter                       |
| -------------------------- | ----------------------------- |
| Auth → start replication   | First active org → `syncAll`  |
| ~15s interval              | App resume if last sync > 60s |
| `window` `online`          | Pull-to-refresh on lists      |
| Debounced local change bus | Settings → manual sync        |
| AI / MCP `studio_sync`     | Org switch → wipe + resync    |

### Order

Studio pulls/pushes with **services before agendaEvents** (FK / dependency).

## Soft delete and trash

1. User deletes → soft-delete (`isDeleted`, `purgeAt` ≈ 30 days) still visible in trash APIs
2. Replication distributes the soft-delete / later `_deleted` tombstone
3. Cron `purge-trash` hard-deletes expired rows server-side
4. Clients also purge local rows past `purgeAt`

Restore: `POST /api/trash/{songs|folders|services}/:id/restore` (then sync).

## What is _not_ replicated

| Data                       | Why / how instead                                                        |
| -------------------------- | ------------------------------------------------------------------------ |
| Service notes              | Privacy (private notes); REST `/api/services/:id/notes` + Firestore ping |
| Song annotations           | Large canvas + live presence; REST + Firestore + local `.fcv`            |
| Notifications              | Better Auth inbox + FCM                                                  |
| AI settings / memory       | Org-scoped REST                                                          |
| Auth / membership / Stripe | Better Auth + Stripe plugins                                             |

## Conflict model

- Identity: `(id, updatedAt)` optimistic lock
- On conflict, server returns its master document; clients overwrite local
- Partial field diffs on Studio push reduce payload size

## Backup

`GET /api/backup` / `POST /api/backup/restore` export or restore folders + songs + services (format v2.1). Complements replication for migrations and disaster recovery — not a substitute for continuous sync.

## Annotations + notes (live path)

```
Client ──PUT/GET──► API ──persist──► Postgres
                      └──signal──► Firestore
Client ◄──snapshot── Firestore
Client ◄──poll REST── API (fallback)
```

Details: [../ANNOTATIONS_FIREBASE.md](../ANNOTATIONS_FIREBASE.md).
