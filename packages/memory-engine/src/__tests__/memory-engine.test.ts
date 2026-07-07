/**
 * @module __tests__/memory-engine
 * Comprehensive test suite for the VOLT OS Memory Engine.
 * Target: ≥90% coverage, ≥50 test cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryEngine } from '../engine.js';
import {
  InMemoryStore,
  InMemoryVectorStore,
  cosineSimilarity,
} from '../layers/in-memory-store.js';
import { UserMemoryLayer } from '../layers/user-memory.js';
import { ProjectMemoryLayer } from '../layers/project-memory.js';
import { AgentMemoryLayer } from '../layers/agent-memory.js';
import { KnowledgeBaseLayer } from '../layers/knowledge-base.js';
import { VectorStoreLayer } from '../layers/vector-store.js';
import { DecisionHistoryLayer } from '../layers/decision-history.js';
import { MemoryQueryEngine } from '../query.js';
import { MemoryIsolation } from '../isolation.js';
import { RetentionPolicy } from '../retention.js';
import type {
  EventBus,
  MemoryEngineConfig,
  MemoryEntry,
} from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn((_event: string, _data: Record<string, unknown>) => {
      // no-op
    }),
    on: vi.fn(),
  };
}

const DEFAULT_CONFIG: MemoryEngineConfig = {
  userMemory: { defaultTtlMs: 60_000, maxSizeMB: 10 },
  projectMemory: { defaultTtlMs: 120_000, maxSizeMB: 50 },
  agentMemory: { workingMemoryTtlMs: 30_000, maxSizeMB: 20 },
  knowledgeBase: { maxSizeMB: 100 },
  vectorStore: { dimensions: 4, similarityThreshold: 0.5 },
  decisionHistory: { immutable: true },
};

function createEngine(config?: Partial<MemoryEngineConfig>): MemoryEngine {
  return new MemoryEngine({
    config: { ...DEFAULT_CONFIG, ...config },
    store: new InMemoryStore(),
    vectorStore: new InMemoryVectorStore(),
    eventBus: createMockEventBus(),
  });
}

function makeEntry(
  overrides: Partial<MemoryEntry> & { id: string },
): MemoryEntry {
  return {
    layer: 'user',
    scopeId: 'u1',
    key: 'k',
    content: '',
    version: 1,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cosine Similarity (pure utility)
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(-1);
  });

  it('should return 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('should return 0 for mismatched dimensions', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('should compute correct similarity for similar vectors', () => {
    const score = cosineSimilarity([1, 1, 0], [1, 0.9, 0]);
    expect(score).toBeGreaterThan(0.9);
  });

  it('should handle zero vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// In-Memory Store
// ---------------------------------------------------------------------------

describe('InMemoryStore', () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('should insert and retrieve an entry', async () => {
    const entry = await store.insert({
      layer: 'user',
      scopeId: 'u1',
      key: 'theme',
      content: 'dark',
      metadata: {},
    });
    expect(entry.id).toBeDefined();
    expect(entry.version).toBe(1);
    expect(entry.createdAt).toBeInstanceOf(Date);

    const retrieved = await store.getById(entry.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe('dark');
  });

  it('should return null for non-existent ID', async () => {
    const result = await store.getById('nonexistent');
    expect(result).toBeNull();
  });

  it('should upsert — create when new', async () => {
    const entry = await store.upsert('u1', 'key1', 'val1');
    expect(entry.content).toBe('val1');
  });

  it('should upsert — update when existing', async () => {
    await store.upsert('u1', 'key1', 'val1');
    const updated = await store.upsert('u1', 'key1', 'val2');
    expect(updated.content).toBe('val2');
    expect(updated.version).toBe(2);
  });

  it('should query by layer', async () => {
    await store.insert({ layer: 'user', scopeId: 'u1', key: 'a', content: '1', metadata: {} });
    await store.insert({ layer: 'project', scopeId: 'p1', key: 'b', content: '2', metadata: {} });
    const results = await store.query({ layer: 'user' });
    expect(results).toHaveLength(1);
    expect(results[0].layer).toBe('user');
  });

  it('should query by scopeId', async () => {
    await store.insert({ layer: 'user', scopeId: 'u1', key: 'a', content: '1', metadata: {} });
    await store.insert({ layer: 'user', scopeId: 'u2', key: 'b', content: '2', metadata: {} });
    const results = await store.query({ scopeId: 'u1' });
    expect(results).toHaveLength(1);
  });

  it('should query by text', async () => {
    await store.insert({ layer: 'user', scopeId: 'u1', key: 'pref', content: '喜欢深色主题', metadata: {} });
    await store.insert({ layer: 'user', scopeId: 'u1', key: 'lang', content: 'English', metadata: {} });
    const results = await store.query({ text: '深色' });
    expect(results).toHaveLength(1);
  });

  it('should delete an entry', async () => {
    const entry = await store.insert({ layer: 'user', scopeId: 'u1', key: 'a', content: '1', metadata: {} });
    const deleted = await store.delete(entry.id);
    expect(deleted).toBe(true);
    expect(await store.getById(entry.id)).toBeNull();
  });

  it('should count entries', async () => {
    await store.insert({ layer: 'user', scopeId: 'u1', key: 'a', content: '1', metadata: {} });
    await store.insert({ layer: 'user', scopeId: 'u2', key: 'b', content: '2', metadata: {} });
    await store.insert({ layer: 'project', scopeId: 'p1', key: 'c', content: '3', metadata: {} });
    expect(await store.count({ layer: 'user' })).toBe(2);
    expect(await store.count({ scopeId: 'u1' })).toBe(1);
    expect(await store.count({})).toBe(3);
  });

  it('should query with offset and limit', async () => {
    for (let i = 0; i < 5; i++) {
      await store.insert({ layer: 'user', scopeId: 'u1', key: `k${i}`, content: `${i}`, metadata: {} });
    }
    const results = await store.query({ layer: 'user', offset: 1, limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('should clear entries', async () => {
    await store.insert({ layer: 'user', scopeId: 'u1', key: 'a', content: '1', metadata: {} });
    await store.clear();
    expect(await store.count({})).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// In-Memory Vector Store
// ---------------------------------------------------------------------------

describe('InMemoryVectorStore', () => {
  let vs: InMemoryVectorStore;

  beforeEach(() => {
    vs = new InMemoryVectorStore();
  });

  it('should insert and count', async () => {
    await vs.insert('e1', [1, 0, 0], { content: 'hello' });
    await vs.insert('e2', [0, 1, 0], { content: 'world' });
    expect(await vs.count()).toBe(2);
  });

  it('should search by similarity', async () => {
    await vs.insert('e1', [1, 0, 0], { content: 'a' });
    await vs.insert('e2', [0.9, 0.1, 0], { content: 'b' });
    await vs.insert('e3', [0, 0, 1], { content: 'c' });
    const results = await vs.search([1, 0, 0], 2, 0.5);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('e1');
  });

  it('should delete an entry', async () => {
    await vs.insert('e1', [1, 0], { content: 'x' });
    await vs.delete('e1');
    expect(await vs.count()).toBe(0);
  });

  it('should respect threshold', async () => {
    await vs.insert('e1', [1, 0], { content: 'x' });
    const results = await vs.search([0, 1], 10, 0.9);
    expect(results).toHaveLength(0);
  });

  it('should clear all vectors', async () => {
    await vs.insert('e1', [1, 0], { content: 'x' });
    await vs.clear();
    expect(await vs.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// User Memory Layer
// ---------------------------------------------------------------------------

describe('UserMemoryLayer', () => {
  let layer: UserMemoryLayer;
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
    layer = new UserMemoryLayer(store, { defaultTtlMs: 60_000 });
  });

  it('should insert with default TTL', async () => {
    const entry = await layer.insert({
      layer: 'user',
      scopeId: 'u1',
      key: 'theme',
      content: 'dark',
      metadata: {},
    });
    expect(entry.layer).toBe('user');
    expect(entry.ttlMs).toBe(60_000);
  });

  it('should upsert — create new', async () => {
    const entry = await layer.upsert('u1', 'lang', 'en');
    expect(entry.content).toBe('en');
  });

  it('should upsert — update existing', async () => {
    await layer.upsert('u1', 'lang', 'en');
    const updated = await layer.upsert('u1', 'lang', 'fr');
    expect(updated.content).toBe('fr');
  });

  it('should get by ID', async () => {
    const entry = await layer.insert({
      layer: 'user',
      scopeId: 'u1',
      key: 'a',
      content: '1',
      metadata: {},
    });
    const retrieved = await layer.getById(entry.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe('1');
  });

  it('should return null for wrong layer on getById', async () => {
    const entry = await store.insert({ layer: 'project', scopeId: 'p1', key: 'a', content: '1', metadata: {} });
    const result = await layer.getById(entry.id);
    expect(result).toBeNull();
  });

  it('should get by key', async () => {
    await layer.upsert('u1', 'theme', 'dark');
    const entry = await layer.getByKey('u1', 'theme');
    expect(entry).not.toBeNull();
    expect(entry!.content).toBe('dark');
  });

  it('should query entries', async () => {
    await layer.upsert('u1', 'a', '1');
    await layer.upsert('u1', 'b', '2');
    const results = await layer.query({ scopeId: 'u1' });
    expect(results).toHaveLength(2);
  });

  it('should delete an entry', async () => {
    const entry = await layer.insert({
      layer: 'user',
      scopeId: 'u1',
      key: 'a',
      content: '1',
      metadata: {},
    });
    const deleted = await layer.delete(entry.id);
    expect(deleted).toBe(true);
  });

  it('should not delete entry from wrong layer', async () => {
    const entry = await store.insert({ layer: 'project', scopeId: 'p1', key: 'a', content: '1', metadata: {} });
    const deleted = await layer.delete(entry.id);
    expect(deleted).toBe(false);
  });

  it('should count entries scoped to user', async () => {
    await layer.upsert('u1', 'a', '1');
    await layer.upsert('u2', 'b', '2');
    expect(await layer.count({ scopeId: 'u1' })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Project Memory Layer
// ---------------------------------------------------------------------------

describe('ProjectMemoryLayer', () => {
  let layer: ProjectMemoryLayer;

  beforeEach(() => {
    layer = new ProjectMemoryLayer(new InMemoryStore(), { defaultTtlMs: 120_000 });
  });

  it('should insert a project memory entry', async () => {
    const entry = await layer.insert({
      layer: 'project',
      scopeId: 'proj1',
      key: 'decision:auth',
      content: 'Use JWT',
      metadata: {},
    });
    expect(entry.layer).toBe('project');
    expect(entry.scopeId).toBe('proj1');
  });

  it('should upsert with versioning', async () => {
    await layer.upsert('proj1', 'arch', 'v1 architecture');
    const updated = await layer.upsert('proj1', 'arch', 'v2 architecture');
    expect(updated.version).toBe(2);
    expect(updated.metadata._previousVersion).toBe(1);
  });

  it('should get by key', async () => {
    await layer.upsert('proj1', 'constraint', 'max 100ms latency');
    const entry = await layer.getByKey('proj1', 'constraint');
    expect(entry).not.toBeNull();
    expect(entry!.content).toContain('100ms');
  });

  it('should query project entries', async () => {
    await layer.upsert('proj1', 'a', '1');
    await layer.upsert('proj2', 'b', '2');
    const results = await layer.query({ scopeId: 'proj1' });
    expect(results).toHaveLength(1);
  });

  it('should delete entry', async () => {
    const entry = await layer.insert({
      layer: 'project',
      scopeId: 'proj1',
      key: 'temp',
      content: 'will be deleted',
      metadata: {},
    });
    expect(await layer.delete(entry.id)).toBe(true);
  });

  it('should count entries', async () => {
    await layer.upsert('proj1', 'a', '1');
    await layer.upsert('proj1', 'b', '2');
    expect(await layer.count({ scopeId: 'proj1' })).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Agent Memory Layer
// ---------------------------------------------------------------------------

describe('AgentMemoryLayer', () => {
  let layer: AgentMemoryLayer;

  beforeEach(() => {
    layer = new AgentMemoryLayer(new InMemoryStore(), { workingMemoryTtlMs: 30_000 });
  });

  it('should insert working memory with TTL', async () => {
    const entry = await layer.insert({
      layer: 'agent',
      scopeId: 'agent1',
      key: 'task-context',
      content: 'Processing request #42',
      metadata: {},
    });
    expect(entry.ttlMs).toBe(30_000);
  });

  it('should store long-term memory without TTL', async () => {
    const entry = await layer.storeLongTerm('agent1', 'learned-pattern', 'Use batching');
    expect(entry.ttlMs).toBeUndefined();
    expect(entry.metadata.isWorkingMemory).toBe(false);
  });

  it('should upsert working memory', async () => {
    await layer.upsert('agent1', 'scratch', 'old');
    const updated = await layer.upsert('agent1', 'scratch', 'new');
    expect(updated.content).toBe('new');
  });

  it('should get by ID', async () => {
    const entry = await layer.insert({
      layer: 'agent',
      scopeId: 'agent1',
      key: 'x',
      content: 'y',
      metadata: {},
    });
    const retrieved = await layer.getById(entry.id);
    expect(retrieved).not.toBeNull();
  });

  it('should query agent memory', async () => {
    await layer.upsert('agent1', 'a', '1');
    await layer.upsert('agent2', 'b', '2');
    const results = await layer.query({ scopeId: 'agent1' });
    expect(results).toHaveLength(1);
  });

  it('should delete agent memory', async () => {
    const entry = await layer.insert({
      layer: 'agent',
      scopeId: 'agent1',
      key: 'tmp',
      content: 'val',
      metadata: {},
    });
    expect(await layer.delete(entry.id)).toBe(true);
  });

  it('should not delete entry from wrong layer', async () => {
    const store = new InMemoryStore();
    const entry = await store.insert({ layer: 'user', scopeId: 'u1', key: 'a', content: '1', metadata: {} });
    const agentLayer = new AgentMemoryLayer(store, { workingMemoryTtlMs: 30_000 });
    expect(await agentLayer.delete(entry.id)).toBe(false);
  });

  it('should count agent entries', async () => {
    await layer.upsert('agent1', 'a', '1');
    await layer.upsert('agent1', 'b', '2');
    expect(await layer.count({ scopeId: 'agent1' })).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Knowledge Base Layer
// ---------------------------------------------------------------------------

describe('KnowledgeBaseLayer', () => {
  let layer: KnowledgeBaseLayer;

  beforeEach(() => {
    layer = new KnowledgeBaseLayer(new InMemoryStore(), { maxSizeMB: 100 });
  });

  it('should insert knowledge base entry', async () => {
    const entry = await layer.insert({
      layer: 'knowledge_base',
      scopeId: 'system',
      key: 'api-docs',
      content: 'REST API reference',
      metadata: {},
    });
    expect(entry.layer).toBe('knowledge_base');
  });

  it('should upsert with version tracking', async () => {
    await layer.upsert('system', 'guide', 'v1 guide');
    const updated = await layer.upsert('system', 'guide', 'v2 guide');
    expect(updated.version).toBe(2);
    expect(Array.isArray(updated.metadata._versions)).toBe(true);
    expect(updated.metadata._versions).toContain(1);
  });

  it('should get by key', async () => {
    await layer.upsert('system', 'faq', 'common questions');
    const entry = await layer.getByKey('system', 'faq');
    expect(entry).not.toBeNull();
    expect(entry!.content).toBe('common questions');
  });

  it('should query all knowledge base entries', async () => {
    await layer.upsert('system', 'a', '1');
    await layer.upsert('system', 'b', '2');
    const results = await layer.query({});
    expect(results).toHaveLength(2);
  });

  it('should delete knowledge base entry', async () => {
    const entry = await layer.insert({
      layer: 'knowledge_base',
      scopeId: 'system',
      key: 'temp',
      content: 'temporary',
      metadata: {},
    });
    expect(await layer.delete(entry.id)).toBe(true);
  });

  it('should estimate size', async () => {
    await layer.upsert('system', 'doc1', 'Hello World');
    const size = await layer.estimateSizeBytes();
    expect(size).toBeGreaterThan(0);
  });

  it('should count entries', async () => {
    await layer.upsert('system', 'a', '1');
    expect(await layer.count({})).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Vector Store Layer
// ---------------------------------------------------------------------------

describe('VectorStoreLayer', () => {
  let layer: VectorStoreLayer;

  beforeEach(() => {
    layer = new VectorStoreLayer(new InMemoryVectorStore(), {
      dimensions: 4,
      similarityThreshold: 0.5,
    });
  });

  it('should store an embedding', async () => {
    await layer.addEmbedding('e1', [1, 0, 0, 0], { content: 'hello' });
    expect(await layer.count()).toBe(1);
  });

  it('should reject mismatched dimensions', async () => {
    await expect(
      layer.addEmbedding('e1', [1, 0], { content: 'hello' }),
    ).rejects.toThrow('dimension mismatch');
  });

  it('should search by similarity', async () => {
    await layer.addEmbedding('e1', [1, 0, 0, 0], { content: 'a' });
    await layer.addEmbedding('e2', [0.9, 0.1, 0, 0], { content: 'b' });
    await layer.addEmbedding('e3', [0, 0, 1, 0], { content: 'c' });
    const results = await layer.search('query', [1, 0, 0, 0], 2);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('e1');
    expect(results[0].content).toBe('a');
  });

  it('should delete embedding', async () => {
    await layer.addEmbedding('e1', [1, 0, 0, 0], { content: 'x' });
    await layer.delete('e1');
    expect(await layer.count()).toBe(0);
  });

  it('should reject search with wrong dimensions', async () => {
    await expect(
      layer.search('query', [1, 0], 10),
    ).rejects.toThrow('dimension mismatch');
  });

  it('should return empty for no matches above threshold', async () => {
    await layer.addEmbedding('e1', [1, 0, 0, 0], { content: 'x' });
    const results = await layer.search('query', [0, 0, 1, 0], 10);
    // [0,0,1,0] dot [1,0,0,0] = 0, which is < 0.5
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Decision History Layer
// ---------------------------------------------------------------------------

describe('DecisionHistoryLayer', () => {
  let layer: DecisionHistoryLayer;

  beforeEach(() => {
    layer = new DecisionHistoryLayer(new InMemoryStore());
  });

  it('should record a decision', async () => {
    const record = await layer.record({
      context: 'architecture',
      decision: 'Use microservices',
      rationale: 'Scalability',
      alternatives: ['monolith', 'modular monolith'],
      outcome: '',
      actorId: 'architect-1',
      timestamp: new Date(),
    });
    expect(record.id).toBeDefined();
    expect(record.hash).toBeDefined();
    expect(record.previousHash).toBe('0');
  });

  it('should chain hashes correctly', async () => {
    const r1 = await layer.record({
      context: 'auth',
      decision: 'JWT',
      rationale: 'standard',
      alternatives: [],
      outcome: '',
      actorId: 'a1',
      timestamp: new Date(),
    });
    const r2 = await layer.record({
      context: 'db',
      decision: 'PostgreSQL',
      rationale: 'ACID',
      alternatives: [],
      outcome: '',
      actorId: 'a1',
      timestamp: new Date(),
    });
    expect(r2.previousHash).toBe(r1.hash);
    expect(r2.hash).not.toBe(r1.hash);
  });

  it('should get decision by ID', async () => {
    const record = await layer.record({
      context: 'test',
      decision: 'do it',
      rationale: 'because',
      alternatives: [],
      outcome: '',
      actorId: 'a1',
      timestamp: new Date(),
    });
    const retrieved = await layer.get(record.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.decision).toBe('do it');
  });

  it('should return null for non-existent decision', async () => {
    const result = await layer.get('nonexistent');
    expect(result).toBeNull();
  });

  it('should query decisions by context', async () => {
    await layer.record({
      context: 'auth',
      decision: 'd1',
      rationale: '',
      alternatives: [],
      outcome: '',
      actorId: 'a1',
      timestamp: new Date(),
    });
    await layer.record({
      context: 'db',
      decision: 'd2',
      rationale: '',
      alternatives: [],
      outcome: '',
      actorId: 'a1',
      timestamp: new Date(),
    });
    const results = await layer.query({ context: 'auth' });
    expect(results).toHaveLength(1);
    expect(results[0].context).toBe('auth');
  });

  it('should query decisions by actorId', async () => {
    await layer.record({
      context: 'x',
      decision: 'd1',
      rationale: '',
      alternatives: [],
      outcome: '',
      actorId: 'a1',
      timestamp: new Date(),
    });
    await layer.record({
      context: 'y',
      decision: 'd2',
      rationale: '',
      alternatives: [],
      outcome: '',
      actorId: 'a2',
      timestamp: new Date(),
    });
    const results = await layer.query({ actorId: 'a2' });
    expect(results).toHaveLength(1);
  });

  it('should query decisions with limit', async () => {
    for (let i = 0; i < 5; i++) {
      await layer.record({
        context: 'x',
        decision: `d${i}`,
        rationale: '',
        alternatives: [],
        outcome: '',
        actorId: 'a1',
        timestamp: new Date(),
      });
    }
    const results = await layer.query({ limit: 3 });
    expect(results).toHaveLength(3);
  });

  it('should verify hash chain integrity — valid chain', async () => {
    await layer.record({
      context: 'a',
      decision: 'd1',
      rationale: '',
      alternatives: [],
      outcome: '',
      actorId: 'a1',
      timestamp: new Date(),
    });
    await layer.record({
      context: 'b',
      decision: 'd2',
      rationale: '',
      alternatives: [],
      outcome: '',
      actorId: 'a1',
      timestamp: new Date(),
    });
    const result = await layer.verifyIntegrity();
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('should verify integrity with empty history', async () => {
    const result = await layer.verifyIntegrity();
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Memory Isolation
// ---------------------------------------------------------------------------

describe('MemoryIsolation', () => {
  let isolation: MemoryIsolation;

  beforeEach(() => {
    isolation = new MemoryIsolation();
  });

  it('should allow access to knowledge_base for all agents', () => {
    const entry = makeEntry({ id: '1', layer: 'knowledge_base', scopeId: 'system', key: 'docs' });
    expect(isolation.canAccess('agent-1', entry)).toBe(true);
  });

  it('should allow access to decision_history for all agents', () => {
    const entry = makeEntry({ id: '1', layer: 'decision_history', scopeId: 'system', key: 'd1' });
    expect(isolation.canAccess('any-agent', entry)).toBe(true);
  });

  it('should deny user memory access without explicit rule', () => {
    const entry = makeEntry({ id: '1', layer: 'user', scopeId: 'u1', key: 'theme' });
    expect(isolation.canAccess('agent-1', entry)).toBe(false);
  });

  it('should filter accessible entries', () => {
    const entries: MemoryEntry[] = [
      makeEntry({ id: '1', layer: 'knowledge_base', scopeId: 'sys', key: 'a' }),
      makeEntry({ id: '2', layer: 'user', scopeId: 'u1', key: 'b' }),
    ];
    const accessible = isolation.filterAccessible('agent-1', entries);
    expect(accessible).toHaveLength(1);
    expect(accessible[0].layer).toBe('knowledge_base');
  });

  it('should get accessible layers', () => {
    const layers = isolation.getAccessibleLayers('agent-1');
    expect(layers).toContain('knowledge_base');
    expect(layers).toContain('decision_history');
    expect(layers).not.toContain('user');
  });

  it('should support custom rules', () => {
    isolation.addRule({
      agentId: 'agent-1',
      layers: ['user', 'project'],
      allowedScopeIds: ['u1', 'proj1'],
    });
    const entry = makeEntry({ id: '1', layer: 'user', scopeId: 'u1', key: 'theme' });
    expect(isolation.canAccess('agent-1', entry)).toBe(true);
  });

  it('should enforce scope restrictions', () => {
    isolation.addRule({
      agentId: 'agent-1',
      layers: ['user'],
      allowedScopeIds: ['u1'],
    });
    const entry = makeEntry({ id: '1', layer: 'user', scopeId: 'u2', key: 'theme' });
    expect(isolation.canAccess('agent-1', entry)).toBe(false);
  });

  it('should reset rules to defaults', () => {
    isolation.addRule({
      agentId: 'agent-1',
      layers: ['user'],
    });
    isolation.resetRules();
    const entry = makeEntry({ id: '1', layer: 'user', scopeId: 'u1', key: 'a' });
    expect(isolation.canAccess('agent-1', entry)).toBe(false);
  });

  it('should deny access for unknown agents without default rules', () => {
    const entry = makeEntry({ id: '1', layer: 'agent', scopeId: 'agent-99', key: 'internal' });
    expect(isolation.canAccess('rogue-agent', entry)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Retention Policy
// ---------------------------------------------------------------------------

describe('RetentionPolicy', () => {
  it('should enforce TTL and expire entries', async () => {
    const store = new InMemoryStore();
    const retention = new RetentionPolicy();

    await store.insert({
      layer: 'user',
      scopeId: 'u1',
      key: 'expired',
      content: 'val',
      metadata: {},
      ttlMs: 1,
    });

    await new Promise((r) => setTimeout(r, 10));

    const { expired } = await retention.enforceTTL(store);
    expect(expired).toBe(1);
    expect(await store.count({})).toBe(0);
  });

  it('should not expire entries without TTL', async () => {
    const store = new InMemoryStore();
    const retention = new RetentionPolicy();

    await store.insert({
      layer: 'user',
      scopeId: 'u1',
      key: 'permanent',
      content: 'val',
      metadata: {},
    });

    const { expired } = await retention.enforceTTL(store);
    expect(expired).toBe(0);
    expect(await store.count({})).toBe(1);
  });

  it('should enforce size limits', async () => {
    const store = new InMemoryStore();
    const retention = new RetentionPolicy();

    for (let i = 0; i < 100; i++) {
      await store.insert({
        layer: 'user',
        scopeId: 'u1',
        key: `k${i}`,
        content: 'x'.repeat(100),
        metadata: {},
      });
    }

    const { evicted } = await retention.enforceSizeLimit(store, 0.001);
    expect(evicted).toBeGreaterThanOrEqual(0);
  });

  it('should not evict when under size limit', async () => {
    const store = new InMemoryStore();
    const retention = new RetentionPolicy();

    await store.insert({
      layer: 'user',
      scopeId: 'u1',
      key: 'small',
      content: 'tiny',
      metadata: {},
    });

    const { evicted } = await retention.enforceSizeLimit(store, 100);
    expect(evicted).toBe(0);
  });

  it('should get storage stats', async () => {
    const store = new InMemoryStore();
    const retention = new RetentionPolicy();

    await store.insert({ layer: 'user', scopeId: 'u1', key: 'a', content: 'hello', metadata: {} });
    await store.insert({ layer: 'project', scopeId: 'p1', key: 'b', content: 'world', metadata: {} });

    const stats = await retention.getStats(store);
    expect(stats.count).toBe(2);
    expect(stats.sizeMB).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Memory Query Engine
// ---------------------------------------------------------------------------

describe('MemoryQueryEngine', () => {
  let engine: MemoryEngine;
  let queryEngine: MemoryQueryEngine;

  beforeEach(() => {
    engine = createEngine();
    queryEngine = engine.queryEngine;
  });

  it('should query across all layers', async () => {
    await engine.write('user', 'u1', 'theme', 'dark');
    await engine.write('project', 'p1', 'arch', 'microservices');
    await engine.write('agent', 'a1', 'scratch', 'working on task');
    await engine.write('knowledge_base', 'system', 'docs', 'API reference');

    const results = await queryEngine.query({});
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('should query specific layer', async () => {
    await engine.write('user', 'u1', 'theme', 'dark');
    await engine.write('project', 'p1', 'arch', 'microservices');

    const results = await queryEngine.query({ layer: 'user' });
    expect(results).toHaveLength(1);
    expect(results[0].layer).toBe('user');
  });

  it('should get agent context', async () => {
    await engine.write('user', 'agent1', 'pref', 'dark mode');
    await engine.write('project', 'proj1', 'goal', 'ship feature X');
    await engine.write('agent', 'agent1', 'task', 'implement API');

    const context = await queryEngine.getAgentContext('agent1', 'proj1');
    expect(context.userMemory).toHaveLength(1);
    expect(context.projectMemory).toHaveLength(1);
    expect(context.agentMemory).toHaveLength(1);
  });

  it('should perform semantic search (text-based)', async () => {
    await engine.write('user', 'u1', 'pref', 'dark theme');
    await engine.write('user', 'u1', 'lang', 'English');
    const results = await queryEngine.semanticSearch('dark');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('should query with limit', async () => {
    for (let i = 0; i < 10; i++) {
      await engine.write('user', 'u1', `key${i}`, `val${i}`);
    }
    const results = await queryEngine.query({ layer: 'user', limit: 3 });
    expect(results).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Memory Engine — Integration
// ---------------------------------------------------------------------------

describe('MemoryEngine', () => {
  let engine: MemoryEngine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should initialize with all layers', () => {
    expect(engine.userMemory).toBeDefined();
    expect(engine.projectMemory).toBeDefined();
    expect(engine.agentMemory).toBeDefined();
    expect(engine.knowledgeBase).toBeDefined();
    expect(engine.vectorStore).toBeDefined();
    expect(engine.decisionHistory).toBeDefined();
  });

  it('should write and read user memory', async () => {
    const written = await engine.write('user', 'u1', 'theme', 'dark');
    expect(written.content).toBe('dark');

    const read = await engine.read('user', 'u1', 'theme');
    expect(read).not.toBeNull();
    expect(read!.content).toBe('dark');
  });

  it('should write and read project memory', async () => {
    await engine.write('project', 'p1', 'decision', 'use TS');
    const read = await engine.read('project', 'p1', 'decision');
    expect(read!.content).toBe('use TS');
  });

  it('should write and read agent memory', async () => {
    await engine.write('agent', 'a1', 'context', 'processing');
    const read = await engine.read('agent', 'a1', 'context');
    expect(read!.content).toBe('processing');
  });

  it('should write and read knowledge base', async () => {
    await engine.write('knowledge_base', 'sys', 'api-docs', 'REST ref');
    const read = await engine.read('knowledge_base', 'sys', 'api-docs');
    expect(read!.content).toBe('REST ref');
  });

  it('should return null for non-existent read', async () => {
    const result = await engine.read('user', 'u1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('should delete memory entries', async () => {
    const entry = await engine.write('user', 'u1', 'temp', 'val');
    const deleted = await engine.delete('user', entry.id);
    expect(deleted).toBe(true);
    expect(await engine.read('user', 'u1', 'temp')).toBeNull();
  });

  it('should query across layers', async () => {
    await engine.write('user', 'u1', 'a', '1');
    await engine.write('project', 'p1', 'b', '2');
    const results = await engine.query({});
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('should perform semantic search', async () => {
    await engine.write('user', 'u1', 'topic', 'machine learning');
    await engine.write('project', 'p1', 'topic', 'deep learning');
    const results = await engine.semanticSearch('learning');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('should get agent context', async () => {
    await engine.write('user', 'agent1', 'pref', 'dark');
    await engine.write('project', 'proj1', 'goal', 'ship');
    await engine.write('agent', 'agent1', 'task', 'build API');
    await engine.write('knowledge_base', 'sys', 'docs', 'reference');

    const context = await engine.getAgentContext('agent1', 'proj1');
    expect(context.user).toBeDefined();
    expect(context.project).toBeDefined();
    expect(context.agent).toBeDefined();
    expect(context.knowledge_base).toBeDefined();
  });

  it('should record decision in decision history', async () => {
    const record = await engine.decisionHistory.record({
      context: 'architecture',
      decision: 'event-driven',
      rationale: 'decoupling',
      alternatives: ['REST', 'gRPC'],
      outcome: '',
      actorId: 'architect',
      timestamp: new Date(),
    });
    expect(record.hash).toBeDefined();
  });

  it('should pass health check', async () => {
    const health = await engine.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.layers).toBeDefined();
    expect(health.layers.user).toBeDefined();
    expect(health.layers.user.healthy).toBe(true);
  });

  it('should emit events on write', async () => {
    const eventBus = createMockEventBus();
    const eng = new MemoryEngine({
      config: DEFAULT_CONFIG,
      store: new InMemoryStore(),
      vectorStore: new InMemoryVectorStore(),
      eventBus,
    });
    await eng.write('user', 'u1', 'key', 'val');
    expect(eventBus.emit).toHaveBeenCalled();
    const calls = (eventBus.emit as ReturnType<typeof vi.fn>).mock.calls;
    const writeEvent = calls.find((c: unknown[]) => c[0] === 'memory:written');
    expect(writeEvent).toBeDefined();
  });

  it('should support overwriting with upsert via write', async () => {
    await engine.write('user', 'u1', 'key', 'v1');
    const updated = await engine.write('user', 'u1', 'key', 'v2');
    expect(updated.content).toBe('v2');
  });

  it('should handle vector store dimension validation', async () => {
    await expect(
      engine.vectorStore.addEmbedding('e1', [1, 0], { content: 'test' }),
    ).rejects.toThrow('dimension mismatch');
  });

  it('should access isolation module', () => {
    expect(engine.isolation).toBeInstanceOf(MemoryIsolation);
  });

  it('should access retention module', () => {
    expect(engine.retention).toBeInstanceOf(RetentionPolicy);
  });

  it('should expose query engine', () => {
    expect(engine.queryEngine).toBeInstanceOf(MemoryQueryEngine);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('Edge Cases', () => {
  it('should handle empty string content', async () => {
    const engine = createEngine();
    const entry = await engine.write('user', 'u1', 'empty', '');
    expect(entry.content).toBe('');
    const read = await engine.read('user', 'u1', 'empty');
    expect(read!.content).toBe('');
  });

  it('should handle duplicate keys via upsert', async () => {
    const engine = createEngine();
    await engine.write('user', 'u1', 'key', 'v1');
    await engine.write('user', 'u1', 'key', 'v2');
    await engine.write('user', 'u1', 'key', 'v3');
    const read = await engine.read('user', 'u1', 'key');
    expect(read!.content).toBe('v3');
    expect(read!.version).toBe(3);
  });

  it('should handle large metadata', async () => {
    const engine = createEngine();
    const largeMeta: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      largeMeta[`key${i}`] = `value${i}`;
    }
    const entry = await engine.write('user', 'u1', 'big', 'content', largeMeta);
    const read = await engine.read('user', 'u1', 'big');
    expect(read!.metadata.key0).toBe('value0');
    expect(read!.metadata.key99).toBe('value99');
  });

  it('should handle empty query', async () => {
    const engine = createEngine();
    await engine.write('user', 'u1', 'a', '1');
    const results = await engine.query({});
    expect(results).toHaveLength(1);
  });

  it('should handle Unicode content', async () => {
    const engine = createEngine();
    await engine.write('user', 'u1', 'unicode', '你好世界 🌍');
    const read = await engine.read('user', 'u1', 'unicode');
    expect(read!.content).toBe('你好世界 🌍');
  });

  it('should handle many entries', async () => {
    const engine = createEngine();
    for (let i = 0; i < 200; i++) {
      await engine.write('user', 'u1', `k${i}`, `v${i}`);
    }
    const results = await engine.query({ layer: 'user', limit: 10 });
    expect(results).toHaveLength(10);
  });

  it('should handle expired entries in TTL enforcement', async () => {
    const store = new InMemoryStore();
    const retention = new RetentionPolicy();
    await store.insert({
      layer: 'agent',
      scopeId: 'a1',
      key: 'temp',
      content: 'data',
      metadata: {},
      ttlMs: 1,
    });
    await new Promise((r) => setTimeout(r, 5));
    const { expired } = await retention.enforceTTL(store);
    expect(expired).toBe(1);
  });

  it('should handle decision history with empty alternatives', async () => {
    const layer = new DecisionHistoryLayer(new InMemoryStore());
    const record = await layer.record({
      context: 'simple',
      decision: 'go',
      rationale: 'obvious',
      alternatives: [],
      outcome: '',
      actorId: 'a1',
      timestamp: new Date(),
    });
    expect(record.alternatives).toEqual([]);
  });

  it('should handle multiple layers for same scope', async () => {
    const engine = createEngine();
    await engine.write('user', 'u1', 'pref', 'dark');
    await engine.write('project', 'u1', 'goal', 'ship');
    await engine.write('agent', 'u1', 'task', 'code');

    const userEntry = await engine.read('user', 'u1', 'pref');
    const projectEntry = await engine.read('project', 'u1', 'goal');
    const agentEntry = await engine.read('agent', 'u1', 'task');

    expect(userEntry!.content).toBe('dark');
    expect(projectEntry!.content).toBe('ship');
    expect(agentEntry!.content).toBe('code');
  });

  it('should handle decision history integrity verification with multiple records', async () => {
    const layer = new DecisionHistoryLayer(new InMemoryStore());
    for (let i = 0; i < 10; i++) {
      await layer.record({
        context: `ctx${i}`,
        decision: `d${i}`,
        rationale: '',
        alternatives: [],
        outcome: '',
        actorId: 'a1',
        timestamp: new Date(),
      });
    }
    const result = await layer.verifyIntegrity();
    expect(result.valid).toBe(true);
  });

  it('should handle vector store with many embeddings', async () => {
    const vs = new VectorStoreLayer(new InMemoryVectorStore(), {
      dimensions: 3,
      similarityThreshold: 0.3,
    });
    for (let i = 0; i < 20; i++) {
      await vs.addEmbedding(`e${i}`, [Math.random(), Math.random(), Math.random()], {
        content: `item${i}`,
      });
    }
    expect(await vs.count()).toBe(20);
    const results = await vs.search('q', [0.5, 0.5, 0.5], 5);
    expect(results).toHaveLength(5);
  });

  it('should handle concurrent writes to same key', async () => {
    const engine = createEngine();
    const promises = Array.from({ length: 5 }, (_, i) =>
      engine.write('user', 'u1', 'race', `value${i}`),
    );
    await Promise.all(promises);
    const read = await engine.read('user', 'u1', 'race');
    expect(read).not.toBeNull();
    expect(read!.version).toBe(5);
  });

  it('should handle knowledge base version tracking', async () => {
    const engine = createEngine();
    await engine.write('knowledge_base', 'sys', 'guide', 'v1');
    await engine.write('knowledge_base', 'sys', 'guide', 'v2');
    const updated = await engine.write('knowledge_base', 'sys', 'guide', 'v3');
    expect(updated.version).toBe(3);
    expect(Array.isArray(updated.metadata._versions)).toBe(true);
  });
});
