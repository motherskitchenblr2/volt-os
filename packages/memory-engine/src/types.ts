/**
 * @module types
 * Core type definitions for the VOLT OS Memory Engine.
 * Defines the 6-layer memory system types, stores, and configuration.
 */

// ---------------------------------------------------------------------------
// Memory Layer Types
// ---------------------------------------------------------------------------

/** Supported memory layer types in the 6-layer system. */
export type MemoryLayerType =
  | 'user'
  | 'project'
  | 'agent'
  | 'knowledge_base'
  | 'vector_store'
  | 'decision_history';

// ---------------------------------------------------------------------------
// Memory Entry
// ---------------------------------------------------------------------------

/** A single memory entry stored in any layer. */
export interface MemoryEntry {
  /** Unique identifier for the memory entry. */
  id: string;
  /** The memory layer this entry belongs to. */
  layer: MemoryLayerType;
  /** Scope identifier — userId, projectId, or agentId depending on layer. */
  scopeId: string;
  /** Semantic key for the entry (e.g. "user:preferences:theme"). */
  key: string;
  /** The content payload (string). */
  content: string;
  /** Optional embedding vector for semantic search. */
  embedding?: number[];
  /** Version number, incremented on each update. */
  version: number;
  /** Arbitrary metadata attached to the entry. */
  metadata: Record<string, unknown>;
  /** Timestamp when the entry was created. */
  createdAt: Date;
  /** Timestamp when the entry was last updated. */
  updatedAt: Date;
  /** Optional time-to-live in milliseconds. Entry expires after this period. */
  ttlMs?: number;
}

// ---------------------------------------------------------------------------
// Memory Query
// ---------------------------------------------------------------------------

/** Filter / query descriptor for memory lookups. */
export interface MemoryQuery {
  /** Filter by memory layer. */
  layer?: MemoryLayerType;
  /** Filter by scope (userId, projectId, agentId). */
  scopeId?: string;
  /** Full-text / key substring filter. */
  text?: string;
  /** Exact key match. */
  key?: string;
  /** Embedding for vector similarity search. */
  embedding?: number[];
  /** Minimum similarity threshold for embedding search. */
  similarityThreshold?: number;
  /** Max number of results. */
  limit?: number;
  /** Offset for pagination. */
  offset?: number;
}

// ---------------------------------------------------------------------------
// Store Interfaces
// ---------------------------------------------------------------------------

/** Generic memory store for key/value-style layers. */
export interface MemoryStore {
  insert(
    entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<MemoryEntry>;
  upsert(
    scopeId: string,
    key: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<MemoryEntry>;
  getById(id: string): Promise<MemoryEntry | null>;
  getByKey(scopeId: string, key: string): Promise<MemoryEntry | null>;
  query(filter: MemoryQuery): Promise<MemoryEntry[]>;
  delete(id: string): Promise<boolean>;
  count(filter: {
    layer?: MemoryLayerType;
    scopeId?: string;
  }): Promise<number>;
}

/** Vector store for embedding-based similarity search. */
export interface VectorStore {
  insert(
    id: string,
    embedding: number[],
    metadata: Record<string, unknown>,
  ): Promise<void>;
  search(
    embedding: number[],
    topK: number,
    threshold: number,
  ): Promise<
    Array<{ id: string; score: number; metadata: Record<string, unknown> }>
  >;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
}

// ---------------------------------------------------------------------------
// Decision Record
// ---------------------------------------------------------------------------

/** An immutable, hash-chained decision record. */
export interface DecisionRecord {
  /** Unique decision identifier. */
  id: string;
  /** Context in which the decision was made. */
  context: string;
  /** The decision that was taken. */
  decision: string;
  /** Rationale behind the decision. */
  rationale: string;
  /** Alternatives that were considered. */
  alternatives: string[];
  /** Observed outcome of the decision. */
  outcome: string;
  /** ID of the actor who made the decision. */
  actorId: string;
  /** Timestamp of the decision. */
  timestamp: Date;
  /** Hash of the previous decision in the chain. */
  previousHash: string;
  /** Hash of this decision record. */
  hash: string;
}

// ---------------------------------------------------------------------------
// Memory Isolation Rules
// ---------------------------------------------------------------------------

/** Describes which layers an agent can access. */
export interface AccessRule {
  /** The agent this rule applies to (or '*' for all agents). */
  agentId: string;
  /** Layers the agent can access. */
  layers: MemoryLayerType[];
  /** Optional scope-specific access. If omitted, any scope within the layer is fine. */
  allowedScopeIds?: string[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration for the Memory Engine and its layers. */
export interface MemoryEngineConfig {
  userMemory: {
    /** Default TTL for user memory entries (ms). Undefined = no TTL. */
    defaultTtlMs?: number;
    /** Maximum size in MB for user memory. */
    maxSizeMB: number;
  };
  projectMemory: {
    /** Default TTL for project memory entries (ms). Undefined = no TTL. */
    defaultTtlMs?: number;
    /** Maximum size in MB for project memory. */
    maxSizeMB: number;
  };
  agentMemory: {
    /** TTL for working-memory entries (ms). */
    workingMemoryTtlMs: number;
    /** Maximum size in MB for agent memory. */
    maxSizeMB: number;
  };
  knowledgeBase: {
    /** Maximum size in MB for knowledge base. */
    maxSizeMB: number;
  };
  vectorStore: {
    /** Dimensionality of embedding vectors. */
    dimensions: number;
    /** Default similarity threshold for vector searches. */
    similarityThreshold: number;
  };
  decisionHistory: {
    /** If true, decision records cannot be modified or deleted. */
    immutable: boolean;
  };
}

// ---------------------------------------------------------------------------
// EventBus Interface (minimal)
// ---------------------------------------------------------------------------

/** Minimal EventBus interface used by the memory engine. */
export interface EventBus {
  emit(event: string, data: Record<string, unknown>): void;
  on(
    event: string,
    handler: (data: Record<string, unknown>) => void,
  ): void;
}
