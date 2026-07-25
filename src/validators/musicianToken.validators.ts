import { z } from 'zod';
import { concurrencySchema } from './common.validators';

export const createMusicianTokenSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  expiresAt: z.coerce.date().optional(),
  allowedServices: z.array(z.string().uuid()).optional(),
});

export const updateMusicianTokenSchema = concurrencySchema.extend({
  name: z.string().trim().min(1).optional(),
  expiresAt: z.coerce.date().optional(),
  allowedServices: z.array(z.string().uuid()).optional(),
});
