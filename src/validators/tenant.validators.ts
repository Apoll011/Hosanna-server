import { z } from "zod";

export const editTenantSchema = z.object({
  name: z.string().trim().optional(),
  logo: z.string().optional(),
  active: z.boolean().optional(),
});
