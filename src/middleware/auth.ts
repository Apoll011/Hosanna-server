import type { NextFunction, Request, Response } from "express";
import { forOrganization, prisma } from "../database/prisma.js";
import { auth } from "../lib/auth.js";
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

export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const sessionData = await auth.api.getSession({
      headers: req.headers,
    });

    if (!sessionData || !sessionData.session || !sessionData.user) {
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

    let userRole =
      (session as any).role ||
      (sessionData as any).member?.role ||
      (user as any).role;

    if (!userRole) {
      const member = await prisma.member.findFirst({
        where: {
          organizationId: workspaceId,
          userId: user.id,
        },
        select: { role: true },
      });
      userRole = member?.role;
    }

    req.orgId = workspaceId;
    req.db = forOrganization(workspaceId);
    req.user = {
      id: user.id,
      workspaceId: workspaceId,
      role: userRole || "guest",
      teamId: teamId,
    };

    next();
  },
);
