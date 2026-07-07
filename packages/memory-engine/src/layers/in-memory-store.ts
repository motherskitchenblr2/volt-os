/**
 * @module layers/in-memory-store
 * Default in-memory implementation of MemoryStore and VectorStore
 * for development and testing.
 */

import { randomUUID } from 'node:crypto';
import type {
  MemoryEntry,
  MemoryLayerType,
  MemoryQuery,
  MemoryStore,
  VectorStore,
} from '../types.js';

// ---------------------------------------------------------------------------
// In-Memory MemoryStore
// ---------------------------------------------------------------------------

export class InMemoryStore implements MemoryStore {
  private readonly entries = new Map<string, MemoryEntry>();

  async insert(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<MemoryEntry> {
    // Check for existing entry with same scopeId+key+layer to determine version
    let version = 1;
    for (const existing of this.entries.values()) {
      if (
        existing.layer === entry.layer &&
        existing.scopeId === entry.scopeId &&
        existing.key === entry.key
      ) {
        version = existing.version + 1;
        // Remove old entry since we're creating a replacement
        this.entries.delete(existing.id);
        break;
      }
    }

    const now = new Date();
    const record: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      version,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.set(record.id, record);
    return structuredClone(record);
  }

  async upsert(
    scopeId: string,
    key: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryEntry> {
    const existing = await this.getByKey(scopeId, key);
    if (existing) {
      existing.version += 1;
      existing.content = content;
      existing.metadata = { ...existing.metadata, ...metadata };
      existing.updatedAt = new Date();
      this.entries.set(existing.id, existing);
      return structuredClone(existing);
    }
    return this.insert({
      layer: 'user', // caller should set layer via wrapper
      scopeId,
      key,
      content,
      metadata,
    });
  }

  async getById(id: string): Promise<MemoryEntry | null> {
    const entry = this.entries.get(id);
    return entry ? structuredClone(entry) : null;
  }

  async getByKey(scopeId: string, key: string): Promise<MemoryEntry | null> {
    for (const entry of this.entries.values()) {
      if (entry.scopeId === scopeId && entry.key === key) {
        return structuredClone(entry);
      }
    }
    return null;
  }

  async query(filter: MemoryQuery): Promise<MemoryEntry[]> {
    let results = Array.from(this.entries.values());

    if (filter.layer) {
      results = results.filter((e) => e.layer === filter.layer);
    }
    if (filter.scopeId) {
      results = results.filter((e) => e.scopeId === filter.scopeId);
    }
    if (filter.key) {
      results = results.filter((e) => e.key === filter.key);
    }
    if (filter.text) {
      const lower = filter.text.toLowerCase();
      results = results.filter(
        (e) =>
          e.content.toLowerCase().includes(lower) ||
          e.key.toLowerCase().includes(lower),
      );
    }

    // Sort by updatedAt descending (newest first)
    results.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? results.length;
    return results.slice(offset, offset + limit).map((e) => structuredClone(e));
  }

  async delete(id: string): Promise<boolean> {
    return this.entries.delete(id);
  }

  async count(filter: {
    layer?: MemoryLayerType;
    scopeId?: string;
  }): Promise<number> {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (filter.layer && entry.layer !== filter.layer) continue;
      if (filter.scopeId && entry.scopeId !== filter.scopeId) continue;
      count += 1;
    }
    return count;
  }

  /** Remove all entries — useful for tests. */
  async clear(): Promise<void> {
    this.entries.clear();
  }
}

// ---------------------------------------------------------------------------
// In-Memory VectorStore (brute-force cosine similarity)
// ---------------------------------------------------------------------------

export class InMemoryVectorStore implements VectorStore {
  private readonly vectors = new Map<
    string,
    { embedding: number[]; metadata: Record<string, unknown> }
  >();

  async insert(
    id: string,
    embedding: number[],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    this.vectors.set(id, { embedding: [...embedding], metadata });
  }

  async search(
    embedding: number[],
    topK: number,
    threshold: number,
  ): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
    const scores: Array<{
      id: string;
      score: number;
      metadata: Record<string, unknown>;
    }> = [];

    for (const [id, vec] of this.vectors) {
      const score = cosineSimilarity(embedding, vec.embedding);
      if (score >= threshold) {
        scores.push({ id, score, metadata: vec.metadata });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  async delete(id: string): Promise<void> {
    this.vectors.delete(id);
  }

  async count(): Promise<number> {
    return this.vectors.size;
  }

  /** Clear all vectors — useful for tests. */
  async clear(): Promise<void> {
    this.vectors.clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute cosine similarity between two vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
