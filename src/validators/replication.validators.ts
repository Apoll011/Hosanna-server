import { z } from "zod";

export const collectionParamSchema = z.object({
  collection: z.enum(["songs", "folders", "services", "agendaEvents"]),
});

const checkpointSchema = z
  .object({
    updatedAt: z.number(),
    id: z.string(),
  })
  .nullable();

export const pullBodySchema = z.object({
  checkpoint: checkpointSchema.optional().default(null),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

export const replicatedCollectionSchema = z.enum([
  "songs",
  "folders",
  "services",
  "agendaEvents",
]);

export const pullAllBodySchema = z.object({
  checkpoints: z
    .record(replicatedCollectionSchema, checkpointSchema)
    .optional()
    .default({}),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

export const changeRowSchema = z.object({
  newDocumentState: z.record(z.unknown()),
  assumedMasterState: z.record(z.unknown()).nullable().optional(),
});

export const pushBodySchema = z.object({
  changeRows: z.array(changeRowSchema).min(1).max(100),
});

export type PullBody = z.infer<typeof pullBodySchema>;
export type PullAllBody = z.infer<typeof pullAllBodySchema>;
