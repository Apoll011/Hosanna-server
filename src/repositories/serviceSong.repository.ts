// src/repositories/serviceSong.repository.ts
import type { TenantPrisma } from '../database/prisma';

// NOT tenant-scoped by the Prisma extension (no tenantId column on this
// join table). Tenant isolation for this repository depends entirely on
// the CALLER having already validated serviceId/songId belong to the
// current tenant via ServiceRepository/SongRepository. Never call
// `create` here with IDs sourced directly from request params without
// that validation happening first — see ServiceSongService.
export class ServiceSongRepository {
  constructor(private readonly db: TenantPrisma) {}

  create(data: { serviceId: string; songId: string; position: number; notes?: string | null }) {
    return this.db.serviceSong.create({ data });
  }

  findByService(serviceId: string) {
    return this.db.serviceSong.findMany({ where: { serviceId }, orderBy: { position: 'asc' } });
  }
}
