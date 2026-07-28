import { z } from 'zod';
import { concurrencySchema } from './common.validators';

// Legacy shape accepted for backward compatibility with the reference
// implementation: songs: [{ songId, notes? }], songNotes: { [songId]: note }.
// If both are present, `songs[].notes` wins for that song.
const legacyServiceSongSchema = z.object({
  songId: z.string().uuid(),
  notes: z.string().optional(),
});

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  date: z.string().trim().min(1, 'date is required'),
  notes: z.string().optional(),
  elements: z.any().optional(),
  songs: z.array(legacyServiceSongSchema).optional(),
  songIds: z.array(z.string().uuid()).optional(), // new, simpler alternative to `songs`
  songNotes: z.record(z.string()).optional(),
});

export const updateServiceSchema = concurrencySchema.extend({
  name: z.string().trim().min(1).optional(),
  date: z.string().trim().min(1).optional(),
  notes: z.string().optional(),
  elements: z.any().optional(),
  songs: z.array(legacyServiceSongSchema).optional(),
  songIds: z.array(z.string().uuid()).optional(),
  songNotes: z.record(z.string()).optional(),
});

export const updateServiceElementsSchema = concurrencySchema.extend({
  elements: z.any(),
});

export const addSongToServiceSchema = concurrencySchema.extend({
  songId: z.string().uuid(),
  notes: z.string().optional(),
  position: z.number().int().min(0).optional(),
});

export const reorderServiceSongsSchema = concurrencySchema.extend({
  orderedSongIds: z.array(z.string().uuid()).min(1),
});

export const moveServiceSongSchema = concurrencySchema.extend({
  targetIndex: z.number().int().min(0),
});

export const updateServiceNotesSchema = concurrencySchema.extend({
  notes: z.string(),
});

export const updateServiceSongNotesSchema = concurrencySchema.extend({
  notes: z.string(),
});
