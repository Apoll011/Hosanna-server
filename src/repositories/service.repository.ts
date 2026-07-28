import { Prisma } from '@prisma/client';
import type { TenantPrisma } from '../database/prisma';



export class ServiceRepository {
  constructor(private readonly db: TenantPrisma) {}

  findAll() {
    return this.db.service.findMany({ orderBy: { date: 'asc' } });
  }

  findById(id: string) {
    return this.db.service.findUnique({ where: { id } });
  }

  countByIds(ids: string[]) {
    return this.db.service.count({ where: { id: { in: ids } } });
  }

  create(data: Omit<Prisma.ServiceUncheckedCreateInput, 'tenantId'> | Omit<Prisma.ServiceCreateInput, 'tenant' | 'tenantId'>) {
    return this.db.service.create({ data: data as any });
  }

  update(id: string, data: Prisma.ServiceUpdateInput) {
    return this.db.service.update({ where: { id }, data });
  }

  /** Touches `updatedAt` without changing other fields (used after child-row mutations). */
  touch(id: string) {
    return this.db.service.update({ where: { id }, data: {} });
  }

  delete(id: string) {
    return this.db.service.delete({ where: { id } });
  }


}

export type ServiceWithSongs = Prisma.PromiseReturnType<InstanceType<typeof ServiceRepository>['findById']>;
