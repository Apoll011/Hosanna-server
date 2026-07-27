import { NextFunction, Request, Response } from 'express';
import { prisma } from '../database/prisma';
import { forTenant } from '../database/prisma';
import { AppError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { hashToken, verifyAccessToken } from '../utils/tokens';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export function authenticateAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) return next(AppError.unauthorized('Missing bearer token.'));

  try {
    const payload = verifyAccessToken(token);
    req.actor = { type: 'admin', admin: payload };
    req.tenantId = payload.tenantId;
    req.db = forTenant(payload.tenantId);
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token.'));
  }
}

export const authenticateMusician = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw AppError.unauthorized('Missing bearer token.');

  // Deliberately unscoped: tokenHash is globally unique and this lookup is
  // what establishes which tenant the request belongs to.
  const record = await prisma.musicianToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { allowedServices: { select: { serviceId: true } } },
  });

  if (!record) throw new AppError(401, 'INVALID_MUSICIAN_TOKEN', 'Invalid musician access token.');
  if (record.revokedAt) throw new AppError(401, 'MUSICIAN_TOKEN_REVOKED', 'This access token has been revoked.');
  if (record.expiresAt.getTime() < Date.now()) {
    throw new AppError(401, 'MUSICIAN_TOKEN_EXPIRED', 'This access token has expired.');
  }

  prisma.musicianToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  req.actor = {
    type: 'musician',
    musicianToken: {
      id: record.id,
      name: record.name,
      allowedServiceIds:
        record.allowedServices.length > 0 ? record.allowedServices.map((s: any) => s.serviceId) : null,
    },
  };
  req.tenantId = record.tenantId;
  req.db = forTenant(record.tenantId);
  next();
});

export const authenticateAny = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next(AppError.unauthorized('Missing bearer token.'));

  try {
    const payload = verifyAccessToken(token);
    req.actor = { type: 'admin', admin: payload };
    req.tenantId = payload.tenantId;
    req.db = forTenant(payload.tenantId);
    return next();
  } catch {
    // Not a valid admin JWT — fall through and try musician token.
  }

  return authenticateMusician(req, res, next);
});

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.actor?.type !== 'admin') {
    return next(AppError.forbidden('This action requires administrator privileges.'));
  }
  next();
}

export function requireServiceAccess(getServiceId: (req: Request) => string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.actor?.type === 'admin') return next();
    if (req.actor?.type === 'musician') {
      const allowed = req.actor.musicianToken.allowedServiceIds;
      if (allowed === null || allowed.includes(getServiceId(req))) return next();
      return next(AppError.forbidden('This access token is not scoped to this service.'));
    }
    return next(AppError.unauthorized());
  };
}