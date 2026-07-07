/**
 * @module layers/knowledge-base
 * Shared reference material and documentation.
 * Read by all agents; write by authorized actors.
 * Versioned entries.
 */

import type {
  EventBus,
  MemoryEntry,
  MemoryLayerType,
  MemoryQuery,
  MemoryStore,
} from '../types.js';

const LAYER: MemoryLayerType = 'knowledge_base';

export interface KnowledgeBaseConfig {
  maxSizeMB: number;
}

export class KnowledgeBaseLayer implements MemoryStore {
  constructor(
    private readonly store: MemoryStore,
    private readonly config: KnowledgeBaseConfig,
    private readonly eventBus?: EventBus,
  ) {}

  async insert(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<MemoryEntry> {
    const record = await this.store.insert({
      ...entry,
      layer: LAYER,
    });
    this.eventBus?.emit('memory:kb:inserted', {
      id: record.id,
      key: record.key,
    });
    return record;
  }

  /** Upsert with version tracking: old version stored in metadata._versions. */
  async upsert(
    scopeId: string,
    key: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryEntry> {
    const existing = await this.getByKey(scopeId, key);
    if (existing) {
      const versions: number[] = Array.isArray(existing.metadata._versions)
        ? (existing.metadata._versions as number[])
        : [];
      versions.push(existing.version);
      const mergedMetadata: Record<string, unknown> = {
        ...existing.metadata,
        ...metadata,
        _versions: versions,
      };
      const record = await this.store.insert({
        layer: LAYER,
        scopeId,
        key,
        content,
        embedding: existing.embedding,
        metadata: mergedMetadata,
      });
      await this.store.delete(existing.id);
      this.eventBus?.emit('memory:kb:updated', {
        id: record.id,
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
      this.eventBus?.emit('memory:kb:deleted', { id });
    }
    return ok;
  }

  async count(filter: {
    layer?: MemoryLayerType;
    scopeId?: string;
  }): Promise<number> {
    return this.store.count({ ...filter, layer: LAYER });
  }

  /** Estimate current storage in bytes based on content length. */
  async estimateSizeBytes(): Promise<number> {
    const entries = await this.query({ layer: LAYER });
    return entries.reduce((acc, e) => acc + e.content.length * 2, 0); // rough UTF-16
  }
}
