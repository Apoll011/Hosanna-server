import { Router } from "express";
import { assertUser } from "../middleware/auth";
import { syncCache } from "../services/syncCache.service";
import { asyncHandler } from "../utils/asyncHandler";

export const syncRouter = Router();

syncRouter.get(
  "/status",
  assertUser,
  asyncHandler(async (req, res) => {
    const tenantId = req.orgId!;
    const db = req.db!;

    const cached = syncCache.get(tenantId);
    if (cached) {
      res.set("X-Sync-Cache", "HIT");
      return res.json({
        versionHash: cached.versionHash,
        timestamp: new Date().toISOString(),
        timestamps: cached.timestamps,
      });
    }

    const [songAgg, folderAgg, serviceAgg, settingsAgg] = await Promise.all([
      db.song.aggregate({ _max: { updatedAt: true } }),
      db.folder.aggregate({ _max: { updatedAt: true } }),
      db.service.aggregate({ _max: { updatedAt: true } }),
      db.settings.aggregate({ _max: { updatedAt: true } }),
    ]);

    const timestamps = {
      songs: songAgg._max.updatedAt?.toISOString() ?? "0",
      folders: folderAgg._max.updatedAt?.toISOString() ?? "0",
      services: serviceAgg._max.updatedAt?.toISOString() ?? "0",
      settings: settingsAgg._max.updatedAt?.toISOString() ?? "0",
    };

    syncCache.set(tenantId, timestamps);

    const versionHash = Object.values(timestamps).join("|");

    res.set("X-Sync-Cache", "MISS");
    return res.json({
      versionHash,
      timestamp: new Date().toISOString(),
      timestamps,
    });
  }),
);
