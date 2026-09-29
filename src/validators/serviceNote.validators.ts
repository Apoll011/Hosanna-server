import { z } from "zod";

const noteBodySchema = z
  .string()
  .trim()
  .min(1, "body is required")
  .max(10_000, "body must be at most 10000 characters");

export const serviceIdParamsSchema = z.object({
  id: z.string().uuid("Must be a valid UUID."),
});

export const serviceNoteParamsSchema = z.object({
  id: z.string().uuid("Must be a valid UUID."),
  noteId: z.string().uuid("Must be a valid UUID."),
});

/**
 * `scope=all` (default) returns every visible note on the service.
 * `scope=service` returns only notes that are not linked to an element.
 * `elementId` returns only notes linked to that element.
 */
export const listServiceNotesQuerySchema = z
  .object({
    elementId: z.string().uuid().optional(),
    scope: z.enum(["all", "service"]).optional().default("all"),
  })
  .refine((query) => !(query.elementId && query.scope === "service"), {
    message: "elementId cannot be combined with scope=service.",
    path: ["elementId"],
  });

export const createServiceNoteSchema = z.object({
  body: noteBodySchema,
  elementId: z.string().uuid().nullable().optional(),
  private: z.boolean().optional().default(false),
});

export const updateServiceNoteSchema = z
  .object({
    body: noteBodySchema.optional(),
    private: z.boolean().optional(),
  })
  .refine((value) => value.body !== undefined || value.private !== undefined, {
    message: "Provide body or private to update.",
  });
