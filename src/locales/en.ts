import type { I18nKeys } from "./pt-PT.js";

/**
 * en-US — English locale.
 */
const en = {
  // ── errors / middleware ─────────────────────────────────────────────────
  error: {
    route_not_found: "No route matches {{method}} {{path}}",
    resource_not_found: "The resource does not exist.",
    duplicate_resource: "A resource with this unique value already exists.",
    internal_error: "An unexpected error occurred.",
    validation_failed: "Request validation failed.",
    unauthenticated: "Unauthenticated",
    missing_permission: "Insufficient permissions",
    forbidden_default: "You do not have permission to perform this action.",
    unauthorized_session: "Invalid or missing authentication session.",
    workspace_required: "An active workspace/organization context is required.",
    rate_limit_exceeded: "Too many requests. Please try again later.",
  },

  // ── conflict / optimistic concurrency ──────────────────────────────────
  conflict: {
    default:
      "The resource was modified by someone else. Please reload and try again.",
    song: "This song was modified by someone else since you last loaded it.",
    folder:
      "This folder was modified by someone else since you last loaded it.",
    service:
      "This service was modified by someone else since you last loaded it.",
  },

  // ── songs ───────────────────────────────────────────────────────────────
  song: {
    not_found: "The song does not exist.",
    unknown_artist: "Unknown Artist",
    varios: "Various",
  },

  // ── folders ─────────────────────────────────────────────────────────────
  folder: {
    not_found: "The folder does not exist.",
    deleted: "Folder deleted",
  },

  // ── services ────────────────────────────────────────────────────────────
  service: {
    not_found: "The service does not exist.",
  },

  // ── settings ────────────────────────────────────────────────────────────
  settings: {
    not_found: "Settings not initialized for this tenant.",
  },

  // ── backup ──────────────────────────────────────────────────────────────
  backup: {
    restored_successfully: "Backup restored successfully",
    invalid_file: "Invalid or corrupted backup file.",
    missing_arrays: "The backup file does not contain the expected arrays.",
  },

  // ── notifications ───────────────────────────────────────────────────────
  notification: {
    new_member_title: "A new member has joined!",
    new_member_description: "{{name}} is now part of the organization",
    folder_deleted_title: "Folder deleted with all its contents",
    folder_deleted_description:
      "{{songs}} song(s) and {{folders}} subfolder(s) were permanently removed.",
    backup_restored_title: "Backup restored — all data replaced",
    backup_restored_description:
      "A full restore imported {{folders}} folder(s), {{songs}} song(s), and {{services}} service(s).",
    settings_changed_title: "Organization settings updated",
    settings_changed_description:
      "An administrator changed one or more workspace settings.",
  },
} as const satisfies I18nKeys;

export default en;
