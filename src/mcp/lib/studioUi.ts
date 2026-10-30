/**
 * Studio UI constants the AI must know (folder icons/colors, etc.).
 * Keep in sync with Hosana-dashboard/src/utils/folderCustomization.ts.
 */

export const FOLDER_ICON_IDS = [
  "default",
  "music",
  "heart",
  "star",
  "book-open",
  "bookmark",
  "sun",
  "moon",
  "sparkles",
  "flame",
  "cross",
  "church",
  "mic",
  "radio",
  "disc",
  "headphones",
  "guitar",
  "bell",
  "archive",
  "tag",
  "hash",
  "smile",
  "shield",
  "award",
  "crown",
  "compass",
  "map-pin",
  "calendar",
  "layers",
  "folder-open",
] as const;

export type FolderIconId = (typeof FOLDER_ICON_IDS)[number];

export const FOLDER_COLOR_IDS = [
  "default",
  "red",
  "orange",
  "amber",
  "yellow",
  "emerald",
  "green",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "slate",
] as const;

export type FolderColorId = (typeof FOLDER_COLOR_IDS)[number];

/** Compact catalog for hosanna_capabilities / tool describes. */
export const STUDIO_UI_CATALOG = {
  folderIcons: FOLDER_ICON_IDS.map((id) => ({ id })),
  folderColors: FOLDER_COLOR_IDS.map((id) => ({ id })),
  notes: {
    folderIcon:
      "Use id strings from folderIcons (e.g. music, book-open, church). Use default to reset to the plain folder glyph.",
    folderColor:
      "Use id strings from folderColors (e.g. default, blue, rose). Collections use the same color/icon ids.",
    sync: "Studio chat refreshes itself after folder/collection/library mutations (no need to call studio_sync). External MCP clients do not have studio_sync — Studio polls replication on its own.",
  },
} as const;

/** Tool names whose successful output should trigger a Studio replication pull. */
export const STUDIO_SYNC_AFTER_TOOLS = [
  "folders_create",
  "folders_update",
  "folders_create_many",
  "folders_update_many",
  "folders_restore",
  "collections_create",
  "collections_update",
  "collections_update_many",
  "collections_add_songs",
  "collections_remove_songs",
  "songs_save",
  "songs_move",
  "songs_restore",
  "services_save",
  "services_restore",
  "agenda_create",
  "agenda_update",
  "trash_restore",
  "studio_sync",
] as const;

export function shouldStudioSyncAfterTool(toolName: string): boolean {
  const name = toolName.replace(/\./g, "_");
  return (STUDIO_SYNC_AFTER_TOOLS as readonly string[]).includes(name);
}
