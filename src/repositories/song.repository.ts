import { Prisma } from '@prisma/client';
import type { TenantPrisma } from '../database/prisma';

export class SongRepository {
  constructor(private readonly db: TenantPrisma) {}

  findById(id: string) {
    return this.db.song.findUnique({ where: { id } });
  }

  findMany(where?: Prisma.SongWhereInput, orderBy?: Prisma.SongOrderByWithRelationInput) {
    return this.db.song.findMany({ where, orderBy });
  }

  create(data: Omit<Prisma.SongUncheckedCreateInput, 'tenantId'> | Omit<Prisma.SongCreateInput, 'tenant' | 'tenantId'>) {
    return this.db.song.create({ data: data as any });
  }

  createMany(data: Omit<Prisma.SongCreateManyInput, 'tenantId'>[]) {
    return this.db.song.createMany({
      data: data as any,
    });
  }

  update(id: string, data: Prisma.SongUpdateInput) {
    return this.db.song.update({ where: { id }, data });
  }

  updateMany(ids: string[], data: Prisma.SongUpdateManyMutationInput) {
    return this.db.song.updateMany({ where: { id: { in: ids } }, data });
  }

  delete(id: string) {
    return this.db.song.delete({ where: { id } });
  }

  countByFolder(folderId: string | null) {
    return this.db.song.count({ where: { folderId } });
  }

  findManyByFolder(folderId: string) {
    return this.db.song.findMany({ where: { folderId } });
  }

  deleteManyByFolder(folderId: string) {
    return this.db.song.deleteMany({ where: { folderId } });
  }

  moveManyToRoot(folderId: string) {
    return this.db.song.updateMany({ where: { folderId }, data: { folderId: null } });
  }
}
