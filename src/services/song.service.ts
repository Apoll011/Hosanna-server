import { Prisma, Song } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import type { TenantPrisma } from "../database/prisma";
import { FolderRepository } from "../repositories/folder.repository";
import { SongRepository } from "../repositories/song.repository";
import { AppError } from "../utils/errors";
import {
  createSongSchema,
  listSongsQuerySchema,
} from "../validators/song.validators";

type ListQuery = z.infer<typeof listSongsQuerySchema>;
type CreateInput = z.infer<typeof createSongSchema>;

const KEY_DIRECTIVE = /\{key:\s*([^}]+)\}/i;

function assertUnchanged(current: { updatedAt: Date }, clientUpdatedAt: Date) {
  if (current.updatedAt.getTime() !== clientUpdatedAt.getTime()) {
    throw AppError.conflict(
      "This song was modified by someone else since you last loaded it.",
    );
  }
}

function defaultContent(title: string, artist?: string) {
  return `{title: ${title}}\n{artist: ${artist || "Unknown"}}\n{key: G}\n\n[G]Add chords and lyrics here...`;
}

export class SongService {
  private songRepo: SongRepository;
  private folderRepo: FolderRepository;

  constructor(private readonly db: TenantPrisma) {
    this.songRepo = new SongRepository(db);
    this.folderRepo = new FolderRepository(db);
  }

  private async computePath(
    title: string,
    folderId: string | null | undefined,
    explicitPath?: string,
  ) {
    if (explicitPath) return explicitPath;
    if (!folderId) return `${title}.pro`;
    const folder = await this.folderRepo.findById(folderId);
    return folder ? `${folder.name}/${title}.pro` : `${title}.pro`;
  }

  async list(query: ListQuery) {
    const where: Prisma.SongWhereInput = {};

    if (query.folder) {
      where.folderId = query.folder === "root" ? null : query.folder;
    }
    if (query.tag) {
      where.tags = { has: query.tag };
    }

    let fields = { title: true, artist: true, content: true, tags: true };
    if (query.search && query.searchFields) {
      try {
        fields = { ...fields, ...JSON.parse(query.searchFields) };
      } catch {
        // ignore malformed filter
      }
    }

    if (query.search) {
      const q = query.search;
      const or: Prisma.SongWhereInput[] = [];
      if (fields.title)
        or.push({ title: { contains: q, mode: "insensitive" } });
      if (fields.artist)
        or.push({ artist: { contains: q, mode: "insensitive" } });
      if (fields.content)
        or.push({ content: { contains: q, mode: "insensitive" } });
      if (fields.tags) or.push({ tags: { hasSome: [q] } });
      if (or.length > 0) where.OR = or;
    }

    let result = await this.songRepo.findMany(where, {});

    if (query.search && fields.tags) {
      const q = query.search.toLowerCase();
      const allSongs = await this.songRepo.findMany(
        query.folder ? { folderId: where.folderId } : {},
        {},
      );
      const extraMatches = allSongs.filter(
        (s) =>
          s.tags.some((t) => t.toLowerCase().includes(q)) &&
          !result.some((r) => r.id === s.id),
      );
      result = [...result, ...extraMatches];
    }

    if (query.key) {
      const k = query.key.toLowerCase();
      result = result.filter((s) => {
        const match = s.content.match(KEY_DIRECTIVE);
        return match && match[1].trim().toLowerCase() === k;
      });
    }

    result.sort((a, b) => {
      const valA = (a as any)[query.sortBy];
      const valB = (b as any)[query.sortBy];
      const normA = typeof valA === "string" ? valA.toLowerCase() : valA;
      const normB = typeof valB === "string" ? valB.toLowerCase() : valB;
      if (normA < normB) return query.sortOrder === "asc" ? -1 : 1;
      if (normA > normB) return query.sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const total = result.length;
    const start = (query.page - 1) * query.limit;
    const paginated = result.slice(start, start + query.limit);

    return {
      songs: paginated,
      total,
      page: query.page,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  }

  async getById(id: string): Promise<Song> {
    const song = await this.songRepo.findById(id);
    if (!song)
      throw AppError.notFound("SONG_NOT_FOUND", "Song does not exist.");
    return song;
  }

  async create(input: CreateInput) {
    const path = await this.computePath(
      input.title,
      input.folderId,
      input.path,
    );
    return this.songRepo.create({
      id: uuid(),
      title: input.title,
      artist: input.artist || "Unknown Artist",
      content: input.content || defaultContent(input.title, input.artist),
      folderId: input.folderId,
      song_number: input.song_number,
      path,
      tags: input.tags ?? [],
    });
  }

  async batchCreate(items: CreateInput[]) {
    const prepared = await Promise.all(
      items.map(async (item) => ({
        id: uuid(),
        title: item.title,
        artist: item.artist || "Vários",
        content:
          item.content ||
          `{title: ${item.title}}\n{artist: ${item.artist || "Vários"}}\n\n`,
        folderId: item.folderId ?? null,
        song_number: item.song_number ?? null,
        path: await this.computePath(item.title, item.folderId, item.path),
        tags: item.tags ?? [],
      })),
    );
    console.log(prepared.map((v) => v.path));
    const created = await this.songRepo.createMany(prepared);
    return { created, count: created.count };
  }

  async batchUpdateTags(
    songIds: string[],
    tags: string[],
    mode: "append" | "replace" | "remove",
  ) {
    const existing = await this.songRepo.findMany({ id: { in: songIds } }, {});
    let updatedCount = 0;
    for (const song of existing) {
      let newTags = [...song.tags];
      if (mode === "replace") newTags = [...new Set(tags)];
      else if (mode === "remove")
        newTags = newTags.filter((t) => !tags.includes(t));
      else
        tags.forEach((t) => {
          if (!newTags.includes(t)) newTags.push(t);
        });

      await this.songRepo.update(song.id, { tags: newTags });
      updatedCount++;
    }
    return { success: true, count: updatedCount };
  }

  async update(id: string, updatedAt: Date, patch: Partial<CreateInput>) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    const data: Prisma.SongUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.artist !== undefined) data.artist = patch.artist;
    if (patch.content !== undefined) data.content = patch.content;
    if (patch.path !== undefined) data.path = patch.path;
    if (patch.tags !== undefined) data.tags = patch.tags;
    if (patch.song_number !== undefined) data.song_number = patch.song_number;
    if (patch.folderId !== undefined) {
      data.folder = patch.folderId
        ? { connect: { id: patch.folderId } }
        : { disconnect: true };
    }
    return this.songRepo.update(id, data);
  }

  async delete(id: string) {
    await this.getById(id);
    await this.songRepo.delete(id);
  }

  async move(
    id: string,
    updatedAt: Date,
    folderId: string | null,
    newPath?: string,
  ) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);
    return this.songRepo.update(id, {
      folder: folderId ? { connect: { id: folderId } } : { disconnect: true },
      path: newPath ?? current.path,
    });
  }
}
