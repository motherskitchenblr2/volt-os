/**
 * @module __tests__/pipeline
 * Comprehensive tests for the VOLT OS Pipeline Engine.
 * Covers DAG operations, state machine, execution, scheduling, approvals,
 * retry, rollback, context, metrics, and end-to-end pipeline lifecycle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DAG } from '../graph/dag.js';
import { getExecutionLayers } from '../graph/topological.js';
import { PipelineStateMachine, InvalidTransitionError } from '../state-machine.js';
import { ExecutionContext } from '../context.js';
import { TaskScheduler } from '../scheduler.js';
import { DependencyResolver } from '../resolver.js';
import { ApprovalManager } from '../approval.js';
import { RetryPolicyManager } from '../retry.js';
import { RollbackManager } from '../rollback.js';
import { PipelineMetrics } from '../metrics.js';
import { PipelineExecutor } from '../executor.js';
import { PipelineManager } from '../manager.js';
import type {
  EventBus,
  PipelineInstance,
  PipelineDefinition,
  TaskDefinition,
  TaskHandler,
} from '../types.js';
import { PipelineEvents } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock event bus that records all emitted events. */
function createMockEventBus(): EventBus & { events: Array<{ event: string; data: Record<string, unknown> }> } {
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  return {
    events,
    emit(event: string, data: Record<string, unknown>) {
      events.push({ event, data });
    },
    on(_event: string, _handler: (data: Record<string, unknown>) => void) {
      // no-op for tests
    },
    off(_event: string, _handler: (data: Record<string, unknown>) => void) {
      // no-op for tests
    },
  };
}

/** Create a simple pipeline definition for testing. */
function createSimpleDefinition(): PipelineDefinition {
  return {
    id: 'def-simple',
    name: 'Simple Pipeline',
    tasks: [
      { id: 'task-a', name: 'Task A', type: 'generic', dependencies: [], config: {} },
      { id: 'task-b', name: 'Task B', type: 'generic', dependencies: ['task-a'], config: {} },
      { id: 'task-c', name: 'Task C', type: 'generic', dependencies: ['task-a'], config: {} },
      { id: 'task-d', name: 'Task D', type: 'generic', dependencies: ['task-b', 'task-c'], config: {} },
    ],
    config: {},
  };
}

/** Create a linear pipeline definition. */
function createLinearDefinition(): PipelineDefinition {
  return {
    id: 'def-linear',
    name: 'Linear Pipeline',
    tasks: [
      { id: 't1', name: 'T1', type: 'generic', dependencies: [], config: {} },
      { id: 't2', name: 'T2', type: 'generic', dependencies: ['t1'], config: {} },
      { id: 't3', name: 'T3', type: 'generic', dependencies: ['t2'], config: {} },
    ],
    config: {},
  };
}

/** Create a pipeline definition with approval gates. */
function createApprovalDefinition(): PipelineDefinition {
  return {
    id: 'def-approval',
    name: 'Approval Pipeline',
    tasks: [
      { id: 'setup', name: 'Setup', type: 'generic', dependencies: [], config: {} },
      {
        id: 'deploy',
        name: 'Deploy',
        type: 'generic',
        dependencies: ['setup'],
        config: {},
        requiresApproval: true,
      },
      { id: 'verify', name: 'Verify', type: 'generic', dependencies: ['deploy'], config: {} },
    ],
    config: {},
  };
}

/** Create a mock task handler. */
function createMockHandler(
  results?: Record<string, Record<string, unknown>>,
  shouldFail?: string[],
): TaskHandler {
  return {
    async execute(taskId: string) {
      if (shouldFail?.includes(taskId)) {
        throw new Error(`Task ${taskId} failed`);
      }
      return results?.[taskId] ?? { success: true, taskId };
    },
  };
}

/** Build a minimal pipeline instance for unit tests. */
function createTestPipeline(definition: PipelineDefinition): PipelineInstance {
  const taskStates = new Map<string, import('../types.js').TaskState>();
  for (const task of definition.tasks) {
    taskStates.set(task.id, {
      taskId: task.id,
      status: 'pending',
      retryCount: 0,
    });
  }
  const ctx = new ExecutionContext('test-pipeline');
  return {
    id: 'test-pipeline',
    definitionId: definition.id,
    status: 'running',
    taskStates,
    context: ctx.toData(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ===========================================================================
// DAG Tests
// ===========================================================================

describe('DAG', () => {
  let dag: DAG<string>;

  beforeEach(() => {
    dag = new DAG<string>();
  });

  it('should add a node', () => {
    dag.addNode('a', 'data-a');
    expect(dag.getNode('a')).toBe('data-a');
    expect(dag.size()).toBe(1);
  });

  it('should throw on duplicate node ID', () => {
    dag.addNode('a', 'data');
    expect(() => dag.addNode('a', 'data2')).toThrow('already exists');
  });

  it('should add an edge between nodes', () => {
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addEdge('a', 'b');
    expect(dag.getDependents('a')).toContain('b');
    expect(dag.getDependencies('b')).toContain('a');
  });

  it('should throw when adding edge for non-existent node', () => {
    dag.addNode('a', 'a');
    expect(() => dag.addEdge('a', 'missing')).toThrow('does not exist');
    expect(() => dag.addEdge('missing', 'a')).toThrow('does not exist');
  });

  it('should throw on self-loop', () => {
    dag.addNode('a', 'a');
    expect(() => dag.addEdge('a', 'a')).toThrow('Self-loop');
  });

  it('should detect no cycle in a DAG', () => {
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addNode('c', 'c');
    dag.addEdge('a', 'b');
    dag.addEdge('b', 'c');
    expect(dag.hasCycle()).toBe(false);
  });

  it('should detect a cycle and reject the edge', () => {
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addEdge('a', 'b');
    expect(() => dag.addEdge('b', 'a')).toThrow('would create a cycle');
  });

  it('should return correct dependents and dependencies', () => {
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addNode('c', 'c');
    dag.addEdge('a', 'b');
    dag.addEdge('a', 'c');
    expect(dag.getDependents('a')).toEqual(expect.arrayContaining(['b', 'c']));
    expect(dag.getDependencies('b')).toEqual(['a']);
    expect(dag.getDependencies('c')).toEqual(['a']);
  });

  it('should return empty arrays for nodes with no edges', () => {
    dag.addNode('a', 'a');
    expect(dag.getDependents('a')).toEqual([]);
    expect(dag.getDependencies('a')).toEqual([]);
  });

  it('should perform topological sort', () => {
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addNode('c', 'c');
    dag.addEdge('a', 'b');
    dag.addEdge('a', 'c');
    const order = dag.topologicalSort();
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
  });

  it('should return roots (no incoming edges)', () => {
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addNode('c', 'c');
    dag.addEdge('a', 'b');
    dag.addEdge('b', 'c');
    const roots = dag.getRoots();
    expect(roots).toEqual(['a']);
  });

  it('should return leaves (no outgoing edges)', () => {
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addNode('c', 'c');
    dag.addEdge('a', 'b');
    dag.addEdge('b', 'c');
    const leaves = dag.getLeaves();
    expect(leaves).toEqual(['c']);
  });

  it('should extract a subgraph', () => {
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addNode('c', 'c');
    dag.addEdge('a', 'b');
    dag.addEdge('b', 'c');
    const sub = dag.getSubgraph(['a', 'c']);
    expect(sub.size()).toBe(2);
    expect(sub.getNode('a')).toBe('a');
    expect(sub.getNode('c')).toBe('c');
    expect(sub.getDependents('a')).toEqual([]);
  });

  it('should remove a node and its edges', () => {
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addEdge('a', 'b');
    dag.removeNode('a');
    expect(dag.getNode('a')).toBeUndefined();
    expect(dag.size()).toBe(1);
    expect(dag.getDependencies('b')).toEqual([]);
  });

  it('should handle removing a non-existent node gracefully', () => {
    dag.addNode('a', 'a');
    dag.removeNode('missing'); // should not throw
    expect(dag.size()).toBe(1);
  });

  it('should return all node IDs', () => {
    dag.addNode('x', 'x');
    dag.addNode('y', 'y');
    dag.addNode('z', 'z');
    expect(dag.nodeIds()).toEqual(expect.arrayContaining(['x', 'y', 'z']));
  });

  it('should handle a complex DAG with multiple roots', () => {
    dag.addNode('r1', 'r1');
    dag.addNode('r2', 'r2');
    dag.addNode('m1', 'm1');
    dag.addNode('m2', 'm2');
    dag.addNode('leaf', 'leaf');
    dag.addEdge('r1', 'm1');
    dag.addEdge('r2', 'm2');
    dag.addEdge('m1', 'leaf');
    dag.addEdge('m2', 'leaf');
    const order = dag.topologicalSort();
    expect(order.indexOf('r1')).toBeLessThan(order.indexOf('m1'));
    expect(order.indexOf('r2')).toBeLessThan(order.indexOf('m2'));
    expect(order.indexOf('m1')).toBeLessThan(order.indexOf('leaf'));
    expect(order.indexOf('m2')).toBeLessThan(order.indexOf('leaf'));
  });

  it('should detect a cycle in a larger graph', () => {
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addNode('c', 'c');
    dag.addEdge('a', 'b');
    dag.addEdge('b', 'c');
    expect(dag.hasCycle()).toBe(false);
    // Add c → a would create a cycle
    // We can't add it via addEdge (throws), but hasCycle on the raw state should work
    // Let's test by adding the edge manually for testing purposes
    (dag as unknown as { edges: Map<string, Set<string>> }).edges.get('c')!.add('a');
    (dag as unknown as { reverseEdges: Map<string, Set<string>> }).edges.get('a')!.add('c');
    expect(dag.hasCycle()).toBe(true);
  });

  it('should handle a single node DAG', () => {
    dag.addNode('only', 'only');
    expect(dag.topologicalSort()).toEqual(['only']);
    expect(dag.getRoots()).toEqual(['only']);
    expect(dag.getLeaves()).toEqual(['only']);
    expect(dag.hasCycle()).toBe(false);
  });
});

// ===========================================================================
// Execution Layers Tests
// ===========================================================================

describe('getExecutionLayers', () => {
  it('should compute layers for a linear chain', () => {
    const dag = new DAG<string>();
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addNode('c', 'c');
    dag.addEdge('a', 'b');
    dag.addEdge('b', 'c');
    const layers = getExecutionLayers(dag);
    expect(layers).toEqual([['a'], ['b'], ['c']]);
  });

  it('should group independent tasks in the same layer', () => {
    const dag = new DAG<string>();
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addNode('c', 'c');
    const layers = getExecutionLayers(dag);
    expect(layers).toEqual([['a', 'b', 'c']]);
  });

  it('should handle a diamond pattern', () => {
    const dag = new DAG<string>();
    dag.addNode('a', 'a');
    dag.addNode('b', 'b');
    dag.addNode('c', 'c');
    dag.addNode('d', 'd');
    dag.addEdge('a', 'b');
    dag.addEdge('a', 'c');
    dag.addEdge('b', 'd');
    dag.addEdge('c', 'd');
    const layers = getExecutionLayers(dag);
    expect(layers).toEqual([['a'], expect.arrayContaining(['b', 'c']), ['d']]);
  });

  it('should handle a single node', () => {
    const dag = new DAG<string>();
    dag.addNode('x', 'x');
    const layers = getExecutionLayers(dag);
    expect(layers).toEqual([['x']]);
  });

  it('should handle a complex multi-layer graph', () => {
    const dag = new DAG<string>();
    dag.addNode('r1', 'r1');
    dag.addNode('r2', 'r2');
    dag.addNode('m1', 'm1');
    dag.addNode('m2', 'm2');
    dag.addNode('leaf', 'leaf');
    dag.addEdge('r1', 'm1');
    dag.addEdge('r2', 'm2');
    dag.addEdge('m1', 'leaf');
    dag.addEdge('m2', 'leaf');
    const layers = getExecutionLayers(dag);
    expect(layers.length).toBe(3);
    expect(layers[0]).toEqual(expect.arrayContaining(['r1', 'r2']));
    expect(layers[1]).toEqual(expect.arrayContaining(['m1', 'm2']));
    expect(layers[2]).toEqual(['leaf']);
  });
});

// ===========================================================================
// State Machine Tests
// ===========================================================================

describe('PipelineStateMachine', () => {
  let sm: PipelineStateMachine;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    eventBus = createMockEventBus();
    sm = new PipelineStateMachine({ eventBus });
  });

  it('should allow created → validated', () => {
    expect(sm.canTransition('created', 'validated')).toBe(true);
  });

  it('should allow validated → queued', () => {
    expect(sm.canTransition('validated', 'queued')).toBe(true);
  });

  it('should allow queued → running', () => {
    expect(sm.canTransition('queued', 'running')).toBe(true);
  });

  it('should allow running → waiting', () => {
    expect(sm.canTransition('running', 'waiting')).toBe(true);
  });

  it('should allow running → completed', () => {
    expect(sm.canTransition('running', 'completed')).toBe(true);
  });

  it('should allow running → failed', () => {
    expect(sm.canTransition('running', 'failed')).toBe(true);
  });

  it('should allow running → cancelled', () => {
    expect(sm.canTransition('running', 'cancelled')).toBe(true);
  });

  it('should allow waiting → running', () => {
    expect(sm.canTransition('waiting', 'running')).toBe(true);
  });

  it('should allow waiting → cancelled', () => {
    expect(sm.canTransition('waiting', 'cancelled')).toBe(true);
  });

  it('should allow failed → rolled_back', () => {
    expect(sm.canTransition('failed', 'rolled_back')).toBe(true);
  });

  it('should allow failed → cancelled', () => {
    expect(sm.canTransition('failed', 'cancelled')).toBe(true);
  });

  it('should allow timed_out → rolled_back', () => {
    expect(sm.canTransition('timed_out', 'rolled_back')).toBe(true);
  });

  it('should allow timed_out → cancelled', () => {
    expect(sm.canTransition('timed_out', 'cancelled')).toBe(true);
  });

  it('should allow rolled_back → cancelled', () => {
    expect(sm.canTransition('rolled_back', 'cancelled')).toBe(true);
  });

  it('should reject invalid transition created → running', () => {
    expect(sm.canTransition('created', 'running')).toBe(false);
  });

  it('should reject completed → anything (terminal)', () => {
    expect(sm.canTransition('completed', 'running')).toBe(false);
    expect(sm.canTransition('completed', 'failed')).toBe(false);
  });

  it('should reject cancelled → anything (terminal)', () => {
    expect(sm.canTransition('cancelled', 'running')).toBe(false);
  });

  it('should throw InvalidTransitionError on invalid transition', () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    pipeline.status = 'created';
    expect(() => sm.transition(pipeline, 'running')).toThrow(InvalidTransitionError);
  });

  it('should perform a valid transition and emit an event', () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    pipeline.status = 'created';
    sm.transition(pipeline, 'validated');
    expect(pipeline.status).toBe('validated');
    expect(eventBus.events.some((e) => e.event === PipelineEvents.PIPELINE_VALIDATED)).toBe(true);
  });

  it('should update updatedAt on transition', () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    pipeline.status = 'created';
    const before = pipeline.updatedAt;
    // Small delay to ensure timestamp changes
    sm.transition(pipeline, 'validated');
    expect(pipeline.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('should return allowed transitions for a status', () => {
    const allowed = sm.getAllowedTransitions('running');
    expect(allowed).toEqual(expect.arrayContaining(['waiting', 'completed', 'failed', 'cancelled']));
  });
});

// ===========================================================================
// ExecutionContext Tests
// ===========================================================================

describe('ExecutionContext', () => {
  let ctx: ExecutionContext;

  beforeEach(() => {
    ctx = new ExecutionContext('pipeline-1');
  });

  it('should store and retrieve a variable', () => {
    ctx.setVariable('key', 'value');
    expect(ctx.getVariable<string>('key')).toBe('value');
  });

  it('should return undefined for missing variables', () => {
    expect(ctx.getVariable('missing')).toBeUndefined();
  });

  it('should return all variables as a record', () => {
    ctx.setVariable('a', 1);
    ctx.setVariable('b', 2);
    const vars = ctx.getAllVariables();
    expect(vars).toEqual({ a: 1, b: 2 });
  });

  it('should add and retrieve artifacts', () => {
    ctx.addArtifact('art-1');
    ctx.addArtifact('art-2');
    expect(ctx.getArtifacts()).toEqual(['art-1', 'art-2']);
  });

  it('should not duplicate artifacts', () => {
    ctx.addArtifact('art-1');
    ctx.addArtifact('art-1');
    expect(ctx.getArtifacts()).toEqual(['art-1']);
  });

  it('should fork a context with inherited state', () => {
    ctx.setVariable('x', 42);
    ctx.addArtifact('art-a');
    const child = ctx.fork();
    expect(child.getVariable('x')).toBe(42);
    expect(child.getArtifacts()).toEqual(['art-a']);
  });

  it('should isolate forked contexts', () => {
    ctx.setVariable('x', 1);
    const child = ctx.fork();
    child.setVariable('x', 2);
    expect(ctx.getVariable('x')).toBe(1);
    expect(child.getVariable('x')).toBe(2);
  });

  it('should export to data and restore from data', () => {
    ctx.setVariable('key', 'val');
    ctx.addArtifact('art-1');
    const data = ctx.toData();
    const restored = ExecutionContext.fromData(data);
    expect(restored.getVariable('key')).toBe('val');
    expect(restored.getArtifacts()).toEqual(['art-1']);
  });

  it('should have the correct pipelineId', () => {
    expect(ctx.pipelineId).toBe('pipeline-1');
  });
});

// ===========================================================================
// DependencyResolver Tests
// ===========================================================================

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  it('should validate a correct pipeline definition', () => {
    const def = createSimpleDefinition();
    const result = resolver.validate(def);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect duplicate task IDs', () => {
    const def: PipelineDefinition = {
      id: 'dup',
      name: 'Dup',
      tasks: [
        { id: 'a', name: 'A', type: 'generic', dependencies: [], config: {} },
        { id: 'a', name: 'A2', type: 'generic', dependencies: [], config: {} },
      ],
      config: {},
    };
    const result = resolver.validate(def);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Duplicate');
  });

  it('should detect missing dependencies', () => {
    const def: PipelineDefinition = {
      id: 'missing',
      name: 'Missing',
      tasks: [
        { id: 'a', name: 'A', type: 'generic', dependencies: ['nonexistent'], config: {} },
      ],
      config: {},
    };
    const result = resolver.validate(def);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Missing dependencies');
  });

  it('should resolve execution layers', () => {
    const def = createSimpleDefinition();
    const layers = resolver.resolve(def);
    expect(layers.length).toBeGreaterThanOrEqual(2);
    // task-a should be in layer 0
    expect(layers[0]).toContain('task-a');
  });

  it('should find missing dependencies', () => {
    const def: PipelineDefinition = {
      id: 'test',
      name: 'Test',
      tasks: [
        { id: 'a', name: 'A', type: 'generic', dependencies: ['ghost'], config: {} },
      ],
      config: {},
    };
    const missing = resolver.findMissingDependencies(def);
    expect(missing.length).toBe(1);
    expect(missing[0]).toContain('ghost');
  });

  it('should find duplicate IDs', () => {
    const def: PipelineDefinition = {
      id: 'test',
      name: 'Test',
      tasks: [
        { id: 'a', name: 'A', type: 'generic', dependencies: [], config: {} },
        { id: 'a', name: 'B', type: 'generic', dependencies: [], config: {} },
        { id: 'b', name: 'C', type: 'generic', dependencies: [], config: {} },
        { id: 'b', name: 'D', type: 'generic', dependencies: [], config: {} },
      ],
      config: {},
    };
    const dups = resolver.findDuplicateIds(def);
    expect(dups).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('should reject definition with cycle', () => {
    const def: PipelineDefinition = {
      id: 'cycle',
      name: 'Cycle',
      tasks: [
        { id: 'a', name: 'A', type: 'generic', dependencies: ['b'], config: {} },
        { id: 'b', name: 'B', type: 'generic', dependencies: ['a'], config: {} },
      ],
      config: {},
    };
    const result = resolver.validate(def);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('cycle');
  });
});

// ===========================================================================
// TaskScheduler Tests
// ===========================================================================

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;

  beforeEach(() => {
    scheduler = new TaskScheduler();
  });

  it('should find ready tasks with no dependencies', () => {
    const def = createSimpleDefinition();
    const pipeline = createTestPipeline(def);
    const ready = scheduler.getReadyTasks(pipeline, def.tasks);
    expect(ready).toContain('task-a');
  });

  it('should not find dependent tasks as ready', () => {
    const def = createSimpleDefinition();
    const pipeline = createTestPipeline(def);
    const ready = scheduler.getReadyTasks(pipeline, def.tasks);
    expect(ready).not.toContain('task-b');
    expect(ready).not.toContain('task-c');
  });

  it('should report dependencies satisfied when deps are completed', () => {
    const def = createSimpleDefinition();
    const pipeline = createTestPipeline(def);
    expect(scheduler.areDependenciesSatisfied('task-a', pipeline, def.tasks)).toBe(true);
    expect(scheduler.areDependenciesSatisfied('task-b', pipeline, def.tasks)).toBe(false);
    // Complete task-a
    pipeline.taskStates.get('task-a')!.status = 'completed';
    expect(scheduler.areDependenciesSatisfied('task-b', pipeline, def.tasks)).toBe(true);
  });

  it('should compute execution batches', () => {
    const def = createSimpleDefinition();
    const pipeline = createTestPipeline(def);
    const batches = scheduler.getExecutionBatches(pipeline, def.tasks);
    expect(batches.length).toBeGreaterThanOrEqual(2);
    expect(batches[0]).toContain('task-a');
  });

  it('should report non-existent tasks as not satisfied', () => {
    const def = createSimpleDefinition();
    const pipeline = createTestPipeline(def);
    expect(scheduler.areDependenciesSatisfied('nonexistent', pipeline, def.tasks)).toBe(false);
  });
});

// ===========================================================================
// ApprovalManager Tests
// ===========================================================================

describe('ApprovalManager', () => {
  let approval: ApprovalManager;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    eventBus = createMockEventBus();
    approval = new ApprovalManager({ eventBus });
  });

  it('should request approval and track it as pending', async () => {
    await approval.requestApproval('p1', 't1');
    const pending = approval.getPendingApprovals();
    expect(pending.length).toBe(1);
    expect(pending[0].pipelineId).toBe('p1');
    expect(pending[0].taskId).toBe('t1');
  });

  it('should emit approval requested event', async () => {
    await approval.requestApproval('p1', 't1');
    expect(eventBus.events.some((e) => e.event === PipelineEvents.APPROVAL_REQUESTED)).toBe(true);
  });

  it('should approve a pending task', async () => {
    await approval.requestApproval('p1', 't1');
    await approval.approve('p1', 't1');
    expect(approval.getPendingApprovals()).toHaveLength(0);
    expect(eventBus.events.some((e) => e.event === PipelineEvents.APPROVAL_GRANTED)).toBe(true);
  });

  it('should reject a pending task', async () => {
    await approval.requestApproval('p1', 't1');
    await approval.reject('p1', 't1', 'Not ready');
    expect(approval.getPendingApprovals()).toHaveLength(0);
    expect(eventBus.events.some((e) => e.event === PipelineEvents.APPROVAL_REJECTED)).toBe(true);
  });

  it('should throw when approving a non-pending task', async () => {
    await expect(approval.approve('p1', 't1')).rejects.toThrow('No pending approval');
  });

  it('should throw when rejecting a non-pending task', async () => {
    await expect(approval.reject('p1', 't1', 'reason')).rejects.toThrow('No pending approval');
  });

  it('should correctly report needsApproval', () => {
    const needsApproval: TaskDefinition = {
      id: 't', name: 'T', type: 'generic', dependencies: [], config: {}, requiresApproval: true,
    };
    const noApproval: TaskDefinition = {
      id: 't', name: 'T', type: 'generic', dependencies: [], config: {},
    };
    expect(approval.needsApproval(needsApproval)).toBe(true);
    expect(approval.needsApproval(noApproval)).toBe(false);
  });

  it('should check for pending approval by pipeline/task', async () => {
    await approval.requestApproval('p1', 't1');
    expect(approval.hasPendingApproval('p1', 't1')).toBe(true);
    expect(approval.hasPendingApproval('p1', 't2')).toBe(false);
  });

  it('should clear approvals for a specific pipeline', async () => {
    await approval.requestApproval('p1', 't1');
    await approval.requestApproval('p2', 't2');
    approval.clearPipelineApprovals('p1');
    expect(approval.getPendingApprovals()).toHaveLength(1);
    expect(approval.getPendingApprovals()[0].pipelineId).toBe('p2');
  });
});

// ===========================================================================
// RetryPolicyManager Tests
// ===========================================================================

describe('RetryPolicyManager', () => {
  it('should use default config', () => {
    const retry = new RetryPolicyManager();
    const config = retry.getConfig();
    expect(config.maxRetries).toBe(3);
    expect(config.delayMs).toBe(1000);
    expect(config.backoffMultiplier).toBe(2);
    expect(config.maxDelayMs).toBe(30000);
  });

  it('should accept custom config', () => {
    const retry = new RetryPolicyManager({ maxRetries: 5, delayMs: 500 });
    expect(retry.getConfig().maxRetries).toBe(5);
    expect(retry.getConfig().delayMs).toBe(500);
  });

  it('should retry when under max retries', () => {
    const retry = new RetryPolicyManager({ maxRetries: 3 });
    expect(retry.shouldRetry({ taskId: 't', status: 'failed', retryCount: 0 })).toBe(true);
    expect(retry.shouldRetry({ taskId: 't', status: 'failed', retryCount: 2 })).toBe(true);
  });

  it('should not retry when max retries exceeded', () => {
    const retry = new RetryPolicyManager({ maxRetries: 3 });
    expect(retry.shouldRetry({ taskId: 't', status: 'failed', retryCount: 3 })).toBe(false);
  });

  it('should calculate exponential backoff delay', () => {
    const retry = new RetryPolicyManager({ delayMs: 100, backoffMultiplier: 2 });
    expect(retry.getRetryDelay({ taskId: 't', status: 'failed', retryCount: 0 })).toBe(100);
    expect(retry.getRetryDelay({ taskId: 't', status: 'failed', retryCount: 1 })).toBe(200);
    expect(retry.getRetryDelay({ taskId: 't', status: 'failed', retryCount: 2 })).toBe(400);
  });

  it('should cap delay at maxDelayMs', () => {
    const retry = new RetryPolicyManager({ delayMs: 1000, backoffMultiplier: 10, maxDelayMs: 5000 });
    const delay = retry.getRetryDelay({ taskId: 't', status: 'failed', retryCount: 3 });
    // 1000 * 10^3 = 1,000,000, capped to 5000
    expect(delay).toBe(5000);
  });

  it('should succeed on first attempt without retry', async () => {
    const retry = new RetryPolicyManager();
    let callCount = 0;
    const result = await retry.executeWithRetry(async () => {
      callCount++;
      return 'ok';
    }, 't1');
    expect(result).toBe('ok');
    expect(callCount).toBe(1);
  });

  it('should retry and eventually succeed', async () => {
    const retry = new RetryPolicyManager({ delayMs: 1, maxRetries: 3 });
    let callCount = 0;
    const result = await retry.executeWithRetry(async () => {
      callCount++;
      if (callCount < 3) throw new Error('fail');
      return 'recovered';
    }, 't1');
    expect(result).toBe('recovered');
    expect(callCount).toBe(3);
  });

  it('should throw after exhausting retries', async () => {
    const retry = new RetryPolicyManager({ delayMs: 1, maxRetries: 2 });
    await expect(
      retry.executeWithRetry(async () => {
        throw new Error('always fail');
      }, 't1'),
    ).rejects.toThrow('always fail');
  });
});

// ===========================================================================
// RollbackManager Tests
// ===========================================================================

describe('RollbackManager', () => {
  let rollback: RollbackManager;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    eventBus = createMockEventBus();
    rollback = new RollbackManager({ eventBus });
  });

  it('should get rollback points sorted by completion time', () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    const now = Date.now();
    pipeline.taskStates.get('task-a')!.status = 'completed';
    pipeline.taskStates.get('task-a')!.completedAt = now - 2000;
    pipeline.taskStates.get('task-b')!.status = 'completed';
    pipeline.taskStates.get('task-b')!.completedAt = now;

    const points = rollback.getRollbackPoints(pipeline);
    expect(points).toEqual(['task-b', 'task-a']);
  });

  it('should rollback completed tasks to pending', async () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    pipeline.taskStates.get('task-a')!.status = 'completed';
    pipeline.taskStates.get('task-a')!.completedAt = Date.now();

    await rollback.rollback(pipeline);
    expect(pipeline.taskStates.get('task-a')!.status).toBe('pending');
  });

  it('should rollback to a specific task', async () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    const now = Date.now();
    pipeline.taskStates.get('task-a')!.status = 'completed';
    pipeline.taskStates.get('task-a')!.completedAt = now - 1000;
    pipeline.taskStates.get('task-b')!.status = 'completed';
    pipeline.taskStates.get('task-b')!.completedAt = now;

    await rollback.rollback(pipeline, 'task-b');
    expect(pipeline.taskStates.get('task-b')!.status).toBe('pending');
    expect(pipeline.taskStates.get('task-a')!.status).toBe('completed');
  });

  it('should throw rollback for non-existent task', async () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    await expect(rollback.rollback(pipeline, 'nonexistent')).rejects.toThrow('not found');
  });

  it('should rollback a single task', async () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    pipeline.taskStates.get('task-a')!.status = 'completed';
    await rollback.rollbackTask(pipeline, 'task-a');
    expect(pipeline.taskStates.get('task-a')!.status).toBe('pending');
  });

  it('should throw when rolling back a running task', async () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    pipeline.taskStates.get('task-a')!.status = 'running';
    await expect(rollback.rollbackTask(pipeline, 'task-a')).rejects.toThrow('running');
  });

  it('should throw when rolling back non-existent task', async () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    await expect(rollback.rollbackTask(pipeline, 'nope')).rejects.toThrow('not found');
  });

  it('should emit rollback events', async () => {
    const pipeline = createTestPipeline(createSimpleDefinition());
    await rollback.rollback(pipeline);
    expect(eventBus.events.some((e) => e.event === PipelineEvents.ROLLBACK_STARTED)).toBe(true);
    expect(eventBus.events.some((e) => e.event === PipelineEvents.ROLLBACK_COMPLETED)).toBe(true);
  });
});

// ===========================================================================
// PipelineMetrics Tests
// ===========================================================================

describe('PipelineMetrics', () => {
  let metrics: PipelineMetrics;

  beforeEach(() => {
    metrics = new PipelineMetrics();
  });

  it('should record pipeline created', () => {
    metrics.recordPipelineCreated();
    expect(metrics.getMetric('pipelines.created')).toBe(1);
  });

  it('should record pipeline completed with duration', () => {
    metrics.recordPipelineCompleted(5000);
    expect(metrics.getMetric('pipelines.completed')).toBe(1);
    expect(metrics.getMetric('pipelines.duration_ms')).toBe(5000);
  });

  it('should record pipeline failed', () => {
    metrics.recordPipelineFailed('timeout');
    expect(metrics.getMetric('pipelines.failed')).toBe(1);
    expect(metrics.getMetric('pipelines.errors.timeout')).toBe(1);
  });

  it('should record task started', () => {
    metrics.recordTaskStarted('p1', 't1');
    expect(metrics.getMetric('tasks.started')).toBe(1);
  });

  it('should record task completed', () => {
    metrics.recordTaskCompleted('p1', 't1', 100);
    expect(metrics.getMetric('tasks.completed')).toBe(1);
    expect(metrics.getMetric('tasks.duration_ms')).toBe(100);
  });

  it('should record task failed', () => {
    metrics.recordTaskFailed('p1', 't1', 'error');
    expect(metrics.getMetric('tasks.failed')).toBe(1);
  });

  it('should record approval events', () => {
    metrics.recordApprovalRequested();
    metrics.recordApprovalGranted();
    metrics.recordApprovalRejected();
    expect(metrics.getMetric('approvals.requested')).toBe(1);
    expect(metrics.getMetric('approvals.granted')).toBe(1);
    expect(metrics.getMetric('approvals.rejected')).toBe(1);
  });

  it('should record retry events', () => {
    metrics.recordRetry('p1', 't1');
    expect(metrics.getMetric('retries.total')).toBe(1);
  });

  it('should record rollback events', () => {
    metrics.recordRollback('p1');
    expect(metrics.getMetric('rollbacks.total')).toBe(1);
  });

  it('should get all metrics as a record', () => {
    metrics.recordPipelineCreated();
    metrics.recordPipelineCompleted(100);
    const all = metrics.getMetrics();
    expect(typeof all).toBe('object');
    expect(all['pipelines.created']).toBe(1);
    expect(all['pipelines.completed']).toBe(1);
  });

  it('should reset all metrics', () => {
    metrics.recordPipelineCreated();
    metrics.recordPipelineCompleted(100);
    metrics.reset();
    expect(metrics.getMetric('pipelines.created')).toBe(0);
  });

  it('should return 0 for unknown metrics', () => {
    expect(metrics.getMetric('nonexistent')).toBe(0);
  });
});

// ===========================================================================
// PipelineExecutor Tests
// ===========================================================================

describe('PipelineExecutor', () => {
  it('should execute a simple pipeline successfully', async () => {
    const eventBus = createMockEventBus();
    const handler = createMockHandler();
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: handler,
      retryPolicy: { maxRetries: 0 },
    });

    const def = createSimpleDefinition();
    const pipeline = createTestPipeline(def);

    // Store definitions so executor can resolve batches
    const definitions = new Map<string, TaskDefinition[]>();
    definitions.set(def.id, def.tasks);

    const executorWithDefs = new PipelineExecutor({
      eventBus,
      taskHandler: handler,
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: () => def.tasks,
    });

    await executorWithDefs.execute(pipeline);

    // All tasks should be completed
    for (const [, state] of pipeline.taskStates) {
      expect(state.status).toBe('completed');
    }
  });

  it('should handle task failure', async () => {
    const eventBus = createMockEventBus();
    const handler = createMockHandler(undefined, ['task-a']);
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: handler,
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: () => createSimpleDefinition().tasks,
    });

    const pipeline = createTestPipeline(createSimpleDefinition());
    await executor.execute(pipeline);

    expect(pipeline.taskStates.get('task-a')!.status).toBe('failed');
  });

  it('should retry failed tasks', async () => {
    const eventBus = createMockEventBus();
    let attempts = 0;
    const handler: TaskHandler = {
      async execute(taskId: string) {
        attempts++;
        if (taskId === 'task-a' && attempts < 3) {
          throw new Error('temporary failure');
        }
        return { success: true };
      },
    };

    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: handler,
      retryPolicy: { maxRetries: 3, delayMs: 1 },
      definitionsProvider: () => createLinearDefinition().tasks,
    });

    const pipeline = createTestPipeline(createLinearDefinition());
    await executor.execute(pipeline);

    expect(pipeline.taskStates.get('t1')!.status).toBe('completed');
    expect(attempts).toBeGreaterThanOrEqual(3);
  });

  it('should emit task started and completed events', async () => {
    const eventBus = createMockEventBus();
    const handler = createMockHandler();
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: handler,
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: () => createLinearDefinition().tasks,
    });

    const pipeline = createTestPipeline(createLinearDefinition());
    await executor.execute(pipeline);

    const started = eventBus.events.filter((e) => e.event === PipelineEvents.TASK_STARTED);
    const completed = eventBus.events.filter((e) => e.event === PipelineEvents.TASK_COMPLETED);
    expect(started.length).toBeGreaterThanOrEqual(1);
    expect(completed.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle task timeout', async () => {
    const eventBus = createMockEventBus();
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
    });

    const pipeline = createTestPipeline(createSimpleDefinition());
    pipeline.taskStates.get('task-a')!.status = 'running';

    await executor.handleTimeout(pipeline, 'task-a');
    expect(pipeline.taskStates.get('task-a')!.status).toBe('timed_out');
    expect(eventBus.events.some((e) => e.event === PipelineEvents.TASK_TIMED_OUT)).toBe(true);
  });

  it('should skip tasks already in terminal state', async () => {
    const eventBus = createMockEventBus();
    let executeCount = 0;
    const handler: TaskHandler = {
      async execute() {
        executeCount++;
        return {};
      },
    };

    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: handler,
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: () => createLinearDefinition().tasks,
    });

    const pipeline = createTestPipeline(createLinearDefinition());
    pipeline.taskStates.get('t1')!.status = 'completed';

    await executor.executeTask(pipeline, 't1');
    expect(executeCount).toBe(0);
  });

  it('should throw for non-existent task', async () => {
    const eventBus = createMockEventBus();
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
    });

    const pipeline = createTestPipeline(createSimpleDefinition());
    await expect(executor.executeTask(pipeline, 'nonexistent')).rejects.toThrow('not found');
  });
});

// ===========================================================================
// PipelineManager Tests (End-to-End)
// ===========================================================================

describe('PipelineManager', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let manager: PipelineManager;

  beforeEach(() => {
    eventBus = createMockEventBus();
    const stateMachine = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => {
        // Return the definition's tasks from the manager's internal store
        // For tests, we'll provide them through the manager
        return [];
      },
    });
    manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine,
    });
  });

  it('should create a pipeline from a definition', async () => {
    const def = createSimpleDefinition();
    const pipeline = await manager.createPipeline(def);
    expect(pipeline.status).toBe('created');
    expect(pipeline.definitionId).toBe(def.id);
    expect(pipeline.taskStates.size).toBe(4);
  });

  it('should list pipelines', async () => {
    await manager.createPipeline(createSimpleDefinition());
    await manager.createPipeline(createLinearDefinition());
    expect(manager.listPipelines().length).toBe(2);
  });

  it('should get a specific pipeline', async () => {
    const pipeline = await manager.createPipeline(createSimpleDefinition());
    const retrieved = manager.getPipeline(pipeline.id);
    expect(retrieved).toBe(pipeline);
  });

  it('should return undefined for non-existent pipeline', () => {
    expect(manager.getPipeline('nonexistent')).toBeUndefined();
  });

  it('should throw for invalid pipeline definition', async () => {
    const def: PipelineDefinition = {
      id: 'bad',
      name: 'Bad',
      tasks: [
        { id: 'a', name: 'A', type: 'generic', dependencies: ['b'], config: {} },
        { id: 'a', name: 'A2', type: 'generic', dependencies: [], config: {} },
      ],
      config: {},
    };
    await expect(manager.createPipeline(def)).rejects.toThrow('Invalid pipeline');
  });

  it('should get execution graph', async () => {
    const def = createSimpleDefinition();
    const pipeline = await manager.createPipeline(def);
    const graph = manager.getExecutionGraph(pipeline.id);
    expect(graph.nodes.length).toBe(4);
    expect(graph.edges.length).toBe(4); // a→b, a→c, b→d, c→d
  });

  it('should throw getting graph for non-existent pipeline', () => {
    expect(() => manager.getExecutionGraph('nonexistent')).toThrow('not found');
  });

  it('should perform health check', async () => {
    await manager.createPipeline(createSimpleDefinition());
    const health = await manager.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.activePipelines).toBe(1);
    expect(health.completedPipelines).toBe(0);
  });

  it('should get metrics', () => {
    const metrics = manager.getMetrics();
    expect(metrics).toBeInstanceOf(PipelineMetrics);
  });

  it('should get approval manager', () => {
    expect(manager.getApprovalManager()).toBeInstanceOf(ApprovalManager);
  });

  it('should emit events during creation', async () => {
    await manager.createPipeline(createSimpleDefinition());
    expect(eventBus.events.some((e) => e.event === PipelineEvents.PIPELINE_CREATED)).toBe(true);
  });

  it('should start a simple pipeline successfully', async () => {
    // Create manager with proper definitions provider
    const def = createLinearDefinition();
    const definitions = new Map<string, PipelineDefinition>();
    definitions.set(def.id, def);

    const sm = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => definitions.get(defId)?.tasks ?? [],
    });

    const mgr = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
      definitions,
    });

    const pipeline = await mgr.createPipeline(def);
    await mgr.startPipeline(pipeline.id);

    expect(pipeline.status).toBe('completed');
    for (const [, state] of pipeline.taskStates) {
      expect(state.status).toBe('completed');
    }
  });

  it('should cancel a pipeline', async () => {
    const def = createSimpleDefinition();
    const pipeline = await manager.createPipeline(def);
    await manager.cancelPipeline(pipeline.id, 'user cancel');
    expect(pipeline.status).toBe('cancelled');
    expect(eventBus.events.some((e) => e.event === PipelineEvents.PIPELINE_CANCELLED)).toBe(true);
  });

  it('should throw when cancelling non-existent pipeline', async () => {
    await expect(manager.cancelPipeline('nonexistent', 'reason')).rejects.toThrow('not found');
  });

  it('should throw for invalid start transition', async () => {
    const def = createSimpleDefinition();
    const pipeline = await manager.createPipeline(def);
    pipeline.status = 'completed'; // force to terminal
    await expect(manager.startPipeline(pipeline.id)).rejects.toThrow(InvalidTransitionError);
  });

  it('should approve a waiting task', async () => {
    const def = createApprovalDefinition();
    const pipeline = await manager.createPipeline(def);
    pipeline.status = 'waiting';
    pipeline.taskStates.get('setup')!.status = 'completed';
    pipeline.taskStates.get('deploy')!.status = 'running';

    // Request approval
    await manager.getApprovalManager().requestApproval(pipeline.id, 'deploy');
    pipeline.taskStates.get('deploy')!.approvalStatus = 'pending';

    await manager.approveTask(pipeline.id, 'deploy');
    expect(pipeline.taskStates.get('deploy')!.approvalStatus).toBe('approved');
    expect(eventBus.events.some((e) => e.event === PipelineEvents.APPROVAL_GRANTED)).toBe(true);
  });

  it('should reject a waiting task', async () => {
    const def = createApprovalDefinition();
    const pipeline = await manager.createPipeline(def);
    pipeline.status = 'waiting';
    pipeline.taskStates.get('deploy')!.status = 'running';

    await manager.getApprovalManager().requestApproval(pipeline.id, 'deploy');
    await manager.rejectTask(pipeline.id, 'deploy', 'Not authorized');
    expect(pipeline.taskStates.get('deploy')!.approvalStatus).toBe('rejected');
    expect(pipeline.status).toBe('failed');
  });

  it('should throw when approving non-existent task', async () => {
    const def = createSimpleDefinition();
    const pipeline = await manager.createPipeline(def);
    pipeline.status = 'waiting';
    await expect(manager.approveTask(pipeline.id, 'nonexistent')).rejects.toThrow('not found');
  });

  it('should retry a failed pipeline', async () => {
    const def = createLinearDefinition();
    const definitions = new Map<string, PipelineDefinition>();
    definitions.set(def.id, def);

    const eventBus = createMockEventBus();
    const sm = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => definitions.get(defId)?.tasks ?? [],
    });

    const manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
      definitions,
    });

    const pipeline = await manager.createPipeline(def);
    pipeline.status = 'failed';
    pipeline.taskStates.get('t1')!.status = 'failed';
    pipeline.taskStates.get('t1')!.error = 'some error';

    await manager.retryPipeline(pipeline.id);
  });
});

// ===========================================================================
// Full Lifecycle Integration Test
// ===========================================================================

describe('Full Pipeline Lifecycle', () => {
  it('should execute create → validate → queue → run → complete', async () => {
    const eventBus = createMockEventBus();
    const def = createLinearDefinition();
    const definitions = new Map<string, PipelineDefinition>();
    definitions.set(def.id, def);

    const sm = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => definitions.get(defId)?.tasks ?? [],
    });

    const manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
      definitions,
    });

    const pipeline = await manager.createPipeline(def);
    expect(pipeline.status).toBe('created');

    await manager.startPipeline(pipeline.id);

    expect(pipeline.status).toBe('completed');
    for (const [, state] of pipeline.taskStates) {
      expect(state.status).toBe('completed');
    }

    // Verify events were emitted
    const eventNames = eventBus.events.map((e) => e.event);
    expect(eventNames).toContain(PipelineEvents.PIPELINE_CREATED);
    expect(eventNames).toContain(PipelineEvents.PIPELINE_VALIDATED);
    expect(eventNames).toContain(PipelineEvents.PIPELINE_QUEUED);
    expect(eventNames).toContain(PipelineEvents.PIPELINE_STARTED);
    expect(eventNames).toContain(PipelineEvents.PIPELINE_COMPLETED);
  });

  it('should handle parallel execution of independent tasks', async () => {
    const eventBus = createMockEventBus();
    const def = createSimpleDefinition(); // task-a → task-b, task-c → task-d
    const definitions = new Map<string, PipelineDefinition>();
    definitions.set(def.id, def);

    const executionOrder: string[] = [];
    const handler: TaskHandler = {
      async execute(taskId: string) {
        executionOrder.push(taskId);
        return {};
      },
    };

    const sm = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: handler,
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => definitions.get(defId)?.tasks ?? [],
    });

    const manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
      definitions,
    });

    const pipeline = await manager.createPipeline(def);
    await manager.startPipeline(pipeline.id);

    expect(pipeline.status).toBe('completed');
    // task-a must be first
    expect(executionOrder[0]).toBe('task-a');
    // task-d must be last
    expect(executionOrder[executionOrder.length - 1]).toBe('task-d');
  });

  it('should handle pipeline failure and rollback', async () => {
    const eventBus = createMockEventBus();
    const def = createLinearDefinition();
    const definitions = new Map<string, PipelineDefinition>();
    definitions.set(def.id, def);

    const handler: TaskHandler = {
      async execute(taskId: string) {
        if (taskId === 't2') throw new Error('boom');
        return {};
      },
    };

    const sm = new PipelineStateMachine({ eventBus });
    const rollbackMgr = new RollbackManager({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: handler,
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => definitions.get(defId)?.tasks ?? [],
    });

    const manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
      rollbackManager: rollbackMgr,
      definitions,
    });

    const pipeline = await manager.createPipeline(def);
    await manager.startPipeline(pipeline.id);

    expect(pipeline.status).toBe('failed');
    expect(pipeline.taskStates.get('t1')!.status).toBe('completed');
    expect(pipeline.taskStates.get('t2')!.status).toBe('failed');
  });

  it('should cancel pipeline during execution', async () => {
    const eventBus = createMockEventBus();
    const def = createSimpleDefinition();
    const definitions = new Map<string, PipelineDefinition>();
    definitions.set(def.id, def);

    const sm = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => definitions.get(defId)?.tasks ?? [],
    });

    const manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
      definitions,
    });

    const pipeline = await manager.createPipeline(def);
    pipeline.status = 'running';

    await manager.cancelPipeline(pipeline.id, 'user request');
    expect(pipeline.status).toBe('cancelled');
  });
});

// ===========================================================================
// Edge Cases
// ===========================================================================

describe('Edge Cases', () => {
  it('should handle a single-task pipeline', async () => {
    const eventBus = createMockEventBus();
    const def: PipelineDefinition = {
      id: 'single',
      name: 'Single',
      tasks: [
        { id: 'only', name: 'Only', type: 'generic', dependencies: [], config: {} },
      ],
      config: {},
    };
    const definitions = new Map<string, PipelineDefinition>();
    definitions.set(def.id, def);

    const sm = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => definitions.get(defId)?.tasks ?? [],
    });

    const manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
      definitions,
    });

    const pipeline = await manager.createPipeline(def);
    await manager.startPipeline(pipeline.id);
    expect(pipeline.status).toBe('completed');
  });

  it('should handle an empty pipeline (no tasks)', async () => {
    const eventBus = createMockEventBus();
    const def: PipelineDefinition = {
      id: 'empty',
      name: 'Empty',
      tasks: [],
      config: {},
    };

    const sm = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: () => [],
    });

    const manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
    });

    const pipeline = await manager.createPipeline(def);
    // An empty pipeline with no tasks: allTasksInStatus returns false when size is 0
    // Let's verify creation works
    expect(pipeline.taskStates.size).toBe(0);
    expect(pipeline.status).toBe('created');
  });

  it('should handle pipeline with all independent tasks', async () => {
    const eventBus = createMockEventBus();
    const def: PipelineDefinition = {
      id: 'parallel',
      name: 'Parallel',
      tasks: [
        { id: 'a', name: 'A', type: 'generic', dependencies: [], config: {} },
        { id: 'b', name: 'B', type: 'generic', dependencies: [], config: {} },
        { id: 'c', name: 'C', type: 'generic', dependencies: [], config: {} },
      ],
      config: {},
    };
    const definitions = new Map<string, PipelineDefinition>();
    definitions.set(def.id, def);

    const sm = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => definitions.get(defId)?.tasks ?? [],
    });

    const manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
      definitions,
    });

    const pipeline = await manager.createPipeline(def);
    await manager.startPipeline(pipeline.id);
    expect(pipeline.status).toBe('completed');
  });

  it('should handle rejection in approval flow', async () => {
    const eventBus = createMockEventBus();
    const def = createApprovalDefinition();
    const pipeline = createTestPipeline(def);
    pipeline.status = 'waiting';
    pipeline.taskStates.get('setup')!.status = 'completed';
    pipeline.taskStates.get('deploy')!.status = 'running';

    const approval = new ApprovalManager({ eventBus });
    await approval.requestApproval(pipeline.id, 'deploy');
    await approval.reject(pipeline.id, 'deploy', 'Security concern');

    expect(approval.getPendingApprovals()).toHaveLength(0);
    expect(eventBus.events.some((e) => e.event === PipelineEvents.APPROVAL_REJECTED)).toBe(true);
  });

  it('should handle DAG with deeply nested dependencies', () => {
    const dag = new DAG<string>();
    for (let i = 0; i < 10; i++) {
      dag.addNode(`t${i}`, `t${i}`);
    }
    for (let i = 1; i < 10; i++) {
      dag.addEdge(`t${i - 1}`, `t${i}`);
    }
    expect(dag.hasCycle()).toBe(false);
    const order = dag.topologicalSort();
    expect(order).toEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9']);
  });

  it('should handle graph with fan-out and fan-in', () => {
    const dag = new DAG<string>();
    dag.addNode('root', 'root');
    for (let i = 0; i < 5; i++) {
      dag.addNode(`mid${i}`, `mid${i}`);
      dag.addEdge('root', `mid${i}`);
    }
    dag.addNode('sink', 'sink');
    for (let i = 0; i < 5; i++) {
      dag.addEdge(`mid${i}`, 'sink');
    }

    expect(dag.hasCycle()).toBe(false);
    const roots = dag.getRoots();
    expect(roots).toEqual(['root']);
    const leaves = dag.getLeaves();
    expect(leaves).toEqual(['sink']);
  });

  it('should handle metrics accumulation across multiple operations', () => {
    const metrics = new PipelineMetrics();
    metrics.recordPipelineCreated();
    metrics.recordPipelineCreated();
    metrics.recordPipelineCompleted(100);
    metrics.recordPipelineCompleted(200);
    metrics.recordTaskFailed('p1', 't1', 'timeout');
    metrics.recordTaskFailed('p1', 't1', 'timeout');
    metrics.recordRetry('p1', 't1');

    expect(metrics.getMetric('pipelines.created')).toBe(2);
    expect(metrics.getMetric('pipelines.completed')).toBe(2);
    expect(metrics.getMetric('pipelines.duration_ms')).toBe(300);
    expect(metrics.getMetric('tasks.failed')).toBe(2);
    expect(metrics.getMetric('tasks.errors.timeout')).toBe(2);
    expect(metrics.getMetric('retries.total')).toBe(1);
  });

  it('should validate resolver with no errors for a well-formed definition', () => {
    const resolver = new DependencyResolver();
    const result = resolver.validate(createSimpleDefinition());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should resolve layers for a definition with no tasks', () => {
    const resolver = new DependencyResolver();
    const def: PipelineDefinition = { id: 'empty', name: 'Empty', tasks: [], config: {} };
    const layers = resolver.resolve(def);
    expect(layers).toEqual([]);
  });

  it('should handle RetryPolicyManager with zero max retries', async () => {
    const retry = new RetryPolicyManager({ maxRetries: 0 });
    await expect(
      retry.executeWithRetry(async () => {
        throw new Error('fail');
      }, 't1'),
    ).rejects.toThrow('fail');
  });

  it('should handle context with complex values', () => {
    const ctx = new ExecutionContext('p1');
    const complexObj = { nested: { deep: [1, 2, 3] } };
    ctx.setVariable('complex', complexObj);
    expect(ctx.getVariable<typeof complexObj>('complex')).toEqual(complexObj);
  });

  it('should handle fork preserving pipeline ID', () => {
    const ctx = new ExecutionContext('p42');
    const child = ctx.fork();
    expect(child.pipelineId).toBe('p42');
  });

  it('should handle rollback when no tasks are completed', async () => {
    const eventBus = createMockEventBus();
    const rollback = new RollbackManager({ eventBus });
    const pipeline = createTestPipeline(createSimpleDefinition());
    const points = rollback.getRollbackPoints(pipeline);
    expect(points).toHaveLength(0);
  });

  it('should handle approval manager with multiple pending requests', async () => {
    const eventBus = createMockEventBus();
    const approval = new ApprovalManager({ eventBus });
    await approval.requestApproval('p1', 't1');
    await approval.requestApproval('p1', 't2');
    await approval.requestApproval('p2', 't3');
    expect(approval.getPendingApprovals()).toHaveLength(3);
    approval.clearPipelineApprovals('p1');
    expect(approval.getPendingApprovals()).toHaveLength(1);
    expect(approval.getPendingApprovals()[0].pipelineId).toBe('p2');
  });

  it('should handle executor with no definitions provider', async () => {
    const eventBus = createMockEventBus();
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
    });

    const pipeline = createTestPipeline(createSimpleDefinition());
    // Should complete without errors (no definitions = no batches = no execution)
    await executor.execute(pipeline);
  });

  it('should validate full pipeline lifecycle event sequence', async () => {
    const eventBus = createMockEventBus();
    const def = createLinearDefinition();
    const definitions = new Map<string, PipelineDefinition>();
    definitions.set(def.id, def);

    const sm = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => definitions.get(defId)?.tasks ?? [],
    });

    const manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
      definitions,
    });

    const pipeline = await manager.createPipeline(def);
    await manager.startPipeline(pipeline.id);

    const eventNames = eventBus.events.map((e) => e.event);

    // Verify all expected events in order
    expect(eventNames.indexOf(PipelineEvents.PIPELINE_CREATED)).toBeLessThan(
      eventNames.indexOf(PipelineEvents.PIPELINE_VALIDATED),
    );
    expect(eventNames.indexOf(PipelineEvents.PIPELINE_VALIDATED)).toBeLessThan(
      eventNames.indexOf(PipelineEvents.PIPELINE_QUEUED),
    );
    expect(eventNames.indexOf(PipelineEvents.PIPELINE_QUEUED)).toBeLessThan(
      eventNames.indexOf(PipelineEvents.PIPELINE_STARTED),
    );
    expect(eventNames.indexOf(PipelineEvents.PIPELINE_STARTED)).toBeLessThan(
      eventNames.indexOf(PipelineEvents.PIPELINE_COMPLETED),
    );
  });

  it('should handle health check with mixed pipeline states', async () => {
    const eventBus = createMockEventBus();
    const def = createSimpleDefinition();
    const definitions = new Map<string, PipelineDefinition>();
    definitions.set(def.id, def);

    const sm = new PipelineStateMachine({ eventBus });
    const executor = new PipelineExecutor({
      eventBus,
      taskHandler: createMockHandler(),
      retryPolicy: { maxRetries: 0 },
      definitionsProvider: (defId) => definitions.get(defId)?.tasks ?? [],
    });

    const manager = new PipelineManager({
      eventBus,
      executor,
      stateMachine: sm,
      definitions,
    });

    const p1 = await manager.createPipeline(def);
    const p2 = await manager.createPipeline(def);
    p2.status = 'completed'; // force

    const health = await manager.healthCheck();
    expect(health.activePipelines).toBe(1);
    expect(health.completedPipelines).toBe(1);
  });
});
