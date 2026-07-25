import { Router } from 'express';
import { settingsService } from '../services/settings.service';
import { authenticateAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { updateSettingsSchema } from '../validators/settings.validators';

export const settingsRouter = Router();

// GET /api/settings — admin only
settingsRouter.get(
  '/',
  authenticateAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await settingsService.get());
  }),
);

// PUT /api/settings — admin only
settingsRouter.put(
  '/',
  authenticateAdmin,
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await settingsService.update(req.body));
  }),
);
