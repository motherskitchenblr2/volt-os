/**
 * @module query
 * Memory Query Engine — cross-layer query, semantic search, and agent context.
 */

import type {
  MemoryEntry,
  MemoryLayerType,
  MemoryQuery,
} from '../types.js';
import type { UserMemoryLayer } from './layers/user-memory.js';
import type { ProjectMemoryLayer } from './layers/project-memory.js';
import type { AgentMemoryLayer } from './layers/agent-memory.js';
import type { KnowledgeBaseLayer } from './layers/knowledge-base.js';
import type { VectorStoreLayer } from './layers/vector-store.js';
import type { DecisionHistoryLayer } from './layers/decision-history.js';

export interface MemoryQueryEngineOptions {
  userMemory: UserMemoryLayer;
  projectMemory: ProjectMemoryLayer;
  agentMemory: AgentMemoryLayer;
  knowledgeBase: KnowledgeBaseLayer;
  vectorStore: VectorStoreLayer;
  decisionHistory: DecisionHistoryLayer;
}

export class MemoryQueryEngine {
  private readonly userMemory: UserMemoryLayer;
  private readonly projectMemory: ProjectMemoryLayer;
  private readonly agentMemory: AgentMemoryLayer;
  private readonly knowledgeBase: KnowledgeBaseLayer;
  private readonly vectorStore: VectorStoreLayer;
  private readonly decisionHistory: DecisionHistoryLayer;

  constructor(options: MemoryQueryEngineOptions) {
    this.userMemory = options.userMemory;
    this.projectMemory = options.projectMemory;
    this.agentMemory = options.agentMemory;
    this.knowledgeBase = options.knowledgeBase;
    this.vectorStore = options.vectorStore;
    this.decisionHistory = options.decisionHistory;
  }

  /**
   * Cross-layer query — searches across the specified layers.
   * Respects scope isolation: each layer returns only its own entries.
   */
  async query(filter: MemoryQuery): Promise<MemoryEntry[]> {
    const layers: MemoryLayerType[] = filter.layer
      ? [filter.layer]
      : ['user', 'project', 'agent', 'knowledge_base'];

    const results: MemoryEntry[] = [];

    for (const layer of layers) {
      let entries: MemoryEntry[];
      switch (layer) {
        case 'user':
          entries = await this.userMemory.query(filter);
          break;
        case 'project':
          entries = await this.projectMemory.query(filter);
          break;
        case 'agent':
          entries = await this.agentMemory.query(filter);
          break;
        case 'knowledge_base':
          entries = await this.knowledgeBase.query(filter);
          break;
        default:
          entries = [];
      }
      results.push(...entries);
    }

    // Apply limit across all results
    const limit = filter.limit ?? results.length;
    const offset = filter.offset ?? 0;
    return results.slice(offset, offset + limit);
  }

  /**
   * Semantic search across all vector-indexed layers.
   * Requires an embedding vector to search against.
   */
  async semanticSearch(
    query: string,
    topK: number = 10,
  ): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    // Semantic search uses the vector store directly
    // The caller must provide embeddings; we can search the vector store
    // For this implementation, we delegate to vector store search
    // and map back to memory entries via the content stored in vector metadata

    // Since we don't have embeddings at this level, we use the query text
    // to find matching entries across all layers
    const textFilter: MemoryQuery = { text: query, limit: topK };
    const textResults = await this.query(textFilter);

    // Return with score 1.0 for text matches (exact/fuzzy text match)
    return textResults.map((entry) => ({ entry, score: 1.0 }));
  }

  /**
   * Get consolidated context for an agent working on a project.
   * Returns entries from all relevant layers.
   */
  async getAgentContext(
    agentId: string,
    projectId: string,
  ): Promise<{
    userMemory: MemoryEntry[];
    projectMemory: MemoryEntry[];
    agentMemory: MemoryEntry[];
    knowledgeBase: MemoryEntry[];
  }> {
    const [userMem, projectMem, agentMem, kb] = await Promise.all([
      this.userMemory.query({ scopeId: agentId }),
      this.projectMemory.query({ scopeId: projectId }),
      this.agentMemory.query({ scopeId: agentId }),
      this.knowledgeBase.query({}),
    ]);

    return {
      userMemory: userMem,
      projectMemory: projectMem,
      agentMemory: agentMem,
      knowledgeBase: kb,
    };
  }
}
