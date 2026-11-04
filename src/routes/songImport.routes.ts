import { Router } from "express";
import { requirePermission } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { SongImportService } from "../services/songImport.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createSongImportJobSchema,
  songImportJobIdParamSchema,
} from "../validators/songImport.validators.js";

export const songImportRouter = Router();
const service = new SongImportService();

songImportRouter.post(
  "/jobs",
  requirePermission("song.import"),
  validate({ body: createSongImportJobSchema }),
  asyncHandler(async (req, res) => {
    const job = await service.createJob({
      orgId: req.orgId!,
      sourceType: req.body.sourceType,
      imageBase64: req.body.imageBase64,
      imageMimeType: req.body.imageMimeType,
      pdfBase64: req.body.pdfBase64,
      fileName: req.body.fileName,
    });
    res.status(200).json(job);
  }),
);

songImportRouter.get(
  "/jobs/:id",
  requirePermission("song.import"),
  validate({ params: songImportJobIdParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(service.getJob(req.orgId!, req.params.id));
  }),
);
