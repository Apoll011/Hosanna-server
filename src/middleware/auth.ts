import { NextFunction, Request, Response } from 'express';
import { prisma } from '../database/prisma';
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

/** Requires a valid administrator JWT. Rejects musician tokens outright. */
export function authenticateAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) return next(AppError.unauthorized('Missing bearer token.'));

  try {
    const payload = verifyAccessToken(token);
    req.actor = { type: 'admin', admin: payload };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired token.'));
  }
}

/**
 * Requires a valid, non-expired, non-revoked musician access token.
 * Looks the hashed token up in the database on every request (cheap
 * indexed equality lookup) so revocation takes effect immediately.
 */
export const authenticateMusician = asyncHandler(async (req, _res, next) => {
  const token = extractBearerToken(req);
  if (!token) throw AppError.unauthorized('Missing bearer token.');

  const record = await prisma.musicianToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { allowedServices: { select: { serviceId: true } } },
  });

  if (!record) throw new AppError(401, 'INVALID_MUSICIAN_TOKEN', 'Invalid musician access token.');
  if (record.revokedAt) throw new AppError(401, 'MUSICIAN_TOKEN_REVOKED', 'This access token has been revoked.');
  if (record.expiresAt.getTime() < Date.now()) {
    throw new AppError(401, 'MUSICIAN_TOKEN_EXPIRED', 'This access token has expired.');
  }

  // Fire-and-forget last-used tracking; does not block the request.
  prisma.musicianToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  req.actor = {
    type: 'musician',
    musicianToken: {
      id: record.id,
      name: record.name,
      allowedServiceIds:
        record.allowedServices.length > 0 ? record.allowedServices.map((s) => s.serviceId) : null,
    },
  };
  next();
});

/**
 * Accepts EITHER a valid admin JWT OR a valid musician token. Used for the
 * read-oriented endpoints both roles share (viewing songs/folders/services).
 * Tries admin first (fast, no DB round-trip); falls back to musician.
 */
export const authenticateAny = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) return next(AppError.unauthorized('Missing bearer token.'));

  try {
    const payload = verifyAccessToken(token);
    req.actor = { type: 'admin', admin: payload };
    return next();
  } catch {
    // Not a valid admin JWT — fall through and try musician token.
  }

  return authenticateMusician(req, res, next);
});

/** Route guard ensuring the resolved actor is an administrator. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.actor?.type !== 'admin') {
    return next(AppError.forbidden('This action requires administrator privileges.'));
  }
  next();
}

/**
 * Ensures a musician actor is allowed to touch the given service (based on
 * the token's allowedServices scoping). Admins always pass. Attach after
 * authenticateAny on service-scoped routes that musicians may write to.
 */
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
