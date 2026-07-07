/**
 * @module layers/project-memory
 * Per-project decisions, constraints, and progress.
 * Supports versioning of entries.
 */

import type {
  EventBus,
  MemoryEntry,
  MemoryLayerType,
  MemoryQuery,
  MemoryStore,
} from '../types.js';

const LAYER: MemoryLayerType = 'project';

export interface ProjectMemoryConfig {
  defaultTtlMs?: number;
}

export class ProjectMemoryLayer implements MemoryStore {
  constructor(
    private readonly store: MemoryStore,
    private readonly config: ProjectMemoryConfig,
    private readonly eventBus?: EventBus,
  ) {}

  async insert(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<MemoryEntry> {
    const ttlMs = entry.ttlMs ?? this.config.defaultTtlMs;
    const record = await this.store.insert({
      ...entry,
      layer: LAYER,
      ttlMs,
    });
    this.eventBus?.emit('memory:project:inserted', {
      id: record.id,
      scopeId: record.scopeId,
      key: record.key,
    });
    return record;
  }

  /** Upsert with versioning: preserves previous version as metadata._previousVersion. */
  async upsert(
    scopeId: string,
    key: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryEntry> {
    const existing = await this.getByKey(scopeId, key);
    if (existing) {
      const mergedMetadata: Record<string, unknown> = {
        ...existing.metadata,
        ...metadata,
        _previousVersion: existing.version,
      };
      const record = await this.store.insert({
        layer: LAYER,
        scopeId,
        key,
        content,
        embedding: existing.embedding,
        metadata: mergedMetadata,
        ttlMs: existing.ttlMs ?? this.config.defaultTtlMs,
      });
      await this.store.delete(existing.id);
      this.eventBus?.emit('memory:project:updated', {
        id: record.id,
        scopeId,
        key,
        version: record.version,
      });
      return record;
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
      this.eventBus?.emit('memory:project:deleted', { id });
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
