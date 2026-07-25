import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';

const withServices = { allowedServices: true };

export const musicianTokenRepository = {
  findAll() {
    return prisma.musicianToken.findMany({ orderBy: { createdAt: 'desc' }, include: withServices });
  },

  findById(id: string) {
    return prisma.musicianToken.findUnique({ where: { id }, include: withServices });
  },

  create(data: Prisma.MusicianTokenCreateInput) {
    return prisma.musicianToken.create({ data, include: withServices });
  },

  update(id: string, data: Prisma.MusicianTokenUpdateInput) {
    return prisma.musicianToken.update({ where: { id }, data, include: withServices });
  },

  revoke(id: string) {
    return prisma.musicianToken.update({
      where: { id },
      data: { revokedAt: new Date() },
      include: withServices,
    });
  },

  replaceAllowedServices(id: string, serviceIds: string[]) {
    return prisma.$transaction([
      prisma.musicianTokenService.deleteMany({ where: { musicianTokenId: id } }),
      ...serviceIds.map((serviceId) =>
        prisma.musicianTokenService.create({ data: { musicianTokenId: id, serviceId } }),
      ),
    ]);
  },

  delete(id: string) {
    return prisma.musicianToken.delete({ where: { id } });
  },
};
