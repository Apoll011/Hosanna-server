import { Router } from "express";
import { z } from "zod";
import { assertUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  extractYouTubeVideoId,
  getYouTubeDuration,
} from "../mcp/lib/youtubeSearch.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const youtubeRouter = Router();

const durationQuerySchema = z.object({
  url: z.string().min(1),
});

/**
 * GET /api/youtube/duration?url=https://www.youtube.com/watch?v=...
 * Returns ChordPro-ready duration for library-health auto-fix.
 */
youtubeRouter.get(
  "/duration",
  assertUser,
  validate({ query: durationQuerySchema }),
  asyncHandler(async (req, res) => {
    const { url } = req.query as z.infer<typeof durationQuerySchema>;
    if (!extractYouTubeVideoId(url)) {
      return res.status(400).json({
        error: "Invalid YouTube URL or video id.",
      });
    }

    try {
      const result = await getYouTubeDuration(url);
      return res
        .set("Cache-Control", "private, max-age=3600")
        .json(result);
    } catch (error) {
      return res.status(502).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to resolve YouTube duration",
      });
    }
  }),
);
