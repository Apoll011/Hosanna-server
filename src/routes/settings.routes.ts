import { Router } from 'express';
import { SettingsService } from '../services/settings.service';
import { authenticateAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { updateSettingsSchema } from '../validators/settings.validators';

export const settingsRouter = Router();

// GET /api/settings — admin only
settingsRouter.get(
  '/',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const service = new SettingsService(req.db!, req.tenantId!);
    res.json(await service.get());
  }),
);

// PUT /api/settings — admin only
settingsRouter.put(
  '/',
  authenticateAdmin,
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    const service = new SettingsService(req.db!, req.tenantId!);
    res.json(await service.update(req.body));
  }),
);
