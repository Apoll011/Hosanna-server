import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Request } from "express";
import { forOrganization } from "../database/prisma.js";
import { hasActiveSubscription } from "../middleware/subscription.js";
import type { AuthorizedUser } from "../types/express.js";
import type { McpContext } from "./context.js";

/** Build MCP AuthInfo from an already-authenticated Express request. */
export async function authInfoFromRequest(
  req: Request,
): Promise<{ authInfo: AuthInfo; ctx: McpContext }> {
  if (!req.user || !req.orgId || !req.db) {
    throw new Error("Unauthenticated");
  }
  const user = req.user as AuthorizedUser;
  const entitled = await hasActiveSubscription(req.orgId);
  const token =
    typeof req.headers.authorization === "string" &&
    req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : "cookie-session";

  const ctx: McpContext = {
    user,
    orgId: req.orgId,
    locale: req.locale,
    db: req.db ?? forOrganization(req.orgId),
    token,
    entitled,
  };

  const authInfo: AuthInfo = {
    token,
    clientId: user.id,
    scopes: [],
    extra: { hosanna: ctx },
  };

  return { authInfo, ctx };
}
