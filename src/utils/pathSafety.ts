import path from "node:path";
import { AppError } from "../types.js";

/**
 * Resolves `userPath` against `baseDir` and guarantees the result stays
 * within `baseDir`. Throws an AppError(400) on any attempt to escape
 * (e.g. via "../", absolute paths, or symlink-style tricks resolved at the
 * string level). This is stricter than a simple prefix replace since it
 * rejects the request outright instead of silently rewriting it.
 */
export function safeResolve(baseDir: string, userPath: string): string {
  if (typeof userPath !== "string" || userPath.trim() === "") {
    throw AppError.badRequest("Path is required.");
  }

  // Reject null bytes and absolute paths outright.
  if (userPath.includes("\0")) {
    throw AppError.badRequest("Invalid path.");
  }

  const normalizedBase = path.resolve(baseDir);
  const candidate = path.resolve(normalizedBase, userPath);

  const relative = path.relative(normalizedBase, candidate);
  const escapesBase =
    relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);

  if (escapesBase) {
    throw AppError.badRequest("Path escapes the allowed directory.");
  }

  return candidate;
}

/** Normalizes a path to forward slashes for consistent client-facing output. */
export function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}

const ALLOWED_SONG_EXTENSIONS = [".chopro", ".cho", ".pro"];

export function hasAllowedSongExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_SONG_EXTENSIONS.includes(ext);
}
