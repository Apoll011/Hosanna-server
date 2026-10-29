import type { AuthInfo } from "@modelcontextprotocol/server";
import { McpServer } from "@modelcontextprotocol/server";
import { registerSongPrompts } from "./prompts/songs.js";
import { registerServicePrompts } from "./prompts/services.js";
import { registerResources } from "./resources/catalog.js";
import { registerChordProTools } from "./tools/chordpro.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerServiceTools } from "./tools/services.js";
import { registerSongTools } from "./tools/songs.js";

export const MCP_SERVER_INFO = {
  name: "hosanna",
  version: "1.0.0",
} as const;

/** Build a fresh MCP server instance for one request / stdio connection. */
export function createHosannaMcpServer(authInfo?: AuthInfo): McpServer {
  const server = new McpServer(MCP_SERVER_INFO);

  registerDiscoveryTools(server, authInfo);
  registerChordProTools(server);
  registerSongTools(server, authInfo);
  registerServiceTools(server, authInfo);
  registerResources(server, authInfo);
  registerSongPrompts(server);
  registerServicePrompts(server);

  return server;
}
