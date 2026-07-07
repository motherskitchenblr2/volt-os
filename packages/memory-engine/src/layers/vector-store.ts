/**
 * @module layers/vector-store
 * Vector-indexed conceptual associations for semantic search.
 */

import type { EventBus, VectorStore } from '../types.js';

export interface VectorStoreLayerConfig {
  dimensions: number;
  similarityThreshold: number;
}

export interface SearchResult {
  id: string;
  score: number;
  content: string;
}

export class VectorStoreLayer {
  constructor(
    private readonly vectorStoreImpl: VectorStore,
    private readonly config: VectorStoreLayerConfig,
    private readonly eventBus?: EventBus,
  ) {}

  /**
   * Store an embedding with associated metadata.
   * Validates vector dimensions against config.
   */
  async addEmbedding(
    id: string,
    embedding: number[],
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (embedding.length !== this.config.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.config.dimensions}, got ${embedding.length}`,
      );
    }
    await this.vectorStoreImpl.insert(id, embedding, metadata);
    this.eventBus?.emit('memory:vector:stored', { id });
  }

  /**
   * Semantic search using an embedding vector.
   * Returns results sorted by similarity score descending.
   */
  async search(
    _query: string,
    embedding: number[],
    topK: number = 10,
  ): Promise<SearchResult[]> {
    if (embedding.length !== this.config.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.config.dimensions}, got ${embedding.length}`,
      );
    }
    const results = await this.vectorStoreImpl.search(
      embedding,
      topK,
      this.config.similarityThreshold,
    );
    return results.map((r) => ({
      id: r.id,
      score: r.score,
      content: (r.metadata.content as string) ?? '',
    }));
  }

  /** Delete an embedding by ID. */
  async delete(id: string): Promise<void> {
    await this.vectorStoreImpl.delete(id);
    this.eventBus?.emit('memory:vector:deleted', { id });
  }

  /** Total number of indexed embeddings. */
  async count(): Promise<number> {
    return this.vectorStoreImpl.count();
  }
}
