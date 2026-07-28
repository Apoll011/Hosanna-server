import type { TenantPrisma } from '../database/prisma';
import { AppError } from '../utils/errors';

const BACKUP_VERSION = '2.0';

export class BackupService {
  constructor(private readonly db: TenantPrisma, private readonly tenantId: string) {}

  async export() {
    const [folders, songs, services, musicianTokens, settings] = await Promise.all([
      this.db.folder.findMany(),
      this.db.song.findMany(),
      this.db.service.findMany(),
      this.db.musicianToken.findMany({ include: { allowedServices: true } }),
      this.db.settings.findUnique({ where: { tenantId: this.tenantId } }),
    ]);

    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      folders,
      songs,
      services,
      musicianTokens,
      settings: settings ?? null,
    };
  }

  /**
   * Fully replaces the tenant database contents with the supplied backup, inside a
   * single transaction (all-or-nothing).
   */
  async restore(backup: any) {
    if (!backup || typeof backup !== 'object') {
      throw new AppError(400, 'INVALID_BACKUP_FILE', 'Backup file is invalid or corrupted.');
    }
    const { folders = [], songs = [], services = [], musicianTokens = [], settings } = backup;
    if (![folders, songs, services, musicianTokens].every(Array.isArray)) {
      throw new AppError(400, 'INVALID_BACKUP_FILE', 'Backup file is missing expected arrays.');
    }

    await this.db.$transaction(async (tx) => {
      // Delete existing data for this tenant
      // ServiceSong and MusicianTokenService cascade via service/song/musicianToken


      const tokenIds = (await tx.musicianToken.findMany({ select: { id: true } })).map((t) => t.id);
      if (tokenIds.length > 0) {
        await tx.musicianTokenService.deleteMany({ where: { musicianTokenId: { in: tokenIds } } });
      }

      await tx.musicianToken.deleteMany();
      await tx.service.deleteMany();
      await tx.song.deleteMany();
      await tx.folder.deleteMany();

      for (const f of folders) {
        await tx.folder.create({
          data: { id: f.id, name: f.name, parentId: f.parentId ?? null, createdAt: f.createdAt, updatedAt: f.updatedAt } as any,
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
            notes: svc.notes ?? '',
            elements: svc.elements ?? [],
            createdAt: svc.createdAt,
            updatedAt: svc.updatedAt,
          } as any,
        });
      }
      for (const t of musicianTokens) {
        await tx.musicianToken.create({
          data: {
            id: t.id,
            name: t.name,
            tokenHash: t.tokenHash,
            tokenPreview: t.tokenPreview,
            expiresAt: t.expiresAt,
            revokedAt: t.revokedAt ?? null,
            lastUsedAt: t.lastUsedAt ?? null,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          } as any,
        });
        for (const link of t.allowedServices ?? []) {
          await tx.musicianTokenService.create({
            data: { musicianTokenId: t.id, serviceId: link.serviceId },
          });
        }
      }
      if (settings) {
        await tx.settings.upsert({
          where: { tenantId: this.tenantId },
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
        musicianTokens: musicianTokens.length,
      },
    };
  }
}
