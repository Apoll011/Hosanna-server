import { Router } from "express";
import { authenticateAny } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

export const syncRouter = Router();

/**
 * GET /api/sync/status
 * Returns lightweight max updatedAt timestamps for all entity types in the tenant.
 * Enables client applications to check for changes instantly without fetching heavy entity lists.
 */
syncRouter.get(
  "/status",
  authenticateAny,
  asyncHandler(async (req, res) => {
    const db = req.db!;
    const [songAgg, folderAgg, serviceAgg, musicianAgg, settingsAgg, adminAgg] =
      await Promise.all([
        db.song.aggregate({ _max: { updatedAt: true } }),
        db.folder.aggregate({ _max: { updatedAt: true } }),
        db.service.aggregate({ _max: { updatedAt: true } }),
        db.musicianToken.aggregate({ _max: { updatedAt: true } }),
        db.settings.aggregate({ _max: { updatedAt: true } }),
        db.admin.aggregate({ _max: { updatedAt: true } }),
      ]);

    const timestamps = {
      songs: songAgg._max.updatedAt?.toISOString() || "0",
      folders: folderAgg._max.updatedAt?.toISOString() || "0",
      services: serviceAgg._max.updatedAt?.toISOString() || "0",
      musicians: musicianAgg._max.updatedAt?.toISOString() || "0",
      settings: settingsAgg._max.updatedAt?.toISOString() || "0",
      admins: adminAgg._max.updatedAt?.toISOString() || "0",
    };

    const versionHash = Object.values(timestamps).join("|");

    res.json({
      versionHash,
      timestamp: new Date().toISOString(),
      timestamps,
    });
  }),
);
