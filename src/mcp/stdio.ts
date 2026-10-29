/**
 * Local stdio entry for Cursor / Claude Desktop.
 *
 * Usage:
 *   HOSANNA_BEARER_TOKEN=<token> npx tsx src/mcp/stdio.ts
 *
 * The bearer token must be a Better Auth session token for a user with an
 * active organization. ChordPro-only tools work without a token.
 */
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  resolveMcpContextFromHeaders,
  type McpContext,
} from "./context.js";
import { createHosannaMcpServer } from "./server.js";
import type { AuthInfo } from "@modelcontextprotocol/server";

async function resolveStdioAuth(): Promise<AuthInfo | undefined> {
  const token = process.env.HOSANNA_BEARER_TOKEN?.trim();
  if (!token) return undefined;

  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  const resolved = await resolveMcpContextFromHeaders(headers);
  if (!resolved) {
    console.error(
      "HOSANNA_BEARER_TOKEN did not resolve to a session with an active organization.",
    );
    return undefined;
  }
  const ctx: McpContext = resolved.ctx;
  console.error(
    `Hosanna MCP authenticated as user ${ctx.user.id} org ${ctx.orgId} role ${ctx.user.role}`,
  );
  return resolved.authInfo;
}

const authInfo = await resolveStdioAuth();
const handle = serveStdio(() => createHosannaMcpServer(authInfo));

process.on("SIGINT", () => {
  void handle.close().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void handle.close().then(() => process.exit(0));
});
