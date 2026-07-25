import { v4 as uuid } from 'uuid';
import { musicianTokenRepository } from '../repositories/musicianToken.repository';
import { AppError } from '../utils/errors';
import { generateMusicianToken, hashToken, tokenPreview } from '../utils/tokens';
import { buildMusicianAccessUrl, generateQrCodeDataUrl } from '../utils/qrcode';
import { env } from '../config/env';

function assertUnchanged(current: { updatedAt: Date }, clientUpdatedAt: Date) {
  if (current.updatedAt.getTime() !== clientUpdatedAt.getTime()) {
    throw AppError.conflict('This token was modified by someone else since you last loaded it.');
  }
}

function status(t: { revokedAt: Date | null; expiresAt: Date }): 'active' | 'revoked' | 'expired' {
  if (t.revokedAt) return 'revoked';
  if (t.expiresAt.getTime() < Date.now()) return 'expired';
  return 'active';
}

function serialize(t: Awaited<ReturnType<typeof musicianTokenRepository.findAll>>[number]) {
  return {
    id: t.id,
    name: t.name,
    tokenPreview: `••••${t.tokenPreview}`,
    status: status(t),
    expiresAt: t.expiresAt,
    revokedAt: t.revokedAt,
    lastUsedAt: t.lastUsedAt,
    allowedServices: t.allowedServices.map((s) => s.serviceId),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function defaultExpiry(): Date {
  return new Date(Date.now() + env.musicianToken.defaultDays * 86_400_000);
}

export const musicianTokenService = {
  async list() {
    return (await musicianTokenRepository.findAll()).map(serialize);
  },

  async getById(id: string) {
    const token = await musicianTokenRepository.findById(id);
    if (!token) throw AppError.notFound('MUSICIAN_TOKEN_NOT_FOUND', 'Musician access token does not exist.');
    return token;
  },

  async getByIdSerialized(id: string) {
    return serialize(await this.getById(id));
  },

  /** Creates a token and returns it together with the ONE-TIME raw value + QR code. */
  async create(name: string, expiresAt: Date | undefined, allowedServices: string[] | undefined) {
    const raw = generateMusicianToken();
    const created = await musicianTokenRepository.create({
      id: uuid(),
      name,
      tokenHash: hashToken(raw),
      tokenPreview: tokenPreview(raw),
      expiresAt: expiresAt ?? defaultExpiry(),
      allowedServices: allowedServices
        ? { create: allowedServices.map((serviceId) => ({ serviceId })) }
        : undefined,
    });

    const accessUrl = buildMusicianAccessUrl(raw);
    const qrCode = await generateQrCodeDataUrl(accessUrl);

    return { ...serialize(created), token: raw, accessUrl, qrCode };
  },

  async update(
    id: string,
    updatedAt: Date,
    patch: { name?: string; expiresAt?: Date; allowedServices?: string[] },
  ) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    await musicianTokenRepository.update(id, {
      name: patch.name ?? undefined,
      expiresAt: patch.expiresAt ?? undefined,
    });

    if (patch.allowedServices) {
      await musicianTokenRepository.replaceAllowedServices(id, patch.allowedServices);
    }

    return serialize(await this.getById(id));
  },

  /** Soft-revoke: the token stops working immediately but the record (and audit trail) is kept. */
  async revoke(id: string, updatedAt: Date) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);
    return serialize(await musicianTokenRepository.revoke(id));
  },

  /** Issues a brand new raw token value for the same record, invalidating the previous one. */
  async regenerate(id: string, updatedAt: Date) {
    const current = await this.getById(id);
    assertUnchanged(current, updatedAt);

    const raw = generateMusicianToken();
    const updated = await musicianTokenRepository.update(id, {
      tokenHash: hashToken(raw),
      tokenPreview: tokenPreview(raw),
      revokedAt: null,
    });

    const accessUrl = buildMusicianAccessUrl(raw);
    const qrCode = await generateQrCodeDataUrl(accessUrl);
    return { ...serialize(await this.getById(id)), token: raw, accessUrl, qrCode };
  },

  async permanentlyDelete(id: string) {
    await this.getById(id);
    await musicianTokenRepository.delete(id);
  },
};
