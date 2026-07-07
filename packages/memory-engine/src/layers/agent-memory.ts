/**
 * @module layers/agent-memory
 * Per-agent working memory (TTL-based) and long-term memory (persistent).
 */

import type {
  EventBus,
  MemoryEntry,
  MemoryLayerType,
  MemoryQuery,
  MemoryStore,
} from '../types.js';

const LAYER: MemoryLayerType = 'agent';

export interface AgentMemoryConfig {
  workingMemoryTtlMs: number;
}

export class AgentMemoryLayer implements MemoryStore {
  constructor(
    private readonly store: MemoryStore,
    private readonly config: AgentMemoryConfig,
    private readonly eventBus?: EventBus,
  ) {}

  /** Insert a working-memory entry (auto-applies TTL). */
  async insert(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<MemoryEntry> {
    const record = await this.store.insert({
      ...entry,
      layer: LAYER,
      ttlMs: entry.ttlMs ?? this.config.workingMemoryTtlMs,
    });
    this.eventBus?.emit('memory:agent:inserted', {
      id: record.id,
      scopeId: record.scopeId,
      key: record.key,
    });
    return record;
  }

  /**
   * Store a long-term memory entry (no TTL — persists indefinitely).
   * Bypasses the working-memory TTL by writing directly to the store.
   */
  async storeLongTerm(
    scopeId: string,
    key: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryEntry> {
    const longTermMetadata = { ...metadata, isWorkingMemory: false };
    // Check for existing
    const existing = await this.getByKey(scopeId, key);
    if (existing) {
      // Delete old, insert new without TTL
      const record = await this.store.insert({
        layer: LAYER,
        scopeId,
        key,
        content,
        embedding: existing.embedding,
        metadata: longTermMetadata,
        // Explicitly set ttlMs to undefined — no TTL for long-term
        ttlMs: undefined,
      });
      await this.store.delete(existing.id);
      this.eventBus?.emit('memory:agent:long_term:updated', {
        id: record.id,
        scopeId,
        key,
      });
      return record;
    }
    // New entry — insert directly without applying working-memory TTL
    const record = await this.store.insert({
      layer: LAYER,
      scopeId,
      key,
      content,
      metadata: longTermMetadata,
      ttlMs: undefined,
    });
    this.eventBus?.emit('memory:agent:inserted', {
      id: record.id,
      scopeId,
      key,
    });
    return record;
  }

  async upsert(
    scopeId: string,
    key: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryEntry> {
    const existing = await this.getByKey(scopeId, key);
    if (existing) {
      const record = await this.store.insert({
        layer: LAYER,
        scopeId,
        key,
        content,
        embedding: existing.embedding,
        metadata: { ...existing.metadata, ...metadata },
        ttlMs: existing.ttlMs ?? this.config.workingMemoryTtlMs,
      });
      await this.store.delete(existing.id);
      this.eventBus?.emit('memory:agent:updated', {
        id: record.id,
        scopeId,
        key,
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
      this.eventBus?.emit('memory:agent:deleted', { id });
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
