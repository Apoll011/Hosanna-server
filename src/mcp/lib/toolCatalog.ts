/**
 * Authoritative tool catalogs.
 * Core tools are registered on the MCP server (ChatGPT / Claude / etc.).
 * Studio-only tools exist only in the Hosanna Studio embedded assistant.
 */

/** UI / session tools — never registered on the external MCP server. */
export const STUDIO_ONLY_TOOLS = [
  "studio_sync",
  "studio_navigate",
  "studio_generate_pdf",
  "studio_search",
] as const;

export const MCP_TOOL_GROUPS = {
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
    "members_resolve",
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
    "songs_list_in_folder",
    "songs_search_lyrics",
    "songs_get",
    "songs_get_many",
    "songs_validate_many",
    "songs_create_draft",
    "songs_propose_edit",
    "songs_propose_fix",
    "songs_propose_transpose",
    "songs_draft_propagate_chords",
    "songs_save",
    "songs_move",
    "songs_delete",
    "songs_restore",
  ],
  services: [
    "services_search",
    "services_get",
    "services_get_many",
    "services_create_draft",
    "services_propose_edit",
    "services_validate",
    "services_save",
    "services_publish",
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
    "library_overview",
    "metadata_musicbrainz_search",
    "metadata_youtube_search",
    "metadata_web_search",
    "metadata_web_fetch",
  ],
} as const;

export const ALL_MCP_TOOL_NAMES: string[] = Object.values(
  MCP_TOOL_GROUPS,
).flatMap((g) => [...g]);

export const TOOL_SURFACE = {
  core: "Registered on the Hosanna MCP server — available to external AI clients (ChatGPT, Claude, …).",
  studioOnly:
    "Available only inside Hosanna Studio chat — UI navigation, PDF, search, and live sync. Not exposed via MCP.",
} as const;
