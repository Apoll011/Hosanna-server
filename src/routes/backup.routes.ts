import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { t } from "../lib/i18n.js";
import { BackupService } from "../services/backup.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const backupRouter = Router();

// GET /api/backup — admin only. Exports the full dataset as JSON for the tenant.
backupRouter.get(
  "/",
  requirePermission("backup.export"),
  asyncHandler(async (req, res) => {
    const service = new BackupService(req.db!, req.orgId!, req.locale);
    res.json(await service.export());
  }),
);

// POST /api/backup/restore — admin only. Replaces the full dataset from a JSON export for the tenant.
backupRouter.post(
  "/restore",
  requirePermission("backup.import"),
  asyncHandler(async (req, res) => {
    const service = new BackupService(req.db!, req.orgId!, req.locale);
    const result = await service.restore(req.body);
    res.json({ message: t(req.locale, "backup.restored_successfully"), ...result });
  }),
);
