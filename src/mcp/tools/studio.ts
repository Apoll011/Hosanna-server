import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { errorResult, jsonResult, requireMcpContext } from "../context.js";
import { syncCache } from "../../services/syncCache.service.js";

/**
 * Studio bridge tools. On Studio chat these emit UI directives; on remote MCP
 * hosts they still invalidate server sync cache and document the expectation.
 */
export function registerStudioTools(
  server: McpServer,
  authInfo?: AuthInfo,
): void {
  server.registerTool(
    "studio_sync",
    {
      title: "Studio sync",
      description:
        "Ask Studio to pull replication after library mutations. On remote MCP hosts this invalidates the org sync cache; open Studio tabs refresh on their next poll. Prefer calling after folders/collections/songs/services writes.",
      inputSchema: z.object({
        reason: z
          .string()
          .optional()
          .describe("Short why, e.g. after_folder_update"),
      }),
    },
    async ({ reason }) => {
      try {
        const ctx = requireMcpContext(authInfo);
        syncCache.invalidate(ctx.orgId);
        return jsonResult({
          studioSync: true,
          reason: reason ?? "refresh",
          note: "Sync cache invalidated. Studio clients pull on next check; remote MCP has no live UI bridge.",
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
