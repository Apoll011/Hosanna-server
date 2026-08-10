import { Router } from "express";
import { assertUser, requirePermission } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { SettingsService } from "../services/settings.service";
import { asyncHandler } from "../utils/asyncHandler";
import { updateSettingsSchema } from "../validators/settings.validators";

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
