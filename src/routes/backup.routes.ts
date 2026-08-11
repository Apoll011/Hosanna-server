import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { BackupService } from "../services/backup.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const backupRouter = Router();

// GET /api/backup — admin only. Exports the full dataset as JSON for the tenant.
backupRouter.get(
  "/",
  requirePermission("export.backup"),
  asyncHandler(async (req, res) => {
    const service = new BackupService(req.db!, req.orgId!);
    res.json(await service.export());
  }),
);

// POST /api/backup/restore — admin only. Replaces the full dataset from a JSON export for the tenant.
backupRouter.post(
  "/restore",
  requirePermission("import.backup"),
  asyncHandler(async (req, res) => {
    const service = new BackupService(req.db!, req.orgId!);
    const result = await service.restore(req.body);
    res.json({ message: "Backup restored successfully", ...result });
  }),
);
