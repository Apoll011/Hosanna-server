/**
 * Minimal Firestore REST writer used for realtime "ping" documents and
 * worship-service song annotations.
 *
 * Notes stay in Postgres / the Hosanna API. After a mutation the server
 * overwrites a tiny signal document so open clients can refresh without
 * polling hard:
 *   services/{serviceId}/realtime/notes
 *
 * Annotations use Firestore for live presence (and inline canvas bytes when
 * small enough). Large canvases stay in Postgres; Firestore still gets a
 * metadata-only doc so listeners wake up and fetch via the Hosanna API.
 *   services/{serviceId}/annotations/{songId}
 *
 * No Firebase Storage — Spark plan is enough (Firestore only).
 *
 * Reuses the Firebase service-account env vars already used for FCM
 * (`FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`). The JWT is minted
 * with the Cloud Datastore scope so Firestore accepts Admin writes (security
 * rules are bypassed for service accounts).
 *
 * Console setup (once):
 *   1. Enable Cloud Firestore on project `FCM_PROJECT_ID`.
 *   2. Deploy `firestore.rules` from this repo (clients may read signals /
 *      annotation docs; only the Admin SDK may write).
 *   3. Firebase Admin SDK service accounts from the console already have
 *      Firestore write permission.
 */

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const DATASTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REQUEST_TIMEOUT_MS = 15_000;

/** Keep Firestore docs comfortably under the ~1 MiB limit (base64 expands ~4/3). */
export const ANNOTATION_INLINE_MAX_BYTES = 700_000;

let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;
let tokenRefresh: Promise<string> | null = null;

function normalizePrivateKey(privateKey: string): string {
  return privateKey.includes("\\n")
    ? privateKey.replace(/\\n/g, "\n")
    : privateKey;
}

function firebaseConfigured(): boolean {
  return Boolean(env.fcmProjectId && env.fcmClientEmail && env.fcmPrivateKey);
}

async function fetchAccessToken(): Promise<string> {
  const { fcmClientEmail: clientEmail, fcmPrivateKey: privateKey } = env;
  if (!clientEmail || !privateKey) {
    throw new Error(
      "[firestore] FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY are not configured.",
    );
  }

  const assertion = jwt.sign(
    { iss: clientEmail, scope: DATASTORE_SCOPE },
    normalizePrivateKey(privateKey),
    {
      algorithm: "RS256",
      expiresIn: "1h",
      audience: TOKEN_ENDPOINT,
    },
  );

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `[firestore] Failed to exchange JWT for access token (${res.status}): ${body}`,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedAccessToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  return cachedAccessToken;
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedTokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }
  if (!tokenRefresh) {
    tokenRefresh = fetchAccessToken().finally(() => {
      tokenRefresh = null;
    });
  }
  return tokenRefresh;
}

function annotationDocPath(projectId: string, serviceId: string, songId: string) {
  return (
    `projects/${projectId}/databases/(default)/documents/` +
    `services/${encodeURIComponent(serviceId)}/annotations/${encodeURIComponent(songId)}`
  );
}

// ── Notes signal ───────────────────────────────────────────────────────────

export type NotesSignalAction = "create" | "update" | "delete";

export interface NotesSignalPayload {
  serviceId: string;
  noteId: string;
  action: NotesSignalAction;
  authorId: string;
  private: boolean;
}

/**
 * Upserts `services/{serviceId}/realtime/notes`. Never throws — failures are
 * logged so a Firestore outage cannot break note CRUD.
 */
export async function publishNotesSignal(
  payload: NotesSignalPayload,
): Promise<void> {
  try {
    const projectId = env.fcmProjectId;
    if (!firebaseConfigured() || !projectId) {
      return;
    }

    const accessToken = await getAccessToken();
    const docPath =
      `projects/${projectId}/databases/(default)/documents/` +
      `services/${encodeURIComponent(payload.serviceId)}/realtime/notes`;

    const mask = ["updatedAt", "action", "noteId", "authorId", "private"]
      .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
      .join("&");

    const res = await fetch(
      `https://firestore.googleapis.com/v1/${docPath}?${mask}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          fields: {
            updatedAt: { timestampValue: new Date().toISOString() },
            action: { stringValue: payload.action },
            noteId: { stringValue: payload.noteId },
            authorId: { stringValue: payload.authorId },
            private: { booleanValue: payload.private },
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[firestore] publishNotesSignal failed (${res.status}): ${body}`,
      );
    }
  } catch (err) {
    console.error("[firestore] publishNotesSignal failed:", err);
  }
}

// ── Annotations (Firestore only — no Storage) ──────────────────────────────

export interface AnnotationFirebasePayload {
  orgId: string;
  serviceId: string;
  songId: string;
  canvasData: Buffer;
  updatedById: string;
  /** ISO timestamp shared with the API response / dual-write row. */
  updatedAt: string;
  revision: number;
}

/** Where the canvas bytes live when not inlined in this doc. */
export type AnnotationPayloadLocation = "firestore" | "api";

export interface AnnotationFirebaseDoc {
  orgId: string;
  serviceId: string;
  songId: string;
  updatedAt: string;
  updatedById: string;
  revision: number;
  /** `firestore` = canvasDataBase64 present; `api` = fetch via Hosanna REST. */
  payloadLocation: AnnotationPayloadLocation;
  canvasDataBase64?: string;
}

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string;
  timestampValue?: string;
  booleanValue?: boolean;
};

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
};

function fieldString(
  fields: Record<string, FirestoreValue> | undefined,
  key: string,
): string | undefined {
  return fields?.[key]?.stringValue;
}

function fieldInt(
  fields: Record<string, FirestoreValue> | undefined,
  key: string,
): number {
  const raw = fields?.[key]?.integerValue;
  return raw != null ? Number(raw) : 0;
}

function fieldTimestamp(
  fields: Record<string, FirestoreValue> | undefined,
  key: string,
): string | undefined {
  return fields?.[key]?.timestampValue ?? fields?.[key]?.stringValue;
}

function parseAnnotationDoc(
  data: FirestoreDocument,
  serviceId: string,
  songId: string,
): AnnotationFirebaseDoc | null {
  const fields = data.fields;
  if (!fields) return null;
  const updatedAt = fieldTimestamp(fields, "updatedAt");
  if (!updatedAt) return null;

  const inline = fieldString(fields, "canvasDataBase64");
  const hasInline = Boolean(inline && inline.trim().length > 0);

  return {
    orgId: fieldString(fields, "orgId") ?? "",
    serviceId: fieldString(fields, "serviceId") ?? serviceId,
    songId: fieldString(fields, "songId") ?? songId,
    updatedAt,
    updatedById: fieldString(fields, "updatedById") ?? "",
    revision: fieldInt(fields, "revision"),
    payloadLocation: hasInline ? "firestore" : "api",
    canvasDataBase64: hasInline ? inline : undefined,
  };
}

/**
 * Reads `services/{serviceId}/annotations/{songId}`. Returns null when
 * Firebase is not configured, the doc is missing, or the call fails.
 */
export async function getAnnotationDoc(
  serviceId: string,
  songId: string,
): Promise<AnnotationFirebaseDoc | null> {
  try {
    const projectId = env.fcmProjectId;
    if (!firebaseConfigured() || !projectId) return null;

    const accessToken = await getAccessToken();
    const docPath = annotationDocPath(projectId, serviceId, songId);
    const res = await fetch(`https://firestore.googleapis.com/v1/${docPath}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[firestore] getAnnotationDoc failed (${res.status}): ${body}`,
      );
      return null;
    }
    const data = (await res.json()) as FirestoreDocument;
    return parseAnnotationDoc(data, serviceId, songId);
  } catch (err) {
    console.error("[firestore] getAnnotationDoc failed:", err);
    return null;
  }
}

/**
 * Resolves inline canvas bytes from a Firestore doc. Returns null when the
 * payload lives on the API / Postgres (callers should load from there).
 */
export async function resolveAnnotationBytes(
  doc: AnnotationFirebaseDoc,
): Promise<Buffer | null> {
  if (doc.payloadLocation !== "firestore" || !doc.canvasDataBase64) {
    return null;
  }
  try {
    return Buffer.from(doc.canvasDataBase64, "base64");
  } catch {
    return null;
  }
}

/**
 * Writes annotation metadata to Firestore. Inlines `canvasDataBase64` when
 * the blob fits; otherwise metadata-only (`payloadLocation: "api"`) so
 * listeners still fire and clients fetch bytes via the Hosanna API / Postgres.
 *
 * Never throws — failures are logged so a Firestore outage cannot break the
 * Postgres write path.
 */
export async function publishAnnotation(
  payload: AnnotationFirebasePayload,
): Promise<boolean> {
  try {
    const projectId = env.fcmProjectId;
    if (!firebaseConfigured() || !projectId) {
      return false;
    }

    const accessToken = await getAccessToken();
    const inlineOk =
      payload.canvasData.byteLength <= ANNOTATION_INLINE_MAX_BYTES;
    const inline = inlineOk
      ? payload.canvasData.toString("base64")
      : undefined;
    const payloadLocation: AnnotationPayloadLocation = inline
      ? "firestore"
      : "api";

    if (!inline) {
      console.info(
        `[firestore] annotation ${payload.serviceId}/${payload.songId} ` +
          `is ${payload.canvasData.byteLength} bytes — metadata-only ping; ` +
          `bytes stay on the API / Postgres`,
      );
    }

    const fields: Record<string, FirestoreValue> = {
      orgId: { stringValue: payload.orgId },
      serviceId: { stringValue: payload.serviceId },
      songId: { stringValue: payload.songId },
      updatedAt: { timestampValue: payload.updatedAt },
      updatedById: { stringValue: payload.updatedById },
      revision: { integerValue: String(payload.revision) },
      payloadLocation: { stringValue: payloadLocation },
    };
    if (inline) {
      fields.canvasDataBase64 = { stringValue: inline };
    }

    const docPath = annotationDocPath(
      projectId,
      payload.serviceId,
      payload.songId,
    );
    // Fields in updateMask but omitted from `fields` are deleted — clears a
    // previous inline payload and any legacy `storagePath` from older builds.
    const maskFields = [
      ...Object.keys(fields),
      ...(inline ? [] : ["canvasDataBase64"]),
      "storagePath",
    ];
    const mask = [...new Set(maskFields)]
      .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
      .join("&");

    const res = await fetch(
      `https://firestore.googleapis.com/v1/${docPath}?${mask}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({ fields }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[firestore] publishAnnotation failed (${res.status}): ${body}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[firestore] publishAnnotation failed:", err);
    return false;
  }
}
