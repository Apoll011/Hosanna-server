import { v4 as uuid } from 'uuid';
import { ServiceRepository, ServiceWithSongs } from '../repositories/service.repository';
import { SongRepository } from '../repositories/song.repository';
import type { TenantPrisma } from '../database/prisma';
import { AppError } from '../utils/errors';

function assertUnchanged(current: { updatedAt: Date }, clientUpdatedAt: Date) {
  if (current.updatedAt.getTime() !== clientUpdatedAt.getTime()) {
    throw AppError.conflict('This service was modified by someone else since you last loaded it.');
  }
}

function serialize(service: NonNullable<ServiceWithSongs>) {
  const orderedSongs = service.songs;
  return {
    id: service.id,
    name: service.name,
    date: service.date,
    notes: service.notes ?? '',
    songIds: orderedSongs.map((s) => s.songId),
    songs: orderedSongs.map((s) => ({ songId: s.songId, notes: s.notes ?? '', position: s.position })),
    songNotes: Object.fromEntries(orderedSongs.map((s) => [s.songId, s.notes ?? ''])),
    createdAt: service.createdAt,
    updatedAt: service.updatedAt,
  };
}

type SongsInput = { songId: string; notes?: string }[] | undefined;

export class ServiceService {
  private serviceRepo: ServiceRepository;
  private songRepo: SongRepository;

  constructor(private readonly db: TenantPrisma) {
    this.serviceRepo = new ServiceRepository(db);
    this.songRepo = new SongRepository(db);
  }

  private async normalizeSongsInput(
    songs: SongsInput,
    songIds: string[] | undefined,
    songNotes: Record<string, string> | undefined,
  ) {
    let list: { songId: string; notes?: string }[] = [];
    if (songs && songs.length > 0) {
      list = songs;
    } else if (songIds && songIds.length > 0) {
      list = songIds.map((songId) => ({ songId }));
    }
    if (songNotes) {
      list = list.map((s) => ({ songId: s.songId, notes: songNotes[s.songId] ?? s.notes }));
    }

    // Validate every referenced song actually exists within this tenant.
    const ids = list.map((s) => s.songId);
    if (ids.length > 0) {
      const found = await this.songRepo.findMany({ id: { in: ids } }, {});
      const missing = ids.filter((id) => !found.some((s) => s.id === id));
      if (missing.length > 0) {
        throw AppError.badRequest(`Unknown song id(s): ${missing.join(', ')}`);
      }
    }

    return list.map((s, index) => ({ songId: s.songId, position: index, notes: s.notes ?? null }));
  }

  async list() {
    const services = await this.serviceRepo.findAll();
    return services.map(serialize);
  }

  async getById(id: string) {
    const service = await this.serviceRepo.findById(id);
    if (!service) throw AppError.notFound('SERVICE_NOT_FOUND', 'Service does not exist.');
    return service;
  }

  async getByIdSerialized(id: string) {
    return serialize(await this.getById(id));
  }

  async create(input: {
    name: string;
    date: string;
    notes?: string;
    songs?: SongsInput;
    songIds?: string[];
    songNotes?: Record<string, string>;
  }) {
    const normalized = await this.normalizeSongsInput(input.songs, input.songIds, input.songNotes);
    const created = await this.serviceRepo.create({
      id: uuid(),
      name: input.name,
      date: input.date,
      notes: input.notes ?? '',
      songs: { create: normalized },
    });
    return serialize(created!);
  }

  async update(
    id: string,
    updatedAt: Date,
    patch: {
      name?: string;
      date?: string;
      notes?: string;
      songs?: SongsInput;
      songIds?: string[];
      songNotes?: Record<string, string>;
    },
  ) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    await this.serviceRepo.update(id, {
      name: patch.name ?? undefined,
      date: patch.date ?? undefined,
      notes: patch.notes ?? undefined,
    });

    if (patch.songs || patch.songIds || patch.songNotes) {
      const normalized = await this.normalizeSongsInput(patch.songs, patch.songIds, patch.songNotes);
      await this.serviceRepo.replaceSongs(id, normalized);
    }

    return serialize((await this.getById(id))!);
  }

  async delete(id: string) {
    await this.getById(id);
    await this.serviceRepo.delete(id);
  }

  async addSong(id: string, updatedAt: Date, songId: string, notes?: string, position?: number) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    const song = await this.songRepo.findById(songId);
    if (!song) throw AppError.notFound('SONG_NOT_FOUND', 'Song does not exist.');

    const existing = await this.serviceRepo.findServiceSong(id, songId);
    if (existing) throw AppError.badRequest('This song is already part of the service.');

    const pos = position ?? (await this.serviceRepo.nextPosition(id));
    await this.serviceRepo.addSong(id, songId, pos, notes);
    return serialize((await this.getById(id))!);
  }

  async removeSong(id: string, updatedAt: Date, songId: string) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    const existing = await this.serviceRepo.findServiceSong(id, songId);
    if (!existing) throw AppError.notFound('SONG_IN_SERVICE_NOT_FOUND', 'This song is not part of the service.');

    await this.serviceRepo.removeSong(id, songId);
    return serialize((await this.getById(id))!);
  }

  async reorder(id: string, updatedAt: Date, orderedSongIds: string[]) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    const currentIds = current.songs.map((s) => s.songId).sort();
    if (JSON.stringify([...orderedSongIds].sort()) !== JSON.stringify(currentIds)) {
      throw AppError.badRequest('orderedSongIds must contain exactly the songs already in the service.');
    }

    const notesById = new Map(current.songs.map((s) => [s.songId, s.notes]));
    const normalized = orderedSongIds.map((songId, index) => ({
      songId,
      position: index,
      notes: notesById.get(songId) ?? null,
    }));
    await this.serviceRepo.replaceSongs(id, normalized);
    return serialize((await this.getById(id))!);
  }

  async moveSong(id: string, updatedAt: Date, songId: string, targetIndex: number) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    const ids = current.songs.map((s) => s.songId);
    const fromIndex = ids.indexOf(songId);
    if (fromIndex === -1) throw AppError.notFound('SONG_IN_SERVICE_NOT_FOUND', 'This song is not part of the service.');

    ids.splice(fromIndex, 1);
    ids.splice(Math.min(targetIndex, ids.length), 0, songId);

    const notesById = new Map(current.songs.map((s) => [s.songId, s.notes]));
    const normalized = ids.map((sid, index) => ({ songId: sid, position: index, notes: notesById.get(sid) ?? null }));
    await this.serviceRepo.replaceSongs(id, normalized);
    return serialize((await this.getById(id))!);
  }

  async updateNotes(id: string, updatedAt: Date, notes: string) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);
    const updated = await this.serviceRepo.update(id, { notes });
    return serialize(updated!);
  }

  async updateSongNotes(id: string, updatedAt: Date, songId: string, notes: string) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    const existing = await this.serviceRepo.findServiceSong(id, songId);
    if (!existing) throw AppError.notFound('SONG_IN_SERVICE_NOT_FOUND', 'This song is not part of the service.');

    await this.serviceRepo.updateSongNotes(id, songId, notes);
    return serialize((await this.getById(id))!);
  }
}
