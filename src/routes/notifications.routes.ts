import { Router } from "express";
import { z } from "zod";
import { auth } from "../lib/auth.js";
import { assertUser, requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { roles } from "../permissions/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendFcmToUser } from "../utils/notify.js";

export const notificationsRouter = Router();

/** Org roles, derived from the single source of truth in src/permissions. */
const ORG_ROLES = Object.keys(roles) as [
  keyof typeof roles,
  ...(keyof typeof roles)[],
];

/**
 * Custom FCM push payload. `title` / `body` fall back to the notification's
 * title / description when omitted, so callers can override only what they
 * need (e.g. a shorter, device-friendly body).
 */
const fcmMessageSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    body: z.string().min(1).max(1000).optional(),
    /** Deep-link / route payload delivered to the device (all values stringified). */
    data: z.record(z.string(), z.string().max(1000)).optional(),
  })
  .refine(
    (m) =>
      m.title !== undefined || m.body !== undefined || m.data !== undefined,
    {
      message: "fcm message cannot be empty.",
    },
  );

const createNotificationSchema = z
  .object({
    /** Target a single user. Mutually exclusive with organizationId. */
    userId: z.string().min(1).optional(),
    /** Fan-out to an entire org (or a subset of roles). Mutually exclusive with userId. */
    organizationId: z.string().min(1).optional(),
    /** Restrict org fan-out to these roles. Only used when organizationId is set. */
    roles: z.array(z.enum(ORG_ROLES)).min(1).optional(),

    /** Notification type — used by the client to render the correct icon / action. */
    type: z.string().min(1).max(128),
    /** Short title shown in the notification bell. */
    title: z.string().min(1).max(255),
    /** Optional longer description shown in the notification detail. */
    description: z.string().max(1000).optional(),
    /** Optional deep-link / route stored with the notification. */
    href: z.string().min(1).max(2048).optional(),

    /**
     * Delivery channel for a single-user notification:
     *   - "inbox" (default): create the in-app notification only (current behaviour).
     *   - "push": send an FCM push to the user's registered devices instead.
     *   - "both": create the notification AND send the FCM push.
     * Ignored for org fan-out, which always stays in-app only.
     */
    channel: z.enum(["inbox", "push", "both"]).default("inbox"),
    /**
     * Custom push content, only used when the channel includes a push
     * ("push" | "both"). `title`/`body` default to the notification's
     * title/description; `data` is merged with the notification coordinates.
     */
    fcm: fcmMessageSchema.optional(),
  })
  .refine((data) => !!data.userId !== !!data.organizationId, {
    message:
      "Provide either userId or organizationId, not both (and not neither).",
    path: ["userId"],
  })
  .refine((data) => !data.roles || !!data.organizationId, {
    message: "roles can only be used together with organizationId.",
    path: ["roles"],
  });

/**
 * POST /api/notifications
 *
 * Allows authenticated clients to create a notification addressed to:
 *   - a single user  ({ userId, type, title, ... })
 *   - a whole org    ({ organizationId, type, title, ... })
 *   - org by role    ({ organizationId, roles: ["owner","admin"], type, title, ... })
 *
 * Single-user sends can additionally be delivered as an FCM push:
 *   { userId, channel: "push", fcm: { title, body, data }, ... }
 *
 * Any authenticated member can call this endpoint; the server does NOT restrict
 * which userId / organizationId is targeted — add requirePermission() here if
 * you want to lock that down in the future.
 */
notificationsRouter.post(
  "/",
  assertUser,
  requirePermission("notification.sent"),
  validate({ body: createNotificationSchema }),
  asyncHandler(async (req, res) => {
    const { channel, fcm, ...notifyBody } = req.body as z.infer<
      typeof createNotificationSchema
    >;

    // Org fan-out always stays in-app only.
    await auth.api.notify({ body: notifyBody as any });

    let push: Awaited<ReturnType<typeof sendFcmToUser>> | undefined;
    if (channel !== "inbox" && "userId" in notifyBody && notifyBody.userId) {
      push = await sendFcmToUser(notifyBody.userId, {
        title: fcm?.title ?? notifyBody.title,
        body: fcm?.body ?? notifyBody.description ?? notifyBody.title,
        data: {
          type: notifyBody.type,
          ...(notifyBody.href ? { href: notifyBody.href } : {}),
          ...(notifyBody.description
            ? { description: notifyBody.description }
            : {}),
          ...fcm?.data,
        },
      });
    }

    res.status(201).json({
      ok: true,
      ...(push
        ? { push: { sent: push.sent, invalidTokensPruned: push.invalidTokens } }
        : {}),
    });
  }),
);
