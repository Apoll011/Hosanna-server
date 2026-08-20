import { z } from "zod";

export const updateSettingsSchema = z.object({
  serverName: z.string().trim().min(1).optional(),
  defaultKey: z.string().trim().min(1).optional(),
  syncIntervalSeconds: z.number().int().min(5).max(3600).optional(),
  allowPublicRead: z.boolean().optional(),
  autoBackupEnabled: z.boolean().optional(),
  maxUploadMB: z.number().int().min(1).max(100).optional(),
  /** Min songs deleted in one operation before owners/admins get a security notification. */
  bulkDeleteThreshold: z.number().int().min(1).max(10_000).optional(),
});
