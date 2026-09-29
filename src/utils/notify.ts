import { prisma } from "../database/prisma.js";
import { auth } from "../lib/auth.js";
import { roles } from "../permissions/index.js";
import { sendFcmToToken, type FcmMessage } from "../lib/fcm.js";

type OrgRole = keyof typeof roles;

export interface OrgNotifyPayload {
  organizationId: string;
  /** Restrict fan-out to these roles. Omit to reach every member. */
  roles?: OrgRole[];
  type: string;
  title: string;
  description?: string;
  href?: string;
}

export interface UserNotifyPayload {
  userId: string;
  type: string;
  title: string;
  description?: string;
  href?: string;
}

export interface FcmUserSendResult {
  /** Number of devices the push was accepted for. */
  sent: number;
  /** Number of dead tokens found and pruned (fcm cleared on the session). */
  invalidTokens: number;
}

/**
 * Fan-out a security/admin notification to the specified org roles.
 * Fire-and-forget — errors are swallowed so they never break the caller.
 */
export async function notifyOrg(payload: OrgNotifyPayload): Promise<void> {
  try {
    await auth.api.notify({ body: payload as any });
  } catch (err) {
    console.error("[notify] org notification failed:", err);
  }
}

/**
 * Send a notification to a single user.
 * Fire-and-forget — errors are swallowed so they never break the caller.
 */
export async function notifyUser(payload: UserNotifyPayload): Promise<void> {
  try {
    await auth.api.notify({ body: payload as any });
  } catch (err) {
    console.error("[notify] user notification failed:", err);
  }
}

/**
 * Push an FCM message to every notify-enabled session (registered device) of
 * a user. Dead tokens are pruned so future sends stop retrying them.
 * Never throws — failures are logged and reflected in the returned counts.
 */
export async function sendFcmToUser(
  userId: string,
  message: FcmMessage,
): Promise<FcmUserSendResult> {
  const result: FcmUserSendResult = { sent: 0, invalidTokens: 0 };
  try {
    const sessions = await prisma.session.findMany({
      where: { userId, notify: true, fcm: { not: null } },
      select: { id: true, fcm: true },
    });
    if (sessions.length === 0) return result;

    const deadSessionIds: string[] = [];
    await Promise.all(
      sessions.map(async (session) => {
        const outcome = await sendFcmToToken(session.fcm!, message);
        if (outcome.ok) {
          result.sent++;
        } else if (outcome.invalidToken) {
          deadSessionIds.push(session.id);
        }
      }),
    );

    if (deadSessionIds.length > 0) {
      await prisma.session
        .updateMany({
          where: { id: { in: deadSessionIds } },
          data: { fcm: null },
        })
        .catch(() => undefined);
      result.invalidTokens = deadSessionIds.length;
    }

    return result;
  } catch (err) {
    console.error("[notify] fcm push failed:", err);
    return result;
  }
}
