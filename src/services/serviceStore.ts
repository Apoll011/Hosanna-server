import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Mutex } from "async-mutex";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { ServiceRecord } from "../types.js";

// Guards read-modify-write cycles against services.json so concurrent sync
// requests can't clobber each other's writes (a real risk with the original
// implementation, which read then wrote with no locking).
const writeMutex = new Mutex();

async function readServicesFile(): Promise<ServiceRecord[]> {
  try {
    const raw = await fs.readFile(config.servicesFile, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    logger.warn({ err }, "services.json is unreadable or corrupt; treating as empty");
    return [];
  }
}

async function writeServicesFile(services: ServiceRecord[]): Promise<void> {
  const tmpPath = path.join(
    config.dataDir,
    `.services.${crypto.randomUUID()}.tmp`
  );
  try {
    await fs.writeFile(tmpPath, JSON.stringify(services, null, 2), "utf-8");
    await fs.rename(tmpPath, config.servicesFile);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

export async function getServices(): Promise<ServiceRecord[]> {
  return readServicesFile();
}

/**
 * Merges client-provided services into the persisted set (upsert by id) and
 * returns the full merged list. The read-modify-write is serialized via a
 * mutex so concurrent callers can't interleave and lose updates.
 */
export async function mergeServices(
  clientServices: ServiceRecord[]
): Promise<ServiceRecord[]> {
  return writeMutex.runExclusive(async () => {
    const serverServices = await readServicesFile();
    const byId = new Map(serverServices.map((s) => [s.id, s]));

    for (const clientSvc of clientServices) {
      byId.set(clientSvc.id, clientSvc);
    }

    const merged = Array.from(byId.values());
    await writeServicesFile(merged);
    return merged;
  });
}
