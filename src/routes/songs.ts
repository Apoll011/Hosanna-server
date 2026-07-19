import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { deleteSong, listSongFiles, saveSong } from "../services/fileService.js";
import { logger } from "../logger.js";

export const songsRouter = Router();

const saveSongSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const deleteSongSchema = z.object({
  path: z.string().min(1),
});

songsRouter.post(
  "/save_song",
  authenticate,
  asyncHandler(async (req, res) => {
    const { path: songPath, content } = saveSongSchema.parse(req.body ?? {});
    await saveSong(songPath, content);
    logger.info({ requestId: req.id, songPath }, "Song saved");
    res.json({ success: true });
  })
);

songsRouter.delete(
  "/delete_song",
  authenticate,
  asyncHandler(async (req, res) => {
    const { path: songPath } = deleteSongSchema.parse(req.body ?? {});
    await deleteSong(songPath);
    logger.info({ requestId: req.id, songPath }, "Song deleted");
    res.json({ success: true });
  })
);

// Additive, non-breaking convenience endpoint for clients that just want the
// current song list without triggering a full service merge.
songsRouter.get(
  "/songs",
  authenticate,
  asyncHandler(async (_req, res) => {
    const files = await listSongFiles();
    res.json({ files });
  })
);
