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
    "hosanna_capabilities",
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
              "hosanna_capabilities",
              "hosanna_permissions",
              "hosanna_skills_list",
              "hosanna_skill_read",
              "hosanna_resources_list",
              "hosanna_resource_read",
              "me",
              "members_list",
              "members_get",
              "org_get",
            ],
            chordpro: [
              "chordpro_validate",
              "chordpro_parse_summary",
              "chordpro_format",
              "chordpro_transpose",
              "chordpro_convert",
              "chordpro_directives",
              "chordpro_propagate_chords",
            ],
            songs: [
              "songs_search",
              "songs_search_lyrics",
              "songs_get",
              "songs_get_many",
              "songs_create_draft",
              "songs_propose_edit",
              "songs_propose_fix",
              "songs_propose_transpose",
              "songs_propose_propagate_chords",
              "songs_save",
              "songs_move",
              "songs_delete",
              "songs_restore",
            ],
            services: [
              "services_search (archived / includeArchived)",
              "services_get",
              "services_create_draft",
              "services_propose_edit",
              "services_validate",
              "services_save",
              "services_delete",
              "services_restore",
              "services_plan_suggest",
            ],
            library: [
              "folders_list",
              "folders_create",
              "folders_update",
              "folders_delete",
              "folders_restore",
              "collections_list",
              "collections_get",
              "collections_create",
              "collections_update",
              "collections_delete",
              "collections_add_songs",
              "collections_remove_songs",
              "agenda_list",
              "agenda_get",
              "agenda_create",
              "agenda_update",
              "agenda_delete",
              "trash_list",
              "metadata_musicbrainz_search",
              "metadata_youtube_search",
              "metadata_web_search",
              "metadata_web_fetch",
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
            system: ["hosanna_system"],
            songs: [
              "songs_create",
              "songs_edit",
              "songs_fix",
              "songs_complete",
              "songs_review",
              "songs_transpose",
              "songs_arrange",
              "songs_explain_chordpro",
            ],
            services: [
              "services_create",
              "services_edit",
              "services_complete",
              "services_fix",
              "services_review",
              "services_plan",
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
            "Start with prompt hosanna_system (or read hosanna://skills/hosanna-safe-data + job skills).",
            "Org-scoped song/service tools require Better Auth bearer session with activeOrganizationId.",
            "Use draft/propose tools first; persist only with songs_save / services_save after user approval.",
            "Never fabricate lyrics. Instrument diagrams are client-render-only.",
            "Folder/collection icon and color must use studioUi ids (or hosanna://domain/library).",
            "Assign agenda people via responsibilities + members_list/me (not service element notes).",
            "All tool names use snake_case (underscores), never dots.",
          ],
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "hosanna_permissions",
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
    "hosanna_skills_list",
    {
      title: "List skills",
      description:
        "List Hosanna skill documents (hosanna://skills/*) with on-disk existence and a short preview. Read full text with hosanna_skill_read.",
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
    "hosanna_skill_read",
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
    "hosanna_resources_list",
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
    "hosanna_resource_read",
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
                tools: "see hosanna_capabilities",
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
              hint: "Call hosanna_resources_list",
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
