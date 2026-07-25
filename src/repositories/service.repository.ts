import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';

const withSongs = {
  songs: {
    orderBy: { position: 'asc' as const },
    include: { song: true },
  },
};

export const serviceRepository = {
  findAll() {
    return prisma.service.findMany({ orderBy: { date: 'asc' }, include: withSongs });
  },

  findById(id: string) {
    return prisma.service.findUnique({ where: { id }, include: withSongs });
  },

  create(data: Prisma.ServiceCreateInput) {
    return prisma.service.create({ data, include: withSongs });
  },

  update(id: string, data: Prisma.ServiceUpdateInput) {
    return prisma.service.update({ where: { id }, data, include: withSongs });
  },

  /** Touches `updatedAt` without changing other fields (used after child-row mutations). */
  touch(id: string) {
    return prisma.service.update({ where: { id }, data: {}, include: withSongs });
  },

  delete(id: string) {
    return prisma.service.delete({ where: { id } });
  },

  replaceSongs(
    serviceId: string,
    songs: { songId: string; position: number; notes?: string | null }[],
  ) {
    return prisma.$transaction([
      prisma.serviceSong.deleteMany({ where: { serviceId } }),
      ...songs.map((s) =>
        prisma.serviceSong.create({
          data: { serviceId, songId: s.songId, position: s.position, notes: s.notes ?? null },
        }),
      ),
      prisma.service.update({ where: { id: serviceId }, data: {}, include: withSongs }),
    ]);
  },

  async nextPosition(serviceId: string): Promise<number> {
    const last = await prisma.serviceSong.findFirst({
      where: { serviceId },
      orderBy: { position: 'desc' },
    });
    return last ? last.position + 1 : 0;
  },

  addSong(serviceId: string, songId: string, position: number, notes?: string | null) {
    return prisma.$transaction([
      prisma.serviceSong.create({ data: { serviceId, songId, position, notes: notes ?? null } }),
      prisma.service.update({ where: { id: serviceId }, data: {}, include: withSongs }),
    ]);
  },

  removeSong(serviceId: string, songId: string) {
    return prisma.$transaction([
      prisma.serviceSong.deleteMany({ where: { serviceId, songId } }),
      prisma.service.update({ where: { id: serviceId }, data: {}, include: withSongs }),
    ]);
  },

  updateSongNotes(serviceId: string, songId: string, notes: string) {
    return prisma.$transaction([
      prisma.serviceSong.updateMany({ where: { serviceId, songId }, data: { notes } }),
      prisma.service.update({ where: { id: serviceId }, data: {}, include: withSongs }),
    ]);
  },

  findServiceSong(serviceId: string, songId: string) {
    return prisma.serviceSong.findUnique({ where: { serviceId_songId: { serviceId, songId } } });
  },
};

export type ServiceWithSongs = Prisma.PromiseReturnType<typeof serviceRepository.findById>;
