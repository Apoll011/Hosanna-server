/**
 * SyncCache — lightweight high-performance in-memory cache for RxDB replication
 * and sync polling.
 *
 * Strategy:
 *   - Each tenant has an in-memory map of latest known checkpoints per collection.
 *   - On replication pull, if the client's checkpoint is already at or ahead of the
 *     server's latest document, the query returns instantly without touching the DB.
 *   - On mutation (push / create / update / delete), the tenant's cache for that
 *     collection is invalidated immediately so subsequent polls fetch fresh data.
 *   - Cache entries expire after TTL to ensure consistency even if external database
 *     mutations occur.
 */

export type ReplicatedCollection =
  "songs" | "folders" | "collections" | "services" | "agendaEvents";

export interface ReplicationCheckpoint {
  updatedAt: number; // Unix epoch milliseconds
  id: string;
}

export interface SyncTimestamps {
  songs: string;
  folders: string;
  services: string;
}

interface LegacyCacheEntry {
  timestamps: SyncTimestamps;
  versionHash: string;
  cachedAt: number;
}

interface CheckpointEntry {
  checkpoint: ReplicationCheckpoint | null;
  cachedAt: number;
}

/** Default TTL: 60 seconds. Refreshes on write or expiry. */
const CHECKPOINT_TTL_MS = 60_000;
const LEGACY_CACHE_TTL_MS = 30_000;
const MAX_TENANTS = 2_048;

class SyncCacheService {
  private legacyStore = new Map<string, LegacyCacheEntry>();
  private checkpointStore = new Map<
    string,
    Map<ReplicatedCollection, CheckpointEntry>
  >();

  /**
   * Fast-path check: returns true if the server knows for certain that
   * no documents have been created or modified since `clientCheckpoint`.
   */
  hasNoChanges(
    tenantId: string,
    collection: ReplicatedCollection,
    clientCheckpoint: ReplicationCheckpoint | null,
  ): boolean {
    const tenantMap = this.checkpointStore.get(tenantId);
    if (!tenantMap) return false;

    const entry = tenantMap.get(collection);
    if (!entry) return false;

    const now = Date.now();
    if (now - entry.cachedAt > CHECKPOINT_TTL_MS) {
      tenantMap.delete(collection);
      return false;
    }

    // If client has no checkpoint, we only have no changes if the collection is empty
    if (!clientCheckpoint) {
      return entry.checkpoint === null;
    }

    // If server collection is empty, client already has everything
    if (entry.checkpoint === null) {
      return true;
    }

    // Client is strictly newer than server's newest doc
    if (clientCheckpoint.updatedAt > entry.checkpoint.updatedAt) {
      return true;
    }

    // Client matches server's newest doc exactly
    if (
      clientCheckpoint.updatedAt === entry.checkpoint.updatedAt &&
      clientCheckpoint.id === entry.checkpoint.id
    ) {
      return true;
    }

    return false;
  }

  /**
   * Records the latest known checkpoint for a tenant's collection.
   */
  setLatestCheckpoint(
    tenantId: string,
    collection: ReplicatedCollection,
    checkpoint: ReplicationCheckpoint | null,
  ): void {
    let tenantMap = this.checkpointStore.get(tenantId);
    if (!tenantMap) {
      // Bounded map eviction
      if (this.checkpointStore.size >= MAX_TENANTS) {
        const oldestKey = this.checkpointStore.keys().next().value;
        if (oldestKey) this.checkpointStore.delete(oldestKey);
      }
      tenantMap = new Map();
      this.checkpointStore.set(tenantId, tenantMap);
    }

    tenantMap.set(collection, {
      checkpoint: checkpoint
        ? { updatedAt: checkpoint.updatedAt, id: checkpoint.id }
        : null,
      cachedAt: Date.now(),
    });
  }

  /**
   * Invalidates the cache for a tenant.
   * If `collection` is specified, only that collection is invalidated.
   * Otherwise, all cached collections for the tenant are cleared.
   */
  invalidate(tenantId: string, collection?: ReplicatedCollection): void {
    this.legacyStore.delete(tenantId);

    if (collection) {
      const tenantMap = this.checkpointStore.get(tenantId);
      if (tenantMap) {
        tenantMap.delete(collection);
        if (tenantMap.size === 0) {
          this.checkpointStore.delete(tenantId);
        }
      }
    } else {
      this.checkpointStore.delete(tenantId);
    }
  }

  /**
   * Invalidates all cached entries across all tenants.
   */
  invalidateAll(): void {
    this.legacyStore.clear();
    this.checkpointStore.clear();
  }

  // ── Legacy methods for backward compatibility ────────────────────────────

  get(tenantId: string): (LegacyCacheEntry & { fromCache: true }) | null {
    const entry = this.legacyStore.get(tenantId);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > LEGACY_CACHE_TTL_MS) {
      this.legacyStore.delete(tenantId);
      return null;
    }
    return { ...entry, fromCache: true };
  }

  set(tenantId: string, timestamps: SyncTimestamps): void {
    const versionHash = Object.values(timestamps).join("|");
    this.legacyStore.set(tenantId, {
      timestamps,
      versionHash,
      cachedAt: Date.now(),
    });
  }

  stats(): { size: number; tenantIds: string[]; checkpointTenants: number } {
    return {
      size: this.legacyStore.size,
      tenantIds: [...this.checkpointStore.keys()],
      checkpointTenants: this.checkpointStore.size,
    };
  }
}

export const syncCache = new SyncCacheService();
