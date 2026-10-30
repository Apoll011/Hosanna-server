/**
 * Shared access to MCP docs/skills for both resources and Studio AI tools.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SKILL_NAMES = [
  "chordpro-create",
  "songs-edit-fix",
  "chordpro-directives-variants",
  "songs-transpose-arrange",
  "songs-validate-review",
  "services-create-edit",
  "services-plan-complete",
  "hosanna-safe-data",
] as const;

export type SkillName = (typeof SKILL_NAMES)[number];

/** Prefer build-copied docs (dist/mcp/docs), then repo docs/mcp (dev / Vercel). */
export function resolveDocsRoot(): string {
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

export function getDocsRoot(): string {
  return resolveDocsRoot();
}

export function getSkillsRoot(): string {
  return join(getDocsRoot(), "skills");
}

export function readDoc(relativePath: string): string {
  return readFileSync(join(getDocsRoot(), relativePath), "utf8");
}

export function readSkill(name: string): {
  name: string;
  uri: string;
  path: string;
  text: string;
} {
  const safe = name.trim().replace(/^hosanna:\/\/skills\//, "");
  if (!SKILL_NAMES.includes(safe as SkillName)) {
    throw new Error(
      `Unknown skill "${safe}". Valid: ${SKILL_NAMES.join(", ")}`,
    );
  }
  const path = join(getSkillsRoot(), safe, "SKILL.md");
  if (!existsSync(path)) {
    throw new Error(`Skill file missing on disk: ${path}`);
  }
  return {
    name: safe,
    uri: `hosanna://skills/${safe}`,
    path,
    text: readFileSync(path, "utf8"),
  };
}

export function listSkills(): Array<{
  name: string;
  uri: string;
  exists: boolean;
  bytes?: number;
  preview?: string;
}> {
  return SKILL_NAMES.map((name) => {
    const path = join(getSkillsRoot(), name, "SKILL.md");
    const exists = existsSync(path);
    if (!exists) return { name, uri: `hosanna://skills/${name}`, exists };
    const text = readFileSync(path, "utf8");
    return {
      name,
      uri: `hosanna://skills/${name}`,
      exists: true,
      bytes: Buffer.byteLength(text, "utf8"),
      preview: text.slice(0, 240),
    };
  });
}

/** Catalog of readable hosanna:// resources (non-skill). */
export const DOC_RESOURCES: Array<{
  uri: string;
  title: string;
  kind: "markdown" | "json" | "chordpro";
  relativePath?: string;
  builtin?: "directives" | "features" | "ops-catalog";
}> = [
  {
    uri: "hosanna://chordpro/guide",
    title: "ChordPro guide",
    kind: "markdown",
    relativePath: "chordpro-guide.md",
  },
  {
    uri: "hosanna://chordpro/directives",
    title: "ChordPro directives",
    kind: "json",
    builtin: "directives",
  },
  {
    uri: "hosanna://chordpro/features",
    title: "ChordPro features",
    kind: "json",
    builtin: "features",
  },
  {
    uri: "hosanna://chordpro/examples/valid",
    title: "Example: valid",
    kind: "chordpro",
    relativePath: "examples/valid.chordpro",
  },
  {
    uri: "hosanna://chordpro/examples/variants",
    title: "Example: variants",
    kind: "chordpro",
    relativePath: "examples/variants.chordpro",
  },
  {
    uri: "hosanna://chordpro/examples/grids",
    title: "Example: grids",
    kind: "chordpro",
    relativePath: "examples/grids.chordpro",
  },
  {
    uri: "hosanna://domain/songs",
    title: "Domain: songs",
    kind: "markdown",
    relativePath: "domain-songs.md",
  },
  {
    uri: "hosanna://domain/services",
    title: "Domain: services",
    kind: "markdown",
    relativePath: "domain-services.md",
  },
  {
    uri: "hosanna://domain/library",
    title: "Domain: library (folder icons/colors)",
    kind: "markdown",
    relativePath: "domain-library.md",
  },
  {
    uri: "hosanna://ops/catalog",
    title: "Ops catalog",
    kind: "json",
    builtin: "ops-catalog",
  },
];

export function listResources(): Array<{
  uri: string;
  title: string;
  kind: string;
}> {
  const docs = DOC_RESOURCES.map((r) => ({
    uri: r.uri,
    title: r.title,
    kind: r.kind,
  }));
  const skills = SKILL_NAMES.map((name) => ({
    uri: `hosanna://skills/${name}`,
    title: `Skill: ${name}`,
    kind: "skill",
  }));
  return [...docs, ...skills];
}

export function readResourceByUri(uri: string): {
  uri: string;
  mimeType: string;
  text: string;
} {
  const trimmed = uri.trim();
  if (trimmed.startsWith("hosanna://skills/")) {
    const skill = readSkill(trimmed);
    return {
      uri: skill.uri,
      mimeType: "text/markdown",
      text: skill.text,
    };
  }

  const entry = DOC_RESOURCES.find((r) => r.uri === trimmed);
  if (!entry) {
    throw new Error(
      `Unknown resource "${trimmed}". Call hosanna_resources_list for URIs.`,
    );
  }

  if (entry.relativePath) {
    const text = readDoc(entry.relativePath);
    const mimeType =
      entry.kind === "chordpro"
        ? "text/vnd.chordpro"
        : entry.kind === "json"
          ? "application/json"
          : "text/markdown";
    return { uri: entry.uri, mimeType, text };
  }

  // Builtin JSON resources are filled by caller with capabilities — keep thin here
  throw new Error(
    `Resource "${trimmed}" needs builtin payload (directives/features/ops). Use hosanna_resource_read which resolves builtins.`,
  );
}

/** Compact access summary — no filesystem paths, no skill body duplication. */
export function docsAccessReport() {
  const skills = listSkills();
  return {
    guideExists: existsSync(join(getDocsRoot(), "chordpro-guide.md")),
    skillCount: skills.length,
    missingSkills: skills.filter((s) => !s.exists).map((s) => s.name),
  };
}
