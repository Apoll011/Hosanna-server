/**
 * SyncCache — lightweight in-memory cache for /sync/status responses.
 *
 * Strategy:
 *   - Each tenant has its own cache entry keyed by tenantId.
 *   - On a cache hit the result is returned immediately (no DB round-trip).
 *   - Cache entries expire after CACHE_TTL_MS; on expiry the next request
 *     refreshes from the DB and repopulates the cache.
 *   - Any mutating operation (create / update / delete) on a tenant's data
 *     should call `syncCache.invalidate(tenantId)` so the next poll reflects
 *     the change without waiting for the TTL.
 */

export interface SyncTimestamps {
  songs: string;
  folders: string;
  services: string;
  settings: string;
}

interface CacheEntry {
  timestamps: SyncTimestamps;
  versionHash: string;
  cachedAt: number; // Date.now()
}

/** Default TTL: 30 seconds. Tune as needed. */
const CACHE_TTL_MS = 30_000;

class SyncCacheService {
  private store = new Map<string, CacheEntry>();

  /**
   * Returns the cached entry for this tenant if it's still fresh,
   * or `null` if the entry is absent / expired.
   */
  get(tenantId: string): (CacheEntry & { fromCache: true }) | null {
    const entry = this.store.get(tenantId);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      this.store.delete(tenantId);
      return null;
    }
    return { ...entry, fromCache: true };
  }

  /**
   * Stores a fresh result for this tenant.
   */
  set(tenantId: string, timestamps: SyncTimestamps): void {
    const versionHash = Object.values(timestamps).join("|");
    this.store.set(tenantId, {
      timestamps,
      versionHash,
      cachedAt: Date.now(),
    });
  }

  /**
   * Invalidates the cache for a tenant. Call this after any write operation
   * so the next sync poll reflects the latest state.
   */
  invalidate(tenantId: string): void {
    this.store.delete(tenantId);
  }

  /**
   * Invalidates all cached entries (useful after bulk operations or admin
   * actions that touch multiple tenants).
   */
  invalidateAll(): void {
    this.store.clear();
  }

  /**
   * Returns cache stats for observability / debugging.
   */
  stats(): { size: number; tenantIds: string[] } {
    return {
      size: this.store.size,
      tenantIds: [...this.store.keys()],
    };
  }
}

export const syncCache = new SyncCacheService();
