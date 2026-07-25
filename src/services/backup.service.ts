import { prisma } from '../database/prisma';
import { AppError } from '../utils/errors';

const BACKUP_VERSION = '2.0';

export const backupService = {
  async export() {
    const [folders, songs, services, musicianTokens, settings] = await Promise.all([
      prisma.folder.findMany(),
      prisma.song.findMany(),
      prisma.service.findMany({ include: { songs: true } }),
      prisma.musicianToken.findMany({ include: { allowedServices: true } }),
      prisma.settings.findMany(),
    ]);

    return {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      folders,
      songs,
      services,
      musicianTokens,
      settings: settings[0] ?? null,
    };
  },

  /**
   * Fully replaces the database contents with the supplied backup, inside a
   * single transaction (all-or-nothing). Restoring musician tokens keeps
   * their existing (hashed) credentials intact, so previously distributed
   * QR codes keep working after a restore — the raw token value is never
   * part of the backup because it is never stored server-side to begin with.
   */
  async restore(backup: any) {
    if (!backup || typeof backup !== 'object') {
      throw new AppError(400, 'INVALID_BACKUP_FILE', 'Backup file is invalid or corrupted.');
    }
    const { folders = [], songs = [], services = [], musicianTokens = [], settings } = backup;
    if (![folders, songs, services, musicianTokens].every(Array.isArray)) {
      throw new AppError(400, 'INVALID_BACKUP_FILE', 'Backup file is missing expected arrays.');
    }

    await prisma.$transaction(async (tx) => {
      // Delete in FK-safe order.
      await tx.serviceSong.deleteMany();
      await tx.musicianTokenService.deleteMany();
      await tx.musicianToken.deleteMany();
      await tx.service.deleteMany();
      await tx.song.deleteMany();
      await tx.folder.deleteMany();

      for (const f of folders) {
        await tx.folder.create({
          data: { id: f.id, name: f.name, parentId: f.parentId ?? null, createdAt: f.createdAt, updatedAt: f.updatedAt },
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
          },
        });
      }
      for (const svc of services) {
        await tx.service.create({
          data: {
            id: svc.id,
            name: svc.name,
            date: svc.date,
            notes: svc.notes ?? '',
            createdAt: svc.createdAt,
            updatedAt: svc.updatedAt,
          },
        });
        const svcSongs = svc.songs ?? [];
        for (let i = 0; i < svcSongs.length; i++) {
          const ss = svcSongs[i];
          await tx.serviceSong.create({
            data: {
              id: ss.id,
              serviceId: svc.id,
              songId: ss.songId,
              position: ss.position ?? i,
              notes: ss.notes ?? null,
            },
          });
        }
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
          },
        });
        for (const link of t.allowedServices ?? []) {
          await tx.musicianTokenService.create({
            data: { musicianTokenId: t.id, serviceId: link.serviceId },
          });
        }
      }
      if (settings) {
        await tx.settings.upsert({
          where: { id: 'settings' },
          update: settings,
          create: { ...settings, id: 'settings' },
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
  },
};
