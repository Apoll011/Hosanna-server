import { Router } from 'express';
import { backupService } from '../services/backup.service';
import { authenticateAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

export const backupRouter = Router();

// GET /api/backup — admin only. Exports the full dataset as JSON.
backupRouter.get(
  '/',
  authenticateAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await backupService.export());
  }),
);

// POST /api/backup/restore — admin only. Replaces the full dataset from a JSON export.
backupRouter.post(
  '/restore',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const result = await backupService.restore(req.body);
    res.json({ message: 'Backup restored successfully', ...result });
  }),
);
