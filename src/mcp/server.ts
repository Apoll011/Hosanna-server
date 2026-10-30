import type { AuthInfo } from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import { buildHosannaMcpInstructions } from "./instructions.js";
import { registerServicePrompts } from "./prompts/services.js";
import { registerSongPrompts } from "./prompts/songs.js";
import { registerSystemPrompts } from "./prompts/system.js";
import { registerResources } from "./resources/catalog.js";
import { registerChordProTools } from "./tools/chordpro.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerLibraryTools } from "./tools/library.js";
import { registerOrgTools } from "./tools/org.js";
import { registerServiceTools } from "./tools/services.js";
import { registerSongTools } from "./tools/songs.js";
import { HOSANNA_MCP_VERSION } from "./version.js";

export const MCP_SERVER_INFO = {
  name: "hosanna",
  version: HOSANNA_MCP_VERSION,
} as const;

/**
 * External MCP server (ChatGPT / Claude / …).
 * Studio-only tools (studio_sync, navigate, PDF, search) are NOT registered here —
 * they exist only on the Hosanna Studio embedded assistant.
 */
export function createHosannaMcpServer(authInfo?: AuthInfo): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, {
    instructions: buildHosannaMcpInstructions(),
  });

  registerDiscoveryTools(server, authInfo);
  registerOrgTools(server, authInfo);
  registerChordProTools(server);
  registerSongTools(server, authInfo);
  registerServiceTools(server, authInfo);
  registerLibraryTools(server, authInfo);
  registerResources(server, authInfo);
  registerSystemPrompts(server);
  registerSongPrompts(server);
  registerServicePrompts(server);

  return server;
}
