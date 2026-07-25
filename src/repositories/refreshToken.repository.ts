import { prisma } from '../database/prisma';

export const refreshTokenRepository = {
  create(adminId: string, tokenHash: string, expiresAt: Date) {
    return prisma.refreshToken.create({ data: { adminId, tokenHash, expiresAt } });
  },

  findByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  revoke(id: string) {
    return prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  revokeAllForAdmin(adminId: string) {
    return prisma.refreshToken.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
