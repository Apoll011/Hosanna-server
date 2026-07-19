import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { AppError, SongFile } from "../types.js";
import { hasAllowedSongExtension, safeResolve, toPosixPath } from "../utils/pathSafety.js";

export async function initDataDirs(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(config.songsDir, { recursive: true });

  try {
    await fs.access(config.servicesFile);
  } catch {
    await fs.writeFile(config.servicesFile, JSON.stringify([], null, 2), "utf-8");
  }
}

async function getFilesRecursively(dir: string): Promise<string[]> {
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const nested = await Promise.all(
    dirents.map((dirent) => {
      const res = path.join(dir, dirent.name);
      if (dirent.isDirectory()) return getFilesRecursively(res);
      if (dirent.isSymbolicLink()) return Promise.resolve([]); // don't follow symlinks
      return Promise.resolve([res]);
    })
  );

  return nested.flat();
}

export async function listSongFiles(): Promise<SongFile[]> {
  const allFilePaths = await getFilesRecursively(config.songsDir);
  const songPaths = allFilePaths.filter(hasAllowedSongExtension);

  const files = await Promise.all(
    songPaths.map(async (fullPath): Promise<SongFile | null> => {
      try {
        const [stats, content] = await Promise.all([
          fs.stat(fullPath),
          fs.readFile(fullPath, "utf-8"),
        ]);
        return {
          path: toPosixPath(path.relative(config.songsDir, fullPath)),
          content,
          updatedAt: stats.mtimeMs,
        };
      } catch (err) {
        // A file may have been deleted between listing and reading; skip it
        // rather than failing the whole sync.
        logger.warn({ err, fullPath }, "Skipping unreadable song file during sync");
        return null;
      }
    })
  );

  return files.filter((f): f is SongFile => f !== null);
}

export async function saveSong(songPath: string, content: string): Promise<void> {
  if (typeof content !== "string") {
    throw AppError.badRequest("Content must be a string.");
  }

  const byteSize = Buffer.byteLength(content, "utf-8");
  if (byteSize > config.maxSongSizeBytes) {
    throw AppError.payloadTooLarge(
      `Song content (${byteSize} bytes) exceeds the maximum allowed size of ${config.maxSongSizeBytes} bytes.`
    );
  }

  if (!hasAllowedSongExtension(songPath)) {
    throw AppError.badRequest(
      "Unsupported file extension. Allowed extensions: .chopro, .cho, .pro"
    );
  }

  const fullPath = safeResolve(config.songsDir, songPath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  // Atomic write: write to a temp file in the same directory, then rename.
  // This avoids readers ever observing a partially-written file, and avoids
  // data loss if the process crashes mid-write.
  const tmpPath = path.join(
    path.dirname(fullPath),
    `.${path.basename(fullPath)}.${crypto.randomUUID()}.tmp`
  );

  try {
    await fs.writeFile(tmpPath, content, "utf-8");
    await fs.rename(tmpPath, fullPath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

export async function deleteSong(songPath: string): Promise<void> {
  const fullPath = safeResolve(config.songsDir, songPath);

  try {
    await fs.unlink(fullPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // Already gone - deleting a non-existent song is not an error from the
    // client's point of view (idempotent delete).
  }
}
