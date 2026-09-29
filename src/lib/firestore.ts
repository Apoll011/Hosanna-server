/**
 * Minimal Firestore REST writer used for realtime "ping" documents.
 *
 * Notes stay in Postgres / the Hosanna API. After a mutation the server
 * overwrites a tiny signal document so open clients can refresh without
 * polling hard.
 *
 * Path used for notes (annotation migration can reuse `services/{id}/…`):
 *   services/{serviceId}/realtime/notes
 *
 * Reuses the Firebase service-account env vars already used for FCM
 * (`FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`). The JWT is minted
 * with the Cloud Datastore scope so Firestore accepts Admin writes (security
 * rules are bypassed for service accounts).
 *
 * Console setup (once):
 *   1. Enable Cloud Firestore on project `FCM_PROJECT_ID`.
 *   2. Deploy `firestore.rules` from this repo (clients may read signals;
 *      only the Admin SDK may write).
 *   3. Firebase Admin SDK service accounts from the console already have
 *      Firestore write permission.
 */

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const DATASTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REQUEST_TIMEOUT_MS = 15_000;

let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;
let tokenRefresh: Promise<string> | null = null;

function normalizePrivateKey(privateKey: string): string {
  return privateKey.includes("\\n")
    ? privateKey.replace(/\\n/g, "\n")
    : privateKey;
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
    if (!projectId || !env.fcmClientEmail || !env.fcmPrivateKey) {
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
