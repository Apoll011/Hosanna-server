import { Router } from 'express';
import { folderService } from '../services/folder.service';
import { authenticateAny, authenticateAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { idParamSchema, concurrencySchema } from '../validators/common.validators';
import { createFolderSchema, deleteFolderQuerySchema, updateFolderSchema } from '../validators/folder.validators';

export const folderRouter = Router();

// GET /api/folders — admin or musician. Includes song counts + rootSongsCount.
folderRouter.get(
  '/',
  authenticateAny,
  asyncHandler(async (_req, res) => {
    res.json(await folderService.listWithCounts());
  }),
);

// GET /api/folders/flat — admin or musician. Bare list, excludes the implicit root
// (root is never a Folder record — see schema notes). Registered before /:id.
folderRouter.get(
  '/flat',
  authenticateAny,
  asyncHandler(async (_req, res) => {
    res.json(await folderService.listFlat());
  }),
);

// POST /api/folders — admin only
folderRouter.post(
  '/',
  authenticateAdmin,
  validate({ body: createFolderSchema }),
  asyncHandler(async (req, res) => {
    const folder = await folderService.create(req.body.name, req.body.parentId);
    res.status(201).json({ ...folder, songCount: 0 });
  }),
);

// PUT /api/folders/:id — admin only, optimistic concurrency
folderRouter.put(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema, body: updateFolderSchema }),
  asyncHandler(async (req, res) => {
    const { updatedAt, name, parentId } = req.body;
    res.json(await folderService.update(req.params.id, updatedAt, name, parentId));
  }),
);

// DELETE /api/folders/:id?action=move_to_root|delete_songs — admin only.
// Kept for backward compatibility with the reference implementation.
// Prefer the explicit /move-songs-to-root and /with-songs endpoints below.
folderRouter.delete(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema, query: deleteFolderQuerySchema }),
  asyncHandler(async (req, res) => {
    const action = (req.query.action as string) || req.body?.action || 'move_to_root';
    const result =
      action === 'delete_songs'
        ? await folderService.deleteWithSongs(req.params.id)
        : await folderService.deleteMovingSongsToRoot(req.params.id);
    res.status(200).json({ message: 'Folder deleted', actionUsed: action, ...result });
  }),
);

// DELETE /api/folders/:id/move-songs-to-root — admin only. Explicit variant.
folderRouter.delete(
  '/:id/move-songs-to-root',
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.status(200).json(await folderService.deleteMovingSongsToRoot(req.params.id));
  }),
);

// DELETE /api/folders/:id/with-songs — admin only. Explicit variant.
folderRouter.delete(
  '/:id/with-songs',
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.status(200).json(await folderService.deleteWithSongs(req.params.id));
  }),
);
