import { z } from "zod";
import { concurrencySchema } from "./common.validators.js";

export const createFolderSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  parentId: z.string().uuid().nullable().optional(),
});

export const updateFolderSchema = concurrencySchema.extend({
  name: z.string().trim().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export const deleteFolderQuerySchema = z.object({
  action: z.enum(["move_to_root", "delete_songs"]).default("move_to_root"),
});
