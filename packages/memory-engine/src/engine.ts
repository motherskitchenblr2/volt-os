/**
 * @module engine
 * Memory Engine — main API for the 6-layer memory system.
 * Coordinates all layers, enforces isolation, and emits events.
 */

import pino from 'pino';
import type {
  EventBus,
  MemoryEngineConfig,
  MemoryEntry,
  MemoryLayerType,
  MemoryQuery,
  MemoryStore,
  VectorStore,
} from './types.js';
import { UserMemoryLayer } from './layers/user-memory.js';
import { ProjectMemoryLayer } from './layers/project-memory.js';
import { AgentMemoryLayer } from './layers/agent-memory.js';
import { KnowledgeBaseLayer } from './layers/knowledge-base.js';
import { VectorStoreLayer } from './layers/vector-store.js';
import { DecisionHistoryLayer } from './layers/decision-history.js';
import { MemoryQueryEngine } from './query.js';
import { MemoryIsolation } from './isolation.js';
import { RetentionPolicy } from './retention.js';

const logger = pino({ name: 'volt-os:memory-engine' });

export interface MemoryEngineOptions {
  config: MemoryEngineConfig;
  store: MemoryStore;
  vectorStore: VectorStore;
  eventBus: EventBus;
}

export class MemoryEngine {
  private readonly _userMemory: UserMemoryLayer;
  private readonly _projectMemory: ProjectMemoryLayer;
  private readonly _agentMemory: AgentMemoryLayer;
  private readonly _knowledgeBase: KnowledgeBaseLayer;
  private readonly _vectorStore: VectorStoreLayer;
  private readonly _decisionHistory: DecisionHistoryLayer;
  private readonly _queryEngine: MemoryQueryEngine;
  private readonly _isolation: MemoryIsolation;
  private readonly _retention: RetentionPolicy;
  private readonly _eventBus: EventBus;
  private readonly _store: MemoryStore;
  private readonly _vectorStoreRaw: VectorStore;
  private readonly _config: MemoryEngineConfig;

  constructor(options: MemoryEngineOptions) {
    this._config = options.config;
    this._store = options.store;
    this._vectorStoreRaw = options.vectorStore;
    this._eventBus = options.eventBus;

    this._isolation = new MemoryIsolation();
    this._retention = new RetentionPolicy();

    this._userMemory = new UserMemoryLayer(
      options.store,
      options.config.userMemory,
      options.eventBus,
    );
    this._projectMemory = new ProjectMemoryLayer(
      options.store,
      options.config.projectMemory,
      options.eventBus,
    );
    this._agentMemory = new AgentMemoryLayer(
      options.store,
      options.config.agentMemory,
      options.eventBus,
    );
    this._knowledgeBase = new KnowledgeBaseLayer(
      options.store,
      options.config.knowledgeBase,
      options.eventBus,
    );
    this._vectorStore = new VectorStoreLayer(
      options.vectorStore,
      options.config.vectorStore,
      options.eventBus,
    );
    this._decisionHistory = new DecisionHistoryLayer(
      options.store,
      options.eventBus,
    );

    this._queryEngine = new MemoryQueryEngine({
      userMemory: this._userMemory,
      projectMemory: this._projectMemory,
      agentMemory: this._agentMemory,
      knowledgeBase: this._knowledgeBase,
      vectorStore: this._vectorStore,
      decisionHistory: this._decisionHistory,
    });

    logger.info('Memory Engine initialized');
  }

  // ---------------------------------------------------------------------------
  // Layer accessors
  // ---------------------------------------------------------------------------

  get userMemory(): UserMemoryLayer {
    return this._userMemory;
  }

  get projectMemory(): ProjectMemoryLayer {
    return this._projectMemory;
  }

  get agentMemory(): AgentMemoryLayer {
    return this._agentMemory;
  }

  get knowledgeBase(): KnowledgeBaseLayer {
    return this._knowledgeBase;
  }

  get vectorStore(): VectorStoreLayer {
    return this._vectorStore;
  }

  get decisionHistory(): DecisionHistoryLayer {
    return this._decisionHistory;
  }

  get queryEngine(): MemoryQueryEngine {
    return this._queryEngine;
  }

  get isolation(): MemoryIsolation {
    return this._isolation;
  }

  get retention(): RetentionPolicy {
    return this._retention;
  }

  // ---------------------------------------------------------------------------
  // High-level operations
  // ---------------------------------------------------------------------------

  /** Read a memory entry by layer, scope, and key. */
  async read(
    layer: MemoryLayerType,
    scopeId: string,
    key: string,
  ): Promise<MemoryEntry | null> {
    const entry = await this._resolveLayer(layer).getByKey(scopeId, key);
    logger.debug({ layer, scopeId, key, found: entry != null }, 'Memory read');
    this._eventBus.emit('memory:read', { layer, scopeId, key, found: entry != null });
    return entry;
  }

  /** Write a memory entry to a specific layer. */
  async write(
    layer: MemoryLayerType,
    scopeId: string,
    key: string,
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<MemoryEntry> {
    const record = await this._resolveLayer(layer).upsert(
      scopeId,
      key,
      content,
      metadata,
    );
    logger.info(
      { layer, scopeId, key, id: record.id, version: record.version },
      'Memory written',
    );
    this._eventBus.emit('memory:written', {
      layer,
      scopeId,
      key,
      id: record.id,
      version: record.version,
    });
    return record;
  }

  /** Delete a memory entry by ID. */
  async delete(layer: MemoryLayerType, id: string): Promise<boolean> {
    const ok = await this._resolveLayer(layer).delete(id);
    logger.info({ layer, id, deleted: ok }, 'Memory deleted');
    this._eventBus.emit('memory:deleted', { layer, id, deleted: ok });
    return ok;
  }

  /** Query memory entries using the cross-layer query engine. */
  async query(filter: MemoryQuery): Promise<MemoryEntry[]> {
    return this._queryEngine.query(filter);
  }

  /** Semantic search across all vector-indexed memory. */
  async semanticSearch(
    queryText: string,
    topK: number = 10,
  ): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    return this._queryEngine.semanticSearch(queryText, topK);
  }

  /** Get consolidated context for an agent working on a project. */
  async getAgentContext(
    agentId: string,
    projectId: string,
  ): Promise<Record<string, MemoryEntry[]>> {
    const ctx = await this._queryEngine.getAgentContext(agentId, projectId);
    return {
      user: ctx.userMemory,
      project: ctx.projectMemory,
      agent: ctx.agentMemory,
      knowledge_base: ctx.knowledgeBase,
    };
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  /** Health check across all layers. */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    layers: Record<string, { count: number; healthy: boolean }>;
  }> {
    const layers: Record<string, { count: number; healthy: boolean }> = {};
    let allHealthy = true;

    const checks: Array<[string, () => Promise<number>]> = [
      ['user', async () => this._userMemory.count({})],
      ['project', async () => this._projectMemory.count({})],
      ['agent', async () => this._agentMemory.count({})],
      ['knowledge_base', async () => this._knowledgeBase.count({})],
      ['decision_history', async () =>
        (await this._store.query({ layer: 'decision_history' })).length],
    ];

    for (const [name, countFn] of checks) {
      try {
        const count = await countFn();
        layers[name] = { count, healthy: true };
      } catch {
        layers[name] = { count: 0, healthy: false };
        allHealthy = false;
      }
    }

    // Vector store
    try {
      const vCount = await this._vectorStore.count();
      layers['vector_store'] = { count: vCount, healthy: true };
    } catch {
      layers['vector_store'] = { count: 0, healthy: false };
      allHealthy = false;
    }

    const status = allHealthy ? 'healthy' : 'degraded';
    logger.info({ status, layers }, 'Health check complete');
    return { status, layers };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private _resolveLayer(
    layer: MemoryLayerType,
  ): MemoryStore {
    switch (layer) {
      case 'user':
        return this._userMemory;
      case 'project':
        return this._projectMemory;
      case 'agent':
        return this._agentMemory;
      case 'knowledge_base':
        return this._knowledgeBase;
      default:
        throw new Error(`Unsupported layer for store operations: ${layer}`);
    }
  }
}
