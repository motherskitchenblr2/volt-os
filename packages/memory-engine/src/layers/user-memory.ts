/**
 * @module layers/user-memory
 * Per-user preferences, history, and context.
 * Auto-applies TTL on entries when configured.
 */

import { randomUUID } from 'node:crypto';
import type {
  EventBus,
  MemoryEntry,
  MemoryLayerType,
  MemoryQuery,
  MemoryStore,
} from '../types.js';

const LAYER: MemoryLayerType = 'user';

export interface UserMemoryConfig {
  defaultTtlMs?: number;
}

export class UserMemoryLayer implements MemoryStore {
  constructor(
    private readonly store: MemoryStore,
    private readonly config: UserMemoryConfig,
    private readonly eventBus?: EventBus,
  ) {}

  /** Insert a new user memory entry, applying default TTL if configured. */
  async insert(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<MemoryEntry> {
    const ttlMs = entry.ttlMs ?? this.config.defaultTtlMs;
    const record = await this.store.insert({
      ...entry,
      layer: LAYER,
      ttlMs,
    });
    this.eventBus?.emit('memory:user:inserted', {
      id: record.id,
      scopeId: record.scopeId,
      key: record.key,
    });
    return record;
  }

  /** Upsert by scopeId + key — creates or updates in place. */
  async upsert(
    scopeId: string,
    key: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryEntry> {
    const existing = await this.getByKey(scopeId, key);
    if (existing) {
      const updated = await this.store.insert({
        layer: LAYER,
        scopeId,
        key,
        content,
        embedding: existing.embedding,
        metadata: { ...existing.metadata, ...metadata },
        ttlMs: existing.ttlMs ?? this.config.defaultTtlMs,
      });
      // Delete old and replace (simulates update on the generic store)
      await this.store.delete(existing.id);
      this.eventBus?.emit('memory:user:updated', {
        id: updated.id,
        scopeId,
        key,
      });
      return updated;
    }
    return this.insert({ layer: LAYER, scopeId, key, content, metadata });
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    const entry = await this.store.getById(id);
    if (entry && entry.layer === LAYER) return entry;
    return null;
  }

  async getByKey(scopeId: string, key: string): Promise<MemoryEntry | null> {
    const entry = await this.store.getByKey(scopeId, key);
    if (entry && entry.layer === LAYER) return entry;
    return null;
  }

  async query(filter: MemoryQuery): Promise<MemoryEntry[]> {
    return this.store.query({ ...filter, layer: LAYER });
  }

  async delete(id: string): Promise<boolean> {
    const entry = await this.store.getById(id);
    if (!entry || entry.layer !== LAYER) return false;
    const ok = await this.store.delete(id);
    if (ok) {
      this.eventBus?.emit('memory:user:deleted', { id });
    }
    return ok;
  }

  async count(filter: {
    layer?: MemoryLayerType;
    scopeId?: string;
  }): Promise<number> {
    return this.store.count({ ...filter, layer: LAYER });
  }
}
