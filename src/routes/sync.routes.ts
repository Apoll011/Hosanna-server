import { Router } from "express";
import { authenticateAny } from "../middleware/auth";
import { syncCache } from "../services/syncCache.service";
import { asyncHandler } from "../utils/asyncHandler";

export const syncRouter = Router();

/**
 * GET /api/sync/status
 *
 * Returns lightweight max-updatedAt timestamps for all entity types in the
 * tenant so that clients can detect changes without fetching heavy lists.
 *
 * Performance strategy:
 *   1. Check the in-process SyncCache. If fresh (< TTL), respond immediately
 *      — zero DB queries.
 *   2. On a miss, run a single parallel batch of six lightweight `aggregate`
 *      queries, cache the result, then respond.
 *   3. Writes to any entity (song, folder, service, etc.) call
 *      `syncCache.invalidate(tenantId)` so the next poll always reflects the
 *      latest change without waiting for the TTL to expire.
 */
syncRouter.get(
  "/status",
  authenticateAny,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const db = req.db!;

    // ── Cache hit ──────────────────────────────────────────────────────────
    const cached = syncCache.get(tenantId);
    if (cached) {
      res.set("X-Sync-Cache", "HIT");
      return res.json({
        versionHash: cached.versionHash,
        timestamp: new Date().toISOString(),
        timestamps: cached.timestamps,
      });
    }

    // ── Cache miss: query DB ───────────────────────────────────────────────
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
      songs: songAgg._max.updatedAt?.toISOString() ?? "0",
      folders: folderAgg._max.updatedAt?.toISOString() ?? "0",
      services: serviceAgg._max.updatedAt?.toISOString() ?? "0",
      musicians: musicianAgg._max.updatedAt?.toISOString() ?? "0",
      settings: settingsAgg._max.updatedAt?.toISOString() ?? "0",
      admins: adminAgg._max.updatedAt?.toISOString() ?? "0",
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
