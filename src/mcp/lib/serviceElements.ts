import type { SongService } from "../../services/song.service.js";
import {
  validateServiceElements,
} from "../../validators/serviceElement.validators.js";

export {
  serviceElementSchema,
  serviceElementTypeSchema,
  serviceElementsSchema,
  validateServiceElements,
  type ServiceElementInput,
} from "../../validators/serviceElement.validators.js";

/** Validate element shape and that song references exist in the org library. */
export async function validateServicePlan(
  elements: unknown,
  songService: SongService,
): Promise<{
  ok: boolean;
  errors: string[];
  warnings: string[];
  missingSongIds: string[];
  /** Duration values are seconds. */
  durationUnit: "seconds";
}> {
  const shape = validateServiceElements(elements);
  if (!shape.ok) {
    return {
      ok: false,
      errors: shape.errors,
      warnings: [],
      missingSongIds: [],
      durationUnit: "seconds",
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const missingSongIds: string[] = [];
  const positions = new Set<number>();
  let songDurationSum = 0;
  let songWithDuration = 0;

  for (const [index, el] of (shape.elements ?? []).entries()) {
    if (el.position != null) {
      if (positions.has(el.position)) {
        warnings.push(`Duplicate position ${el.position} at index ${index}`);
      }
      positions.add(el.position);
    }
    if (el.type === "song" && el.songId) {
      try {
        await songService.getById(el.songId);
      } catch {
        missingSongIds.push(el.songId);
        errors.push(
          `Element "${el.title}" (${el.id}) references missing song ${el.songId}`,
        );
      }
    }
    if (el.type === "scripture" && !el.passage && !el.content) {
      warnings.push(
        `Scripture element "${el.title}" has no passage or content`,
      );
    }
    if (typeof el.duration === "number" && el.duration > 0) {
      // Hosanna stores element duration in seconds.
      if (el.type === "song") {
        songDurationSum += el.duration;
        songWithDuration += 1;
        if (el.duration > 0 && el.duration < 30) {
          warnings.push(
            `Song "${el.title}" duration=${el.duration} looks like minutes; duration is seconds (e.g. 210 ≈ 3.5 min)`,
          );
        }
        if (el.duration > 3600) {
          warnings.push(
            `Song "${el.title}" duration=${el.duration}s (>1h) — verify unit`,
          );
        }
      }
      if (el.type === "message" && el.duration > 9000) {
        warnings.push(
          `Message "${el.title}" duration=${el.duration}s is unusually long`,
        );
      }
    }
  }

  if (songWithDuration >= 2 && songDurationSum < 120) {
    warnings.push(
      `Sum of song durations is ${songDurationSum}s for ${songWithDuration} songs — likely stored as minutes instead of seconds`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    missingSongIds,
    durationUnit: "seconds",
  };
}
