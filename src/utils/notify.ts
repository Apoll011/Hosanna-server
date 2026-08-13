import { auth } from "../lib/auth.js";
import { roles } from "../permissions/index.js";

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
