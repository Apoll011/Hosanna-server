import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";

export const cronRouter = Router();

function requireCronSecret(req: Request, _res: Response, next: NextFunction) {
  if (!env.cronSecret)
    return next(AppError.forbidden("CRON_SECRET not configured."));
  if (req.headers["authorization"] !== `Bearer ${env.cronSecret}`) {
    return next(AppError.forbidden("Invalid cron secret."));
  }
  next();
}

// POST /api/cron/purge-trash — permanently delete records past their purgeAt
cronRouter.post(
  "/purge-trash",
  requireCronSecret,
  asyncHandler(async (_req, res) => {
    const now = new Date();

    const [songs, folders, services] = await Promise.all([
      prisma.song.deleteMany({
        where: { deleted: true, purgeAt: { lte: now } },
      }),
      prisma.folder.deleteMany({
        where: { deleted: true, purgeAt: { lte: now } },
      }),
      prisma.service.deleteMany({
        where: { deleted: true, purgeAt: { lte: now } },
      }),
    ]);

    res.json({
      purged: {
        songs: songs.count,
        folders: folders.count,
        services: services.count,
      },
    });
  }),
);
