/**
 * @module memory-api
 * Memory API implementation for the VOLT OS Developer SDK.
 *
 * Pure delegation to the MemoryEngine subsystem — no business logic.
 */

import type {
  MemoryEntry as _MemoryEntry,
  MemoryLayerType as _MemoryLayerType,
} from '@volt-os/memory-engine';
import type { MemoryAPI } from '../types.js';

/**
 * Minimal interface for the parts of MemoryEngine the SDK needs.
 */
interface MemoryEngineLike {
  read(layer: _MemoryLayerType, scopeId: string, key: string): Promise<_MemoryEntry | null>;
  write(
    layer: _MemoryLayerType,
    scopeId: string,
    key: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<_MemoryEntry>;
  delete(layer: _MemoryLayerType, id: string): Promise<boolean>;
  semanticSearch(
    queryText: string,
    topK?: number,
  ): Promise<Array<{ entry: _MemoryEntry; score: number }>>;
}

/** Set of valid memory layer types for runtime validation. */
const VALID_LAYERS = new Set<string>([
  'user',
  'project',
  'agent',
  'knowledge_base',
  'vector_store',
  'decision_history',
]);

/**
 * MemoryAPI implementation that delegates to the MemoryEngine.
 *
 * @example
 * ```ts
 * const api = new MemoryAPIImpl(memoryEngine);
 * await api.write('user', 'user-123', 'theme', 'dark');
 * const entry = await api.read('user', 'user-123', 'theme');
 * const results = await api.search('VOLT OS architecture', 5);
 * ```
 */
export class MemoryAPIImpl implements MemoryAPI {
  /**
   * Create a new MemoryAPIImpl.
   * @param engine - The MemoryEngine subsystem.
   */
  constructor(private readonly engine: MemoryEngineLike) {}

  /**
   * Validate that a layer string is a valid memory layer type.
   * @param layer - Layer string to validate.
   * @returns The validated MemoryLayerType.
   * @throws If the layer is invalid.
   */
  private validateLayer(layer: string): _MemoryLayerType {
    if (!VALID_LAYERS.has(layer)) {
      throw new Error(`Invalid memory layer "${layer}". Valid layers: ${[...VALID_LAYERS].join(', ')}`);
    }
    return layer as _MemoryLayerType;
  }

  /**
   * Read a memory entry by layer, scope, and key.
   * @param layer - Memory layer type.
   * @param scopeId - Scope identifier.
   * @param key - Semantic key.
   * @returns The memory entry, or null if not found.
   * @throws If the layer is invalid.
   */
  async read(layer: string, scopeId: string, key: string): Promise<_MemoryEntry | null> {
    const validLayer = this.validateLayer(layer);
    return this.engine.read(validLayer, scopeId, key);
  }

  /**
   * Write a memory entry to a specific layer.
   * @param layer - Memory layer type.
   * @param scopeId - Scope identifier.
   * @param key - Semantic key.
   * @param content - Content payload.
   * @returns The created/updated memory entry.
   * @throws If the layer is invalid.
   */
  async write(layer: string, scopeId: string, key: string, content: string): Promise<_MemoryEntry> {
    const validLayer = this.validateLayer(layer);
    return this.engine.write(validLayer, scopeId, key, content);
  }

  /**
   * Semantic search across all vector-indexed memory.
   * @param query - Search query text.
   * @param topK - Maximum number of results (default: 10).
   * @returns Array of entries with similarity scores.
   */
  async search(query: string, topK: number = 10): Promise<Array<{ entry: _MemoryEntry; score: number }>> {
    return this.engine.semanticSearch(query, topK);
  }

  /**
   * Delete a memory entry by layer and ID.
   * @param layer - Memory layer type.
   * @param id - Entry ID.
   * @returns True if deleted, false if not found.
   * @throws If the layer is invalid.
   */
  async delete(layer: string, id: string): Promise<boolean> {
    const validLayer = this.validateLayer(layer);
    return this.engine.delete(validLayer, id);
  }
}
