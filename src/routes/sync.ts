import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { listSongFiles } from "../services/fileService.js";
import { getServices, mergeServices } from "../services/serviceStore.js";
import { logger } from "../logger.js";

export const syncRouter = Router();

const serviceRecordSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

const syncRequestSchema = z.object({
  services: z.array(serviceRecordSchema).optional(),
});

syncRouter.post(
  "/sync",
  authenticate,
  asyncHandler(async (req, res) => {
    const { services: clientServices } = syncRequestSchema.parse(req.body ?? {});

    const [files, services] = await Promise.all([
      listSongFiles(),
      clientServices && clientServices.length > 0
        ? mergeServices(clientServices)
        : getServices(),
    ]);

    logger.info(
      { requestId: req.id, fileCount: files.length, serviceCount: services.length },
      "Sync completed"
    );

    res.json({
      files,
      services,
      syncedAt: new Date().toISOString(),
    });
  })
);
