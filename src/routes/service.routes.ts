import { Router } from 'express';
import { ServiceService } from '../services/service.service';
import { authenticateAny, authenticateAdmin, requireServiceAccess } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { idParamSchema, twoIdParamSchema } from '../validators/common.validators';
import {
  addSongToServiceSchema,
  createServiceSchema,
  moveServiceSongSchema,
  reorderServiceSongsSchema,
  updateServiceNotesSchema,
  updateServiceSchema,
  updateServiceSongNotesSchema,
} from '../validators/service.validators';

export const serviceRouter = Router();
const byId = requireServiceAccess((req) => req.params.id);

// GET /api/services — admin or musician
serviceRouter.get(
  '/',
  authenticateAny,
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    res.json(await service.list());
  }),
);

// GET /api/services/:id — admin or musician
serviceRouter.get(
  '/:id',
  authenticateAny,
  validate({ params: idParamSchema }),
  byId,
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    res.json(await service.getByIdSerialized(req.params.id));
  }),
);

// POST /api/services — admin only
serviceRouter.post(
  '/',
  authenticateAdmin,
  validate({ body: createServiceSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    res.status(201).json(await service.create(req.body));
  }),
);

// PUT /api/services/:id — admin only, optimistic concurrency
serviceRouter.put(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema, body: updateServiceSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    const { updatedAt, ...patch } = req.body;
    res.json(await service.update(req.params.id, updatedAt, patch));
  }),
);

// DELETE /api/services/:id — admin only
serviceRouter.delete(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    await service.delete(req.params.id);
    res.status(204).send();
  }),
);

// POST /api/services/:id/songs — admin only. Adds a song to the service.
serviceRouter.post(
  '/:id/songs',
  authenticateAdmin,
  validate({ params: idParamSchema, body: addSongToServiceSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    const { updatedAt, songId, notes, position } = req.body;
    res.status(201).json(await service.addSong(req.params.id, updatedAt, songId, notes, position));
  }),
);

// DELETE /api/services/:id/songs/:songId — admin only. Removes a song from the service.
serviceRouter.delete(
  '/:id/songs/:songId',
  authenticateAdmin,
  validate({ params: twoIdParamSchema, body: updateServiceSchema.pick({ updatedAt: true }) }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    res.json(await service.removeSong(req.params.id, req.body.updatedAt, req.params.songId));
  }),
);

// PUT /api/services/:id/songs/reorder — admin only. Full reorder of the setlist.
serviceRouter.put(
  '/:id/songs/reorder',
  authenticateAdmin,
  validate({ params: idParamSchema, body: reorderServiceSongsSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    const { updatedAt, orderedSongIds } = req.body;
    res.json(await service.reorder(req.params.id, updatedAt, orderedSongIds));
  }),
);

// PUT /api/services/:id/songs/:songId/move — admin only. Moves a single song to a new index.
serviceRouter.put(
  '/:id/songs/:songId/move',
  authenticateAdmin,
  validate({ params: twoIdParamSchema, body: moveServiceSongSchema }),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    const { updatedAt, targetIndex } = req.body;
    res.json(await service.moveSong(req.params.id, updatedAt, req.params.songId, targetIndex));
  }),
);

// PUT /api/services/:id/notes — admin OR musician (scoped). Updates the service-level notes.
serviceRouter.put(
  '/:id/notes',
  authenticateAny,
  validate({ params: idParamSchema, body: updateServiceNotesSchema }),
  byId,
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    const { updatedAt, notes } = req.body;
    res.json(await service.updateNotes(req.params.id, updatedAt, notes));
  }),
);

// PUT /api/services/:id/songs/:songId/notes — admin OR musician (scoped). Updates a per-song note.
serviceRouter.put(
  '/:id/songs/:songId/notes',
  authenticateAny,
  validate({ params: twoIdParamSchema, body: updateServiceSongNotesSchema }),
  requireServiceAccess((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const service = new ServiceService(req.db!);
    const { updatedAt, notes } = req.body;
    res.json(await service.updateSongNotes(req.params.id, updatedAt, req.params.songId, notes));
  }),
);
