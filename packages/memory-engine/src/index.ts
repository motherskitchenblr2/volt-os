/**
 * @module @volt-os/memory-engine
 * 6-layer memory system for VOLT OS.
 *
 * Layers:
 *  - User Memory — per-user preferences, history, context
 *  - Project Memory — per-project decisions, constraints, progress
 *  - Agent Memory — per-agent working memory, learned patterns
 *  - Knowledge Base — shared reference material, documentation
 *  - Semantic Memory — vector-indexed conceptual associations
 *  - Decision History — append-only audit trail of all decisions
 *
 * @packageDocumentation
 */

// Types
export type {
  MemoryLayerType,
  MemoryEntry,
  MemoryQuery,
  MemoryStore,
  VectorStore,
  DecisionRecord,
  AccessRule,
  MemoryEngineConfig,
  EventBus,
} from './types.js';

// Layers
export { UserMemoryLayer } from './layers/user-memory.js';
export type { UserMemoryConfig } from './layers/user-memory.js';
export { ProjectMemoryLayer } from './layers/project-memory.js';
export type { ProjectMemoryConfig } from './layers/project-memory.js';
export { AgentMemoryLayer } from './layers/agent-memory.js';
export type { AgentMemoryConfig } from './layers/agent-memory.js';
export { KnowledgeBaseLayer } from './layers/knowledge-base.js';
export type { KnowledgeBaseConfig } from './layers/knowledge-base.js';
export { VectorStoreLayer } from './layers/vector-store.js';
export type { VectorStoreLayerConfig, SearchResult } from './layers/vector-store.js';
// Alias for backward compat
export { VectorStoreLayer as VectorIndex } from './layers/vector-store.js';
export { DecisionHistoryLayer } from './layers/decision-history.js';

// In-memory implementations (for dev/testing)
export {
  InMemoryStore,
  InMemoryVectorStore,
  cosineSimilarity,
} from './layers/in-memory-store.js';

// Query engine
export { MemoryQueryEngine } from './query.js';
export type { MemoryQueryEngineOptions } from './query.js';

// Isolation
export { MemoryIsolation } from './isolation.js';

// Retention
export { RetentionPolicy } from './retention.js';
export type { RetentionPolicyConfig } from './retention.js';

// Engine
export { MemoryEngine } from './engine.js';
export type { MemoryEngineOptions } from './engine.js';
