import { v4 as uuid } from 'uuid';
import { FolderRepository } from '../repositories/folder.repository';
import { SongRepository } from '../repositories/song.repository';
import type { TenantPrisma } from '../database/prisma';
import { AppError } from '../utils/errors';

function assertUnchanged(current: { updatedAt: Date }, clientUpdatedAt: Date) {
  if (current.updatedAt.getTime() !== clientUpdatedAt.getTime()) {
    throw AppError.conflict('This folder was modified by someone else since you last loaded it.');
  }
}

export class FolderService {
  private folderRepo: FolderRepository;
  private songRepo: SongRepository;

  constructor(private readonly db: TenantPrisma) {
    this.folderRepo = new FolderRepository(db);
    this.songRepo = new SongRepository(db);
  }

  async listWithCounts() {
    const [folders, rootSongsCount] = await Promise.all([
      this.folderRepo.findAll(),
      this.songRepo.countByFolder(null),
    ]);
    const withCounts = await Promise.all(
      folders.map(async (f) => ({ ...f, songCount: await this.songRepo.countByFolder(f.id) })),
    );
    return { folders: withCounts, rootSongsCount };
  }

  async listFlat() {
    return this.folderRepo.findAll();
  }

  async getById(id: string) {
    const folder = await this.folderRepo.findById(id);
    if (!folder) throw AppError.notFound('FOLDER_NOT_FOUND', 'Folder does not exist.');
    return folder;
  }

  async create(name: string, parentId?: string | null) {
    return this.folderRepo.create({
      id: uuid(),
      name: name.trim(),
      parent: parentId ? { connect: { id: parentId } } : undefined,
    });
  }

  async update(id: string, updatedAt: Date, name?: string, parentId?: string | null) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    const updated = await this.folderRepo.update(id, {
      name: name ?? undefined,
      parent: parentId !== undefined ? (parentId ? { connect: { id: parentId } } : { disconnect: true }) : undefined,
    });

    if (name && name !== current.name) {
      const songs = await this.songRepo.findManyByFolder(id);
      await Promise.all(
        songs.map((s) => this.songRepo.update(s.id, { path: `${updated.name}/${s.title}.pro` })),
      );
    }

    return updated;
  }

  async deleteMovingSongsToRoot(id: string) {
    await this.getById(id);
    const songs = await this.songRepo.findManyByFolder(id);
    await Promise.all(songs.map((s) => this.songRepo.update(s.id, { folder: { disconnect: true }, path: `${s.title}.pro` })));
    await this.folderRepo.delete(id);
    return { movedSongs: songs.length };
  }

  async deleteWithSongs(id: string) {
    await this.getById(id);
    const songs = await this.songRepo.findManyByFolder(id);
    await this.songRepo.deleteManyByFolder(id);
    await this.folderRepo.delete(id);
    return { deletedSongs: songs.length };
  }
}
