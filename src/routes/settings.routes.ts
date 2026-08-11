import { Router } from "express";
import { assertUser, requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { SettingsService } from "../services/settings.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { updateSettingsSchema } from "../validators/settings.validators.js";

export const settingsRouter = Router();

// GET /api/settings — admin only
settingsRouter.get(
  "/",
  assertUser,
  asyncHandler(async (req, res) => {
    const service = new SettingsService(req.db!, req.orgId!);
    res.json(await service.get());
  }),
);

// PUT /api/settings — admin only
settingsRouter.put(
  "/",
  requirePermission("settings.manage"),
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    const service = new SettingsService(req.db!, req.orgId!);
    res.json(await service.update(req.body));
  }),
);
