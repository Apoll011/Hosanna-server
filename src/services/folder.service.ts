import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma } from "@prisma/client";
import {
  DynamicClientExtensionThis,
  InternalArgs,
} from "@prisma/client/runtime/client";
import { v4 as uuid } from "uuid";
import type { OrgScopedPrisma } from "../database/prisma.js";
import { FolderRepository } from "../repositories/folder.repository.js";
import { SongRepository } from "../repositories/song.repository.js";
import { AppError } from "../utils/errors.js";
import { notifyOrg } from "../utils/notify.js";
import { syncCache } from "./syncCache.service.js";

function assertUnchanged(current: { updatedAt: Date }, clientUpdatedAt: Date) {
  if (current.updatedAt.getTime() !== clientUpdatedAt.getTime()) {
    throw AppError.conflict(
      "This folder was modified by someone else since you last loaded it.",
    );
  }
}

export class FolderService {
  private folderRepo: FolderRepository;
  private songRepo: SongRepository;

  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly tenantId: string,
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
    if (!folder)
      throw AppError.notFound("FOLDER_NOT_FOUND", "Folder does not exist.");
    return folder;
  }

  async create(name: string, parentId?: string | null) {
    this.invalidateCache();
    return this.folderRepo.create({
      id: uuid(),
      name: name.trim(),
      parent: parentId ? { connect: { id: parentId } } : undefined,
    });
  }

  async update(
    id: string,
    updatedAt: Date,
    name?: string,
    parentId?: string | null,
  ) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    const updated = await this.folderRepo.update(id, {
      name: name ?? undefined,
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
    await this.getById(id);
    const songs = await this.songRepo.findManyByFolder(id);
    await Promise.all(
      songs.map((s) =>
        this.songRepo.update(s.id, {
          folder: { disconnect: true },
          path: `${s.title}.pro`,
        }),
      ),
    );
    await this.folderRepo.delete(id);

    this.invalidateCache();
    return { movedSongs: songs.length };
  }

  async deleteWithContent(id: string) {
    this.invalidateCache();
    const result = await this.db.$transaction(async (tx) => {
      return this.deleteRecursive(id, tx);
    });

    void notifyOrg({
      organizationId: this.tenantId,
      roles: ["owner", "admin"],
      type: "library.folder_deleted_with_content",
      title: `Folder deleted with all its content`,
      description: `${result.deletedSongs} song(s) and ${result.deletedFolders} sub-folder(s) were permanently removed.`,
    });

    return result;
  }

  private async deleteRecursive(
    id: string,
    tx: Omit<
      DynamicClientExtensionThis<
        Prisma.TypeMap<
          InternalArgs & {
            result: {};
            model: {};
            query: {};
            client: {};
          },
          {}
        >,
        Prisma.TypeMapCb<{
          adapter: PrismaPg;
        }>,
        {
          result: {};
          model: {};
          query: {};
          client: {};
        }
      >,
      "$connect" | "$disconnect" | "$extends" | "$on" | "$use"
    >,
  ) {
    const folder = await tx.folder.findUnique({ where: { id } });
    if (!folder)
      throw AppError.notFound("FOLDER_NOT_FOUND", "Folder does not exist.");

    const songs = await tx.song.findMany({ where: { folderId: id } });
    const folders = await tx.folder.findMany({ where: { parentId: id } });

    let deletedSongs = songs.length;
    let deletedFolders = folders.length;

    await tx.song.deleteMany({ where: { folderId: id } });

    for (const folder of folders) {
      const result = await this.deleteRecursive(folder.id, tx);
      deletedSongs += result.deletedSongs;
      deletedFolders += result.deletedFolders;
    }

    await tx.folder.delete({ where: { id } });

    return {
      deletedSongs,
      deletedFolders,
    };
  }
}
