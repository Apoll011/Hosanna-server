import { z } from "zod";

export const aiProviderSchema = z.enum(["openai", "anthropic", "google"]);

export const updateAiSettingsSchema = z.object({
  provider: aiProviderSchema.optional(),
  model: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
  apiKey: z.string().min(1).optional(),
});

export const aiChatContextSchema = z
  .object({
    kind: z
      .enum([
        "song_editor",
        "service_editor",
        "songs_list",
        "services_list",
        "general",
      ])
      .optional(),
    route: z.string().optional(),
    songId: z.string().optional(),
    serviceId: z.string().optional(),
    title: z.string().optional(),
    contentExcerpt: z.string().max(20_000).optional(),
  })
  .optional();

export const aiChatBodySchema = z.object({
  messages: z.array(z.any()).min(1),
  context: aiChatContextSchema,
});
