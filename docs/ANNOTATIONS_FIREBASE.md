# Annotation sync (Firebase / Firestore only)

Worship-service song annotations sync via **Firestore** (no Firebase Storage,
no Supabase). Spark plan is enough — you do **not** need Blaze for Storage.

## Architecture

| Layer | Role |
|-------|------|
| Flutter local `.fcv` cache | Fast open / offline (`settings.syncAnnotations`) |
| Hosanna API `PUT/GET …/annotation` | Auth + org checks; always writes Postgres |
| Firestore `services/{serviceId}/annotations/{songId}` | Live listener + inline `canvasDataBase64` when small |
| Postgres `ServiceSongAnnotation` | Source of truth for bytes when the canvas is too large for Firestore (~700KB raw) |

### Small vs large canvases

- **Small** (≤ ~700KB): bytes are inlined in the Firestore doc → clients apply
  directly from the snapshot / get.
- **Large**: Firestore stores metadata only (`payloadLocation: "api"`,
  `updatedAt`, `revision`, …). Listeners still fire; clients (and the API
  `GET`) load bytes from Postgres via the Hosanna REST route.

Team **text notes** stay on Postgres; only a tiny Firestore ping at
`services/{serviceId}/realtime/notes` is used for presence.

## Setup

1. Enable **Cloud Firestore** on the Firebase project that already backs FCM
   (`FCM_PROJECT_ID`). Storage is **not** required.
2. Deploy rules:
   ```bash
   firebase deploy --only firestore:rules
   ```
   Or paste `firestore.rules` in the Firebase console.
3. Ensure the API has:
   - `FCM_PROJECT_ID`
   - `FCM_CLIENT_EMAIL`
   - `FCM_PRIVATE_KEY`

## Trust model

Clients (Flutter) **read** annotation docs; they do **not** write. Auth today
is Better Auth on the Hosanna API — not Firebase Auth — so rules allow open
read + Admin-only write (same pragmatic model as note pings). Tighten later
with custom tokens if needed.

## Flutter

With `syncAnnotations` enabled, `ServiceAnnotationRepository` loads from
Firestore first (REST/Postgres fallback when payload is API-only), pushes via
the API, and subscribes to the annotation document snapshot. Conflict UX
(Keep mine / Reload) is unchanged.
