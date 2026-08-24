import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { FolderService } from "../services/folder.service.js";
import { ServiceService } from "../services/service.service.js";
import { SongService } from "../services/song.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { idParamSchema } from "../validators/common.validators.js";

export const trashRouter = Router();

// GET /api/trash — list all trashed items for the org
trashRouter.get(
  "/",
  requirePermission("song.access"),
  asyncHandler(async (req, res) => {
    const [songs, folders, services] = await Promise.all([
      new SongService(req.db!, req.orgId!, req.locale).listTrashed(),
      new FolderService(req.db!, req.orgId!, req.locale).listTrashed(),
      new ServiceService(req.db!, req.orgId!, req.locale).listTrashed(),
    ]);
    res.json({ songs, folders, services });
  }),
);

// POST /api/trash/songs/:id/restore
trashRouter.post(
  "/songs/:id/restore",
  requirePermission("song.update"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new SongService(req.db!, req.orgId!, req.locale);
    res.json(await service.restore(req.params.id));
  }),
);

// POST /api/trash/folders/:id/restore
trashRouter.post(
  "/folders/:id/restore",
  requirePermission("folder.update"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.orgId!, req.locale);
    res.json(await service.restore(req.params.id));
  }),
);

// POST /api/trash/services/:id/restore
trashRouter.post(
  "/services/:id/restore",
  requirePermission("service.update"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!, req.orgId!, req.locale);
    res.json(await service.restore(req.params.id));
  }),
);
