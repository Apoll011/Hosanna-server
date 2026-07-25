import crypto from 'crypto';
import { adminRepository } from '../repositories/admin.repository';
import { refreshTokenRepository } from '../repositories/refreshToken.repository';
import { AppError } from '../utils/errors';
import { verifyPassword } from '../utils/password';
import {
  AdminJwtPayload,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens';
import { env } from '../config/env';

function toPayload(admin: { id: string; email: string; name: string }): AdminJwtPayload {
  return { id: admin.id, email: admin.email, name: admin.name, role: 'admin' };
}

function refreshExpiryDate(): Date {
  // JWT_REFRESH_EXPIRES_IN is a zeit/ms-style string (e.g. "7d"); we only
  // need an approximate DB expiry for cleanup/reporting, the JWT itself is
  // the source of truth for actual expiration.
  const match = /^(\d+)([smhd])$/.exec(env.jwt.refreshExpiresIn);
  const amount = match ? parseInt(match[1], 10) : 7;
  const unit = match ? match[2] : 'd';
  const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 86_400_000;
  return new Date(Date.now() + amount * ms);
}

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const authService = {
  async login(email: string, password: string) {
    const admin = await adminRepository.findByEmail(email);
    if (!admin) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');

    const valid = await verifyPassword(password, admin.passwordHash);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');

    const user = toPayload(admin);
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(admin.id);
    await refreshTokenRepository.create(admin.id, hashRefreshToken(refreshToken), refreshExpiryDate());

    // `token` is kept alongside `accessToken` for backward compatibility
    // with the reference dashboard, which reads either field.
    return { user, token: accessToken, accessToken, refreshToken };
  },

  async refresh(refreshToken: string) {
    let decoded: { id: string };
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token.');
    }

    const stored = await refreshTokenRepository.findByHash(hashRefreshToken(refreshToken));
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token has been revoked or expired.');
    }

    const admin = await adminRepository.findById(decoded.id);
    if (!admin) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Account no longer exists.');

    // Rotate: revoke the used refresh token and issue a new one.
    await refreshTokenRepository.revoke(stored.id);
    const newRefreshToken = signRefreshToken(admin.id);
    await refreshTokenRepository.create(admin.id, hashRefreshToken(newRefreshToken), refreshExpiryDate());

    const accessToken = signAccessToken(toPayload(admin));
    return { accessToken, refreshToken: newRefreshToken };
  },

  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    const stored = await refreshTokenRepository.findByHash(hashRefreshToken(refreshToken));
    if (stored && !stored.revokedAt) {
      await refreshTokenRepository.revoke(stored.id);
    }
  },

  async me(adminId: string) {
    const admin = await adminRepository.findById(adminId);
    if (!admin) throw new AppError(404, 'ADMIN_NOT_FOUND', 'Administrator account not found.');
    return { user: toPayload(admin) };
  },
};
