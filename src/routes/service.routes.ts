import { Router } from 'express';
import { serviceService } from '../services/service.service';
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

// GET /api/services — admin or musician (scoped to allowedServices, filtered client-side by dashboard;
// the list itself is not filtered server-side to preserve the reference behavior of returning everything,
// since a musician's allowedServices only restrict write actions, not visibility of the schedule).
serviceRouter.get(
  '/',
  authenticateAny,
  asyncHandler(async (_req, res) => {
    res.json(await serviceService.list());
  }),
);

// GET /api/services/:id — admin or musician
serviceRouter.get(
  '/:id',
  authenticateAny,
  validate({ params: idParamSchema }),
  byId,
  asyncHandler(async (req, res) => {
    res.json(await serviceService.getByIdSerialized(req.params.id));
  }),
);

// POST /api/services — admin only
serviceRouter.post(
  '/',
  authenticateAdmin,
  validate({ body: createServiceSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await serviceService.create(req.body));
  }),
);

// PUT /api/services/:id — admin only, optimistic concurrency
serviceRouter.put(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema, body: updateServiceSchema }),
  asyncHandler(async (req, res) => {
    const { updatedAt, ...patch } = req.body;
    res.json(await serviceService.update(req.params.id, updatedAt, patch));
  }),
);

// DELETE /api/services/:id — admin only
serviceRouter.delete(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await serviceService.delete(req.params.id);
    res.status(204).send();
  }),
);

// POST /api/services/:id/songs — admin only. Adds a song to the service.
serviceRouter.post(
  '/:id/songs',
  authenticateAdmin,
  validate({ params: idParamSchema, body: addSongToServiceSchema }),
  asyncHandler(async (req, res) => {
    const { updatedAt, songId, notes, position } = req.body;
    res.status(201).json(await serviceService.addSong(req.params.id, updatedAt, songId, notes, position));
  }),
);

// DELETE /api/services/:id/songs/:songId — admin only. Removes a song from the service.
serviceRouter.delete(
  '/:id/songs/:songId',
  authenticateAdmin,
  validate({ params: twoIdParamSchema, body: updateServiceSchema.pick({ updatedAt: true }) }),
  asyncHandler(async (req, res) => {
    res.json(await serviceService.removeSong(req.params.id, req.body.updatedAt, req.params.songId));
  }),
);

// PUT /api/services/:id/songs/reorder — admin only. Full reorder of the setlist.
serviceRouter.put(
  '/:id/songs/reorder',
  authenticateAdmin,
  validate({ params: idParamSchema, body: reorderServiceSongsSchema }),
  asyncHandler(async (req, res) => {
    const { updatedAt, orderedSongIds } = req.body;
    res.json(await serviceService.reorder(req.params.id, updatedAt, orderedSongIds));
  }),
);

// PUT /api/services/:id/songs/:songId/move — admin only. Moves a single song to a new index.
serviceRouter.put(
  '/:id/songs/:songId/move',
  authenticateAdmin,
  validate({ params: twoIdParamSchema, body: moveServiceSongSchema }),
  asyncHandler(async (req, res) => {
    const { updatedAt, targetIndex } = req.body;
    res.json(await serviceService.moveSong(req.params.id, updatedAt, req.params.songId, targetIndex));
  }),
);

// PUT /api/services/:id/notes — admin OR musician (scoped). Updates the service-level notes.
serviceRouter.put(
  '/:id/notes',
  authenticateAny,
  validate({ params: idParamSchema, body: updateServiceNotesSchema }),
  byId,
  asyncHandler(async (req, res) => {
    const { updatedAt, notes } = req.body;
    res.json(await serviceService.updateNotes(req.params.id, updatedAt, notes));
  }),
);

// PUT /api/services/:id/songs/:songId/notes — admin OR musician (scoped). Updates a per-song note.
serviceRouter.put(
  '/:id/songs/:songId/notes',
  authenticateAny,
  validate({ params: twoIdParamSchema, body: updateServiceSongNotesSchema }),
  requireServiceAccess((req) => req.params.id),
  asyncHandler(async (req, res) => {
    const { updatedAt, notes } = req.body;
    res.json(await serviceService.updateSongNotes(req.params.id, updatedAt, req.params.songId, notes));
  }),
);
