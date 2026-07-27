import { Router } from 'express';
import { BackupService } from '../services/backup.service';
import { authenticateAdmin } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

export const backupRouter = Router();

// GET /api/backup — admin only. Exports the full dataset as JSON for the tenant.
backupRouter.get(
  '/',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const service = new BackupService(req.db!, req.tenantId!);
    res.json(await service.export());
  }),
);

// POST /api/backup/restore — admin only. Replaces the full dataset from a JSON export for the tenant.
backupRouter.post(
  '/restore',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const service = new BackupService(req.db!, req.tenantId!);
    const result = await service.restore(req.body);
    res.json({ message: 'Backup restored successfully', ...result });
  }),
);
