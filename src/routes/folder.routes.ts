import { Router } from "express";
import { authenticateAdmin, authenticateAny } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { FolderService } from "../services/folder.service";
import { asyncHandler } from "../utils/asyncHandler";
import { idParamSchema } from "../validators/common.validators";
import {
  createFolderSchema,
  deleteFolderQuerySchema,
  updateFolderSchema,
} from "../validators/folder.validators";

export const folderRouter = Router();

// GET /api/folders — admin or musician. Includes song counts + rootSongsCount.
folderRouter.get(
  "/",
  authenticateAny,
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.tenantId!);
    res.json(await service.listWithCounts());
  }),
);

// GET /api/folders/flat — admin or musician. Bare list, excludes the implicit root
folderRouter.get(
  "/flat",
  authenticateAny,
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.tenantId!);
    res.json(await service.listFlat());
  }),
);

// POST /api/folders — admin only
folderRouter.post(
  "/",
  authenticateAdmin,
  validate({ body: createFolderSchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.tenantId!);
    const folder = await service.create(req.body.name, req.body.parentId);
    res.status(201).json({ ...folder, songCount: 0 });
  }),
);

// PUT /api/folders/:id — admin only, optimistic concurrency
folderRouter.put(
  "/:id",
  authenticateAdmin,
  validate({ params: idParamSchema, body: updateFolderSchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.tenantId!);
    const { updatedAt, name, parentId } = req.body;
    res.json(await service.update(req.params.id, updatedAt, name, parentId));
  }),
);

// DELETE /api/folders/:id?action=move_to_root|delete_songs — admin only.
folderRouter.delete(
  "/:id",
  authenticateAdmin,
  validate({ params: idParamSchema, query: deleteFolderQuerySchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.tenantId!);
    const action =
      (req.query.action as string) || req.body?.action || "move_to_root";
    const result =
      action === "delete_songs"
        ? await service.deleteWithContent(req.params.id)
        : await service.deleteMovingContentToRoot(req.params.id);
    res
      .status(200)
      .json({ message: "Folder deleted", actionUsed: action, ...result });
  }),
);

// DELETE /api/folders/:id/move-songs-to-root — admin only. Explicit variant.
folderRouter.delete(
  "/:id/move-songs-to-root",
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.tenantId!);
    res
      .status(200)
      .json(await service.deleteMovingContentToRoot(req.params.id));
  }),
);

// DELETE /api/folders/:id/with-songs — admin only. Explicit variant.
folderRouter.delete(
  "/:id/with-songs",
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.tenantId!);
    res.status(200).json(await service.deleteWithContent(req.params.id));
  }),
);
