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
  elements?: ReturnType<typeof validateServiceElements>["elements"];
}> {
  const shape = validateServiceElements(elements);
  if (!shape.ok) {
    return { ok: false, errors: shape.errors, warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const positions = new Set<number>();

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
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    elements: shape.elements,
  };
}
