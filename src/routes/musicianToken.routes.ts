import { Router } from "express";
import { authenticateAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { MusicianTokenService } from "../services/musicianToken.service";
import { asyncHandler } from "../utils/asyncHandler";
import {
  concurrencySchema,
  idParamSchema,
} from "../validators/common.validators";
import {
  createMusicianTokenSchema,
  updateMusicianTokenSchema,
} from "../validators/musicianToken.validators";

export const musicianTokenRouter = Router();

// GET /api/musicians/tokens — admin only
musicianTokenRouter.get(
  "/",
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const service = new MusicianTokenService(req.db!, req.tenantId!);
    res.json(await service.list());
  }),
);

// GET /api/musicians/tokens/:id — admin only
musicianTokenRouter.get(
  "/:id",
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new MusicianTokenService(req.db!, req.tenantId!);
    res.json(await service.getByIdSerialized(req.params.id));
  }),
);

// POST /api/musicians/tokens — admin only.
// Response includes the raw token + a ready-to-print QR code ONE TIME ONLY.
musicianTokenRouter.post(
  "/",
  authenticateAdmin,
  validate({ body: createMusicianTokenSchema }),
  asyncHandler(async (req, res) => {
    const service = new MusicianTokenService(req.db!, req.tenantId!);
    const { name, expiresAt, allowedServices } = req.body;
    res
      .status(201)
      .json(await service.create(name, expiresAt, allowedServices));
  }),
);

// PUT /api/musicians/tokens/:id — admin only. Updates name/expiry/scoping (not the token value itself).
musicianTokenRouter.put(
  "/:id",
  authenticateAdmin,
  validate({ params: idParamSchema, body: updateMusicianTokenSchema }),
  asyncHandler(async (req, res) => {
    const service = new MusicianTokenService(req.db!, req.tenantId!);
    const { updatedAt, ...patch } = req.body;
    res.json(await service.update(req.params.id, updatedAt, patch));
  }),
);

// POST /api/musicians/tokens/:id/regenerate — admin only.
// Issues a brand new raw token (invalidating the old one) + a new QR code.
musicianTokenRouter.post(
  "/:id/regenerate",
  authenticateAdmin,
  validate({ params: idParamSchema, body: concurrencySchema }),
  asyncHandler(async (req, res) => {
    const service = new MusicianTokenService(req.db!, req.tenantId!);
    res
      .status(201)
      .json(await service.regenerate(req.params.id, req.body.updatedAt));
  }),
);

// DELETE /api/musicians/tokens/:id — admin only.
// Soft-revokes the token (kept for audit history) rather than hard-deleting it
musicianTokenRouter.delete(
  "/:id",
  authenticateAdmin,
  validate({ params: idParamSchema, body: concurrencySchema }),
  asyncHandler(async (req, res) => {
    const service = new MusicianTokenService(req.db!, req.tenantId!);
    res.json(await service.revoke(req.params.id, req.body.updatedAt));
  }),
);

// DELETE /api/musicians/tokens/:id/permanent — admin only. Hard delete
musicianTokenRouter.delete(
  "/:id/permanent",
  authenticateAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new MusicianTokenService(req.db!, req.tenantId!);
    await service.permanentlyDelete(req.params.id);
    res.status(204).send();
  }),
);
