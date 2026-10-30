import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOC_RESOURCES,
  listResources,
  listSkills,
  SKILL_NAMES,
} from "../../src/mcp/lib/docsAccess.js";
import {
  ALL_MCP_TOOL_NAMES,
  MCP_TOOL_GROUPS,
} from "../../src/mcp/lib/toolCatalog.js";
import { HOSANNA_MCP_VERSION } from "../../src/mcp/version.js";
import { createHosannaMcpServer, MCP_SERVER_INFO } from "../../src/mcp/server.js";

describe("MCP contract", () => {
  it("server version matches package catalog", () => {
    assert.equal(MCP_SERVER_INFO.version, HOSANNA_MCP_VERSION);
    assert.match(HOSANNA_MCP_VERSION, /^\d+\.\d+\.\d+$/);
  });

  it("advertised schema resources are listable and distinct", () => {
    const uris = listResources().map((r) => r.uri);
    for (const schema of [
      "hosanna://schemas/song",
      "hosanna://schemas/service",
      "hosanna://schemas/service-element-types",
    ]) {
      assert.ok(uris.includes(schema), `missing ${schema}`);
    }
    assert.equal(new Set(uris).size, uris.length);
  });

  it("DOC_RESOURCES entries appear in listResources", () => {
    const uris = new Set(listResources().map((r) => r.uri));
    for (const doc of DOC_RESOURCES) {
      assert.ok(uris.has(doc.uri), `DOC_RESOURCES uri missing from list: ${doc.uri}`);
    }
  });

  it("every skill name is listed and exists on disk", () => {
    const skills = listSkills();
    assert.equal(skills.length, SKILL_NAMES.length);
    for (const s of skills) {
      assert.equal(s.exists, true, `skill missing on disk: ${s.name}`);
      assert.ok(s.uri.startsWith("hosanna://skills/"));
    }
  });

  it("tool catalog has unique names and required batch/studio tools", () => {
    assert.equal(
      new Set(ALL_MCP_TOOL_NAMES).size,
      ALL_MCP_TOOL_NAMES.length,
      "duplicate tool names in catalog",
    );
    for (const required of [
      "studio_sync",
      "songs_validate_many",
      "services_get_many",
      "library_overview",
      "clientRequestId_placeholder_skip",
    ]) {
      if (required.endsWith("_skip")) continue;
      assert.ok(
        ALL_MCP_TOOL_NAMES.includes(required),
        `catalog missing ${required}`,
      );
    }
    assert.ok(MCP_TOOL_GROUPS.studio.includes("studio_sync"));
  });

  it("createHosannaMcpServer registers without throw", () => {
    const server = createHosannaMcpServer();
    assert.ok(server);
  });
});
