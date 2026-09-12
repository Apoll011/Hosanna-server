import type { NextFunction, Request, Response } from "express";
import { forOrganization, prisma } from "../database/prisma.js";
import { auth } from "../lib/auth.js";
import { DEFAULT_LOCALE } from "../lib/i18n.js";
import {
  AppRole,
  PermissionString,
  roles,
  toPermissionRequest,
} from "../permissions/index.js";
import { AuthorizedUser } from "../types/express.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";

export interface DeniedResponse {
  status?: number;
  body?: Record<string, unknown> | ((req: Request) => Record<string, unknown>);
}

export interface MiddlewareOptions {
  onUnauthenticated?: DeniedResponse;
  onForbidden?: DeniedResponse;
}

const DEFAULT_UNAUTHENTICATED: DeniedResponse = {
  status: 401,
  body: { error: "Unauthenticated" },
};

const DEFAULT_FORBIDDEN: DeniedResponse = {
  status: 403,
  body: { error: "Missing permission" },
};

function send(res: Response, req: Request, denied: DeniedResponse) {
  const body =
    typeof denied.body === "function" ? denied.body(req) : denied.body;
  res.status(denied.status ?? 403).json(body ?? { error: "Forbidden" });
}

/** Checks a single permission string against a role. Usable outside Express too. */
export function can(
  user: Pick<AuthorizedUser, "role">,
  permission: PermissionString,
): boolean {
  const roleName = user.role?.toLowerCase() as AppRole;
  const role = roles[roleName];
  if (!role) return false;
  return role.authorize(toPermissionRequest(permission)).success;
}

export function cannot(
  user: Pick<AuthorizedUser, "role">,
  permission: PermissionString,
): boolean {
  return !can(user, permission);
}

function requireUser(
  req: Request,
  res: Response,
  options: MiddlewareOptions,
): req is Request & { user: AuthorizedUser } {
  if (!req.user) {
    send(res, req, options.onUnauthenticated ?? DEFAULT_UNAUTHENTICATED);
    return false;
  }
  return true;
}

export function assertUser(
  req: Request,
  res: Response,
  next: NextFunction,
): asserts req is Request & { user: AuthorizedUser } {
  if (!req.user) {
    return send(res, req, DEFAULT_UNAUTHENTICATED);
  }
  next();
}

/** router.post("/songs", requirePermission("song.create"), ...) */
export function requirePermission(
  permission: PermissionString,
  options: MiddlewareOptions = {},
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!requireUser(req, res, options)) return;
    if (!can(req.user, permission)) {
      return send(res, req, options.onForbidden ?? DEFAULT_FORBIDDEN);
    }
    next();
  };
}

export function requireAllPermissions(
  permissions: PermissionString[],
  options: MiddlewareOptions = {},
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!requireUser(req, res, options)) return;
    const ok = permissions.every((permission) => can(req.user!, permission));
    if (!ok) return send(res, req, options.onForbidden ?? DEFAULT_FORBIDDEN);
    next();
  };
}

export function requireAnyPermission(
  permissions: PermissionString[],
  options: MiddlewareOptions = {},
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!requireUser(req, res, options)) return;
    const ok = permissions.some((permission) => can(req.user!, permission));
    if (!ok) return send(res, req, options.onForbidden ?? DEFAULT_FORBIDDEN);
    next();
  };
}

export function requireRole(role: AppRole, options: MiddlewareOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!requireUser(req, res, options)) return;
    if (req.user.role !== role)
      return send(res, req, options.onForbidden ?? DEFAULT_FORBIDDEN);
    next();
  };
}

export function requireAnyRole(
  allowedRoles: AppRole[],
  options: MiddlewareOptions = {},
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!requireUser(req, res, options)) return;
    if (!allowedRoles.includes(req.user.role)) {
      return send(res, req, options.onForbidden ?? DEFAULT_FORBIDDEN);
    }
    next();
  };
}

/**
 * Resource-aware example: a team leader may only manage services that
 * belong to their own team, even though the static role grants
 * "service.update" in general. Combine with requirePermission, e.g.:
 *
 *   router.patch(
 *     "/teams/:teamId/services/:id",
 *     requirePermission("service.update"),
 *     requireOwnTeamResource((req) => req.params.teamId),
 *     ...
 *   )
 *
 * OWNER and ADMIN bypass the team check since they operate workspace-wide.
 */
export function requireOwnTeamResource(
  getResourceTeamId: (req: Request) => string | undefined,
  options: MiddlewareOptions = {},
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!requireUser(req, res, options)) return;
    if (req.user.role === "OWNER" || req.user.role === "ADMIN") return next();

    const resourceTeamId = getResourceTeamId(req);
    if (!resourceTeamId || resourceTeamId !== req.user.teamId) {
      return send(res, req, options.onForbidden ?? DEFAULT_FORBIDDEN);
    }
    next();
  };
}

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

// ── In-memory caches with bounded size & TTL ─────────────────────────────────

const SESSION_CACHE_TTL_MS = 20_000; // 20 s
const ORG_LOCALE_CACHE_TTL_MS = 300_000; // 5 min
const USER_ROLE_CACHE_TTL_MS = 60_000; // 1 min
const MAX_CACHE_ENTRIES = 2_048;

const sessionCache = new Map<
  string,
  { sessionData: SessionResult; expiresAt: number }
>();

const orgLocaleCache = new Map<string, { locale: string; expiresAt: number }>();

const userRoleCache = new Map<string, { role: string; expiresAt: number }>();

export function invalidateAuthCaches() {
  sessionCache.clear();
  orgLocaleCache.clear();
  userRoleCache.clear();
}

/**
 * Resolves a session from cookies on the incoming request (web dashboard flow).
 */
async function getSessionFromCookies(
  req: Request,
): Promise<SessionResult | null> {
  const sessionData = await auth.api.getSession({
    headers: req.headers as any,
  });
  return sessionData ?? null;
}

/**
 * Resolves a session from an `Authorization: Bearer <token>` header
 * (mobile app / API clients using the better-auth bearer plugin).
 */
async function getSessionFromBearerToken(
  req: Request,
): Promise<SessionResult | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);

  const sessionData = await auth.api.getSession({ headers });
  return sessionData ?? null;
}

async function resolveSession(req: Request): Promise<SessionResult | null> {
  const authHeader = req.headers.authorization;
  const isBearer = Boolean(authHeader?.startsWith("Bearer "));
  const cookieHeader = req.headers.cookie;

  // Compute a lightweight cache key
  const cacheKey = isBearer
    ? `b:${authHeader!.slice(7).trim()}`
    : cookieHeader
      ? `c:${cookieHeader}`
      : null;

  const now = Date.now();

  if (cacheKey) {
    const cached = sessionCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.sessionData;
    }
  }

  // Optimize resolution order: Bearer clients shouldn't run cookie resolution first
  let sessionData: SessionResult | null = null;
  if (isBearer) {
    sessionData = await getSessionFromBearerToken(req);
    if (!sessionData?.session && cookieHeader) {
      sessionData = await getSessionFromCookies(req);
    }
  } else if (cookieHeader) {
    sessionData = await getSessionFromCookies(req);
  }

  if (cacheKey && sessionData?.session && sessionData?.user) {
    if (sessionCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = sessionCache.keys().next().value;
      if (oldest) sessionCache.delete(oldest);
    }
    sessionCache.set(cacheKey, {
      sessionData,
      expiresAt: now + SESSION_CACHE_TTL_MS,
    });
  }

  return sessionData;
}

/** Parse locale out of an org's JSON metadata blob. */
function parseLocaleFromMeta(metadata: unknown): string | null {
  try {
    let meta: any =
      typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    const locale = meta?.settings?.general?.locale ?? meta?.locale;
    if (typeof locale === "string" && locale.length > 0) return locale;
  } catch {
    /* ignore */
  }
  return null;
}

async function getCachedOrgLocale(workspaceId: string): Promise<string> {
  const now = Date.now();
  const cached = orgLocaleCache.get(workspaceId);
  if (cached && cached.expiresAt > now) {
    return cached.locale;
  }

  const org = await prisma.organization.findUnique({
    where: { id: workspaceId },
    select: { metadata: true },
  });

  const locale = parseLocaleFromMeta(org?.metadata) ?? DEFAULT_LOCALE;

  if (orgLocaleCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = orgLocaleCache.keys().next().value;
    if (oldest) orgLocaleCache.delete(oldest);
  }
  orgLocaleCache.set(workspaceId, {
    locale,
    expiresAt: now + ORG_LOCALE_CACHE_TTL_MS,
  });

  return locale;
}

async function getCachedUserRole(
  workspaceId: string,
  userId: string,
): Promise<string> {
  const key = `${workspaceId}:${userId}`;
  const now = Date.now();
  const cached = userRoleCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.role;
  }

  const member = await prisma.member.findFirst({
    where: { organizationId: workspaceId, userId },
    select: { role: true },
  });

  const role = member?.role ?? "guest";

  if (userRoleCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = userRoleCache.keys().next().value;
    if (oldest) userRoleCache.delete(oldest);
  }
  userRoleCache.set(key, { role, expiresAt: now + USER_ROLE_CACHE_TTL_MS });

  return role;
}

export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const sessionData = await resolveSession(req);

    if (!sessionData?.session || !sessionData?.user) {
      throw AppError.unauthorized("Invalid or missing authentication session.");
    }

    const { user, session } = sessionData;

    const workspaceId = (session as any).activeOrganizationId;
    if (!workspaceId) {
      throw AppError.forbidden(
        "An active workspace/organization context is required.",
      );
    }

    const teamId = (session as any).activeTeamId || undefined;

    const roleFromSession =
      (session as any).role ||
      (sessionData as any).member?.role ||
      (user as any).role;

    // Concurrently resolve cached role and cached locale
    const [resolvedRole, locale] = await Promise.all([
      roleFromSession
        ? Promise.resolve(roleFromSession as string)
        : getCachedUserRole(workspaceId, user.id),
      getCachedOrgLocale(workspaceId),
    ]);

    req.locale = locale;
    req.orgId = workspaceId;
    req.db = forOrganization(workspaceId);
    req.user = {
      id: user.id,
      workspaceId,
      role: resolvedRole,
      teamId,
    };

    next();
  },
);
