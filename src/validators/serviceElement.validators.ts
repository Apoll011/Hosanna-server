import { z } from "zod";

export const serviceElementTypeSchema = z.enum([
  "welcome",
  "scripture",
  "message",
  "announcement",
  "custom",
  "song",
]);

export const serviceElementSchema = z
  .object({
    id: z.string().min(1),
    type: serviceElementTypeSchema,
    title: z.string().trim().min(1),
    content: z.string().optional(),
    position: z.number().int().nonnegative().optional(),
    songId: z.string().uuid().optional(),
    notes: z.string().optional(),
    passage: z.string().optional(),
    duration: z.number().nonnegative().optional(),
  })
  .superRefine((el, ctx) => {
    if (el.type === "song" && !el.songId) {
      ctx.addIssue({
        code: "custom",
        message: "song elements require songId",
        path: ["songId"],
      });
    }
  });

export const serviceElementsSchema = z.array(serviceElementSchema);

export type ServiceElementInput = z.infer<typeof serviceElementSchema>;

export function validateServiceElements(elements: unknown): {
  ok: boolean;
  elements?: ServiceElementInput[];
  errors: string[];
} {
  const parsed = serviceElementsSchema.safeParse(elements ?? []);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "elements"}: ${i.message}`,
      ),
    };
  }
  return { ok: true, elements: parsed.data, errors: [] };
}
