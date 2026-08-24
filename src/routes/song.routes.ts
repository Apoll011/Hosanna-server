import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { SongService } from "../services/song.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { idParamSchema } from "../validators/common.validators.js";
import {
  batchCreateSongsSchema,
  batchTagsSchema,
  createSongSchema,
  listSongsQuerySchema,
  moveSongSchema,
  updateSongSchema,
} from "../validators/song.validators.js";

export const songRouter = Router();

// GET /api/songs — admin or musician
songRouter.get(
  "/",
  requirePermission("song.access"),
  validate({ query: listSongsQuerySchema }),
  asyncHandler(async (req, res) => {
    const service = new SongService(req.db!, req.orgId!, req.locale);
    res.json(await service.list(req.query as any));
  }),
);

// POST /api/songs/batch — admin only. Registered before /:id routes.
songRouter.post(
  "/batch",
  requirePermission("song.create"),
  validate({ body: batchCreateSongsSchema }),
  asyncHandler(async (req, res) => {
    const service = new SongService(req.db!, req.orgId!, req.locale);
    res.status(201).json(await service.batchCreate(req.body.songs));
  }),
);

// PUT /api/songs/batch-tags — admin only.
songRouter.put(
  "/batch-tags",
  requirePermission("song.update"),
  validate({ body: batchTagsSchema }),
  asyncHandler(async (req, res) => {
    const service = new SongService(req.db!, req.orgId!, req.locale);
    res.json(
      await service.batchUpdateTags(
        req.body.songIds,
        req.body.tags,
        req.body.mode,
      ),
    );
  }),
);

// GET /api/songs/:id — admin or musician
songRouter.get(
  "/:id",
  requirePermission("song.access"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new SongService(req.db!, req.orgId!, req.locale);
    res.json(await service.getById(req.params.id));
  }),
);

// GET /api/songs/:id/download — admin or musician. Returns raw ChordPro content.
songRouter.get(
  "/:id/download",
  requirePermission("song.access"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new SongService(req.db!, req.orgId!, req.locale);
    const song = await service.getById(req.params.id);
    const filename = song.path?.split("/").pop() || `${song.title}.pro`;
    res.setHeader("Content-Type", "text/vnd.chordpro; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename.replace(/"/g, "")}"`,
    );
    res.send(song.content);
  }),
);

// POST /api/songs — admin or musician.
songRouter.post(
  "/",
  requirePermission("song.create"),
  validate({ body: createSongSchema }),
  asyncHandler(async (req, res) => {
    const service = new SongService(req.db!, req.orgId!, req.locale);
    res.status(201).json(await service.create(req.body));
  }),
);

// PUT /api/songs/:id — admin only, optimistic concurrency
songRouter.put(
  "/:id",
  requirePermission("song.update"),
  validate({ params: idParamSchema, body: updateSongSchema }),
  asyncHandler(async (req, res) => {
    const service = new SongService(req.db!, req.orgId!, req.locale);
    const { updatedAt, ...patch } = req.body;
    res.json(
      await service.update(
        req.params.id,
        updatedAt ?? new Date().toISOString(),
        patch,
      ),
    );
  }),
);

// DELETE /api/songs/:id — admin only
songRouter.delete(
  "/:id",
  requirePermission("song.delete"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = new SongService(req.db!, req.orgId!, req.locale);
    await service.delete(req.params.id);
    res.status(204).send();
  }),
);

// PUT /api/songs/:id/move — admin only, optimistic concurrency
songRouter.put(
  "/:id/move",
  requirePermission("song.update"),
  validate({ params: idParamSchema, body: moveSongSchema }),
  asyncHandler(async (req, res) => {
    const service = new SongService(req.db!, req.orgId!, req.locale);
    const { updatedAt, folderId, newPath } = req.body;
    res.json(
      await service.move(
        req.params.id,
        updatedAt ?? new Date().toISOString(),
        folderId,
        newPath,
      ),
    );
  }),
);
