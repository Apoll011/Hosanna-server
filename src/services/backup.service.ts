import type { OrgScopedPrisma } from "../database/prisma.js";
import { AppError } from "../utils/errors.js";

const BACKUP_VERSION = "2.0";

export class BackupService {
  constructor(
    private readonly db: OrgScopedPrisma,
    private readonly tenantId: string,
  ) {}

  async export() {
    const [folders, songs, services, settings] = await Promise.all([
      this.db.folder.findMany(),
      this.db.song.findMany(),
      this.db.service.findMany(),
      this.db.settings.findUnique({ where: { orgId: this.tenantId } }),
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

      for (const f of folders) {
        await tx.folder.create({
          data: {
            id: f.id,
            name: f.name,
            parentId: f.parentId ?? null,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          } as any,
        });
      }
      for (const s of songs) {
        await tx.song.create({
          data: {
            id: s.id,
            title: s.title,
            artist: s.artist,
            content: s.content,
            folderId: s.folderId ?? null,
            path: s.path,
            tags: s.tags ?? [],
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          } as any,
        });
      }
      for (const svc of services) {
        await tx.service.create({
          data: {
            id: svc.id,
            name: svc.name,
            date: svc.date,
            notes: svc.notes ?? "",
            elements: svc.elements ?? [],
            createdAt: svc.createdAt,
            updatedAt: svc.updatedAt,
          } as any,
        });
      }
      if (settings) {
        await tx.settings.upsert({
          where: { orgId: this.tenantId },
          update: settings,
          create: { ...settings, tenantId: this.tenantId },
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
