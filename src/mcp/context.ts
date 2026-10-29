import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Request } from "express";
import { forOrganization } from "../database/prisma.js";
import type { OrgScopedPrisma } from "../database/prisma.js";
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
      "Authentication required. Sign in with Better Auth and pass Authorization: Bearer <token> with an active organization.",
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
    const meta =
      typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    const locale =
      (meta as any)?.settings?.general?.locale ?? (meta as any)?.locale;
    if (typeof locale === "string" && locale.length > 0) return locale;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Resolve a Hosanna MCP context from Authorization / cookie headers.
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
  if (!sessionData?.session || !sessionData?.user) return null;

  const workspaceId = (sessionData.session as any).activeOrganizationId as
    | string
    | undefined;
  if (!workspaceId) return null;

  const userId = sessionData.user.id;
  const teamId = (sessionData.session as any).activeTeamId || undefined;

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

  const role = (member?.role ?? "guest") as AppRole;
  const locale = parseLocaleFromMeta(org?.metadata) ?? DEFAULT_LOCALE;
  const authHeader = headerBag.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "cookie-session";

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
    clientId: userId,
    scopes: [],
    extra: { hosanna: ctx },
  };

  return { authInfo, ctx };
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
        text:
          typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
    structuredContent:
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : undefined,
    isError,
  };
}

export function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return jsonResult({ error: message }, true);
}
