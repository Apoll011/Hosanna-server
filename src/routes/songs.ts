import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  deleteSong,
  listSongFiles,
  saveSong,
  createFolder,
  deleteFolder,
  renamePath,
  getLibraryTree,
  searchSongs,
  getSongContent,
} from "../services/fileService.js";
import { logger } from "../logger.js";
import { AppError } from "../types.js";

export const songsRouter = Router();

const upload = multer({ storage: multer.memoryStorage() });

const saveSongSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const deleteSongSchema = z.object({
  path: z.string().min(1),
});

const folderSchema = z.object({
  path: z.string().min(1),
});

const renameSchema = z.object({
  oldPath: z.string().min(1),
  newPath: z.string().min(1),
});

const searchSchema = z.object({
  query: z.string().optional(),
  folder: z.string().optional(),
  tags: z.string().optional().transform(v => v ? v.split(",") : undefined),
  artist: z.string().optional(),
  title: z.string().optional(),
});

const createEmptySchema = z.object({
  path: z.string().min(1),
  title: z.string().optional(),
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

songsRouter.post(
  "/create_folder",
  authenticate,
  asyncHandler(async (req, res) => {
    const { path: folderPath } = folderSchema.parse(req.body ?? {});
    await createFolder(folderPath);
    logger.info({ requestId: req.id, folderPath }, "Folder created");
    res.json({ success: true });
  })
);

songsRouter.delete(
  "/delete_folder",
  authenticate,
  asyncHandler(async (req, res) => {
    const { path: folderPath } = folderSchema.parse(req.body ?? {});
    await deleteFolder(folderPath);
    logger.info({ requestId: req.id, folderPath }, "Folder deleted");
    res.json({ success: true });
  })
);

songsRouter.post(
  "/rename",
  authenticate,
  asyncHandler(async (req, res) => {
    const { oldPath, newPath } = renameSchema.parse(req.body ?? {});
    await renamePath(oldPath, newPath);
    logger.info({ requestId: req.id, oldPath, newPath }, "Path renamed");
    res.json({ success: true });
  })
);

songsRouter.get(
  "/tree",
  authenticate,
  asyncHandler(async (_req, res) => {
    const tree = await getLibraryTree();
    res.json({ tree });
  })
);

songsRouter.get(
  "/search",
  authenticate,
  asyncHandler(async (req, res) => {
    const options = searchSchema.parse(req.query);
    const results = await searchSongs(options);
    res.json({ results });
  })
);

songsRouter.post(
  "/upload",
  authenticate,
  upload.array("files"),
  asyncHandler(async (req, res) => {
    const folder = z.string().default("").parse(req.body.folder);
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      throw AppError.badRequest("No files uploaded.");
    }

    for (const file of files) {
      const songPath = folder ? `${folder}/${file.originalname}` : file.originalname;
      const content = file.buffer.toString("utf-8");
      await saveSong(songPath, content);
    }

    logger.info({ requestId: req.id, count: files.length, folder }, "Songs uploaded");
    res.json({ success: true });
  })
);

songsRouter.get(
  "/download",
  authenticate,
  asyncHandler(async (req, res) => {
    const songPath = z.string().min(1).parse(req.query.path);
    const { content } = await getSongContent(songPath);
    
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(songPath.split("/").pop()!)}"`);
    res.send(content);
  })
);

songsRouter.post(
  "/create_empty",
  authenticate,
  asyncHandler(async (req, res) => {
    const { path: songPath, title } = createEmptySchema.parse(req.body ?? {});
    const content = title ? `{title: ${title}}\n` : "{title: New Song}\n";
    await saveSong(songPath, content);
    logger.info({ requestId: req.id, songPath }, "Empty song created");
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
