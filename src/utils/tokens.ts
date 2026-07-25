import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface AdminJwtPayload {
  id: string;
  email: string;
  name: string;
  role: 'admin';
}

export function signAccessToken(payload: AdminJwtPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AdminJwtPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AdminJwtPayload;
}

export function signRefreshToken(adminId: string): string {
  return jwt.sign({ id: adminId, typ: 'refresh' }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  } as SignOptions);
}

export function verifyRefreshToken(token: string): { id: string } {
  return jwt.verify(token, env.jwt.refreshSecret) as { id: string };
}

/**
 * Musician access tokens are opaque, high-entropy bearer strings (NOT JWTs).
 * Only their SHA-256 hash is stored, so the raw value is unrecoverable after
 * creation — the same tradeoff used by GitHub/Stripe style API keys. This is
 * what gets encoded into the QR code shown to the admin.
 */
export function generateMusicianToken(): string {
  const raw = crypto.randomBytes(32).toString('base64url');
  return `mus_${raw}`;
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function tokenPreview(rawToken: string): string {
  return rawToken.slice(-4);
}
