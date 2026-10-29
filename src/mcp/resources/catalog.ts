import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { createSongSchema } from "../../validators/song.validators.js";
import {
  createServiceSchema,
} from "../../validators/service.validators.js";
import {
  serviceElementSchema,
  serviceElementTypeSchema,
} from "../../validators/serviceElement.validators.js";
import {
  explainChordProDirective,
  getChordProCapabilities,
} from "../lib/capabilities.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Prefer build-copied docs (dist/mcp/docs), then repo docs/mcp (dev / Vercel). */
function resolveDocsRoot(): string {
  const candidates = [
    join(__dirname, "../docs"),
    join(__dirname, "../../../docs/mcp"),
    join(process.cwd(), "docs/mcp"),
    join(process.cwd(), "dist/mcp/docs"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "chordpro-guide.md"))) return candidate;
  }
  return candidates[0];
}

const docsRoot = resolveDocsRoot();
const skillsRoot = join(docsRoot, "skills");

function readDoc(relativePath: string): string {
  return readFileSync(join(docsRoot, relativePath), "utf8");
}

function textResource(
  uri: string,
  text: string,
  mimeType = "text/markdown",
) {
  return {
    contents: [{ uri, mimeType, text }],
  };
}

const SKILL_NAMES = [
  "chordpro-create",
  "songs-edit-fix",
  "chordpro-directives-variants",
  "songs-transpose-arrange",
  "songs-validate-review",
  "services-create-edit",
  "services-plan-complete",
  "hosanna-safe-data",
] as const;

export function registerResources(
  server: McpServer,
  _authInfo?: AuthInfo,
): void {
  server.registerResource(
    "chordpro-guide",
    "hosanna://chordpro/guide",
    {
      title: "ChordPro guide",
      description: "Hosanna ChordPro syntax and support levels",
      mimeType: "text/markdown",
    },
    async (uri) => textResource(uri.href, readDoc("chordpro-guide.md")),
  );

  server.registerResource(
    "chordpro-directives",
    "hosanna://chordpro/directives",
    {
      title: "ChordPro directives",
      description: "Capability manifest of directives",
      mimeType: "application/json",
    },
    async (uri) =>
      textResource(
        uri.href,
        JSON.stringify(getChordProCapabilities().directives, null, 2),
        "application/json",
      ),
  );

  server.registerResource(
    "chordpro-features",
    "hosanna://chordpro/features",
    {
      title: "ChordPro features",
      description: "Implemented / partial / missing feature matrix",
      mimeType: "application/json",
    },
    async (uri) =>
      textResource(
        uri.href,
        JSON.stringify(getChordProCapabilities().features, null, 2),
        "application/json",
      ),
  );

  for (const example of ["valid", "variants", "grids"] as const) {
    server.registerResource(
      `chordpro-example-${example}`,
      `hosanna://chordpro/examples/${example}`,
      {
        title: `ChordPro example: ${example}`,
        description: `Example ${example} ChordPro document`,
        mimeType: "text/vnd.chordpro",
      },
      async (uri) =>
        textResource(
          uri.href,
          readDoc(`examples/${example}.chordpro`),
          "text/vnd.chordpro",
        ),
    );
  }

  server.registerResource(
    "schema-song",
    "hosanna://schemas/song",
    {
      title: "Song schema",
      description: "Song create fields (JSON Schema via Zod)",
      mimeType: "application/json",
    },
    async (uri) =>
      textResource(
        uri.href,
        JSON.stringify(zToRoughJson(createSongSchema), null, 2),
        "application/json",
      ),
  );

  server.registerResource(
    "schema-service",
    "hosanna://schemas/service",
    {
      title: "Service schema",
      description: "Service create fields including typed elements",
      mimeType: "application/json",
    },
    async (uri) =>
      textResource(
        uri.href,
        JSON.stringify(
          {
            service: zToRoughJson(createServiceSchema),
            element: zToRoughJson(serviceElementSchema),
          },
          null,
          2,
        ),
        "application/json",
      ),
  );

  server.registerResource(
    "schema-service-element-types",
    "hosanna://schemas/service-element-types",
    {
      title: "Service element types",
      description: "Allowed service element type enum and field notes",
      mimeType: "application/json",
    },
    async (uri) =>
      textResource(
        uri.href,
        JSON.stringify(
          {
            types: serviceElementTypeSchema.options,
            fields: {
              song: ["id", "type", "title", "songId", "duration", "notes"],
              scripture: [
                "id",
                "type",
                "title",
                "passage",
                "content",
                "duration",
                "notes",
              ],
              other: ["id", "type", "title", "content", "duration", "notes"],
            },
          },
          null,
          2,
        ),
        "application/json",
      ),
  );

  server.registerResource(
    "ops-catalog",
    "hosanna://ops/catalog",
    {
      title: "Operations catalog",
      description: "MCP tool I/O summary",
      mimeType: "application/json",
    },
    async (uri) =>
      textResource(
        uri.href,
        JSON.stringify(
          {
            draftBeforeSave: true,
            chordproTools: [
              "chordpro.validate",
              "chordpro.parse_summary",
              "chordpro.format",
              "chordpro.transpose",
              "chordpro.convert",
              "chordpro.directives",
            ],
            songTools: [
              "songs.search",
              "songs.get",
              "songs.create_draft",
              "songs.propose_edit",
              "songs.propose_fix",
              "songs.save",
              "songs.delete",
            ],
            serviceTools: [
              "services.search",
              "services.get",
              "services.create_draft",
              "services.propose_edit",
              "services.validate",
              "services.save",
              "services.plan_suggest",
            ],
          },
          null,
          2,
        ),
        "application/json",
      ),
  );

  server.registerResource(
    "domain-songs",
    "hosanna://domain/songs",
    {
      title: "Song domain rules",
      mimeType: "text/markdown",
    },
    async (uri) => textResource(uri.href, readDoc("domain-songs.md")),
  );

  server.registerResource(
    "domain-services",
    "hosanna://domain/services",
    {
      title: "Service domain rules",
      mimeType: "text/markdown",
    },
    async (uri) => textResource(uri.href, readDoc("domain-services.md")),
  );

  for (const name of SKILL_NAMES) {
    server.registerResource(
      `skill-${name}`,
      `hosanna://skills/${name}`,
      {
        title: `Skill: ${name}`,
        description: `Workflow skill ${name}`,
        mimeType: "text/markdown",
      },
      async (uri) => {
        try {
          const text = readFileSync(
            join(skillsRoot, name, "SKILL.md"),
            "utf8",
          );
          return textResource(uri.href, text);
        } catch {
          return textResource(
            uri.href,
            `# ${name}\n\nSkill document not found yet.`,
          );
        }
      },
    );
  }

  // Keep explain helper referenced so tree-shaking does not drop it in tests
  void explainChordProDirective;
}

/** Minimal Zod → JSON-ish description without adding zod-to-json-schema. */
function zToRoughJson(schema: { description?: string; _def?: unknown }) {
  try {
    // Zod 4 JSON Schema conversion when available
    const anySchema = schema as {
      toJSONSchema?: () => unknown;
    };
    if (typeof anySchema.toJSONSchema === "function") {
      return anySchema.toJSONSchema();
    }
  } catch {
    /* fall through */
  }
  return {
    description:
      "See createSongSchema / createServiceSchema / serviceElementSchema in Hosanna-server validators.",
    note: "Install-time JSON Schema export unavailable; use Zod validators as source of truth.",
  };
}

export { SKILL_NAMES };
