/**
 * @module __tests__/agent-runtime
 * Comprehensive tests for the VOLT OS Agent Runtime.
 * Covers IAgent interface contract, AgentRegistry, AgentManager,
 * AgentScheduler, AgentExecutor, HealthMonitor, CapabilityResolver,
 * MemoryBinder, ModelBinder, RecoveryManager, and integration scenarios.
 *
 * Target: ≥90% coverage with ≥60 test cases.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import type {
  AgentManifest,
  AgentInstance,
  AgentTask,
  AgentResult,
  AgentHealthStatus,
  AgentState,
} from '../types.js';
import { AgentEvents } from '../types.js';
import type { IAgent } from '../agent/agent-interface.js';
import type { EventBus } from '@volt-os/plugin-runtime';
import { AgentRegistry } from '../registry.js';
import { AgentManager } from '../manager.js';
import { AgentScheduler } from '../scheduler.js';
import { AgentExecutor } from '../executor.js';
import { AgentHealthMonitor } from '../health.js';
import { CapabilityResolver } from '../capabilities.js';
import { MemoryBinder } from '../memory-binder.js';
import { ModelBinder } from '../model-binder.js';
import { RecoveryManager } from '../recovery.js';
import { AgentContextFactory } from '../context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBus & { emitted: Array<{ event: string; data: Record<string, unknown> }> } {
  const handlers = new Map<string, Set<(data: Record<string, unknown>) => void>>();
  const emitted: Array<{ event: string; data: Record<string, unknown> }> = [];

  return {
    emitted,
    emit: vi.fn((event: string, data: Record<string, unknown>) => {
      emitted.push({ event, data });
      const set = handlers.get(event);
      if (set) {
        for (const h of set) h(data);
      }
    }),
    on: vi.fn((event: string, handler: (data: Record<string, unknown>) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (data: Record<string, unknown>) => void) => {
      handlers.get(event)?.delete(handler);
    }),
  };
}

function createManifest(overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    id: 'test-agent',
    version: '1.0.0',
    name: 'Test Agent',
    description: 'A test agent',
    author: 'test',
    capabilities: ['research', 'planning'],
    requiredTools: [],
    requiredModels: [],
    requiredPermissions: [],
    memoryProfile: {
      workingMemoryMB: 64,
      longTermMemory: true,
      contextWindow: 8192,
    },
    resourceLimits: {
      maxConcurrentTasks: 2,
      maxMemoryMB: 256,
      maxCpuTimeMs: 30_000,
      maxTokensPerTask: 10_000,
      executionTimeoutMs: 60_000,
    },
    priority: 5,
    healthChecks: {
      intervalMs: 30_000,
      timeoutMs: 5_000,
      failureThreshold: 3,
    },
    lifecycleHooks: {},
    ...overrides,
  };
}

function createInstance(overrides: Partial<AgentInstance> = {}): AgentInstance {
  return {
    id: 'test-agent',
    manifest: createManifest(),
    state: 'ready',
    resourceUsage: {
      memoryMB: 0,
      cpuTimeMs: 0,
      tokensUsed: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
    },
    health: {
      status: 'healthy',
      lastCheck: new Date(),
      consecutiveFailures: 0,
      uptime: 0,
    },
    ...overrides,
  };
}

function createTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'task-1',
    type: 'research',
    input: { query: 'test query' },
    requiredCapabilities: ['research'],
    context: {},
    ...overrides,
  };
}

function createResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    status: 'completed',
    output: { result: 'done' },
    artifacts: [],
    memoryUpdates: [],
    metadata: {},
    ...overrides,
  };
}

function createMockAgent(overrides: Partial<IAgent> = {}): IAgent {
  return {
    initialize: vi.fn(async () => {}),
    execute: vi.fn(async () => createResult()),
    validate: vi.fn(async () => ({ valid: true, errors: [] })),
    heartbeat: vi.fn(async () => ({
      status: 'healthy' as const,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      uptime: 0,
    })),
    shutdown: vi.fn(async () => {}),
    ...overrides,
  };
}

// ===========================================================================
// IAgent Interface Contract Validation
// ===========================================================================

describe('IAgent Interface Contract', () => {
  it('should have initialize method', () => {
    const agent = createMockAgent();
    expect(typeof agent.initialize).toBe('function');
  });

  it('should have execute method', () => {
    const agent = createMockAgent();
    expect(typeof agent.execute).toBe('function');
  });

  it('should have validate method', () => {
    const agent = createMockAgent();
    expect(typeof agent.validate).toBe('function');
  });

  it('should have heartbeat method', () => {
    const agent = createMockAgent();
    expect(typeof agent.heartbeat).toBe('function');
  });

  it('should have shutdown method', () => {
    const agent = createMockAgent();
    expect(typeof agent.shutdown).toBe('function');
  });

  it('should return AgentResult from execute', async () => {
    const agent = createMockAgent();
    const result = await agent.execute(createTask());
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('artifacts');
    expect(result).toHaveProperty('memoryUpdates');
    expect(result).toHaveProperty('metadata');
  });

  it('should return validation result from validate', async () => {
    const agent = createMockAgent();
    const result = await agent.validate(createTask());
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('should return AgentHealthStatus from heartbeat', async () => {
    const agent = createMockAgent();
    const status = await agent.heartbeat();
    expect(status).toHaveProperty('status');
    expect(status).toHaveProperty('lastCheck');
    expect(status).toHaveProperty('consecutiveFailures');
    expect(status).toHaveProperty('uptime');
  });
});

// ===========================================================================
// AgentRegistry
// ===========================================================================

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('should register an agent', () => {
    registry.register(createInstance());
    expect(registry.has('test-agent')).toBe(true);
  });

  it('should throw on duplicate registration', () => {
    registry.register(createInstance());
    expect(() => registry.register(createInstance())).toThrow('already registered');
  });

  it('should unregister an agent', () => {
    registry.register(createInstance());
    const removed = registry.unregister('test-agent');
    expect(removed).toBeDefined();
    expect(registry.has('test-agent')).toBe(false);
  });

  it('should return undefined for unknown unregister', () => {
    expect(registry.unregister('unknown')).toBeUndefined();
  });

  it('should get an agent by id', () => {
    registry.register(createInstance());
    expect(registry.get('test-agent')).toBeDefined();
  });

  it('should return undefined for unknown id', () => {
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('should list all agents', () => {
    registry.register(createInstance({ id: 'a', manifest: createManifest({ id: 'a' }) }));
    registry.register(createInstance({ id: 'b', manifest: createManifest({ id: 'b' }) }));
    expect(registry.list()).toHaveLength(2);
  });

  it('should get agents by capability', () => {
    registry.register(createInstance({
      id: 'researcher',
      manifest: createManifest({ id: 'researcher', capabilities: ['research', 'analysis'] }),
    }));
    registry.register(createInstance({
      id: 'planner',
      manifest: createManifest({ id: 'planner', capabilities: ['planning'] }),
    }));
    expect(registry.getByCapability('research')).toHaveLength(1);
    expect(registry.getByCapability('planning')).toHaveLength(1);
    expect(registry.getByCapability('coding')).toHaveLength(0);
  });

  it('should get ready agents', () => {
    registry.register(createInstance({ id: 'a', state: 'ready' }));
    registry.register(createInstance({
      id: 'b',
      manifest: createManifest({ id: 'b' }),
      state: 'running',
    }));
    expect(registry.getReady()).toHaveLength(1);
    expect(registry.getReady()[0].id).toBe('a');
  });

  it('should get agents by state', () => {
    registry.register(createInstance({ id: 'a', state: 'ready' }));
    registry.register(createInstance({
      id: 'b',
      manifest: createManifest({ id: 'b' }),
      state: 'failed',
    }));
    expect(registry.getByState('ready')).toHaveLength(1);
    expect(registry.getByState('failed')).toHaveLength(1);
    expect(registry.getByState('running')).toHaveLength(0);
  });

  it('should report count', () => {
    expect(registry.count()).toBe(0);
    registry.register(createInstance({ id: 'a' }));
    expect(registry.count()).toBe(1);
    registry.register(createInstance({
      id: 'b',
      manifest: createManifest({ id: 'b' }),
    }));
    expect(registry.count()).toBe(2);
  });

  it('should clear all entries', () => {
    registry.register(createInstance({ id: 'a' }));
    registry.register(createInstance({
      id: 'b',
      manifest: createManifest({ id: 'b' }),
    }));
    registry.clear();
    expect(registry.count()).toBe(0);
  });

  it('should return empty list when no agents registered', () => {
    expect(registry.list()).toHaveLength(0);
  });

  it('should return empty array for capability query with no agents', () => {
    expect(registry.getByCapability('anything')).toHaveLength(0);
  });
});

// ===========================================================================
// AgentManager
// ===========================================================================

describe('AgentManager', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let registry: AgentRegistry;
  let manager: AgentManager;

  beforeEach(() => {
    eventBus = createMockEventBus();
    registry = new AgentRegistry();
    manager = new AgentManager({ eventBus, registry });
  });

  it('should discover an agent', async () => {
    const instance = await manager.discover(createManifest());
    expect(instance.id).toBe('test-agent');
    expect(instance.state).toBe('discovered');
    expect(registry.has('test-agent')).toBe(true);
  });

  it('should emit AGENT_DISCOVERED event', async () => {
    await manager.discover(createManifest());
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_DISCOVERED,
      expect.objectContaining({ agentId: 'test-agent' }),
    );
  });

  it('should verify an agent', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    const agent = manager.getAgent('test-agent');
    expect(agent?.state).toBe('verified');
  });

  it('should emit AGENT_VERIFIED event', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_VERIFIED,
      expect.objectContaining({ agentId: 'test-agent' }),
    );
  });

  it('should reject verify for unknown agent', async () => {
    await expect(manager.verify('unknown')).rejects.toThrow('not found');
  });

  it('should reject verify for wrong state', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await expect(manager.verify('test-agent')).rejects.toThrow('expected "discovered"');
  });

  it('should reject verify for invalid manifest', async () => {
    const badManifest = createManifest({ id: '', version: '', name: '' });
    // First discover will create the instance (discovery doesn't validate)
    await manager.discover(badManifest);
    await expect(manager.verify('')).rejects.toThrow();
  });

  it('should load an agent', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    const agent = manager.getAgent('test-agent');
    expect(agent?.state).toBe('loaded');
    expect(agent?.loadedAt).toBeDefined();
  });

  it('should emit AGENT_LOADED event', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_LOADED,
      expect.objectContaining({ agentId: 'test-agent' }),
    );
  });

  it('should reject load for wrong state', async () => {
    await manager.discover(createManifest());
    await expect(manager.load('test-agent', createMockAgent())).rejects.toThrow('expected "verified"');
  });

  it('should activate an agent', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    await manager.activate('test-agent');
    const agent = manager.getAgent('test-agent');
    expect(agent?.state).toBe('ready');
  });

  it('should emit AGENT_READY event on activation', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    await manager.activate('test-agent');
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_READY,
      expect.objectContaining({ agentId: 'test-agent' }),
    );
  });

  it('should deactivate an agent', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    await manager.activate('test-agent');
    await manager.deactivate('test-agent');
    const agent = manager.getAgent('test-agent');
    expect(agent?.state).toBe('paused');
  });

  it('should emit AGENT_PAUSED event on deactivation', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    await manager.activate('test-agent');
    await manager.deactivate('test-agent');
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_PAUSED,
      expect.objectContaining({ agentId: 'test-agent' }),
    );
  });

  it('should disable an agent with reason', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    await manager.activate('test-agent');
    await manager.disable('test-agent', 'resource limit exceeded');
    const agent = manager.getAgent('test-agent');
    expect(agent?.state).toBe('disabled');
    expect(agent?.error).toBe('resource limit exceeded');
  });

  it('should emit AGENT_DISABLED event', async () => {
    await manager.discover(createManifest());
    await manager.disable('test-agent', 'test reason');
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_DISABLED,
      expect.objectContaining({ agentId: 'test-agent', reason: 'test reason' }),
    );
  });

  it('should restart an agent', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    await manager.activate('test-agent');
    await manager.restart('test-agent');
    const agent = manager.getAgent('test-agent');
    expect(agent?.state).toBe('ready');
    expect(agent?.error).toBeUndefined();
  });

  it('should emit AGENT_RESTARTING and AGENT_READY events on restart', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    await manager.activate('test-agent');
    await manager.restart('test-agent');
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_RESTARTING,
      expect.objectContaining({ agentId: 'test-agent' }),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_READY,
      expect.objectContaining({ agentId: 'test-agent', restarted: true }),
    );
  });

  it('should follow full lifecycle: discovered → verified → loaded → ready', async () => {
    const manifest = createManifest();
    await manager.discover(manifest);
    expect(manager.getAgent('test-agent')?.state).toBe('discovered');

    await manager.verify('test-agent');
    expect(manager.getAgent('test-agent')?.state).toBe('verified');

    await manager.load('test-agent', createMockAgent());
    expect(manager.getAgent('test-agent')?.state).toBe('loaded');

    await manager.activate('test-agent');
    expect(manager.getAgent('test-agent')?.state).toBe('ready');
  });

  it('should emit state change events for each transition', async () => {
    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    await manager.activate('test-agent');

    const stateChanges = eventBus.emitted.filter(
      (e) => e.event === AgentEvents.AGENT_STATE_CHANGED,
    );
    expect(stateChanges.length).toBeGreaterThanOrEqual(3);
    expect(stateChanges[0].data.oldState).toBe('discovered');
    expect(stateChanges[0].data.newState).toBe('verified');
  });

  it('should list all agents', async () => {
    await manager.discover(createManifest());
    await manager.discover(createManifest({
      id: 'agent-2',
      name: 'Agent 2',
    }));
    expect(manager.listAgents()).toHaveLength(2);
  });

  it('should get agents by state', async () => {
    await manager.discover(createManifest());
    await manager.discover(createManifest({
      id: 'agent-2',
      name: 'Agent 2',
    }));
    await manager.verify('agent-2');
    const discovered = manager.getAgentsByState('discovered');
    const verified = manager.getAgentsByState('verified');
    expect(discovered).toHaveLength(1);
    expect(verified).toHaveLength(1);
  });

  it('should return health status from healthCheck', async () => {
    await manager.discover(createManifest());
    const health = await manager.healthCheck('test-agent');
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('lastCheck');
  });

  it('should return health statuses from healthCheckAll', async () => {
    await manager.discover(createManifest());
    await manager.discover(createManifest({ id: 'agent-2', name: 'Agent 2' }));
    const healthAll = await manager.healthCheckAll();
    expect(healthAll).toHaveLength(2);
  });

  it('should reject operations on unknown agents', async () => {
    await expect(manager.activate('unknown')).rejects.toThrow('not found');
    await expect(manager.deactivate('unknown')).rejects.toThrow('not found');
    await expect(manager.disable('unknown', 'reason')).rejects.toThrow('not found');
    await expect(manager.restart('unknown')).rejects.toThrow('not found');
    await expect(manager.healthCheck('unknown')).rejects.toThrow('not found');
  });

  it('should get the recovery manager', () => {
    expect(manager.getRecoveryManager()).toBeInstanceOf(RecoveryManager);
  });
});

// ===========================================================================
// AgentScheduler
// ===========================================================================

describe('AgentScheduler', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let registry: AgentRegistry;
  let scheduler: AgentScheduler;

  beforeEach(() => {
    eventBus = createMockEventBus();
    registry = new AgentRegistry();
    scheduler = new AgentScheduler({ registry, eventBus });
  });

  it('should find the best agent for a task', () => {
    registry.register(createInstance({
      id: 'researcher',
      manifest: createManifest({
        id: 'researcher',
        capabilities: ['research', 'analysis'],
        priority: 1,
      }),
    }));
    registry.register(createInstance({
      id: 'planner',
      manifest: createManifest({
        id: 'planner',
        capabilities: ['planning'],
        priority: 2,
      }),
    }));

    const task = createTask({ requiredCapabilities: ['research'] });
    const best = scheduler.findBestAgent(task);
    expect(best).not.toBeNull();
    expect(best!.id).toBe('researcher');
  });

  it('should return null when no agents available', () => {
    const task = createTask();
    const best = scheduler.findBestAgent(task);
    expect(best).toBeNull();
  });

  it('should return null when no agent has required capabilities', () => {
    registry.register(createInstance({
      id: 'planner',
      manifest: createManifest({
        id: 'planner',
        capabilities: ['planning'],
      }),
    }));
    const task = createTask({ requiredCapabilities: ['coding'] });
    const best = scheduler.findBestAgent(task);
    expect(best).toBeNull();
  });

  it('should not select non-ready agents', () => {
    registry.register(createInstance({
      id: 'researcher',
      manifest: createManifest({ id: 'researcher', capabilities: ['research'] }),
      state: 'running',
    }));
    const task = createTask({ requiredCapabilities: ['research'] });
    const best = scheduler.findBestAgent(task);
    expect(best).toBeNull();
  });

  it('should select by priority when scores are equal', () => {
    registry.register(createInstance({
      id: 'agent-a',
      manifest: createManifest({
        id: 'agent-a',
        capabilities: ['research'],
        priority: 10,
      }),
    }));
    registry.register(createInstance({
      id: 'agent-b',
      manifest: createManifest({
        id: 'agent-b',
        capabilities: ['research'],
        priority: 1,
      }),
    }));
    const task = createTask({ requiredCapabilities: ['research'] });
    const best = scheduler.findBestAgent(task);
    expect(best!.id).toBe('agent-b'); // lower priority number = higher priority
  });

  it('should score an agent correctly', () => {
    const agent = createInstance({
      manifest: createManifest({ capabilities: ['research', 'planning', 'analysis'] }),
    });
    const task = createTask({ requiredCapabilities: ['research', 'planning'] });
    const score = scheduler.scoreAgent(agent, task);
    expect(score.score).toBe(100);
    expect(score.available).toBe(true);
    expect(score.capabilities).toContain('research');
    expect(score.capabilities).toContain('planning');
  });

  it('should score partial capability match', () => {
    const agent = createInstance({
      manifest: createManifest({ capabilities: ['research'] }),
    });
    const task = createTask({ requiredCapabilities: ['research', 'planning'] });
    const score = scheduler.scoreAgent(agent, task);
    expect(score.score).toBe(50);
  });

  it('should assign a task to an agent', async () => {
    registry.register(createInstance());
    const task = createTask();
    await scheduler.assign('test-agent', task);
    const agent = registry.get('test-agent');
    expect(agent?.state).toBe('assigned');
    expect(agent?.assignedTask).toBe('task-1');
  });

  it('should emit AGENT_ASSIGNED event', async () => {
    registry.register(createInstance());
    const task = createTask();
    await scheduler.assign('test-agent', task);
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_ASSIGNED,
      expect.objectContaining({ agentId: 'test-agent', taskId: 'task-1' }),
    );
  });

  it('should reject assign for non-ready agent', async () => {
    registry.register(createInstance({ state: 'running' }));
    await expect(scheduler.assign('test-agent', createTask())).rejects.toThrow('not available');
  });

  it('should reject assign for unknown agent', async () => {
    await expect(scheduler.assign('unknown', createTask())).rejects.toThrow('not found');
  });

  it('should reject assign when at max concurrent tasks', async () => {
    registry.register(createInstance({
      manifest: createManifest({ resourceLimits: { ...createManifest().resourceLimits, maxConcurrentTasks: 1 } }),
    }));
    await scheduler.assign('test-agent', createTask({ id: 'task-1' }));
    await expect(scheduler.assign('test-agent', createTask({ id: 'task-2' }))).rejects.toThrow('maximum concurrent tasks');
  });

  it('should complete a task', async () => {
    registry.register(createInstance());
    const task = createTask();
    await scheduler.assign('test-agent', task);
    await scheduler.complete('test-agent', createResult());
    const agent = registry.get('test-agent');
    expect(agent?.state).toBe('ready');
    expect(agent?.assignedTask).toBeUndefined();
  });

  it('should emit AGENT_TASK_COMPLETED event', async () => {
    registry.register(createInstance());
    const task = createTask();
    await scheduler.assign('test-agent', task);
    await scheduler.complete('test-agent', createResult());
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_TASK_COMPLETED,
      expect.objectContaining({ agentId: 'test-agent', taskId: 'task-1' }),
    );
  });

  it('should fail a task', async () => {
    registry.register(createInstance());
    const task = createTask();
    await scheduler.assign('test-agent', task);
    await scheduler.fail('test-agent', 'execution error');
    const agent = registry.get('test-agent');
    expect(agent?.state).toBe('failed');
    expect(agent?.error).toBe('execution error');
  });

  it('should emit AGENT_TASK_FAILED event on failure', async () => {
    registry.register(createInstance());
    const task = createTask();
    await scheduler.assign('test-agent', task);
    await scheduler.fail('test-agent', 'error');
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_TASK_FAILED,
      expect.objectContaining({ agentId: 'test-agent', error: 'error' }),
    );
  });

  it('should enqueue and dequeue tasks by priority', () => {
    scheduler.enqueue(createTask({ id: 'task-low', priority: 10 }));
    scheduler.enqueue(createTask({ id: 'task-high', priority: 1 }));
    scheduler.enqueue(createTask({ id: 'task-mid', priority: 5 }));

    expect(scheduler.dequeue()?.id).toBe('task-high');
    expect(scheduler.dequeue()?.id).toBe('task-mid');
    expect(scheduler.dequeue()?.id).toBe('task-low');
  });

  it('should dequeue undefined when queue is empty', () => {
    expect(scheduler.dequeue()).toBeUndefined();
  });

  it('should report queue status', () => {
    scheduler.enqueue(createTask({ id: 't1' }));
    scheduler.enqueue(createTask({ id: 't2' }));
    const status = scheduler.getQueueStatus();
    expect(status.pending).toBe(2);
    expect(status.assigned).toBe(0);
    expect(status.running).toBe(0);
  });

  it('should track assigned agent for a task', async () => {
    registry.register(createInstance());
    const task = createTask();
    await scheduler.assign('test-agent', task);
    expect(scheduler.getAssignedAgent('task-1')).toBe('test-agent');
  });

  it('should count agent assignments', async () => {
    registry.register(createInstance());
    await scheduler.assign('test-agent', createTask({ id: 't1' }));
    await scheduler.assign('test-agent', createTask({ id: 't2' }));
    expect(scheduler.getAgentAssignmentCount('test-agent')).toBe(2);
  });

  it('should get pending tasks', () => {
    scheduler.enqueue(createTask({ id: 't1' }));
    scheduler.enqueue(createTask({ id: 't2' }));
    expect(scheduler.getPendingTasks()).toHaveLength(2);
  });

  it('should clear pending tasks', () => {
    scheduler.enqueue(createTask({ id: 't1' }));
    scheduler.clearPending();
    expect(scheduler.getPendingTasks()).toHaveLength(0);
  });

  it('should not select at-max-capacity agent', () => {
    registry.register(createInstance({
      id: 'limited',
      manifest: createManifest({
        id: 'limited',
        capabilities: ['research'],
        resourceLimits: { ...createManifest().resourceLimits, maxConcurrentTasks: 1 },
      }),
    }));
    // Pre-assign a task
    scheduler.assign('limited', createTask({ id: 'pre-assigned' }));
    const task = createTask({ requiredCapabilities: ['research'] });
    const best = scheduler.findBestAgent(task);
    expect(best).toBeNull();
  });
});

// ===========================================================================
// AgentExecutor
// ===========================================================================

describe('AgentExecutor', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let executor: AgentExecutor;

  beforeEach(() => {
    eventBus = createMockEventBus();
    executor = new AgentExecutor({ eventBus });
  });

  it('should execute a task through an agent', async () => {
    const mockAgent = createMockAgent();
    const agent = createInstance();
    executor.registerImplementation('test-agent', mockAgent);

    const result = await executor.execute(agent, createTask());
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ result: 'done' });
    expect(mockAgent.execute).toHaveBeenCalled();
  });

  it('should emit AGENT_RUNNING event before execution', async () => {
    executor.registerImplementation('test-agent', createMockAgent());
    const agent = createInstance();

    await executor.execute(agent, createTask());
    const runningEvents = eventBus.emitted.filter(
      (e) => e.event === AgentEvents.AGENT_RUNNING,
    );
    expect(runningEvents).toHaveLength(1);
  });

  it('should emit AGENT_COMPLETED event after successful execution', async () => {
    executor.registerImplementation('test-agent', createMockAgent());
    const agent = createInstance();

    await executor.execute(agent, createTask());
    const completedEvents = eventBus.emitted.filter(
      (e) => e.event === AgentEvents.AGENT_COMPLETED,
    );
    expect(completedEvents).toHaveLength(1);
  });

  it('should update resource usage on success', async () => {
    executor.registerImplementation('test-agent', createMockAgent());
    const agent = createInstance();

    await executor.execute(agent, createTask());
    expect(agent.resourceUsage.tasksCompleted).toBe(1);
    expect(agent.resourceUsage.cpuTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should throw when no implementation registered', async () => {
    const agent = createInstance();
    await expect(executor.execute(agent, createTask())).rejects.toThrow('No implementation registered');
  });

  it('should handle execution errors', async () => {
    const failingAgent = createMockAgent({
      execute: vi.fn(async () => { throw new Error('execution failed'); }),
    });
    executor.registerImplementation('test-agent', failingAgent);
    const agent = createInstance();

    await expect(executor.execute(agent, createTask())).rejects.toThrow('execution failed');
    expect(agent.resourceUsage.tasksFailed).toBe(1);
    expect(agent.error).toBe('execution failed');
  });

  it('should emit AGENT_FAILED event on error', async () => {
    const failingAgent = createMockAgent({
      execute: vi.fn(async () => { throw new Error('boom'); }),
    });
    executor.registerImplementation('test-agent', failingAgent);
    const agent = createInstance();

    try {
      await executor.execute(agent, createTask());
    } catch {
      // Expected
    }
    const failedEvents = eventBus.emitted.filter(
      (e) => e.event === AgentEvents.AGENT_FAILED,
    );
    expect(failedEvents).toHaveLength(1);
  });

  it('should enforce execution timeout', async () => {
    const slowAgent = createMockAgent({
      execute: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return createResult();
      }),
    });
    executor.registerImplementation('test-agent', slowAgent);
    const agent = createInstance();
    const task = createTask({ timeout: 100 });

    await expect(executor.execute(agent, task)).rejects.toThrow('timed out');
  });

  it('should use default timeout from manifest when task has no timeout', async () => {
    const slowAgent = createMockAgent({
      execute: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return createResult();
      }),
    });
    executor.registerImplementation('test-agent', slowAgent);
    const agent = createInstance({
      manifest: createManifest({
        resourceLimits: { ...createManifest().resourceLimits, executionTimeoutMs: 100 },
      }),
    });

    await expect(executor.execute(agent, createTask())).rejects.toThrow('timed out');
  });

  it('should register and retrieve implementations', () => {
    const impl = createMockAgent();
    executor.registerImplementation('test-agent', impl);
    expect(executor.getImplementation('test-agent')).toBe(impl);
  });

  it('should unregister implementations', () => {
    executor.registerImplementation('test-agent', createMockAgent());
    const removed = executor.unregisterImplementation('test-agent');
    expect(removed).toBeDefined();
    expect(executor.getImplementation('test-agent')).toBeUndefined();
  });

  it('should report implementation count', () => {
    expect(executor.count()).toBe(0);
    executor.registerImplementation('a', createMockAgent());
    executor.registerImplementation('b', createMockAgent());
    expect(executor.count()).toBe(2);
  });
});

// ===========================================================================
// AgentHealthMonitor
// ===========================================================================

describe('AgentHealthMonitor', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let registry: AgentRegistry;
  let monitor: AgentHealthMonitor;

  beforeEach(() => {
    eventBus = createMockEventBus();
    registry = new AgentRegistry();
    monitor = new AgentHealthMonitor({ eventBus, registry, intervalMs: 1000 });
  });

  it('should check a specific agent health', async () => {
    const agent = createInstance();
    registry.register(agent);
    const mockImpl = createMockAgent();
    monitor.registerImplementation('test-agent', mockImpl);

    const status = await monitor.checkAgent('test-agent');
    expect(status.status).toBe('healthy');
    expect(status.consecutiveFailures).toBe(0);
  });

  it('should emit AGENT_HEALTH_CHECK event', async () => {
    registry.register(createInstance());
    monitor.registerImplementation('test-agent', createMockAgent());

    await monitor.checkAgent('test-agent');
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_HEALTH_CHECK,
      expect.objectContaining({ agentId: 'test-agent' }),
    );
  });

  it('should handle heartbeat failure', async () => {
    registry.register(createInstance());
    const failingImpl = createMockAgent({
      heartbeat: vi.fn(async () => { throw new Error('heartbeat failed'); }),
    });
    monitor.registerImplementation('test-agent', failingImpl);

    const status = await monitor.checkAgent('test-agent');
    expect(status.consecutiveFailures).toBe(1);
  });

  it('should mark unhealthy after failure threshold', async () => {
    const manifest = createManifest({ healthChecks: { intervalMs: 30000, timeoutMs: 5000, failureThreshold: 2 } });
    registry.register(createInstance({ id: 'flaky', manifest }));
    const failingImpl = createMockAgent({
      heartbeat: vi.fn(async () => { throw new Error('fail'); }),
    });
    monitor.registerImplementation('flaky', failingImpl);

    await monitor.checkAgent('flaky');
    const status2 = await monitor.checkAgent('flaky');
    expect(status2.status).toBe('unhealthy');
    expect(status2.consecutiveFailures).toBe(2);
  });

  it('should emit AGENT_UNHEALTHY event when threshold exceeded', async () => {
    const manifest = createManifest({ healthChecks: { intervalMs: 30000, timeoutMs: 5000, failureThreshold: 1 } });
    registry.register(createInstance({ id: 'flaky', manifest }));
    monitor.registerImplementation('flaky', createMockAgent({
      heartbeat: vi.fn(async () => { throw new Error('fail'); }),
    }));

    await monitor.checkAgent('flaky');
    const unhealthyEvents = eventBus.emitted.filter(
      (e) => e.event === AgentEvents.AGENT_UNHEALTHY,
    );
    expect(unhealthyEvents).toHaveLength(1);
  });

  it('should check all agents', async () => {
    registry.register(createInstance({ id: 'a' }));
    registry.register(createInstance({
      id: 'b',
      manifest: createManifest({ id: 'b' }),
    }));
    monitor.registerImplementation('a', createMockAgent());
    monitor.registerImplementation('b', createMockAgent());

    const results = await monitor.checkAll();
    expect(results.size).toBe(2);
  });

  it('should get unhealthy agents', () => {
    registry.register(createInstance({
      id: 'healthy',
      health: { status: 'healthy', lastCheck: new Date(), consecutiveFailures: 0, uptime: 0 },
    }));
    registry.register(createInstance({
      id: 'sick',
      manifest: createManifest({ id: 'sick' }),
      health: { status: 'unhealthy', lastCheck: new Date(), consecutiveFailures: 5, uptime: 1000 },
    }));
    expect(monitor.getUnhealthy()).toHaveLength(1);
    expect(monitor.getUnhealthy()[0].id).toBe('sick');
  });

  it('should start and stop periodic monitoring', () => {
    monitor.start();
    monitor.stop();
    // Should not throw
    expect(true).toBe(true);
  });

  it('should not double-start monitoring', () => {
    monitor.start();
    monitor.start(); // Should be no-op
    monitor.stop();
  });

  it('should handle no implementation gracefully', async () => {
    registry.register(createInstance());
    // No implementation registered
    const status = await monitor.checkAgent('test-agent');
    expect(status.status).toBe('unhealthy');
  });

  it('should unregister implementations', () => {
    monitor.registerImplementation('test-agent', createMockAgent());
    expect(monitor.count()).toBe(1);
    monitor.unregisterImplementation('test-agent');
    expect(monitor.count()).toBe(0);
  });

  it('should throw on check for unknown agent', async () => {
    await expect(monitor.checkAgent('unknown')).rejects.toThrow('not found');
  });

  it('should get health history', async () => {
    registry.register(createInstance());
    monitor.registerImplementation('test-agent', createMockAgent());
    await monitor.checkAgent('test-agent');
    const history = monitor.getHealthHistory('test-agent');
    expect(history).toBeDefined();
    expect(history?.status).toBe('healthy');
  });
});

// ===========================================================================
// CapabilityResolver
// ===========================================================================

describe('CapabilityResolver', () => {
  let resolver: CapabilityResolver;

  beforeEach(() => {
    resolver = new CapabilityResolver();
  });

  it('should resolve agents with all required capabilities', () => {
    const agents = [
      createInstance({
        id: 'a',
        manifest: createManifest({ id: 'a', capabilities: ['research', 'planning'] }),
      }),
      createInstance({
        id: 'b',
        manifest: createManifest({ id: 'b', capabilities: ['coding'] }),
      }),
    ];
    const result = resolver.resolve(['research'], agents);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('should resolve all agents when no capabilities required', () => {
    const agents = [
      createInstance({ id: 'a' }),
      createInstance({ id: 'b', manifest: createManifest({ id: 'b' }) }),
    ];
    const result = resolver.resolve([], agents);
    expect(result).toHaveLength(2);
  });

  it('should return empty when no agent matches', () => {
    const agents = [
      createInstance({
        id: 'a',
        manifest: createManifest({ id: 'a', capabilities: ['research'] }),
      }),
    ];
    const result = resolver.resolve(['coding'], agents);
    expect(result).toHaveLength(0);
  });

  it('should score agent with full match', () => {
    const agent = createInstance({
      manifest: createManifest({ capabilities: ['research', 'planning', 'analysis'] }),
    });
    const score = resolver.score(agent, ['research', 'planning']);
    expect(score).toBe(100);
  });

  it('should score agent with partial match', () => {
    const agent = createInstance({
      manifest: createManifest({ capabilities: ['research'] }),
    });
    const score = resolver.score(agent, ['research', 'planning']);
    expect(score).toBe(50);
  });

  it('should score agent with no match', () => {
    const agent = createInstance({
      manifest: createManifest({ capabilities: ['coding'] }),
    });
    const score = resolver.score(agent, ['research']);
    expect(score).toBe(0);
  });

  it('should score 100 when no capabilities required', () => {
    const agent = createInstance();
    const score = resolver.score(agent, []);
    expect(score).toBe(100);
  });

  it('should check hasCapability', () => {
    const agent = createInstance({
      manifest: createManifest({ capabilities: ['research', 'planning'] }),
    });
    expect(resolver.hasCapability(agent, 'research')).toBe(true);
    expect(resolver.hasCapability(agent, 'coding')).toBe(false);
  });

  it('should get all unique capabilities', () => {
    const agents = [
      createInstance({
        manifest: createManifest({ capabilities: ['research', 'planning'] }),
      }),
      createInstance({
        manifest: createManifest({ id: 'b', capabilities: ['planning', 'analysis'] }),
      }),
    ];
    const caps = resolver.getAllCapabilities(agents);
    expect(caps).toHaveLength(3);
    expect(caps).toContain('research');
    expect(caps).toContain('planning');
    expect(caps).toContain('analysis');
  });

  it('should return empty capabilities for no agents', () => {
    expect(resolver.getAllCapabilities([])).toHaveLength(0);
  });

  it('should score batch and sort by score', () => {
    const agents = [
      createInstance({
        id: 'low',
        manifest: createManifest({ id: 'low', capabilities: ['research'] }),
      }),
      createInstance({
        id: 'high',
        manifest: createManifest({ id: 'high', capabilities: ['research', 'planning'] }),
      }),
    ];
    const scores = resolver.scoreBatch(['research', 'planning'], agents);
    expect(scores[0].agentId).toBe('high');
    expect(scores[0].score).toBe(100);
    expect(scores[1].agentId).toBe('low');
    expect(scores[1].score).toBe(50);
  });

  it('should mark unavailable agents in batch score', () => {
    const agents = [
      createInstance({
        id: 'busy',
        manifest: createManifest({ id: 'busy', capabilities: ['research'] }),
        state: 'running',
      }),
    ];
    const scores = resolver.scoreBatch(['research'], agents);
    expect(scores[0].available).toBe(false);
  });
});

// ===========================================================================
// MemoryBinder
// ===========================================================================

describe('MemoryBinder', () => {
  let binder: MemoryBinder;

  beforeEach(() => {
    binder = new MemoryBinder();
  });

  it('should bind an agent', async () => {
    const agent = createInstance();
    const context = await binder.bind(agent);
    expect(context).toBeDefined();
    expect(binder.isBound('test-agent')).toBe(true);
  });

  it('should throw on duplicate bind', async () => {
    await binder.bind(createInstance());
    await expect(binder.bind(createInstance())).rejects.toThrow('already bound');
  });

  it('should unbind an agent', async () => {
    await binder.bind(createInstance());
    await binder.unbind('test-agent');
    expect(binder.isBound('test-agent')).toBe(false);
  });

  it('should throw on unbind of unknown agent', async () => {
    await expect(binder.unbind('unknown')).rejects.toThrow('not bound');
  });

  it('should get context', async () => {
    const agent = createInstance();
    await binder.bind(agent);
    expect(binder.getContext('test-agent')).toBeDefined();
  });

  it('should return undefined for unknown context', () => {
    expect(binder.getContext('unknown')).toBeUndefined();
  });

  it('should report count', async () => {
    expect(binder.count()).toBe(0);
    await binder.bind(createInstance());
    expect(binder.count()).toBe(1);
  });

  it('should bind with custom context', async () => {
    const agent = createInstance();
    const customContext = {
      logger: {} as any,
      events: {} as any,
      memory: {} as any,
      config: {} as any,
      storage: {} as any,
      tasks: {} as any,
    };
    const ctx = await binder.bindWithContext(agent, customContext);
    expect(ctx).toBe(customContext);
  });

  it('should clear all bindings', async () => {
    await binder.bind(createInstance());
    binder.clear();
    expect(binder.count()).toBe(0);
  });
});

// ===========================================================================
// ModelBinder
// ===========================================================================

describe('ModelBinder', () => {
  let binder: ModelBinder;

  beforeEach(() => {
    binder = new ModelBinder();
  });

  it('should bind an agent to its model', async () => {
    const agent = createInstance();
    await binder.bind(agent);
    expect(binder.isBound('test-agent')).toBe(true);
  });

  it('should throw on duplicate bind', async () => {
    await binder.bind(createInstance());
    await expect(binder.bind(createInstance())).rejects.toThrow('already bound');
  });

  it('should unbind an agent', async () => {
    await binder.bind(createInstance());
    await binder.unbind('test-agent');
    expect(binder.isBound('test-agent')).toBe(false);
  });

  it('should throw on unbind of unknown agent', async () => {
    await expect(binder.unbind('unknown')).rejects.toThrow('not bound');
  });

  it('should get model config', async () => {
    const agent = createInstance();
    await binder.bind(agent);
    const config = binder.getModelConfig('test-agent');
    expect(config).toBeDefined();
    expect(config?.requiredModels).toEqual([]);
  });

  it('should return undefined for unknown config', () => {
    expect(binder.getModelConfig('unknown')).toBeUndefined();
  });

  it('should bind with custom config', async () => {
    const agent = createInstance();
    const customConfig = { provider: 'openai', model: 'gpt-4' };
    await binder.bindWithConfig(agent, customConfig);
    expect(binder.getModelConfig('test-agent')).toEqual(customConfig);
  });

  it('should report count', async () => {
    expect(binder.count()).toBe(0);
    await binder.bind(createInstance());
    expect(binder.count()).toBe(1);
  });

  it('should clear all bindings', async () => {
    await binder.bind(createInstance());
    binder.clear();
    expect(binder.count()).toBe(0);
  });
});

// ===========================================================================
// RecoveryManager
// ===========================================================================

describe('RecoveryManager', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let recovery: RecoveryManager;

  beforeEach(() => {
    eventBus = createMockEventBus();
    recovery = new RecoveryManager({ eventBus });
  });

  it('should handle failure and record attempt', async () => {
    await recovery.handleFailure('agent-1', new Error('crash'));
    const status = recovery.getRecoveryStatus('agent-1');
    expect(status.attempts).toBe(1);
  });

  it('should emit AGENT_RECOVERY_STARTED event', async () => {
    await recovery.handleFailure('agent-1', new Error('crash'));
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_RECOVERY_STARTED,
      expect.objectContaining({ agentId: 'agent-1', attempt: 1 }),
    );
  });

  it('should exhaust recovery after max attempts', async () => {
    await recovery.handleFailure('agent-1', new Error('crash1'));
    await recovery.handleFailure('agent-1', new Error('crash2'));
    await recovery.handleFailure('agent-1', new Error('crash3'));

    expect(recovery.isExhausted('agent-1')).toBe(true);
    const status = recovery.getRecoveryStatus('agent-1');
    expect(status.attempts).toBe(3);
    expect(status.nextAttempt).toBeUndefined();
  });

  it('should emit AGENT_DISABLED when recovery exhausted', async () => {
    await recovery.handleFailure('agent-1', new Error('crash1'));
    await recovery.handleFailure('agent-1', new Error('crash2'));
    await recovery.handleFailure('agent-1', new Error('crash3'));

    const disabledEvents = eventBus.emitted.filter(
      (e) => e.event === AgentEvents.AGENT_DISABLED,
    );
    expect(disabledEvents).toHaveLength(1);
  });

  it('should restart an agent successfully', async () => {
    const restartFn = vi.fn(async () => {});
    recovery.setRestartCallback(restartFn);
    await recovery.handleFailure('agent-1', new Error('crash'));
    await recovery.restart('agent-1');
    expect(restartFn).toHaveBeenCalledWith('agent-1');
    expect(recovery.getRecoveryStatus('agent-1').attempts).toBe(0);
  });

  it('should emit AGENT_RECOVERY_COMPLETED on successful restart', async () => {
    recovery.setRestartCallback(async () => {});
    await recovery.handleFailure('agent-1', new Error('crash'));
    await recovery.restart('agent-1');
    expect(eventBus.emit).toHaveBeenCalledWith(
      AgentEvents.AGENT_RECOVERY_COMPLETED,
      expect.objectContaining({ agentId: 'agent-1' }),
    );
  });

  it('should throw on restart without callback', async () => {
    await recovery.handleFailure('agent-1', new Error('crash'));
    await expect(recovery.restart('agent-1')).rejects.toThrow('No restart callback');
  });

  it('should throw on restart when exhausted', async () => {
    recovery.setRestartCallback(async () => {});
    await recovery.handleFailure('agent-1', new Error('crash1'));
    await recovery.handleFailure('agent-1', new Error('crash2'));
    await recovery.handleFailure('agent-1', new Error('crash3'));
    await expect(recovery.restart('agent-1')).rejects.toThrow('Recovery exhausted');
  });

  it('should handle restart failure', async () => {
    const restartFn = vi.fn(async () => { throw new Error('restart failed'); });
    recovery.setRestartCallback(restartFn);
    await recovery.handleFailure('agent-1', new Error('crash'));

    await expect(recovery.restart('agent-1')).rejects.toThrow('restart failed');
    // Should have recorded another failure
    const status = recovery.getRecoveryStatus('agent-1');
    expect(status.attempts).toBe(2);
  });

  it('should reset recovery state', async () => {
    await recovery.handleFailure('agent-1', new Error('crash'));
    recovery.reset('agent-1');
    expect(recovery.getRecoveryStatus('agent-1').attempts).toBe(0);
  });

  it('should report count', async () => {
    expect(recovery.count()).toBe(0);
    await recovery.handleFailure('agent-1', new Error('crash'));
    expect(recovery.count()).toBe(1);
  });

  it('should return default status for unknown agent', () => {
    const status = recovery.getRecoveryStatus('unknown');
    expect(status.attempts).toBe(0);
  });

  it('should return false for isExhausted on unknown agent', () => {
    expect(recovery.isExhausted('unknown')).toBe(false);
  });

  it('should clear all state', async () => {
    await recovery.handleFailure('agent-1', new Error('crash'));
    recovery.clear();
    expect(recovery.count()).toBe(0);
  });
});

// ===========================================================================
// AgentContextFactory
// ===========================================================================

describe('AgentContextFactory', () => {
  it('should create a stub context', () => {
    const factory = new AgentContextFactory();
    const agent = createInstance();
    const context = factory.createStub(agent);
    expect(context.logger).toBeDefined();
    expect(context.events).toBeDefined();
    expect(context.memory).toBeDefined();
    expect(context.config).toBeDefined();
    expect(context.storage).toBeDefined();
    expect(context.tasks).toBeDefined();
  });

  it('should have working stub logger', () => {
    const factory = new AgentContextFactory();
    const context = factory.createStub(createInstance());
    // Should not throw
    expect(() => {
      context.logger.info('test');
      context.logger.warn('test');
      context.logger.error('test');
      context.logger.debug('test');
    }).not.toThrow();
  });

  it('should have working stub memory', async () => {
    const factory = new AgentContextFactory();
    const context = factory.createStub(createInstance());
    expect(await context.memory.read('key')).toBeNull();
    await context.memory.write('key', 'value');
    // Each stub is independent
    expect(await context.memory.read('key')).toBeNull();
  });

  it('should have working stub config', () => {
    const factory = new AgentContextFactory();
    const context = factory.createStub(createInstance());
    expect(context.config.get('key')).toBeNull();
    expect(context.config.getAll()).toEqual({});
  });

  it('should have working stub storage', async () => {
    const factory = new AgentContextFactory();
    const context = factory.createStub(createInstance());
    expect(await context.storage.get('key')).toBeNull();
    await context.storage.set('key', 'value');
    // Each stub is independent
    expect(await context.storage.get('key')).toBeNull();
  });

  it('should have working stub tasks', () => {
    const factory = new AgentContextFactory();
    const context = factory.createStub(createInstance());
    expect(() => context.tasks.reportProgress(50)).not.toThrow();
    expect(context.tasks.checkCancellation()).toBe(false);
  });
});

// ===========================================================================
// Integration: Full Task Lifecycle
// ===========================================================================

describe('Integration: Full Task Lifecycle', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let registry: AgentRegistry;
  let manager: AgentManager;
  let scheduler: AgentScheduler;
  let executor: AgentExecutor;

  beforeEach(async () => {
    eventBus = createMockEventBus();
    registry = new AgentRegistry();
    manager = new AgentManager({ eventBus, registry });
    scheduler = new AgentScheduler({ registry, eventBus });
    executor = new AgentExecutor({ eventBus });

    // Setup a full agent lifecycle
    const manifest = createManifest({
      id: 'research-agent',
      name: 'Research Agent',
      capabilities: ['research', 'analysis'],
    });
    await manager.discover(manifest);
    await manager.verify('research-agent');
    const mockImpl = createMockAgent();
    await manager.load('research-agent', mockImpl);
    await manager.activate('research-agent');
    executor.registerImplementation('research-agent', mockImpl);
  });

  it('should complete full task lifecycle: assign → execute → complete', async () => {
    const task = createTask({
      requiredCapabilities: ['research'],
    });

    // Schedule
    const bestAgent = scheduler.findBestAgent(task);
    expect(bestAgent).not.toBeNull();
    expect(bestAgent!.id).toBe('research-agent');

    // Assign
    await scheduler.assign('research-agent', task);
    expect(registry.get('research-agent')?.state).toBe('assigned');

    // Execute
    const result = await executor.execute(registry.get('research-agent')!, task);
    expect(result.status).toBe('completed');

    // Complete
    await scheduler.complete('research-agent', result);
    expect(registry.get('research-agent')?.state).toBe('ready');
  });

  it('should handle agent failure during execution', async () => {
    const failingImpl = createMockAgent({
      execute: vi.fn(async () => { throw new Error('agent crashed'); }),
    });
    executor.registerImplementation('research-agent', failingImpl);

    const task = createTask({ requiredCapabilities: ['research'] });
    await scheduler.assign('research-agent', task);

    try {
      await executor.execute(registry.get('research-agent')!, task);
    } catch {
      // Expected
    }

    const agent = registry.get('research-agent');
    expect(agent?.resourceUsage.tasksFailed).toBe(1);
    expect(agent?.error).toBe('agent crashed');
  });

  it('should handle multiple tasks with different capability requirements', async () => {
    // Register a second agent
    const plannerManifest = createManifest({
      id: 'planner-agent',
      name: 'Planner Agent',
      capabilities: ['planning', 'scheduling'],
    });
    await manager.discover(plannerManifest);
    await manager.verify('planner-agent');
    const plannerImpl = createMockAgent();
    await manager.load('planner-agent', plannerImpl);
    await manager.activate('planner-agent');
    executor.registerImplementation('planner-agent', plannerImpl);

    const researchTask = createTask({
      id: 'r-task',
      requiredCapabilities: ['research'],
    });
    const planningTask = createTask({
      id: 'p-task',
      requiredCapabilities: ['planning'],
    });

    const researchAgent = scheduler.findBestAgent(researchTask);
    const planningAgent = scheduler.findBestAgent(planningTask);

    expect(researchAgent!.id).toBe('research-agent');
    expect(planningAgent!.id).toBe('planner-agent');
  });

  it('should emit correct event sequence for full lifecycle', async () => {
    eventBus.emitted.length = 0; // Reset

    const task = createTask({ requiredCapabilities: ['research'] });
    const bestAgent = scheduler.findBestAgent(task);
    await scheduler.assign(bestAgent!.id, task);

    const assignedEvents = eventBus.emitted.filter(
      (e) => e.event === AgentEvents.AGENT_ASSIGNED,
    );
    expect(assignedEvents).toHaveLength(1);
  });
});

// ===========================================================================
// Edge Cases
// ===========================================================================

describe('Edge Cases', () => {
  it('should handle no available agent for task', () => {
    const eventBus = createMockEventBus();
    const registry = new AgentRegistry();
    const scheduler = new AgentScheduler({ registry, eventBus });

    const task = createTask({ requiredCapabilities: ['nonexistent'] });
    expect(scheduler.findBestAgent(task)).toBeNull();
  });

  it('should handle all agents busy', () => {
    const eventBus = createMockEventBus();
    const registry = new AgentRegistry();
    const scheduler = new AgentScheduler({ registry, eventBus });

    registry.register(createInstance({
      manifest: createManifest({
        resourceLimits: { ...createManifest().resourceLimits, maxConcurrentTasks: 1 },
      }),
    }));

    // Pre-assign the only slot
    scheduler.assign('test-agent', createTask({ id: 'existing' }));

    const task = createTask({ requiredCapabilities: ['research'] });
    expect(scheduler.findBestAgent(task)).toBeNull();
  });

  it('should handle empty capabilities in manifest', () => {
    const registry = new AgentRegistry();
    const resolver = new CapabilityResolver();

    const agent = createInstance({
      manifest: createManifest({ capabilities: [] }),
    });
    expect(resolver.score(agent, ['research'])).toBe(0);
    expect(resolver.resolve(['research'], [agent])).toHaveLength(0);
  });

  it('should handle empty task required capabilities', () => {
    const registry = new AgentRegistry();
    const resolver = new CapabilityResolver();

    const agent = createInstance();
    expect(resolver.score(agent, [])).toBe(100);
    expect(resolver.resolve([], [agent])).toHaveLength(1);
  });

  it('should handle agent state transition events for full lifecycle', async () => {
    const eventBus = createMockEventBus();
    const registry = new AgentRegistry();
    const manager = new AgentManager({ eventBus, registry });

    await manager.discover(createManifest());
    await manager.verify('test-agent');
    await manager.load('test-agent', createMockAgent());
    await manager.activate('test-agent');

    const stateChanges = eventBus.emitted.filter(
      (e) => e.event === AgentEvents.AGENT_STATE_CHANGED,
    );

    // Should have: discovered→verified, verified→loaded, loaded→ready
    expect(stateChanges.length).toBeGreaterThanOrEqual(3);

    const transitions = stateChanges.map((e) => `${e.data.oldState}→${e.data.newState}`);
    expect(transitions).toContain('discovered→verified');
    expect(transitions).toContain('verified→loaded');
    expect(transitions).toContain('loaded→ready');
  });

  it('should handle priority ordering in scheduler', () => {
    const eventBus = createMockEventBus();
    const registry = new AgentRegistry();
    const scheduler = new AgentScheduler({ registry, eventBus });

    // All agents have same capabilities but different priorities
    registry.register(createInstance({
      id: 'low-priority',
      manifest: createManifest({
        id: 'low-priority',
        capabilities: ['research'],
        priority: 100,
      }),
    }));
    registry.register(createInstance({
      id: 'high-priority',
      manifest: createManifest({
        id: 'high-priority',
        capabilities: ['research'],
        priority: 1,
      }),
    }));

    const task = createTask({ requiredCapabilities: ['research'] });
    const best = scheduler.findBestAgent(task);
    expect(best!.id).toBe('high-priority');
  });

  it('should handle agent completion resetting assigned task', async () => {
    const eventBus = createMockEventBus();
    const registry = new AgentRegistry();
    const scheduler = new AgentScheduler({ registry, eventBus });

    registry.register(createInstance());
    const task = createTask();
    await scheduler.assign('test-agent', task);
    await scheduler.complete('test-agent', createResult());

    expect(scheduler.getAssignedAgent('task-1')).toBeUndefined();
  });
});
