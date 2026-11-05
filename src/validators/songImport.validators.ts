import { z } from "zod";

export const createSongImportJobSchema = z.object({
  sourceType: z.enum(["photo", "gallery", "pdf"]),
  imageBase64: z.string().min(1),
  imageMimeType: z.string().min(1).default("image/jpeg"),
  /** Extra page screenshots for multi-page PDFs (max 5 total pages including primary). */
  imagesBase64: z.array(z.string().min(1)).max(4).optional(),
  imageMimeTypes: z.array(z.string().min(1)).max(4).optional(),
  pdfBase64: z.string().min(1).optional(),
  fileName: z.string().max(255).optional(),
});

export const songImportJobIdParamSchema = z.object({
  id: z.string().uuid(),
});
