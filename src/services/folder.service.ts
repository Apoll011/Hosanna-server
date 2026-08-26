import { v4 as uuid } from "uuid";
import type { OrgScopedPrisma, OrgScopedTx } from "../database/prisma.js";
import { DEFAULT_LOCALE, t } from "../lib/i18n.js";
import { FolderRepository } from "../repositories/folder.repository.js";
import { SongRepository } from "../repositories/song.repository.js";
import { AppError } from "../utils/errors.js";
import { notifyOrg } from "../utils/notify.js";
import { syncCache } from "./syncCache.service.js";

function assertUnchanged(
  current: { updatedAt: Date },
  clientUpdatedAt: Date,
  locale: string,
) {
  if (current.updatedAt.getTime() !== clientUpdatedAt.getTime()) {
    throw AppError.conflict(t(locale, "conflict.folder"));
  }
}

export class FolderService {
  private folderRepo: FolderRepository;
  private songRepo: SongRepository;

  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly tenantId: string,
    private readonly locale: string = DEFAULT_LOCALE,
  ) {
    this.folderRepo = new FolderRepository(db);
    this.songRepo = new SongRepository(db);
  }

  invalidateCache() {
    syncCache.invalidate(this.tenantId);
  }

  async listWithCounts() {
    const [folders, rootSongsCount] = await Promise.all([
      this.folderRepo.findAll(),
      this.songRepo.countByFolder(null),
    ]);
    const withCounts = await Promise.all(
      folders.map(async (f) => ({
        ...f,
        songCount: await this.songRepo.countByFolder(f.id),
        folderCount: await this.folderRepo.countByFolder(f.id),
      })),
    );
    return { folders: withCounts, rootSongsCount };
  }

  async listFlat() {
    return this.folderRepo.findAll();
  }

  async getById(id: string) {
    const folder = await this.folderRepo.findById(id);
    if (!folder || folder.deleted)
      throw AppError.notFound(
        "FOLDER_NOT_FOUND",
        t(this.locale, "folder.not_found"),
      );
    return folder;
  }

  async create(
    name: string,
    parentId?: string | null,
    color?: string,
    icon?: string,
  ) {
    this.invalidateCache();
    if (parentId) {
      this.folderRepo.touch(parentId);
    }
    return this.folderRepo.create({
      id: uuid(),
      name: name.trim(),
      color: color ?? "default",
      icon: icon ?? "default",
      parent: parentId ? { connect: { id: parentId } } : undefined,
    });
  }

  async update(
    id: string,
    updatedAt: Date,
    name?: string,
    parentId?: string | null,
    color?: string,
    icon?: string,
  ) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt, this.locale);

    if (parentId) {
      this.folderRepo.touch(parentId);
    }

    const updated = await this.folderRepo.update(id, {
      name: name ?? undefined,
      color: color ?? undefined,
      icon: icon ?? undefined,
      parent:
        parentId !== undefined
          ? parentId
            ? { connect: { id: parentId } }
            : { disconnect: true }
          : undefined,
    });

    if (name && name !== current.name) {
      const songs = await this.songRepo.findManyByFolder(id);
      await Promise.all(
        songs.map((s) =>
          this.songRepo.update(s.id, {
            path: `${updated.name}/${s.title}.pro`,
          }),
        ),
      );
    }
    this.invalidateCache();
    return updated;
  }

  async deleteMovingContentToRoot(id: string) {
    const folder = await this.getById(id);
    const songs = await this.songRepo.findManyByFolder(id);
    const purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await Promise.all(
      songs.map((s) =>
        this.songRepo.update(s.id, {
          folder: { disconnect: true },
          path: `${s.title}.pro`,
        }),
      ),
    );
    //TODO: move the folders to....
    await this.folderRepo.update(id, { deleted: true, purgeAt });
    if (folder.parentId) {
      this.folderRepo.touch(folder.parentId);
    }
    this.invalidateCache();
    return { movedSongs: songs.length };
  }

  async deleteWithContent(id: string) {
    this.invalidateCache();
    const result = await this.db.$transaction(async (tx) => {
      return this.deleteRecursive(id, tx);
    });

    if (result.parentId) {
      this.folderRepo.touch(result.parentId);
    }

    void notifyOrg({
      organizationId: this.tenantId,
      roles: ["owner", "admin"],
      type: "library.folder_deleted_with_content",
      title: t(this.locale, "notification.folder_deleted_title"),
      description: t(this.locale, "notification.folder_deleted_description", {
        songs: result.deletedSongs,
        folders: result.deletedFolders,
      }),
    });

    return result;
  }

  private async deleteRecursive(id: string, tx: OrgScopedTx) {
    const folder = await tx.folder.findUnique({ where: { id } });
    if (!folder)
      throw AppError.notFound(
        "FOLDER_NOT_FOUND",
        t(this.locale, "folder.not_found"),
      );

    const songs = await tx.song.findMany({ where: { folderId: id } });
    const folders = await tx.folder.findMany({ where: { parentId: id } });

    let deletedSongs = songs.length;
    let deletedFolders = folders.length;

    const purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await tx.song.updateMany({
      where: { folderId: id },
      data: { deleted: true, purgeAt },
    });

    for (const folder of folders) {
      const result = await this.deleteRecursive(folder.id, tx);
      deletedSongs += result.deletedSongs;
      deletedFolders += result.deletedFolders;
    }

    await tx.folder.update({ where: { id }, data: { deleted: true, purgeAt } });

    return {
      parentId: folder.parentId,
      deletedSongs,
      deletedFolders,
    };
  }

  async restore(id: string) {
    const folder = await this.folderRepo.findById(id);
    if (!folder || !folder.deleted)
      throw AppError.notFound(
        "FOLDER_NOT_FOUND",
        t(this.locale, "folder.not_found"),
      );
    await this.folderRepo.update(id, { deleted: false, purgeAt: null });
    this.invalidateCache();
    return this.folderRepo.findById(id);
  }

  async listTrashed() {
    return this.db.folder.findMany({ where: { deleted: true } });
  }
}
