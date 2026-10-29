import type { AuthInfo } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  errorResult,
  jsonResult,
  requireMcpContext,
} from "../context.js";
import {
  getMe,
  getMember,
  getOrganization,
  listMembers,
} from "../lib/orgDirectory.js";

export function registerOrgTools(
  server: McpServer,
  authInfo?: AuthInfo,
): void {
  server.registerTool(
    "me",
    {
      title: "Who am I",
      description:
        "Return the authenticated user (id, name, email), org membership (memberId, role), and active organization. Use before assigning agenda responsibilities to \"me\".",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult(await getMe(requireMcpContext(authInfo)));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "members_list",
    {
      title: "List organization members",
      description:
        "List members of the active organization (memberId, userId, name, email, role). Use to resolve people for agenda responsibilities (leader, musicians, preacher, …).",
      inputSchema: z.object({
        search: z
          .string()
          .optional()
          .describe("Filter by name or email (case-insensitive)"),
        role: z
          .string()
          .optional()
          .describe("Filter by org role (owner, admin, musician, …)"),
        limit: z.number().int().positive().max(200).optional().default(100),
      }),
    },
    async (args) => {
      try {
        return jsonResult(await listMembers(requireMcpContext(authInfo), args));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "members_get",
    {
      title: "Get organization member",
      description:
        "Look up one member by memberId, userId, or name (partial). Prefer memberId for agenda assignee.memberId.",
      inputSchema: z.object({
        memberId: z.string().optional(),
        userId: z.string().optional(),
        name: z.string().optional().describe("Partial name match"),
      }),
    },
    async (args) => {
      try {
        return jsonResult(await getMember(requireMcpContext(authInfo), args));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "org_get",
    {
      title: "Get active organization",
      description:
        "Return active org profile: name, slug, locale, timezone, and agenda responsibilityCategories (leader, musicians, preacher, …). No org switch — session stays on the current org.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult(await getOrganization(requireMcpContext(authInfo)));
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
