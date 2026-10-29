import { Router } from "express";

import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import { hasActiveSubscription } from "../middleware/subscription.js";

/**
 * Lightweight billing probes for clients that need to show a read-only
 * warning without mutating tenant data.
 */
export const billingRouter = Router();

// GET /api/billing/entitlement — active subscription or trial for the caller's org.
billingRouter.get(
  "/entitlement",
  asyncHandler(async (req, res) => {
    const organizationId = req.orgId;
    if (!organizationId) {
      throw AppError.forbidden("An active organization is required.");
    }
    const entitled = await hasActiveSubscription(organizationId);
    res.json({ entitled });
  }),
);
