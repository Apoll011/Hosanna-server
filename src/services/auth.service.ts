import crypto from 'crypto';
import { prisma } from '../database/prisma';
import { RefreshTokenRepository } from '../repositories/refreshToken.repository';
import { AppError } from '../utils/errors';
import { verifyPassword } from '../utils/password';
import {
  AdminJwtPayload,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens';
import { env } from '../config/env';

function refreshExpiryDate(): Date {
  const match = /^(\d+)([smhd])$/.exec(env.jwt.refreshExpiresIn);
  const amount = match ? parseInt(match[1], 10) : 7;
  const unit = match ? match[2] : 'd';
  const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 86_400_000;
  return new Date(Date.now() + amount * ms);
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class AuthService {
  private refreshTokenRepo = new RefreshTokenRepository(prisma);

  async login(email: string, password: string) {
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      throw AppError.unauthorized('Invalid credentials.');
    }

    const payload: AdminJwtPayload = {
      id: admin.id,
      tenantId: admin.tenantId,
      email: admin.email,
      name: admin.name,
      role: 'admin',
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(admin.id);
    await this.refreshTokenRepo.create(admin.id, hashRefreshToken(refreshToken), refreshExpiryDate());

    return { user: payload, token: accessToken, accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    let decoded: { id: string };
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token.');
    }

    const stored = await this.refreshTokenRepo.findByHash(hashRefreshToken(refreshToken));
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw AppError.unauthorized('Refresh token has been revoked or expired.');
    }

    const admin = await prisma.admin.findUnique({ where: { id: decoded.id } });
    if (!admin) throw AppError.unauthorized('Account no longer exists.');

    await this.refreshTokenRepo.revoke(stored.id);
    const newRefreshToken = signRefreshToken(admin.id);
    await this.refreshTokenRepo.create(admin.id, hashRefreshToken(newRefreshToken), refreshExpiryDate());

    const payload: AdminJwtPayload = {
      id: admin.id,
      tenantId: admin.tenantId,
      email: admin.email,
      name: admin.name,
      role: 'admin',
    };

    const accessToken = signAccessToken(payload);
    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    const stored = await this.refreshTokenRepo.findByHash(hashRefreshToken(refreshToken));
    if (stored && !stored.revokedAt) {
      await this.refreshTokenRepo.revoke(stored.id);
    }
  }

  async me(adminId: string) {
    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) throw AppError.notFound('ADMIN_NOT_FOUND', 'Administrator account not found.');
    return {
      user: {
        id: admin.id,
        tenantId: admin.tenantId,
        email: admin.email,
        name: admin.name,
        role: 'admin' as const,
      },
    };
  }
}
