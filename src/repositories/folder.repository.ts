import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';

export const folderRepository = {
  findAll() {
    return prisma.folder.findMany({ orderBy: { name: 'asc' } });
  },

  findById(id: string) {
    return prisma.folder.findUnique({ where: { id } });
  },

  create(data: Prisma.FolderCreateInput) {
    return prisma.folder.create({ data });
  },

  update(id: string, data: Prisma.FolderUpdateInput) {
    return prisma.folder.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.folder.delete({ where: { id } });
  },
};
