import { Router } from 'express';
import { musicianTokenService } from '../services/musicianToken.service';
import { authenticateAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { idParamSchema, concurrencySchema } from '../validators/common.validators';
import { createMusicianTokenSchema, updateMusicianTokenSchema } from '../validators/musicianToken.validators';

export const musicianTokenRouter = Router();

// GET /api/musicians/tokens — admin only
musicianTokenRouter.get(
  '/',
  authenticateAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await musicianTokenService.list());
  }),
);

// GET /api/musicians/tokens/:id — admin only
musicianTokenRouter.get(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await musicianTokenService.getByIdSerialized(req.params.id));
  }),
);

// POST /api/musicians/tokens — admin only.
// Response includes the raw token + a ready-to-print QR code ONE TIME ONLY.
musicianTokenRouter.post(
  '/',
  authenticateAdmin,
  validate({ body: createMusicianTokenSchema }),
  asyncHandler(async (req, res) => {
    const { name, expiresAt, allowedServices } = req.body;
    res.status(201).json(await musicianTokenService.create(name, expiresAt, allowedServices));
  }),
);

// PUT /api/musicians/tokens/:id — admin only. Updates name/expiry/scoping (not the token value itself).
musicianTokenRouter.put(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema, body: updateMusicianTokenSchema }),
  asyncHandler(async (req, res) => {
    const { updatedAt, ...patch } = req.body;
    res.json(await musicianTokenService.update(req.params.id, updatedAt, patch));
  }),
);

// POST /api/musicians/tokens/:id/regenerate — admin only.
// Issues a brand new raw token (invalidating the old one) + a new QR code.
musicianTokenRouter.post(
  '/:id/regenerate',
  authenticateAdmin,
  validate({ params: idParamSchema, body: concurrencySchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await musicianTokenService.regenerate(req.params.id, req.body.updatedAt));
  }),
);

// DELETE /api/musicians/tokens/:id — admin only.
// Soft-revokes the token (kept for audit history) rather than hard-deleting it,
// so admins can see who had access to what, and when it was cut off.
// The raw request body carries `updatedAt` for optimistic concurrency.
musicianTokenRouter.delete(
  '/:id',
  authenticateAdmin,
  validate({ params: idParamSchema, body: concurrencySchema }),
  asyncHandler(async (req, res) => {
    res.json(await musicianTokenService.revoke(req.params.id, req.body.updatedAt));
  }),
);

// DELETE /api/musicians/tokens/:id/permanent — admin only. Hard delete, e.g. for data-retention/GDPR requests.
musicianTokenRouter.delete(
  '/:id/permanent',
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await musicianTokenService.permanentlyDelete(req.params.id);
    res.status(204).send();
  }),
);
