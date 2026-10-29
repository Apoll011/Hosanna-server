import { z } from "zod";

export const aiProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "openai_compatible",
]);

export const updateAiSettingsSchema = z.object({
  provider: aiProviderSchema.optional(),
  model: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().trim().url().nullable().optional(),
});

export const aiChatContextSchema = z
  .object({
    kind: z
      .enum([
        "song_editor",
        "service_editor",
        "songs_list",
        "services_list",
        "explorer",
        "collection_detail",
        "agenda",
        "trash",
        "general",
      ])
      .optional(),
    route: z.string().optional(),
    songId: z.string().optional(),
    serviceId: z.string().optional(),
    folderId: z.string().nullable().optional(),
    collectionId: z.string().nullable().optional(),
    title: z.string().optional(),
    updatedAt: z.string().optional(),
    artist: z.string().optional(),
    contentExcerpt: z.string().max(20_000).optional(),
    contentTruncated: z.boolean().optional(),
    selectedSongIds: z.array(z.string()).optional(),
    selectedFolderIds: z.array(z.string()).optional(),
    serviceElementsSummary: z
      .array(
        z.object({
          id: z.string(),
          type: z.string(),
          title: z.string().optional(),
          songId: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough()
  .optional();

export const aiChatBodySchema = z.object({
  messages: z.array(z.any()).min(1),
  context: aiChatContextSchema,
});

/** Execute a Studio-staged destructive confirmation (after user clicks Confirm). */
export const aiConfirmActionSchema = z.object({
  action: z.enum([
    "delete_song",
    "delete_service",
    "delete_folder",
    "delete_collection",
    "delete_agenda",
  ]),
  id: z.string().min(1),
  folderAction: z.enum(["move_to_root", "delete_songs"]).optional(),
});
