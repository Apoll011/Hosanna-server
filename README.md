# HOssana-server

Production-ready rewrite of the ChoPro song/service sync server. Now supports
full ChordPro library management for desktop dashboards.
Same API contract as the original (`/api/sync`, `/api/save_song`, `/api/delete_song`),
rebuilt with the hardening, reliability, and operational features a real
deployment needs.

## What changed vs. the original

- **Security**
  - Path-traversal protection now *rejects* unsafe paths (`safeResolve`)
    instead of silently rewriting them.
  - Bearer token comparison uses `crypto.timingSafeEqual` to avoid timing
    side-channels.
  - The server **refuses to start in production** without an explicit
    `SYNC_API_TOKEN` (no silent fallback to a default/dev token).
  - `helmet` security headers, configurable CORS allow-list (no more
    wildcard-by-default in production), and per-route rate limiting.
  - Request body size and per-song size limits are enforced and configurable.
  - File writes are extension-allow-listed (`.chopro`, `.cho`, `.pro`).
- **Reliability**
  - Atomic writes: content is written to a temp file and `rename`d into
    place, so a crash mid-write can never leave a corrupt/partial file.
  - `services.json` reads/writes are serialized with a mutex, eliminating
    the read-modify-write race in the original (two concurrent syncs could
    silently drop each other's updates).
  - Deletes are idempotent (deleting a non-existent song still returns
    success, matching client expectations).
  - Symlinks inside the songs directory are not followed when listing files.
  - A single unreadable file no longer fails the entire sync; it's skipped
    and logged.
- **Operability**
  - Structured JSON logs (`pino`) with per-request IDs, pretty-printed in
    development.
  - `GET /api/health` for load balancers / container orchestrators.
  - Graceful shutdown on `SIGTERM`/`SIGINT` with a force-exit timeout.
  - All configuration is validated at startup with `zod`; the process exits
    immediately with a clear error instead of failing weirdly at runtime.
  - Dockerfile (multi-stage, non-root user, healthcheck) and Compose file.
- **Correctness / DX**
  - Request bodies are validated with `zod` schemas (clear 400s instead of
    `undefined` crashes).
  - Centralized error handling — every error path returns a consistent
    `{ error, code, details, requestId }` shape.
  - Full TypeScript strictness (`strict`, `noUnusedLocals`, etc.), ESM
    throughout.
  - Static frontend hosting is now a proper production code path
    (`express.static` + SPA fallback) instead of always running a Vite dev
    server; Vite is only loaded (optionally) in development.

## What's New: Dashboard Support

The server now includes a set of endpoints designed to support a desktop dashboard for full ChordPro library management:

- **Folder Management**: Create and delete directories within the songs library.
- **File/Folder Renaming**: Move or rename files and folders with safety checks.
- **Improved Listing**: Dedicated `/api/songs` endpoint for lightweight library browsing.

All features maintain full backwards compatibility with existing clients.

## API

All endpoints are prefixed with `/api` and (except `/health`) require:

```
Authorization: Bearer <SYNC_API_TOKEN>
```

| Method | Path                | Description                                              |
|--------|---------------------|------------------------------------------------------------|
| GET    | `/api/health`        | Liveness check. No auth required.                          |
| POST   | `/api/sync`           | Returns all song files plus the merged service list. Body: `{ services?: [{ id, ...fields }] }`. Services are upserted by `id`. |
| POST   | `/api/save_song`      | Body: `{ path, content }`. Writes/overwrites a song file.  |
| DELETE | `/api/delete_song`    | Body: `{ path }`. Idempotent.                              |
| GET    | `/api/songs`          | Lists song files without touching services.                |
| POST   | `/api/create_folder`   | Body: `{ path }`. Creates a directory (recursive).         |
| DELETE | `/api/delete_folder`   | Body: `{ path }`. Deletes a directory and its contents.    |
| POST   | `/api/rename`          | Body: `{ oldPath, newPath }`. Renames or moves a file/folder. |
| GET    | `/api/tree`            | Returns the complete folder tree of the library.        |
| GET    | `/api/search`          | Query params: `query`, `folder`, `tags`, `artist`, `title`. Fast search. |
| POST   | `/api/upload`          | Body: `multipart/form-data` with `files` and optional `folder`. |
| GET    | `/api/download`        | Query params: `path`. Returns original ChordPro file.    |
| POST   | `/api/create_empty`    | Body: `{ path, title? }`. Creates an empty song.         |

Error responses:

```json
{ "error": "message", "code": "BAD_REQUEST", "details": {}, "requestId": "..." }
```

## Getting started

```bash
cp .env.example .env
# edit .env and set SYNC_API_TOKEN

npm install
npm run dev        # development, auto-reload via tsx
```

Production:

```bash
npm run build
npm start
```

Docker:

```bash
export SYNC_API_TOKEN=$(openssl rand -hex 24)
docker compose up --build
```

## Configuration

See `.env.example` for the full list. Key variables:

| Variable | Default | Notes |
|---|---|---|
| `SYNC_API_TOKEN` | *(required in prod)* | Bearer token clients must send. |
| `DATA_DIR` | `./data` | Where songs and `services.json` are stored. |
| `CORS_ORIGINS` | `*` | Comma-separated allow-list; set explicitly in production. |
| `MAX_SONG_SIZE_BYTES` | `2097152` (2 MB) | Per-song content size cap. |
| `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_MS` | `120` / `60000` | Per-IP limit on `/api/*`. |
| `SERVE_STATIC` / `STATIC_DIR` | `false` / `./client/dist` | Serve a built SPA alongside the API in production. |

## Project layout

```
src/
  config.ts        env validation
  logger.ts         pino logger
  types.ts           AppError + shared types
  app.ts               express app assembly
  server.ts           bootstrap + graceful shutdown
  middleware/       auth, request id, error handling
  routes/                health, sync, songs
  services/             fileService (songs on disk), serviceStore (services.json)
  utils/                  path safety helpers
```
