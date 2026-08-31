// src/routes/serviceSongAnnotation.routes.ts
import { Router } from "express";
import { assertUser } from "../middleware/auth.js";
import { ServiceSongAnnotationService } from "../services/serviceSongAnnotation.service.js";

const anotationRouter = Router({ mergeParams: true });

anotationRouter.get(
  "/services/:serviceId/songs/:songId/annotation",
  assertUser,
  async (req, res) => {
    const { serviceId, songId } = req.params;
    const serviceSongAnnotationService = new ServiceSongAnnotationService(
      req.db!,
      req.orgId!,
      req.user?.id!,
    );

    const row = await serviceSongAnnotationService.get(serviceId, songId);
    if (!row) return res.status(404).json({ error: "Not found" });

    res.json({
      canvasDataBase64: Buffer.from(row.canvasData).toString("base64"),
      updatedAt: row.updatedAt.toISOString(),
    });
  },
);

anotationRouter.put(
  "/services/:serviceId/songs/:songId/annotation",
  assertUser,
  async (req, res) => {
    const serviceSongAnnotationService = new ServiceSongAnnotationService(
      req.db!,
      req.orgId!,
      req.user?.id!,
    );
    const { serviceId, songId } = req.params;
    const { canvasDataBase64 } = req.body;

    if (typeof canvasDataBase64 !== "string") {
      return res.status(400).json({ error: "canvasDataBase64 is required" });
    }

    const row = await serviceSongAnnotationService.upsert({
      serviceId,
      songId,
      canvasData: Buffer.from(canvasDataBase64, "base64"),
    });

    res.json({ updatedAt: row.updatedAt.toISOString() });
  },
);

export default anotationRouter;
