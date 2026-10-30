import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { forOrganization } from "../database/prisma.js";
import type { OrgScopedPrisma } from "../database/prisma.js";
import { env } from "../config/env.js";
import { auth } from "../lib/auth.js";
import { DEFAULT_LOCALE } from "../lib/i18n.js";
import { can } from "../middleware/auth.js";
import { hasActiveSubscription } from "../middleware/subscription.js";
import type { AppRole, PermissionString } from "../permissions/index.js";
import type { AuthorizedUser } from "../types/express.js";
import { prisma } from "../database/prisma.js";
import { FolderService } from "../services/folder.service.js";
import { ServiceService } from "../services/service.service.js";
import { SongService } from "../services/song.service.js";
import { mapToolError } from "./lib/toolErrors.js";

const apiOrigin = env.mcpResourceUrl.replace(/\/mcp\/?$/, "");
const jwksUrl = new URL(
  "/api/auth/jwks",
  apiOrigin || `http://127.0.0.1:${env.port}`,
);
const remoteJwks = createRemoteJWKSet(jwksUrl);

export interface McpContext {
  user: AuthorizedUser;
  orgId: string;
  locale: string;
  db: OrgScopedPrisma;
  token: string;
  entitled: boolean;
}

export function getMcpContext(authInfo?: AuthInfo | null): McpContext | null {
  const ctx = authInfo?.extra?.hosanna as McpContext | undefined;
  return ctx ?? null;
}

export function requireMcpContext(authInfo?: AuthInfo | null): McpContext {
  const ctx = getMcpContext(authInfo);
  if (!ctx) {
    throw new Error(
      "Authentication required. Use MCP OAuth (discovery on the MCP resource) or pass Authorization: Bearer <session-token> with an active organization.",
    );
  }
  return ctx;
}

export function requirePermission(
  ctx: McpContext,
  permission: PermissionString,
): void {
  if (!can(ctx.user, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
}

export function requireWriteEntitlement(ctx: McpContext): void {
  if (!ctx.entitled) {
    throw new Error(
      "Organization subscription is inactive. Writes require an active or trialing subscription.",
    );
  }
}

export function songs(ctx: McpContext): SongService {
  return new SongService(ctx.db, ctx.orgId, ctx.locale);
}

export function services(ctx: McpContext): ServiceService {
  return new ServiceService(ctx.db, ctx.orgId, ctx.locale);
}

export function folders(ctx: McpContext): FolderService {
  return new FolderService(ctx.db, ctx.orgId, ctx.locale);
}

function parseLocaleFromMeta(metadata: unknown): string | null {
  try {
    const meta = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    const locale =
      (meta as any)?.settings?.general?.locale ?? (meta as any)?.locale;
    if (typeof locale === "string" && locale.length > 0) return locale;
  } catch {
    /* ignore */
  }
  return null;
}

async function buildContextForUser(opts: {
  userId: string;
  workspaceId: string;
  teamId?: string;
  token: string;
  scopes?: string[];
  clientId?: string;
}): Promise<{ authInfo: AuthInfo; ctx: McpContext } | null> {
  const { userId, workspaceId, teamId, token } = opts;
  const [member, org, entitled] = await Promise.all([
    prisma.member.findFirst({
      where: { organizationId: workspaceId, userId },
      select: { role: true },
    }),
    prisma.organization.findUnique({
      where: { id: workspaceId },
      select: { metadata: true },
    }),
    hasActiveSubscription(workspaceId),
  ]);
  if (!member) return null;

  const role = (member.role ?? "guest") as AppRole;
  const locale = parseLocaleFromMeta(org?.metadata) ?? DEFAULT_LOCALE;
  const ctx: McpContext = {
    user: {
      id: userId,
      workspaceId,
      role,
      teamId,
    },
    orgId: workspaceId,
    locale,
    db: forOrganization(workspaceId),
    token,
    entitled,
  };
  const authInfo: AuthInfo = {
    token,
    clientId: opts.clientId ?? userId,
    scopes: opts.scopes ?? [],
    extra: { hosanna: ctx },
  };
  return { authInfo, ctx };
}

async function resolveFromOAuthAccessToken(
  token: string,
): Promise<{ authInfo: AuthInfo; ctx: McpContext } | null> {
  // Opaque DB-backed access tokens (non-JWT)
  const row = await prisma.oauthAccessToken.findUnique({
    where: { token },
    select: {
      userId: true,
      referenceId: true,
      clientId: true,
      scopes: true,
      expiresAt: true,
      revoked: true,
      sessionId: true,
    },
  });
  if (row && !row.revoked && row.expiresAt > new Date() && row.userId) {
    let workspaceId = row.referenceId ?? undefined;
    if (!workspaceId && row.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: row.sessionId },
        select: { activeOrganizationId: true, activeTeamId: true },
      });
      workspaceId = session?.activeOrganizationId ?? undefined;
      if (workspaceId) {
        return buildContextForUser({
          userId: row.userId,
          workspaceId,
          teamId: session?.activeTeamId ?? undefined,
          token,
          scopes: row.scopes,
          clientId: row.clientId,
        });
      }
    }
    if (!workspaceId) {
      const membership = await prisma.member.findFirst({
        where: { userId: row.userId },
        select: { organizationId: true },
        orderBy: { createdAt: "asc" },
      });
      workspaceId = membership?.organizationId;
    }
    if (!workspaceId) return null;
    return buildContextForUser({
      userId: row.userId,
      workspaceId,
      token,
      scopes: row.scopes,
      clientId: row.clientId,
    });
  }

  // JWT access tokens (signed via Better Auth jwt plugin)
  if (token.split(".").length !== 3) return null;
  try {
    const { payload } = await jwtVerify(token, remoteJwks, {
      audience: env.mcpResourceUrl,
    });
    const userId = typeof payload.sub === "string" ? payload.sub : undefined;
    if (!userId) return null;
    const scopeClaim =
      typeof payload.scope === "string"
        ? payload.scope.split(/\s+/).filter(Boolean)
        : [];
    let workspaceId =
      (typeof payload.organizationId === "string" && payload.organizationId) ||
      (typeof payload.reference_id === "string" && payload.reference_id) ||
      (typeof (payload as { referenceId?: string }).referenceId === "string" &&
        (payload as { referenceId?: string }).referenceId) ||
      undefined;
    if (!workspaceId) {
      const membership = await prisma.member.findFirst({
        where: { userId },
        select: { organizationId: true },
        orderBy: { createdAt: "asc" },
      });
      workspaceId = membership?.organizationId ?? undefined;
    }
    if (!workspaceId) return null;
    return buildContextForUser({
      userId,
      workspaceId,
      token,
      scopes: scopeClaim,
      clientId:
        typeof payload.client_id === "string" ? payload.client_id : userId,
    });
  } catch {
    return null;
  }
}

/**
 * Resolve a Hosanna MCP context from Authorization / cookie headers.
 * Supports Better Auth sessions and MCP OAuth access tokens.
 * Returns null when unauthenticated (ChordPro tools may still run).
 */
export async function resolveMcpContextFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined>,
): Promise<{ authInfo: AuthInfo; ctx: McpContext } | null> {
  const headerBag = new Headers();
  if (headers instanceof Headers) {
    headers.forEach((value, key) => headerBag.set(key, value));
  } else {
    for (const [key, value] of Object.entries(headers)) {
      if (value == null) continue;
      headerBag.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  const sessionData = await auth.api.getSession({ headers: headerBag });
  if (sessionData?.session && sessionData?.user) {
    const workspaceId = (sessionData.session as any).activeOrganizationId as
      string | undefined;
    if (workspaceId) {
      const authHeader = headerBag.get("authorization") ?? "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : "cookie-session";
      const built = await buildContextForUser({
        userId: sessionData.user.id,
        workspaceId,
        teamId: (sessionData.session as any).activeTeamId || undefined,
        token,
      });
      if (built) return built;
    }
  }

  const authHeader = headerBag.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const fromOauth = await resolveFromOAuthAccessToken(token);
      if (fromOauth) return fromOauth;
    }
  }

  return null;
}

/** Express middleware: attach `req.auth` for MCP `toNodeHandler`. */
export async function mcpAuthMiddleware(
  req: Request,
  _res: unknown,
  next: (err?: unknown) => void,
): Promise<void> {
  try {
    const resolved = await resolveMcpContextFromHeaders(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (resolved) {
      (req as Request & { auth?: AuthInfo }).auth = resolved.authInfo;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function jsonResult(data: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
    structuredContent:
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : undefined,
    isError,
  };
}

export function errorResult(
  error: unknown,
  opts?: { current?: unknown; field?: string },
) {
  return jsonResult(mapToolError(error, opts), true);
}

/** Run a tool body, attach `_meta.durationMs`, and record in-process metrics. */
export async function timedToolResult(
  toolName: string,
  run: () => Promise<unknown>,
) {
  const started = performance.now();
  try {
    const data = await run();
    const durationMs = Math.round((performance.now() - started) * 100) / 100;
    const { recordToolTiming } = await import("./lib/toolMetrics.js");
    recordToolTiming(toolName, durationMs, true);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return jsonResult({
        ...(data as Record<string, unknown>),
        _meta: { durationMs, tool: toolName },
      });
    }
    return jsonResult({
      result: data,
      _meta: { durationMs, tool: toolName },
    });
  } catch (error) {
    const durationMs = Math.round((performance.now() - started) * 100) / 100;
    const { recordToolTiming } = await import("./lib/toolMetrics.js");
    recordToolTiming(toolName, durationMs, false);
    const payload = mapToolError(error);
    return jsonResult(
      { ...payload, _meta: { durationMs, tool: toolName } },
      true,
    );
  }
}
