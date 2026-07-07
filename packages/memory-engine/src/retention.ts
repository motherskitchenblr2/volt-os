/**
 * @module retention
 * Retention policy — TTL enforcement, size limits, and storage stats.
 */

import type { MemoryStore } from '../types.js';

const BYTES_PER_MB = 1024 * 1024;

export interface RetentionPolicyConfig {
  /** How often to run retention checks (ms). */
  checkIntervalMs?: number;
}

export class RetentionPolicy {
  constructor(private readonly config: RetentionPolicyConfig = {}) {}

  /** Enforce TTL on all entries in a store — removes expired entries. */
  async enforceTTL(store: MemoryStore): Promise<{ expired: number }> {
    const now = Date.now();
    const all = await store.query({});
    let expired = 0;

    for (const entry of all) {
      if (entry.ttlMs != null) {
        const expiresAt = entry.createdAt.getTime() + entry.ttlMs;
        if (now > expiresAt) {
          const deleted = await store.delete(entry.id);
          if (deleted) expired += 1;
        }
      }
    }

    return { expired };
  }

  /**
   * Enforce a maximum size limit on a store.
   * Evicts oldest entries (by createdAt) until under the limit.
   */
  async enforceSizeLimit(
    store: MemoryStore,
    maxSizeMB: number,
  ): Promise<{ evicted: number }> {
    const stats = await this.getStats(store);
    const maxBytes = maxSizeMB * BYTES_PER_MB;
    let evicted = 0;

    if (stats.sizeMB <= maxSizeMB) {
      return { evicted: 0 };
    }

    // Get all entries sorted by createdAt ascending (oldest first)
    const all = await store.query({});
    all.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let currentSize = stats.sizeMB * BYTES_PER_MB;
    for (const entry of all) {
      if (currentSize <= maxBytes) break;
      const entrySize = entry.content.length * 2; // rough UTF-16 bytes
      const deleted = await store.delete(entry.id);
      if (deleted) {
        currentSize -= entrySize;
        evicted += 1;
      }
    }

    return { evicted };
  }

  /** Get storage stats for a store. */
  async getStats(store: MemoryStore): Promise<{
    count: number;
    sizeMB: number;
  }> {
    const all = await store.query({});
    const totalBytes = all.reduce(
      (acc, e) => acc + e.content.length * 2 + JSON.stringify(e.metadata).length,
      0,
    );
    return {
      count: all.length,
      sizeMB: totalBytes / BYTES_PER_MB,
    };
  }
}
