import { Prisma, PrismaClient } from '@prisma/client';
import type { TenantPrisma } from '../database/prisma';

const withServices = { allowedServices: true };

export class MusicianTokenRepository {
  constructor(private readonly db: TenantPrisma) {}

  findAll() {
    return this.db.musicianToken.findMany({ orderBy: { createdAt: 'desc' }, include: withServices });
  }

  findById(id: string) {
    return this.db.musicianToken.findUnique({ where: { id }, include: withServices });
  }

  create(data: Omit<Prisma.MusicianTokenUncheckedCreateInput, 'tenantId'> | Omit<Prisma.MusicianTokenCreateInput, 'tenant' | 'tenantId'>) {
    return this.db.musicianToken.create({ data: data as any, include: withServices });
  }

  update(id: string, data: Prisma.MusicianTokenUpdateInput) {
    return this.db.musicianToken.update({ where: { id }, data, include: withServices });
  }

  revoke(id: string) {
    return this.db.musicianToken.update({
      where: { id },
      data: { revokedAt: new Date() },
      include: withServices,
    });
  }

  replaceAllowedServices(id: string, serviceIds: string[]) {
    return this.db.$transaction([
      this.db.musicianTokenService.deleteMany({ where: { musicianTokenId: id } }),
      ...serviceIds.map((serviceId) =>
        this.db.musicianTokenService.create({ data: { musicianTokenId: id, serviceId } }),
      ),
    ]);
  }

  delete(id: string) {
    return this.db.musicianToken.delete({ where: { id } });
  }
}

export class MusicianTokenAuthRepository {
  constructor(private readonly rawDb: PrismaClient) {}

  findByTokenHash(tokenHash: string) {
    return this.rawDb.musicianToken.findUnique({
      where: { tokenHash },
      include: { allowedServices: { select: { serviceId: true } } },
    });
  }
}
