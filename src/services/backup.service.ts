import type { OrgScopedPrisma } from "../database/prisma.js";
import { AppError } from "../utils/errors.js";

const BACKUP_VERSION = "2.1";

export class BackupService {
  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly orgId: string,
  ) {}

  async export() {
    const [folders, songs, services, settings] = await Promise.all([
      this.db.folder.findMany(),
      this.db.song.findMany(),
      this.db.service.findMany(),
      this.db.settings.findUnique({ where: { orgId: this.orgId } }),
    ]);

    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      folders,
      songs,
      services,
      settings: settings ?? null,
    };
  }

  /**
   * Fully replaces the tenant database contents with the supplied backup, inside a
   * single transaction (all-or-nothing).
   */
  async restore(backup: any) {
    if (!backup || typeof backup !== "object") {
      throw new AppError(
        400,
        "INVALID_BACKUP_FILE",
        "Backup file is invalid or corrupted.",
      );
    }
    const { folders = [], songs = [], services = [], settings } = backup;
    if (![folders, songs, services].every(Array.isArray)) {
      throw new AppError(
        400,
        "INVALID_BACKUP_FILE",
        "Backup file is missing expected arrays.",
      );
    }

    await this.db.$transaction(async (tx) => {
      await tx.service.deleteMany();
      await tx.song.deleteMany();
      await tx.folder.deleteMany();

      if (folders.length > 0) {
        await tx.folder.createMany({
          data: folders.map((f: any) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId ?? null,
            createdAt: f.createdAt ? new Date(f.createdAt) : undefined,
            updatedAt: f.updatedAt ? new Date(f.updatedAt) : undefined,
          })),
        });
      }

      if (songs.length > 0) {
        await tx.song.createMany({
          data: songs.map((s: any) => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            content: s.content,
            folderId: s.folderId ?? null,
            path: s.path,
            tags: s.tags ?? [],
            song_number: s.song_number ?? s.songNumber ?? null,
            createdAt: s.createdAt ? new Date(s.createdAt) : undefined,
            updatedAt: s.updatedAt ? new Date(s.updatedAt) : undefined,
          })),
        });
      }

      if (services.length > 0) {
        await tx.service.createMany({
          data: services.map((svc: any) => ({
            id: svc.id,
            name: svc.name,
            date: svc.date ? new Date(svc.date) : undefined,
            notes: svc.notes ?? "",
            elements: svc.elements ?? [],
            createdAt: svc.createdAt ? new Date(svc.createdAt) : undefined,
            updatedAt: svc.updatedAt ? new Date(svc.updatedAt) : undefined,
          })),
        });
      }

      if (settings) {
        const { tenantId, orgId, ...settingsData } = settings;
        await tx.settings.upsert({
          where: { orgId: this.orgId },
          update: settingsData,
          create: settingsData,
        });
      }
    });

    return {
      counts: {
        folders: folders.length,
        songs: songs.length,
        services: services.length,
      },
    };
  }
}
