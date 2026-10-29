import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { can } from "../../middleware/auth.js";
import type { PermissionString } from "../../permissions/index.js";
import { getChordProCapabilities } from "../lib/capabilities.js";
import {
  DOC_RESOURCES,
  docsAccessReport,
  listResources,
  listSkills,
  readDoc,
  readSkill,
  SKILL_NAMES,
} from "../lib/docsAccess.js";
import { STUDIO_UI_CATALOG } from "../lib/studioUi.js";
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
            discovery: [
              "hosanna.capabilities",
              "hosanna.permissions",
              "hosanna.skills_list",
              "hosanna.skill_read",
              "hosanna.resources_list",
              "hosanna.resource_read",
            ],
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
              "songs.get_many",
              "songs.create_draft",
              "songs.propose_edit",
              "songs.propose_fix",
              "songs.propose_transpose",
              "songs.propose_propagate_chords",
              "songs.save",
              "songs.move",
              "songs.delete",
              "songs.restore",
            ],
            services: [
              "services.search",
              "services.get",
              "services.create_draft",
              "services.propose_edit",
              "services.validate",
              "services.save",
              "services.delete",
              "services.restore",
              "services.plan_suggest",
            ],
            library: [
              "folders.list",
              "folders.create",
              "folders.update",
              "folders.delete",
              "folders.restore",
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
              "trash.list",
              "metadata.musicbrainz_search",
              "metadata.youtube_search",
              "metadata.web_search",
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
            "hosanna://domain/library",
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
          studioUi: STUDIO_UI_CATALOG,
          notes: [
            "Server instructions tell you to READ skill resources — they are not auto-injected into context.",
            "Start with prompt hosanna.system (or read hosanna://skills/hosanna-safe-data + job skills).",
            "Org-scoped song/service tools require Better Auth bearer session with activeOrganizationId.",
            "Use draft/propose tools first; persist only with *.save after user approval.",
            "Never fabricate lyrics. Instrument diagrams are client-render-only.",
            "Folder/collection icon and color must use studioUi ids (or hosanna://domain/library).",
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

  server.registerTool(
    "hosanna.skills_list",
    {
      title: "List skills",
      description:
        "List Hosanna skill documents (hosanna://skills/*) with on-disk existence and a short preview. Read full text with hosanna.skill_read.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult({
          skills: listSkills(),
          access: docsAccessReport(),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "hosanna.skill_read",
    {
      title: "Read skill",
      description:
        "Read the full SKILL.md body for a skill name (e.g. hosanna-safe-data or hosanna://skills/hosanna-safe-data).",
      inputSchema: z.object({
        name: z
          .string()
          .describe(`One of: ${SKILL_NAMES.join(", ")}`),
      }),
    },
    async ({ name }) => {
      try {
        const skill = readSkill(name);
        return jsonResult({
          name: skill.name,
          uri: skill.uri,
          mimeType: "text/markdown",
          bytes: Buffer.byteLength(skill.text, "utf8"),
          text: skill.text,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "hosanna.resources_list",
    {
      title: "List resources",
      description: "List readable hosanna:// resource URIs (docs + skills).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return jsonResult({ resources: listResources() });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "hosanna.resource_read",
    {
      title: "Read resource",
      description:
        "Read a hosanna:// resource by URI (skills, chordpro guide/features, domain docs, examples).",
      inputSchema: z.object({
        uri: z.string().describe("e.g. hosanna://chordpro/guide"),
      }),
    },
    async ({ uri }) => {
      try {
        const trimmed = uri.trim();
        if (trimmed.startsWith("hosanna://skills/")) {
          const skill = readSkill(trimmed);
          return jsonResult({
            uri: skill.uri,
            mimeType: "text/markdown",
            text: skill.text,
          });
        }
        const caps = getChordProCapabilities();
        if (trimmed === "hosanna://chordpro/directives") {
          return jsonResult({
            uri: trimmed,
            mimeType: "application/json",
            text: JSON.stringify(caps.directives, null, 2),
          });
        }
        if (trimmed === "hosanna://chordpro/features") {
          return jsonResult({
            uri: trimmed,
            mimeType: "application/json",
            text: JSON.stringify(caps.features, null, 2),
          });
        }
        if (trimmed === "hosanna://ops/catalog") {
          return jsonResult({
            uri: trimmed,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                tools: "see hosanna.capabilities",
                resources: listResources(),
                skills: SKILL_NAMES,
              },
              null,
              2,
            ),
          });
        }
        const entry = DOC_RESOURCES.find((r) => r.uri === trimmed);
        if (!entry?.relativePath) {
          return jsonResult(
            {
              error: true,
              code: "not_found",
              message: `Unknown resource ${trimmed}`,
              hint: "Call hosanna.resources_list",
            },
            true,
          );
        }
        const text = readDoc(entry.relativePath);
        return jsonResult({
          uri: trimmed,
          mimeType:
            entry.kind === "chordpro"
              ? "text/vnd.chordpro"
              : entry.kind === "json"
                ? "application/json"
                : "text/markdown",
          text,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
