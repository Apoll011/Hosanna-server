import { z } from "zod";
import { AI_LIMITS } from "../services/aiBehavior.js";

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
  maxToolCalls: z
    .number()
    .int()
    .min(AI_LIMITS.maxToolCalls.min)
    .max(AI_LIMITS.maxToolCalls.max)
    .optional(),
  temperature: z
    .number()
    .min(AI_LIMITS.temperature.min)
    .max(AI_LIMITS.temperature.max)
    .nullable()
    .optional(),
  maxOutputTokens: z
    .number()
    .int()
    .min(AI_LIMITS.maxOutputTokens.min)
    .max(AI_LIMITS.maxOutputTokens.max)
    .nullable()
    .optional(),
  instructions: z
    .string()
    .max(AI_LIMITS.instructionsMaxChars)
    .nullable()
    .optional(),
  memoryEnabled: z.boolean().optional(),
});

export const addAiMemorySchema = z.object({
  content: z.string().trim().min(1).max(AI_LIMITS.memoryEntryMaxChars),
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

/** Hard caps so a runaway client cannot send unbounded history. */
export const AI_CHAT_MAX_MESSAGES = 200;
export const AI_CHAT_MAX_BODY_CHARS = 1_500_000;

export const aiChatBodySchema = z
  .object({
    messages: z.array(z.any()).min(1).max(AI_CHAT_MAX_MESSAGES),
    context: aiChatContextSchema,
    /** Studio UI language so the model replies in it. */
    locale: z.enum(["pt", "en", "es"]).optional(),
  })
  .refine(
    (body) => JSON.stringify(body.messages).length <= AI_CHAT_MAX_BODY_CHARS,
    {
      message: "Conversation is too large. Start a new chat.",
      path: ["messages"],
    },
  );

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
