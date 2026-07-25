import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.string().uuid('Must be a valid UUID.'),
});

export const twoIdParamSchema = z.object({
  id: z.string().uuid(),
  songId: z.string().uuid(),
});

/**
 * Optimistic-concurrency guard: every mutating endpoint requires the client
 * to send back the `updatedAt` it last read. If the row has since changed,
 * the service layer raises AppError.conflict() -> HTTP 409.
 */
export const concurrencySchema = z.object({
  updatedAt: z.coerce.date({
    required_error: 'updatedAt is required for optimistic concurrency control.',
    invalid_type_error: 'updatedAt must be a valid ISO date string.',
  }),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
