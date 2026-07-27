import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';

export const songRepository = {
  findById(id: string) {
    return prisma.song.findUnique({ where: { id } });
  },

  findMany(where: Prisma.SongWhereInput, orderBy: Prisma.SongOrderByWithRelationInput) {
    return prisma.song.findMany({ where, orderBy });
  },

  create(data: Prisma.SongCreateInput) {
    return prisma.song.create({ data });
  },

  createMany(data: Prisma.SongCreateManyInput[]) {
    return prisma.song.createMany({
      data,
    });
  },

  update(id: string, data: Prisma.SongUpdateInput) {
    return prisma.song.update({ where: { id }, data });
  },

  updateMany(ids: string[], data: Prisma.SongUpdateManyMutationInput) {
    return prisma.song.updateMany({ where: { id: { in: ids } }, data });
  },

  delete(id: string) {
    return prisma.song.delete({ where: { id } });
  },

  countByFolder(folderId: string | null) {
    return prisma.song.count({ where: { folderId } });
  },

  findManyByFolder(folderId: string) {
    return prisma.song.findMany({ where: { folderId } });
  },

  deleteManyByFolder(folderId: string) {
    return prisma.song.deleteMany({ where: { folderId } });
  },

  moveManyToRoot(folderId: string) {
    return prisma.song.updateMany({ where: { folderId }, data: { folderId: null } });
  },
};
