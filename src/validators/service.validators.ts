import { z } from "zod";
import { concurrencySchema } from "./common.validators.js";
import { serviceElementsSchema } from "./serviceElement.validators.js";

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  date: z.string().trim().min(1, "date is required"),
  notes: z.string().optional(),
  elements: serviceElementsSchema.optional(),
});

export const updateServiceSchema = concurrencySchema.extend({
  name: z.string().trim().min(1).optional(),
  date: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
  archived: z.boolean().optional(),
  elements: serviceElementsSchema.optional(),
});

export const updateServiceElementsSchema = concurrencySchema.extend({
  elements: serviceElementsSchema,
});

export const archiveSchema = concurrencySchema.extend({
  archive: z.boolean().optional().default(false),
});

export const serviceListSchema = z.object({
  archived: z
    .union([z.string(), z.boolean(), z.undefined()])
    .transform((val) => {
      if (val === "true" || val === true) return true;
      return false;
    })
    .pipe(z.boolean()),
});
