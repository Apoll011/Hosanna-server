import { Prisma } from '@prisma/client';
import type { TenantPrisma } from '../database/prisma';

const withSongs = {
  songs: {
    orderBy: { position: 'asc' as const },
    include: { song: true },
  },
};

export class ServiceRepository {
  constructor(private readonly db: TenantPrisma) {}

  findAll() {
    return this.db.service.findMany({ orderBy: { date: 'asc' }, include: withSongs });
  }

  findById(id: string) {
    return this.db.service.findUnique({ where: { id }, include: withSongs });
  }

  countByIds(ids: string[]) {
    return this.db.service.count({ where: { id: { in: ids } } });
  }

  create(data: Omit<Prisma.ServiceUncheckedCreateInput, 'tenantId'> | Omit<Prisma.ServiceCreateInput, 'tenant' | 'tenantId'>) {
    return this.db.service.create({ data: data as any, include: withSongs });
  }

  update(id: string, data: Prisma.ServiceUpdateInput) {
    return this.db.service.update({ where: { id }, data, include: withSongs });
  }

  /** Touches `updatedAt` without changing other fields (used after child-row mutations). */
  touch(id: string) {
    return this.db.service.update({ where: { id }, data: {}, include: withSongs });
  }

  delete(id: string) {
    return this.db.service.delete({ where: { id } });
  }

  replaceSongs(
    serviceId: string,
    songs: { songId: string; position: number; notes?: string | null }[],
  ) {
    return this.db.$transaction([
      this.db.serviceSong.deleteMany({ where: { serviceId } }),
      ...songs.map((s) =>
        this.db.serviceSong.create({
          data: { serviceId, songId: s.songId, position: s.position, notes: s.notes ?? null },
        }),
      ),
      this.db.service.update({ where: { id: serviceId }, data: {}, include: withSongs }),
    ]);
  }

  async nextPosition(serviceId: string): Promise<number> {
    const last = await this.db.serviceSong.findFirst({
      where: { serviceId },
      orderBy: { position: 'desc' },
    });
    return last ? last.position + 1 : 0;
  }

  addSong(serviceId: string, songId: string, position: number, notes?: string | null) {
    return this.db.$transaction([
      this.db.serviceSong.create({ data: { serviceId, songId, position, notes: notes ?? null } }),
      this.db.service.update({ where: { id: serviceId }, data: {}, include: withSongs }),
    ]);
  }

  removeSong(serviceId: string, songId: string) {
    return this.db.$transaction([
      this.db.serviceSong.deleteMany({ where: { serviceId, songId } }),
      this.db.service.update({ where: { id: serviceId }, data: {}, include: withSongs }),
    ]);
  }

  updateSongNotes(serviceId: string, songId: string, notes: string) {
    return this.db.$transaction([
      this.db.serviceSong.updateMany({ where: { serviceId, songId }, data: { notes } }),
      this.db.service.update({ where: { id: serviceId }, data: {}, include: withSongs }),
    ]);
  }

  findServiceSong(serviceId: string, songId: string) {
    return this.db.serviceSong.findUnique({ where: { serviceId_songId: { serviceId, songId } } });
  }
}

export type ServiceWithSongs = Prisma.PromiseReturnType<InstanceType<typeof ServiceRepository>['findById']>;
