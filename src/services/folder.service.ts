import { v4 as uuid } from 'uuid';
import { folderRepository } from '../repositories/folder.repository';
import { songRepository } from '../repositories/song.repository';
import { AppError } from '../utils/errors';

function assertUnchanged(current: { updatedAt: Date }, clientUpdatedAt: Date) {
  if (current.updatedAt.getTime() !== clientUpdatedAt.getTime()) {
    throw AppError.conflict('This folder was modified by someone else since you last loaded it.');
  }
}

export const folderService = {
  async listWithCounts() {
    const [folders, rootSongsCount] = await Promise.all([
      folderRepository.findAll(),
      songRepository.countByFolder(null),
    ]);
    const withCounts = await Promise.all(
      folders.map(async (f) => ({ ...f, songCount: await songRepository.countByFolder(f.id) })),
    );
    return { folders: withCounts, rootSongsCount };
  },

  /**
   * All real folder records, flat, with no song counts attached. There is no
   * "root" Folder row to exclude — root is the implicit `folderId === null`
   * state on a Song — so this is simply the plain folder list, provided as
   * a lightweight endpoint for populating pickers/dropdowns.
   */
  async listFlat() {
    return folderRepository.findAll();
  },

  async getById(id: string) {
    const folder = await folderRepository.findById(id);
    if (!folder) throw AppError.notFound('FOLDER_NOT_FOUND', 'Folder does not exist.');
    return folder;
  },

  async create(name: string, parentId?: string | null) {
    return folderRepository.create({
      id: uuid(),
      name: name.trim(),
      parent: parentId ? { connect: { id: parentId } } : undefined,
    });
  },

  async update(id: string, updatedAt: Date, name?: string, parentId?: string | null) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    const updated = await folderRepository.update(id, {
      name: name ?? undefined,
      parent: parentId !== undefined ? (parentId ? { connect: { id: parentId } } : { disconnect: true }) : undefined,
    });

    // Keep song.path in sync with the folder name, matching reference behavior.
    if (name && name !== current.name) {
      const songs = await songRepository.findManyByFolder(id);
      await Promise.all(
        songs.map((s) => songRepository.update(s.id, { path: `${updated.name}/${s.title}.pro` })),
      );
    }

    return updated;
  },

  /** Moves every song inside the folder to root (folderId = null), then deletes the folder. */
  async deleteMovingSongsToRoot(id: string) {
    await this.getById(id);
    const songs = await songRepository.findManyByFolder(id);
    await Promise.all(songs.map((s) => songRepository.update(s.id, { folderId: null, path: `${s.title}.pro` })));
    await folderRepository.delete(id);
    return { movedSongs: songs.length };
  },

  /** Deletes the folder and every song inside it (services referencing them cascade). */
  async deleteWithSongs(id: string) {
    await this.getById(id);
    const songs = await songRepository.findManyByFolder(id);
    await songRepository.deleteManyByFolder(id);
    await folderRepository.delete(id);
    return { deletedSongs: songs.length };
  },
};
