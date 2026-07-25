import { Router } from 'express';
import { songService } from '../services/song.service';
import { authenticateAny, authenticateAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { idParamSchema } from '../validators/common.validators';
import {
  batchCreateSongsSchema,
  batchTagsSchema,
  createSongSchema,
  listSongsQuerySchema,
  moveSongSchema,
  renameSongSchema,
  updateSongSchema,
} from '../validators/song.validators';

export const songRouter = Router();

// GET /api/songs — admin or musician
songRouter.get(
  '/',
  authenticateAny,
  validate({ query: listSongsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await songService.list(req.query as any));
  }),
);

// POST /api/songs/batch — admin only. Registered before /:id routes.
songRouter.post(
  '/batch',
  authenticateAdmin,
  validate({ body: batchCreateSongsSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await songService.batchCreate(req.body.songs));
  }),
);

// PUT /api/songs/batch-tags — admin only.
songRouter.put(
  '/batch-tags',
  authenticateAdmin,
  validate({ body: batchTagsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await songService.batchUpdateTags(req.body.songIds, req.body.tags, req.body.mode));
  }),
);

// GET /api/songs/:id — admin or musician
songRouter.get(
  '/:id',
  authenticateAny,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await songService.getById(req.params.id));
  }),
);

// GET /api/songs/:id/download — admin or musician. Returns raw ChordPro content.
songRouter.get(
  '/:id/download',
  authenticateAny,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const song = await songService.getById(req.params.id);
    const filename = song.path?.split('/').pop() || `${song.title}.pro`;
    res.setHeader('Content-Type', 'text/vnd.chordpro; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.send(song.content);
  }),
);

// POST /api/songs — admin only
songRouter.post(
  '/',
  authenticateAdmin,
  validate({ body: createSongSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await songService.create(req.body));
  }),
);

// PUT /api/songs/:id — admin only, optimistic concurrency
songRouter.put(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema, body: updateSongSchema }),
  asyncHandler(async (req, res) => {
    const { updatedAt, ...patch } = req.body;
    res.json(await songService.update(req.params.id, updatedAt, patch));
  }),
);

// DELETE /api/songs/:id — admin only
songRouter.delete(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await songService.delete(req.params.id);
    res.status(204).send();
  }),
);

// PUT /api/songs/:id/rename — admin only, optimistic concurrency
songRouter.put(
  '/:id/rename',
  authenticateAdmin,
  validate({ params: idParamSchema, body: renameSongSchema }),
  asyncHandler(async (req, res) => {
    const { updatedAt, newTitle, newPath } = req.body;
    res.json(await songService.rename(req.params.id, updatedAt, newTitle, newPath));
  }),
);

// PUT /api/songs/:id/move — admin only, optimistic concurrency
songRouter.put(
  '/:id/move',
  authenticateAdmin,
  validate({ params: idParamSchema, body: moveSongSchema }),
  asyncHandler(async (req, res) => {
    const { updatedAt, folderId, newPath } = req.body;
    res.json(await songService.move(req.params.id, updatedAt, folderId, newPath));
  }),
);
