import { z } from "zod";
import { concurrencySchema } from "./common.validators";

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  date: z.string().trim().min(1, "date is required"),
  notes: z.string().optional(),
  elements: z.any().optional(),
});

export const updateServiceSchema = concurrencySchema.extend({
  name: z.string().trim().min(1).optional(),
  date: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
  elements: z.any().optional(),
});

export const updateServiceElementsSchema = concurrencySchema.extend({
  elements: z.any(),
});

export const archiveSchema = concurrencySchema.extend({
  archive: z.boolean().optional().default(false),
});

export const serviceListSchema = concurrencySchema.extend({
  archived: z.boolean().optional().default(false),
});
