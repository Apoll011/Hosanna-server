import { PrismaClient } from '@prisma/client';

export class RefreshTokenRepository {
  constructor(private readonly rawDb: PrismaClient) {}

  create(adminId: string, tokenHash: string, expiresAt: Date) {
    return this.rawDb.refreshToken.create({ data: { adminId, tokenHash, expiresAt } });
  }

  findByHash(tokenHash: string) {
    return this.rawDb.refreshToken.findUnique({ where: { tokenHash } });
  }

  revoke(id: string) {
    return this.rawDb.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  revokeAllForAdmin(adminId: string) {
    return this.rawDb.refreshToken.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
