import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { AppError, SongFile, LibraryNode, SongMetadata } from "../types.js";
import { hasAllowedSongExtension, safeResolve, toPosixPath } from "../utils/pathSafety.js";
import { parseChordProMetadata } from "../utils/chordpro.js";

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

const metadataCache = new Map<string, { mtime: number; metadata: SongMetadata }>();

async function getSongMetadata(fullPath: string, stats: any): Promise<SongMetadata> {
  const cached = metadataCache.get(fullPath);
  if (cached && cached.mtime === stats.mtimeMs) {
    return cached.metadata;
  }

  const content = await fs.readFile(fullPath, "utf-8");
  const metadata = parseChordProMetadata(content);
  metadataCache.set(fullPath, { mtime: stats.mtimeMs, metadata });
  return metadata;
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
          metadata: parseChordProMetadata(content),
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

export async function createFolder(folderPath: string): Promise<void> {
  const fullPath = safeResolve(config.songsDir, folderPath);
  await fs.mkdir(fullPath, { recursive: true });
}

export async function deleteFolder(folderPath: string): Promise<void> {
  const fullPath = safeResolve(config.songsDir, folderPath);
  try {
    const stats = await fs.stat(fullPath);
    if (!stats.isDirectory()) {
      throw AppError.badRequest("Path is not a directory.");
    }
    await fs.rm(fullPath, { recursive: true, force: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  const fullOldPath = safeResolve(config.songsDir, oldPath);
  const fullNewPath = safeResolve(config.songsDir, newPath);

  // Ensure the parent directory of the new path exists
  await fs.mkdir(path.dirname(fullNewPath), { recursive: true });

  try {
    await fs.rename(fullOldPath, fullNewPath);
    // Clear cache for moved/renamed file or folder
    for (const key of metadataCache.keys()) {
      if (key.startsWith(fullOldPath)) {
        metadataCache.delete(key);
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw AppError.notFound("Source path not found.");
    }
    throw err;
  }
}

export async function getLibraryTree(dir: string = config.songsDir): Promise<LibraryNode[]> {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const nodes = await Promise.all(
    dirents.map(async (dirent): Promise<LibraryNode | null> => {
      const fullPath = path.join(dir, dirent.name);
      const relativePath = toPosixPath(path.relative(config.songsDir, fullPath));

      if (dirent.isDirectory()) {
        const children = await getLibraryTree(fullPath);
        return {
          name: dirent.name,
          path: relativePath,
          type: "folder",
          children,
        };
      } else if (dirent.isFile() && hasAllowedSongExtension(dirent.name)) {
        return {
          name: dirent.name,
          path: relativePath,
          type: "song",
        };
      }
      return null;
    })
  );

  return nodes
    .filter((n): n is LibraryNode => n !== null)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export async function searchSongs(options: {
  query?: string;
  folder?: string;
  tags?: string[];
  artist?: string;
  title?: string;
}): Promise<SongFile[]> {
  const searchDir = options.folder ? safeResolve(config.songsDir, options.folder) : config.songsDir;
  const allFilePaths = await getFilesRecursively(searchDir);
  const songPaths = allFilePaths.filter(hasAllowedSongExtension);

  const results = await Promise.all(
    songPaths.map(async (fullPath): Promise<SongFile | null> => {
      try {
        const stats = await fs.stat(fullPath);
        const content = await fs.readFile(fullPath, "utf-8");
        const metadata = await getSongMetadata(fullPath, stats);

        const songFile: SongFile = {
          path: toPosixPath(path.relative(config.songsDir, fullPath)),
          content,
          updatedAt: stats.mtimeMs,
          metadata,
        };

        if (options.artist && !metadata.artist?.toLowerCase().includes(options.artist.toLowerCase())) return null;
        if (options.title && !metadata.title?.toLowerCase().includes(options.title.toLowerCase())) return null;
        if (options.tags && options.tags.length > 0) {
          const songTags = metadata.tags || [];
          if (!options.tags.every(t => songTags.includes(t))) return null;
        }

        if (options.query) {
          const q = options.query.toLowerCase();
          const matches =
            songFile.path.toLowerCase().includes(q) ||
            metadata.title?.toLowerCase().includes(q) ||
            metadata.artist?.toLowerCase().includes(q) ||
            content.toLowerCase().includes(q) ||
            metadata.tags?.some(t => t.toLowerCase().includes(q));

          if (!matches) return null;
        }

        return songFile;
      } catch (err) {
        return null;
      }
    })
  );

  return results.filter((f): f is SongFile => f !== null);
}

export async function getSongContent(songPath: string): Promise<{ content: string; stats: any }> {
  const fullPath = safeResolve(config.songsDir, songPath);
  const [stats, content] = await Promise.all([
    fs.stat(fullPath),
    fs.readFile(fullPath, "utf-8"),
  ]);
  return { content, stats };
}
