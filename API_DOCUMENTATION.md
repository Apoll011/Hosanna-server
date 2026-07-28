# Hosanna Studio API — Documentation

Base URL: `http://localhost:3000/api`

All request/response bodies are JSON unless noted. All mutating endpoints
validate input with Zod; validation failures return `400 VALIDATION_ERROR`
with per-field details.

## Error format

```json
{
  "error": {
    "code": "SONG_NOT_FOUND",
    "message": "Song does not exist.",
    "details": [ { "path": "title", "message": "Required" } ]
  }
}
```

`details` is only present for `VALIDATION_ERROR`.

## Authentication

Two independent bearer-token schemes share the same `Authorization: Bearer <token>` header:

| Scheme | Token type | Who | Grants |
|---|---|---|---|
| Administrator | JWT, signed with `JWT_ACCESS_SECRET`, 8h default | Dashboard users | Full CRUD on everything |
| Musician | Opaque high-entropy string (`mus_...`), stored hashed, distributed via QR code | Band/vocal team members | View/download songs & folders, view services, edit service notes & per-song notes inside services |

Routes marked **Admin or Musician** accept either token type. Routes marked
**Admin only** reject a musician token with `403 FORBIDDEN`.

### Optimistic concurrency

Every endpoint that mutates a Song, Folder, Service, or MusicianToken
requires the client to send back the `updatedAt` timestamp it last read
(as an ISO-8601 string) inside the request body. If the record changed in
the meantime, the API responds `409 CONFLICT`:

```json
{ "error": { "code": "CONFLICT", "message": "This song was modified by someone else since you last loaded it." } }
```

---

## Auth

### `POST /api/auth/login`
**Authentication:** None

Request body
```json
{ "email": "leader@church.org", "password": "..." }
```

Response `200`
```json
{
  "user": { "id": "uuid", "email": "leader@church.org", "name": "Worship Director", "role": "admin" },
  "token": "eyJ...",
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```
`token` is kept as an alias of `accessToken` for backward compatibility with the reference dashboard.

Errors: `400` (missing fields), `401 INVALID_CREDENTIALS`

> **Change from reference implementation:** the prototype accepted *any*
> password, or a bare `bearerToken` field, and fabricated a user on the fly.
> Production login now verifies a real bcrypt-hashed password against the
> `admins` table. The insecure shortcut was removed as a security fix.

---

### `POST /api/auth/refresh`
**Authentication:** None (refresh token in body)

Request body
```json
{ "refreshToken": "eyJ..." }
```

Response `200`
```json
{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```
Refresh tokens are rotated: the one you sent is revoked and a new one is issued.

Errors: `400` (missing field), `401 INVALID_REFRESH_TOKEN`

---

### `GET /api/auth/me`
**Authentication:** Administrator

Response `200`
```json
{ "user": { "id": "uuid", "email": "leader@church.org", "name": "Worship Director", "role": "admin" } }
```

Errors: `401`, `404 ADMIN_NOT_FOUND`

---

### `POST /api/auth/logout`
**Authentication:** None

Request body (optional)
```json
{ "refreshToken": "eyJ..." }
```
If provided, the refresh token is revoked server-side so it can no longer be used to mint new access tokens. (The prototype's logout was a no-op; this version actually invalidates the session.)

Response `200`: `{ "message": "Logged out successfully" }`

---

## Songs

### `GET /api/songs`
**Authentication:** Admin or Musician

Query parameters
| Name | Type | Description |
|---|---|---|
| page | number | Page number (default 1) |
| limit | number | Results per page (default 50, max 200) |
| folder | string | Folder UUID, or the literal `root` |
| search | string | Free-text search |
| searchFields | string | JSON-encoded `{title?,artist?,content?,tags?}` to scope `search` |
| key | string | Filter by ChordPro `{key: ...}` directive |
| tag | string | Filter by exact tag |
| sortBy | string | `title` \| `artist` \| `createdAt` \| `updatedAt` (default `title`) |
| sortOrder | string | `asc` \| `desc` (default `asc`) |

Response `200`
```json
{ "songs": [ { "id": "uuid", "title": "...", "artist": "...", "content": "...", "folderId": "uuid|null", "path": "...", "tags": ["..."], "createdAt": "...", "updatedAt": "..." } ], "total": 5, "page": 1, "totalPages": 1 }
```

Errors: `400`, `401`

---

### `GET /api/songs/:id`
**Authentication:** Admin or Musician

Response `200`: a single Song object (see shape above).

Errors: `400` (bad UUID), `401`, `404 SONG_NOT_FOUND`

---

### `GET /api/songs/:id/download` — *NEW*
**Authentication:** Admin or Musician

Returns the raw ChordPro source as a file download (`Content-Type: text/vnd.chordpro`, `Content-Disposition: attachment`).

**Why it was added:** the spec requires musicians to be able to *download*
songs, not just view JSON. This endpoint streams the plain `.pro` file
content with correct headers so a mobile client can save it directly.

Errors: `400`, `401`, `404 SONG_NOT_FOUND`

---

### `POST /api/songs`
**Authentication:** Administrator

Request body
```json
{ "title": "Amazing Grace", "artist": "John Newton", "content": "{title: ...}", "folderId": "uuid|null", "path": "optional/custom/path.pro", "tags": ["Hymn"] }
```
Only `title` is required.

Response `201`: the created Song.

Errors: `400`, `401`, `403`

---

### `POST /api/songs/batch`
**Authentication:** Administrator

Request body
```json
{ "songs": [ { "title": "...", "artist": "...", "content": "...", "folderId": "uuid|null", "tags": [] } ] }
```

Response `201`
```json
{ "created": [ /* Song[] */ ], "count": 2 }
```

Errors: `400`, `401`, `403`

---

### `PUT /api/songs/batch-tags`
**Authentication:** Administrator

Request body
```json
{ "songIds": ["uuid", "uuid"], "tags": ["Worship"], "mode": "append" }
```
`mode`: `append` (default) | `replace` | `remove`.

Response `200`: `{ "success": true, "count": 2 }`

Errors: `400`, `401`, `403`

---

### `PUT /api/songs/:id`
**Authentication:** Administrator — optimistic concurrency

Request body
```json
{ "updatedAt": "2026-07-20T10:00:00.000Z", "title": "New Title", "content": "...", "folderId": "uuid|null", "tags": ["..."] }
```
All fields besides `updatedAt` are optional partial updates.

Response `200`: the updated Song.

Errors: `400`, `401`, `403`, `404 SONG_NOT_FOUND`, `409 CONFLICT`

---

### `DELETE /api/songs/:id`
**Authentication:** Administrator

Deletes the song. Any `ServiceSong` rows referencing it are removed automatically (database cascade), so it disappears from every service's setlist too.

Response `204`: empty body.

Errors: `400`, `401`, `403`, `404 SONG_NOT_FOUND`

---

### `PUT /api/songs/:id/rename`
**Authentication:** Administrator — optimistic concurrency

Request body
```json
{ "updatedAt": "...", "newTitle": "New Title", "newPath": "optional/new/path.pro" }
```

Response `200`: the updated Song.

Errors: `400`, `401`, `403`, `404`, `409`

---

### `PUT /api/songs/:id/move`
**Authentication:** Administrator — optimistic concurrency

Request body
```json
{ "updatedAt": "...", "folderId": "uuid|null", "newPath": "optional/new/path.pro" }
```

Response `200`: the updated Song.

Errors: `400`, `401`, `403`, `404`, `409`

---

## Folders

### `GET /api/folders`
**Authentication:** Admin or Musician

Response `200`
```json
{ "folders": [ { "id": "uuid", "name": "Hymns", "parentId": null, "createdAt": "...", "updatedAt": "...", "songCount": 4 } ], "rootSongsCount": 2 }
```

Errors: `401`

---

### `GET /api/folders/flat` — *NEW*
**Authentication:** Admin or Musician

Returns the bare list of Folder records (no counts), suitable for populating
a folder picker/dropdown cheaply. There is no `Folder` row for "root" —
root is the implicit state of a Song whose `folderId` is `null` — so this
endpoint naturally satisfies "all folders excluding the implicit root."

Response `200`: `Folder[]`

Errors: `401`

---

### `POST /api/folders`
**Authentication:** Administrator

Request body
```json
{ "name": "Hymns", "parentId": "uuid|null" }
```

Response `201`: the created Folder, with `songCount: 0`.

Errors: `400`, `401`, `403`

---

### `PUT /api/folders/:id`
**Authentication:** Administrator — optimistic concurrency

Request body
```json
{ "updatedAt": "...", "name": "New Name", "parentId": "uuid|null" }
```
Renaming a folder also updates the `path` of every song inside it, matching the reference behavior.

Response `200`: the updated Folder.

Errors: `400`, `401`, `403`, `404 FOLDER_NOT_FOUND`, `409`

---

### `DELETE /api/folders/:id?action=move_to_root|delete_songs`
**Authentication:** Administrator

Legacy combined endpoint, kept for backward compatibility. `action` (query
param, or `action` in the body) selects the behavior; defaults to
`move_to_root`.

Response `200`: `{ "message": "Folder deleted", "actionUsed": "move_to_root", "movedSongs": 3 }` (or `deletedSongs` for `delete_songs`).

Errors: `400`, `401`, `403`, `404`

---

### `DELETE /api/folders/:id/move-songs-to-root` — *NEW*
**Authentication:** Administrator

Explicit variant: moves every song in the folder to root (`folderId = null`), then deletes the folder.

Response `200`: `{ "movedSongs": 3 }`

Errors: `400`, `401`, `403`, `404`

---

### `DELETE /api/folders/:id/with-songs` — *NEW*
**Authentication:** Administrator

Explicit variant: deletes the folder and every song inside it.

Response `200`: `{ "deletedSongs": 3 }`

Errors: `400`, `401`, `403`, `404`

> **Why both DELETE variants were added:** the spec calls for separate,
> discoverable endpoints for each destructive path instead of overloading a
> single query parameter, so API clients (and API docs/OpenAPI tooling) can
> distinguish "safe" and "destructive" deletes at the routing level. The
> original combined endpoint is kept so the existing dashboard keeps working
> unmodified.

---

## Services

A Service's songs are stored in a normalized `service_songs` join table
(`serviceId`, `songId`, `position`, `notes`) instead of the reference
implementation's ad-hoc `{ songs: [...], songNotes: {} }` pair. Every
response is serialized back into a superset of the original shape:

```json
{
  "id": "uuid",
  "name": "Sunday Morning Service",
  "date": "2026-07-26",
  "notes": "...",
  "songIds": ["uuid1", "uuid2"],
  "songs": [ { "songId": "uuid1", "notes": "Soft intro", "position": 0 } ],
  "songNotes": { "uuid1": "Soft intro" },
  "createdAt": "...",
  "updatedAt": "..."
}
```

### `GET /api/services`
**Authentication:** Admin or Musician

Response `200`: `Service[]` (shape above).

Errors: `401`

---

### `GET /api/services/:id`
**Authentication:** Admin or Musician (scoped: a musician token restricted via `allowedServices` gets `403` on services outside its scope)

Response `200`: a Service.

Errors: `400`, `401`, `403`, `404 SERVICE_NOT_FOUND`

---

### `POST /api/services`
**Authentication:** Administrator

Request body
```json
{ "name": "Sunday Morning Service", "date": "2026-07-26", "notes": "...", "songIds": ["uuid1", "uuid2"], "songNotes": { "uuid1": "Soft intro" } }
```
Also accepts the legacy `songs: [{songId, notes}]` shape.

Response `201`: the created Service.

Errors: `400` (incl. unknown song ids), `401`, `403`

---

### `PUT /api/services/:id`
**Authentication:** Administrator — optimistic concurrency

Request body: same shape as create, plus `updatedAt`; all fields optional partial updates. If `songs`/`songIds`/`songNotes` is supplied, the entire setlist is replaced.

Response `200`: the updated Service.

Errors: `400`, `401`, `403`, `404`, `409`

---

### `DELETE /api/services/:id`
**Authentication:** Administrator

Response `204`: empty body.

Errors: `400`, `401`, `403`, `404`

---

### `POST /api/services/:id/songs` — *NEW*
**Authentication:** Administrator — optimistic concurrency

Request body
```json
{ "updatedAt": "...", "songId": "uuid", "notes": "optional", "position": 2 }
```
Adds a single song to the setlist without resending the whole list. `position` defaults to the end.

Response `201`: the updated Service.

Errors: `400` (unknown song, or song already in service), `401`, `403`, `404`, `409`

---

### `DELETE /api/services/:id/songs/:songId` — *NEW*
**Authentication:** Administrator — optimistic concurrency (`updatedAt` in body)

Response `200`: the updated Service.

Errors: `400`, `401`, `403`, `404 SONG_IN_SERVICE_NOT_FOUND`, `409`

---

### `PUT /api/services/:id/songs/reorder` — *NEW*
**Authentication:** Administrator — optimistic concurrency

Request body
```json
{ "updatedAt": "...", "orderedSongIds": ["uuid2", "uuid1", "uuid3"] }
```
Must contain exactly the same song ids already in the service (a permutation), otherwise `400`.

Response `200`: the updated Service.

Errors: `400`, `401`, `403`, `404`, `409`

---

### `PUT /api/services/:id/songs/:songId/move` — *NEW*
**Authentication:** Administrator — optimistic concurrency

Request body
```json
{ "updatedAt": "...", "targetIndex": 0 }
```
Moves a single song to the given zero-based index, shifting others.

Response `200`: the updated Service.

Errors: `400`, `401`, `403`, `404 SONG_IN_SERVICE_NOT_FOUND`, `409`

---

### `PUT /api/services/:id/notes` — *NEW*
**Authentication:** Admin or Musician (scoped) — optimistic concurrency

Request body
```json
{ "updatedAt": "...", "notes": "Extended prayer time before song 2" }
```

Response `200`: the updated Service.

Errors: `400`, `401`, `403`, `404`, `409`

> **Why it was added:** the spec requires musicians be able to edit service
> notes. The reference implementation only exposed a single admin-only
> `PUT /api/services/:id` for the whole object; a focused notes endpoint lets
> a musician token update notes without granting it the ability to rename
> the service, change its date, or touch the setlist.

---

### `PUT /api/services/:id/songs/:songId/notes` — *NEW*
**Authentication:** Admin or Musician (scoped) — optimistic concurrency

Request body
```json
{ "updatedAt": "...", "notes": "Capo 2, slower tempo" }
```

Response `200`: the updated Service.

Errors: `400`, `401`, `403`, `404 SONG_IN_SERVICE_NOT_FOUND`, `409`

---

## Musician access tokens

All endpoints under `/api/musicians/tokens` are **Administrator only** —
musicians never manage tokens, only use them.

A token's raw secret value is generated once, hashed with SHA-256 before
storage, and returned to the caller **exactly once** (on creation or
regeneration) together with a ready-to-print QR code. It cannot be
recovered afterwards — only revoked or regenerated.

### `GET /api/musicians/tokens`
Response `200`: array of
```json
{ "id": "uuid", "name": "Sunday Band Access", "tokenPreview": "••••a91f", "status": "active", "expiresAt": "...", "revokedAt": null, "lastUsedAt": "...", "allowedServices": ["uuid"], "createdAt": "...", "updatedAt": "..." }
```
`status` is derived: `active` | `expired` | `revoked`. `allowedServices: []` means unrestricted (all services).

Errors: `401`, `403`

---

### `GET /api/musicians/tokens/:id` — *NEW*
Response `200`: single token metadata (shape above, no raw token).

Errors: `400`, `401`, `403`, `404 MUSICIAN_TOKEN_NOT_FOUND`

---

### `POST /api/musicians/tokens`
Request body
```json
{ "name": "Sunday Band Access", "expiresAt": "2026-08-30T00:00:00.000Z", "allowedServices": ["uuid"] }
```
`expiresAt` defaults to `MUSICIAN_TOKEN_DEFAULT_DAYS` (30) days out. `allowedServices` omitted or `[]` = all services.

Response `201`
```json
{
  "id": "uuid", "name": "...", "tokenPreview": "••••a91f", "status": "active",
  "expiresAt": "...", "allowedServices": [], "createdAt": "...", "updatedAt": "...",
  "token": "mus_9F2k...",
  "accessUrl": "https://dashboard.example.com/musician/access?token=mus_9F2k...",
  "qrCode": "data:image/png;base64,..."
}
```
`token`, `accessUrl`, and `qrCode` are only ever present in this response and the regenerate response below.

Errors: `400`, `401`, `403`

---

### `PUT /api/musicians/tokens/:id` — *NEW*
**Optimistic concurrency**

Request body
```json
{ "updatedAt": "...", "name": "New label", "expiresAt": "...", "allowedServices": ["uuid"] }
```
Updates metadata only — never the token value itself (use regenerate for that).

Response `200`: token metadata.

Errors: `400`, `401`, `403`, `404`, `409`

---

### `POST /api/musicians/tokens/:id/regenerate` — *NEW*
**Optimistic concurrency**

Issues a brand-new raw token (the old one stops working immediately) and a new QR code, un-revoking the record if it had been revoked.

Request body: `{ "updatedAt": "..." }`

Response `201`: same shape as create's response (includes `token`, `accessUrl`, `qrCode`).

Errors: `400`, `401`, `403`, `404`, `409`

---

### `DELETE /api/musicians/tokens/:id`
**Optimistic concurrency** (`updatedAt` in body)

Soft-revokes the token: it stops authenticating immediately, but the row is kept for audit history (who had access, when it was cut off).

Response `200`: the token metadata with `status: "revoked"`.

Errors: `400`, `401`, `403`, `404`, `409`

> **Change from reference implementation:** the prototype hard-deleted the
> token record on `DELETE`. Production keeps a revoked record instead, so
> admins retain an audit trail and can support the "regeneration" flow the
> spec calls for. Use the endpoint below for true removal.

---

### `DELETE /api/musicians/tokens/:id/permanent` — *NEW*
Hard-deletes the token record entirely (e.g. for data-retention/GDPR-style purges).

Response `204`: empty body.

Errors: `400`, `401`, `403`, `404`

---

## Settings

### `GET /api/settings`
**Authentication:** Administrator

Response `200`
```json
{ "id": "settings", "serverName": "...", "defaultKey": "G", "syncIntervalSeconds": 30, "allowPublicRead": false, "autoBackupEnabled": true, "maxUploadMB": 10, "updatedAt": "..." }
```

Errors: `401`, `403`

---

### `PUT /api/settings`
**Authentication:** Administrator

Request body: any subset of the fields above (all optional).

Response `200`: the updated settings object.

Errors: `400`, `401`, `403`

---

## Backup

### `GET /api/backup`
**Authentication:** Administrator

Exports the entire dataset as JSON (folders, songs, services with their song links, musician tokens — hashed, settings).

Response `200`: `{ "version": "2.0", "exportedAt": "...", "folders": [...], "songs": [...], "services": [...], "musicianTokens": [...], "settings": {...} }`

Errors: `401`, `403`

---

### `POST /api/backup/restore`
**Authentication:** Administrator

Request body: a previously exported backup object (same shape as the `GET /api/backup` response).

Replaces the entire database contents inside a single transaction
(all-or-nothing). Musician token *hashes* are restored as-is, so QR codes
issued before the restore keep working — the raw secret is never included
in a backup because it's never stored server-side in the first place.

Response `200`: `{ "message": "Backup restored successfully", "counts": { "folders": 3, "songs": 5, "services": 2, "musicianTokens": 2 } }`

Errors: `400 INVALID_BACKUP_FILE`, `401`, `403`

---

## Health

### `GET /api/health` — *NEW*
**Authentication:** None

Pings the database and returns `{ "status": "ok", "timestamp": "..." }`. Used by the Docker Compose healthcheck / load balancers / uptime monitors.

Errors: `500` if the database is unreachable.

---

## Summary of endpoints new since the reference prototype

| Endpoint | Why |
|---|---|
| `GET /api/songs/:id/download` | Explicit file-download semantics for musicians, distinct from viewing JSON. |
| `GET /api/folders/flat` | Lightweight folder list for pickers, without recomputing song counts. |
| `DELETE /api/folders/:id/move-songs-to-root`, `DELETE /api/folders/:id/with-songs` | Separate, self-documenting endpoints per the spec, instead of one endpoint overloaded by a query parameter. |
| `POST /api/services/:id/songs`, `DELETE /api/services/:id/songs/:songId` | Add/remove a single song without resending the entire setlist (avoids lost-update races between two admins editing different songs at once). |
| `PUT /api/services/:id/songs/reorder`, `PUT /api/services/:id/songs/:songId/move` | Explicit reordering primitives required by the spec. |
| `PUT /api/services/:id/notes`, `PUT /api/services/:id/songs/:songId/notes` | Narrow, musician-accessible write endpoints so a musician token can update notes without admin-level access to the whole service. |
| `GET/PUT /api/musicians/tokens/:id`, `POST /api/musicians/tokens/:id/regenerate`, `DELETE /api/musicians/tokens/:id/permanent` | Full CRUD + regeneration/revocation lifecycle required by the spec (the prototype only had list/create/hard-delete). |
| `GET /api/health` | Needed by the Docker Compose healthcheck and any production load balancer/uptime monitor. |
