# Hossana-server

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
| `HTTPS_ENABLED` | `false` | Enable HTTPS support. |
| `SSL_KEY_FILE` / `SSL_CRT_FILE` | *(optional)* | Paths to SSL key and certificate files (required if `HTTPS_ENABLED` is `true`). |
| `SERVE_STATIC` / `STATIC_DIR` | `false` / `./client/dist` | Serve a built SPA alongside the API in production. |

### HTTPS and SSL

To enable HTTPS, set `HTTPS_ENABLED=true` in your `.env` file and provide paths to your SSL certificate and key.

For local development, you can generate self-signed certificates using the following command:

```bash
npm run generate-certs
```

This will create `certs/server.key` and `certs/server.crt`. You can then configure them in your `.env`:

```env
HTTPS_ENABLED=true
SSL_KEY_FILE=./certs/server.key
SSL_CRT_FILE=./certs/server.crt
```