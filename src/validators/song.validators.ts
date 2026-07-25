import { z } from 'zod';
import { concurrencySchema, paginationQuerySchema } from './common.validators';

export const listSongsQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  folder: z.string().optional(), // folder UUID, or the literal "root"
  key: z.string().optional(),
  tag: z.string().optional(),
  sortBy: z.enum(['title', 'artist', 'createdAt', 'updatedAt']).default('title'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  // JSON-encoded { title?: boolean, artist?: boolean, content?: boolean, tags?: boolean }
  searchFields: z.string().optional(),
});

export const createSongSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  artist: z.string().trim().optional(),
  content: z.string().optional(),
  folderId: z.string().uuid().nullable().optional(),
  path: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const batchCreateSongsSchema = z.object({
  songs: z.array(createSongSchema).min(1, 'At least one song is required.'),
});

export const batchTagsSchema = z.object({
  songIds: z.array(z.string().uuid()).min(1),
  tags: z.array(z.string()).min(1),
  mode: z.enum(['append', 'replace', 'remove']).default('append'),
});

export const updateSongSchema = concurrencySchema.extend({
  title: z.string().trim().min(1).optional(),
  artist: z.string().trim().optional(),
  content: z.string().optional(),
  folderId: z.string().uuid().nullable().optional(),
  path: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const renameSongSchema = concurrencySchema.extend({
  newTitle: z.string().trim().min(1).optional(),
  newPath: z.string().trim().optional(),
});

export const moveSongSchema = concurrencySchema.extend({
  folderId: z.string().uuid().nullable(),
  newPath: z.string().trim().optional(),
});
