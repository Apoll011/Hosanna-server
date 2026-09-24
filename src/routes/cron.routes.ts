import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import { runAgendaReminders } from "../services/agendaReminder.service.js";
import { syncCache } from "../services/syncCache.service.js";
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

// GET|POST /api/cron/agenda-reminders — notify assignees of events in 1 or 3 days
// (Vercel cron issues GET requests; POST kept for manual/scripted runs.)
async function agendaRemindersHandler(_req: Request, res: Response) {
  const result = await runAgendaReminders();
  res.json(result);
}

cronRouter.get(
  "/agenda-reminders",
  requireCronSecret,
  asyncHandler(agendaRemindersHandler),
);

cronRouter.post(
  "/agenda-reminders",
  requireCronSecret,
  asyncHandler(agendaRemindersHandler),
);

// POST /api/cron/purge-trash — permanently delete records past their purgeAt
cronRouter.get(
  "/purge-trash",
  requireCronSecret,
  asyncHandler(async (_req, res) => {
    const now = new Date();

    const [songs, folders, services, agendaEvents] = await Promise.all([
      prisma.song.deleteMany({
        where: { deleted: true, purgeAt: { lte: now } },
      }),
      prisma.folder.deleteMany({
        where: { deleted: true, purgeAt: { lte: now } },
      }),
      prisma.service.deleteMany({
        where: { deleted: true, purgeAt: { lte: now } },
      }),
      prisma.agendaEvent.deleteMany({
        where: { deleted: true, purgeAt: { lte: now } },
      }),
    ]);

    const totalPurged =
      songs.count + folders.count + services.count + agendaEvents.count;
    if (totalPurged > 0) {
      syncCache.invalidateAll();
    }

    res.json({
      purged: {
        songs: songs.count,
        folders: folders.count,
        services: services.count,
        agendaEvents: agendaEvents.count,
      },
    });
  }),
);
