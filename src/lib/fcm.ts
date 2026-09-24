/**
 * Firebase Cloud Messaging (HTTP v1 API) client.
 *
 * Authenticates with a Firebase service account by minting a short-lived
 * OAuth2 access token (JWT signed with the service-account private key,
 * exchanged at https://oauth2.googleapis.com/token).
 *
 * Required env vars:
 *   FCM_PROJECT_ID
 *   FCM_CLIENT_EMAIL
 *   FCM_PRIVATE_KEY          (with literal \n escapes, as copied from the JSON key)
 *
 * Sends are fire-and-forget safe: `sendFcmToToken` never throws — failures
 * are logged and invalid tokens are reported distinctly so callers can prune
 * only genuinely dead registrations (not malformed payloads).
 */

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FCM_SEND_ENDPOINT = (projectId: string) =>
  `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

/** Hard cap on a single outbound HTTP call so a hung request can't stall the cron. */
const REQUEST_TIMEOUT_MS = 15_000;

// ── Cached access token ─────────────────────────────────────────────────────

let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;
/** In-flight token exchange, so concurrent sends share one mint. */
let tokenRefresh: Promise<string> | null = null;

/**
 * The service-account key is usually stored in an env var with literal `\n`
 * escapes (as copied from the JSON key file). Restore real newlines so the
 * PEM parses.
 */
function normalizePrivateKey(privateKey: string): string {
  return privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
}

async function fetchAccessToken(): Promise<string> {
  const { fcmClientEmail: clientEmail, fcmPrivateKey: privateKey } = env;
  if (!clientEmail || !privateKey) {
    throw new Error(
      "[fcm] FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY are not configured.",
    );
  }

  const assertion = jwt.sign(
    { iss: clientEmail, scope: FCM_SCOPE },
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
      `[fcm] Failed to exchange JWT for access token (${res.status}): ${body}`,
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

  // Collapse concurrent refreshes into a single network round-trip.
  if (!tokenRefresh) {
    tokenRefresh = fetchAccessToken().finally(() => {
      tokenRefresh = null;
    });
  }
  return tokenRefresh;
}

// ── Send ────────────────────────────────────────────────────────────────────

export interface FcmMessage {
  title: string;
  body: string;
  /** Deep-link / route payload delivered to the client. */
  data?: Record<string, string>;
}

export interface FcmSendResult {
  ok: boolean;
  /** True when FCM rejected the token as invalid/unregistered — prune it. */
  invalidToken: boolean;
  error?: string;
}

/**
 * Send a push notification to a single FCM registration token.
 * Never throws — all failures are captured in the returned result.
 */
export async function sendFcmToToken(
  token: string,
  message: FcmMessage,
): Promise<FcmSendResult> {
  try {
    const projectId = env.fcmProjectId;
    if (!projectId) {
      return { ok: false, invalidToken: false, error: "FCM not configured." };
    }

    const accessToken = await getAccessToken();

    const res = await fetch(FCM_SEND_ENDPOINT(projectId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        message: {
          token,
          notification: { title: message.title, body: message.body },
          ...(message.data ? { data: message.data } : {}),
          // Deliver even when the app is backgrounded/closed; Android shows
          // the notification automatically via the system tray.
          android: { priority: "HIGH" },
          apns: {
            payload: { aps: { sound: "default" } },
          },
        },
      }),
    });

    if (res.ok) return { ok: true, invalidToken: false };

    const body = await res.text().catch(() => "");
    // Only treat responses that specifically flag the registration token as
    // dead as prunable. A generic INVALID_ARGUMENT usually means a malformed
    // payload and must NOT wipe every stored token.
    const invalidToken =
      res.status === 404 ||
      res.status === 410 ||
      body.includes("UNREGISTERED") ||
      (res.status === 400 &&
        /registration token|registration_token/i.test(body));

    console.error(
      `[fcm] Send failed (${res.status}) for token …${token.slice(-8)}: ${body}`,
    );
    return { ok: false, invalidToken, error: body };
  } catch (err) {
    console.error("[fcm] Send failed:", err);
    return {
      ok: false,
      invalidToken: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
