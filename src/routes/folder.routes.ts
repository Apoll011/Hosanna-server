import { Router } from "express";
import { requireAllPermissions, requirePermission } from "../middleware/auth";
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

folderRouter.get(
  "/",
  requirePermission("folder.access"),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.orgId!);
    res.json(await service.listWithCounts());
  }),
);

folderRouter.get(
  "/flat",
  requirePermission("folder.access"),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.orgId!);
    res.json(await service.listFlat());
  }),
);

// POST /api/folders — admin only
folderRouter.post(
  "/",
  requirePermission("folder.create"),
  validate({ body: createFolderSchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.orgId!);
    const folder = await service.create(req.body.name, req.body.parentId);
    res.status(201).json({ ...folder, songCount: 0 });
  }),
);

// PUT /api/folders/:id — admin only, optimistic concurrency
folderRouter.put(
  "/:id",
  requirePermission("folder.update"),
  validate({ params: idParamSchema, body: updateFolderSchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.orgId!);
    const { updatedAt, name, parentId } = req.body;
    res.json(await service.update(req.params.id, updatedAt, name, parentId));
  }),
);

// DELETE /api/folders/:id?action=move_to_root|delete_songs — admin only.
folderRouter.delete(
  "/:id",
  requirePermission("folder.delete"),
  validate({ params: idParamSchema, query: deleteFolderQuerySchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.orgId!);
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

folderRouter.delete(
  "/:id/move-content-to-root",
  requirePermission("folder.delete"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.orgId!);
    res
      .status(200)
      .json(await service.deleteMovingContentToRoot(req.params.id));
  }),
);

// DELETE /api/folders/:id/with-songs — admin only. Explicit variant.
folderRouter.delete(
  "/:id/with-content",
  requireAllPermissions(["folder.delete", "song.delete"]),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new FolderService(req.db!, req.orgId!);
    res.status(200).json(await service.deleteWithContent(req.params.id));
  }),
);
