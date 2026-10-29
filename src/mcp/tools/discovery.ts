import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { can } from "../../middleware/auth.js";
import type { PermissionString } from "../../permissions/index.js";
import { getChordProCapabilities } from "../lib/capabilities.js";
import { errorResult, getMcpContext, jsonResult } from "../context.js";

const SONG_PERMS: PermissionString[] = [
  "song.access",
  "song.create",
  "song.update",
  "song.delete",
  "song.import",
];
const SERVICE_PERMS: PermissionString[] = [
  "service.access",
  "service.create",
  "service.update",
  "service.delete",
];

export function registerDiscoveryTools(
  server: McpServer,
  authInfo?: AuthInfo,
): void {
  server.registerTool(
    "hosanna.capabilities",
    {
      title: "Hosanna capabilities",
      description:
        "Summarize Hosanna MCP tools, resources, prompts, and ChordPro feature support levels.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const chordpro = getChordProCapabilities();
        return jsonResult({
          server: { name: "hosanna", version: "1.0.0" },
          tools: {
            discovery: ["hosanna.capabilities", "hosanna.permissions"],
            chordpro: [
              "chordpro.validate",
              "chordpro.parse_summary",
              "chordpro.format",
              "chordpro.transpose",
              "chordpro.convert",
              "chordpro.directives",
            ],
            songs: [
              "songs.search",
              "songs.get",
              "songs.create_draft",
              "songs.propose_edit",
              "songs.propose_fix",
              "songs.save",
              "songs.move",
              "songs.delete",
            ],
            services: [
              "services.search",
              "services.get",
              "services.create_draft",
              "services.propose_edit",
              "services.validate",
              "services.save",
              "services.delete",
              "services.plan_suggest",
            ],
            library: [
              "folders.list",
              "folders.create",
              "folders.update",
              "folders.delete",
              "collections.list",
              "collections.get",
              "collections.create",
              "collections.update",
              "collections.delete",
              "collections.add_songs",
              "collections.remove_songs",
              "agenda.list",
              "agenda.get",
              "agenda.create",
              "agenda.update",
              "agenda.delete",
              "metadata.musicbrainz_search",
            ],
          },
          resources: [
            "hosanna://chordpro/guide",
            "hosanna://chordpro/directives",
            "hosanna://chordpro/features",
            "hosanna://chordpro/examples/valid",
            "hosanna://chordpro/examples/variants",
            "hosanna://chordpro/examples/grids",
            "hosanna://schemas/song",
            "hosanna://schemas/service",
            "hosanna://schemas/service-element-types",
            "hosanna://ops/catalog",
            "hosanna://domain/songs",
            "hosanna://domain/services",
            "hosanna://skills/{name}",
          ],
          prompts: {
            system: ["hosanna.system"],
            songs: [
              "songs.create",
              "songs.edit",
              "songs.fix",
              "songs.complete",
              "songs.review",
              "songs.transpose",
              "songs.arrange",
              "songs.explain_chordpro",
            ],
            services: [
              "services.create",
              "services.edit",
              "services.complete",
              "services.fix",
              "services.review",
              "services.plan",
            ],
          },
          skills: [
            "hosanna://skills/hosanna-safe-data",
            "hosanna://skills/chordpro-create",
            "hosanna://skills/songs-edit-fix",
            "hosanna://skills/chordpro-directives-variants",
            "hosanna://skills/songs-transpose-arrange",
            "hosanna://skills/songs-validate-review",
            "hosanna://skills/services-create-edit",
            "hosanna://skills/services-plan-complete",
          ],
          chordproFeatures: chordpro.features,
          notes: [
            "Server instructions tell you to READ skill resources — they are not auto-injected into context.",
            "Start with prompt hosanna.system (or read hosanna://skills/hosanna-safe-data + job skills).",
            "Org-scoped song/service tools require Better Auth bearer session with activeOrganizationId.",
            "Use draft/propose tools first; persist only with *.save after user approval.",
            "Never fabricate lyrics. Instrument diagrams are client-render-only.",
          ],
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "hosanna.permissions",
    {
      title: "Current permissions",
      description:
        "Return the authenticated user/org role and allowed song/service actions.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const ctx = getMcpContext(authInfo);
        if (!ctx) {
          return jsonResult({
            authenticated: false,
            message:
              "Not authenticated. ChordPro tools still work; song/service tools require a session.",
          });
        }
        const allowed = [...SONG_PERMS, ...SERVICE_PERMS].filter((p) =>
          can(ctx.user, p),
        );
        return jsonResult({
          authenticated: true,
          userId: ctx.user.id,
          orgId: ctx.orgId,
          role: ctx.user.role,
          teamId: ctx.user.teamId ?? null,
          entitled: ctx.entitled,
          locale: ctx.locale,
          permissions: allowed,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
