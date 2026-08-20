import { Router } from "express";
import { z } from "zod";
import { assertUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { auth } from "../lib/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const notificationsRouter = Router();

const createNotificationSchema = z
  .object({
    /** Target a single user. Mutually exclusive with organizationId. */
    userId: z.string().optional(),
    /** Fan-out to an entire org (or a subset of roles). Mutually exclusive with userId. */
    organizationId: z.string().optional(),
    /** Restrict org fan-out to these roles. Only used when organizationId is set. */
    roles: z
      .array(
        z.enum([
          "owner",
          "admin",
          "teamLeader",
          "editor",
          "musician",
          "member",
          "guest",
        ]),
      )
      .optional(),
    /** Notification type — used by the client to render the correct icon / action. */
    type: z.string().min(1),
    /** Short title shown in the notification bell. */
    title: z.string().min(1).max(255),
    /** Optional longer description shown in the notification detail. */
    description: z.string().max(1000).optional(),
    // TODO: add href
  })
  .refine((data) => !!data.userId !== !!data.organizationId, {
    message:
      "Provide either userId or organizationId, not both (and not neither).",
    path: ["userId"],
  });

/**
 * POST /api/notifications
 *
 * Allows authenticated clients to create a notification addressed to:
 *   - a single user  ({ userId, type, title, ... })
 *   - a whole org    ({ organizationId, type, title, ... })
 *   - org by role    ({ organizationId, roles: ["owner","admin"], type, title, ... })
 *
 * Any authenticated member can call this endpoint; the server does NOT restrict
 * which userId / organizationId is targeted — add requirePermission() here if
 * you want to lock that down in the future.
 */
notificationsRouter.post(
  "/",
  assertUser,
  validate({ body: createNotificationSchema }),
  asyncHandler(async (req, res) => {
    await auth.api.notify({ body: req.body as any });
    res.status(201).json({ ok: true });
  }),
);
