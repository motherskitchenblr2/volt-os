/**
 * @module sdk.test
 * Comprehensive test suite for the VOLT OS Developer SDK.
 *
 * Targets ≥90% coverage with 40+ test cases covering:
 * - Volt client construction (defaults + custom config)
 * - Pipeline API: create, start, cancel, list, approve, reject
 * - Agent API: discover, activate, deactivate, run, list, health
 * - Plugin API: install, activate, deactivate, uninstall, list
 * - Memory API: read, write, search, delete
 * - Model API: request, listProviders, getBudget
 * - Security API: authenticate, authorize, secrets
 * - Event API: publish, subscribe
 * - Config API: get, getAll
 * - Health check: all subsystems
 * - Shutdown: graceful
 * - Error handling: invalid inputs, subsystem failures
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Volt,
  PipelineAPIImpl,
  AgentAPIImpl,
  PluginAPIImpl,
  MemoryAPIImpl,
  ModelAPIImpl,
  SecurityAPIImpl,
  EventAPIImpl,
  ConfigAPIImpl,
} from '../index.js';
import type {
  PipelineDefinition,
  PipelineInstance,
} from '@volt-os/pipeline-engine';
import type {
  AgentManifest,
  AgentTask,
  AgentResult,
  AgentInstance,
} from '@volt-os/agent-runtime';
import type {
  PluginManifest,
  PluginInstance,
} from '@volt-os/plugin-runtime';
import type {
  MemoryEntry,
  MemoryLayerType,
} from '@volt-os/memory-engine';
import type {
  ModelRequest,
  ModelResponse,
} from '@volt-os/model-router';
import type {
  Subject,
} from '@volt-os/security-engine';

// ---------------------------------------------------------------------------
// Mock Factories
// ---------------------------------------------------------------------------

function createMockPipelineManager() {
  const pipelines = new Map<string, PipelineInstance>();
  let counter = 0;
  return {
    createPipeline: vi.fn(async (def: PipelineDefinition): Promise<PipelineInstance> => {
      counter++;
      const instance: PipelineInstance = {
        id: `pipeline-${counter}`,
        definitionId: def.id,
        status: 'created',
        taskStates: new Map(),
        context: { pipelineId: '', variables: new Map(), artifacts: [] },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      pipelines.set(instance.id, instance);
      return instance;
    }),
    startPipeline: vi.fn(async (_id: string): Promise<void> => { /* noop */ }),
    cancelPipeline: vi.fn(async (_id: string, _reason: string): Promise<void> => { /* noop */ }),
    getPipeline: vi.fn((id: string) => pipelines.get(id)),
    listPipelines: vi.fn(() => Array.from(pipelines.values())),
    approveTask: vi.fn(async (_pipelineId: string, _taskId: string): Promise<void> => { /* noop */ }),
    rejectTask: vi.fn(async (_pipelineId: string, _taskId: string, _reason: string): Promise<void> => { /* noop */ }),
    healthCheck: vi.fn(async () => ({ status: 'healthy', activePipelines: 0, completedPipelines: 0 })),
    _pipelines: pipelines,
  };
}

function createMockAgentManager() {
  const agents = new Map<string, AgentInstance>();
  return {
    discover: vi.fn(async (manifest: AgentManifest): Promise<AgentInstance> => {
      const instance: AgentInstance = {
        id: manifest.id,
        manifest,
        state: 'discovered',
        resourceUsage: { memoryMB: 0, cpuTimeMs: 0, tokensUsed: 0, tasksCompleted: 0, tasksFailed: 0 },
        health: { status: 'healthy', lastCheck: new Date(), consecutiveFailures: 0, uptime: 0 },
      };
      agents.set(manifest.id, instance);
      return instance;
    }),
    activate: vi.fn(async (agentId: string): Promise<void> => {
      const agent = agents.get(agentId);
      if (!agent) throw new Error(`Agent "${agentId}" not found`);
      agent.state = 'ready';
    }),
    deactivate: vi.fn(async (agentId: string): Promise<void> => {
      const agent = agents.get(agentId);
      if (!agent) throw new Error(`Agent "${agentId}" not found`);
      agent.state = 'paused';
    }),
    getAgent: vi.fn((agentId: string) => agents.get(agentId)),
    listAgents: vi.fn(() => Array.from(agents.values())),
    healthCheck: vi.fn(async (agentId: string) => {
      const agent = agents.get(agentId);
      if (!agent) throw new Error(`Agent "${agentId}" not found`);
      return agent.health;
    }),
    _agents: agents,
  };
}

function createMockAgentExecutor() {
  return {
    execute: vi.fn(async (_agent: AgentInstance, _task: AgentTask): Promise<AgentResult> => ({
      status: 'completed',
      output: { result: 'done' },
      artifacts: [],
      memoryUpdates: [],
      metadata: { elapsedMs: 100 },
    })),
  };
}

function createMockPluginManager() {
  const plugins = new Map<string, PluginInstance>();
  return {
    install: vi.fn(async (manifest: PluginManifest): Promise<PluginInstance> => {
      const instance: PluginInstance = {
        id: manifest.id,
        manifest,
        state: 'installed',
        resourceUsage: { memoryMB: 0, cpuTimeMs: 0, tokensUsed: 0, tasksExecuted: 0 },
      };
      plugins.set(manifest.id, instance);
      return instance;
    }),
    activate: vi.fn(async (pluginId: string): Promise<void> => {
      const plugin = plugins.get(pluginId);
      if (!plugin) throw new Error(`Plugin "${pluginId}" not found`);
      plugin.state = 'healthy';
    }),
    deactivate: vi.fn(async (pluginId: string): Promise<void> => {
      const plugin = plugins.get(pluginId);
      if (!plugin) throw new Error(`Plugin "${pluginId}" not found`);
      plugin.state = 'stopped';
    }),
    uninstall: vi.fn(async (pluginId: string): Promise<void> => {
      const plugin = plugins.get(pluginId);
      if (!plugin) throw new Error(`Plugin "${pluginId}" not found`);
      plugin.state = 'removed';
    }),
    listPlugins: vi.fn(() => Array.from(plugins.values())),
    healthCheck: vi.fn(async () => ({ status: 'healthy' as const, plugins: [] })),
    _plugins: plugins,
  };
}

function createMockMemoryEngine() {
  const store = new Map<string, MemoryEntry>();
  return {
    read: vi.fn(async (_layer: MemoryLayerType, _scopeId: string, _key: string): Promise<MemoryEntry | null> => {
      for (const entry of store.values()) {
        if (entry.key === _key && entry.scopeId === _scopeId) return entry;
      }
      return null;
    }),
    write: vi.fn(async (_layer: MemoryLayerType, scopeId: string, key: string, content: string): Promise<MemoryEntry> => {
      const entry: MemoryEntry = {
        id: `mem-${Date.now()}`,
        layer: _layer,
        scopeId,
        key,
        content,
        version: 1,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.set(entry.id, entry);
      return entry;
    }),
    delete: vi.fn(async (_layer: MemoryLayerType, id: string): Promise<boolean> => {
      return store.delete(id);
    }),
    semanticSearch: vi.fn(async (_query: string, _topK?: number): Promise<Array<{ entry: MemoryEntry; score: number }>> => {
      return [];
    }),
    healthCheck: vi.fn(async () => ({ status: 'healthy' as const, layers: {} })),
    _store: store,
  };
}

function createMockModelRouter() {
  return {
    route: vi.fn(async (request: ModelRequest): Promise<ModelResponse> => ({
      id: `resp-${Date.now()}`,
      requestId: request.id,
      content: 'Hello from the model!',
      model: 'gpt-4',
      provider: 'openai',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      latencyMs: 150,
      costUsd: 0.001,
    })),
    getAvailableProviders: vi.fn(() => [
      { id: 'openai', type: 'openai' },
    ]),
    getBudgetStatus: vi.fn(() => ({ costUsd: 0.5, tokens: 1000, requestCount: 5 })),
    getProviderHealth: vi.fn(async () => []),
  };
}

function createMockSecurityEngine() {
  const secrets = new Map<string, string>();
  return {
    authenticate: vi.fn(async (token: string): Promise<{ authenticated: boolean; subject: Subject | null }> => {
      if (token === 'valid-token') {
        return {
          authenticated: true,
          subject: {
            id: 'user-1',
            type: 'user',
            roles: ['admin'],
            permissions: [],
            metadata: {},
          },
        };
      }
      return { authenticated: false, subject: null };
    }),
    authorize: vi.fn(async (_subject: Subject, _action: string, _resource: string) => ({
      allowed: true,
      reason: 'Access granted by policy',
    })),
    secrets: {
      get: vi.fn(async (name: string, _subject?: unknown): Promise<string | null> => {
        return secrets.get(name) ?? null;
      }),
      store: vi.fn(async (name: string, value: string): Promise<void> => {
        secrets.set(name, value);
      }),
    },
    healthCheck: vi.fn(async () => ({ status: 'healthy' as const, components: {} })),
    _secrets: secrets,
  };
}

function createMockEventBus() {
  const handlers = new Map<string, Set<(data: Record<string, unknown>) => void>>();
  return {
    emit: vi.fn((event: string, data: Record<string, unknown>): void => {
      const set = handlers.get(event);
      if (set) {
        for (const handler of set) {
          handler(data);
        }
      }
    }),
    on: vi.fn((event: string, handler: (data: Record<string, unknown>) => void): void => {
      if (!handlers.has(event)) {
        handlers.set(event, new Set());
      }
      handlers.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (data: Record<string, unknown>) => void): void => {
      handlers.get(event)?.delete(handler);
    }),
    _handlers: handlers,
  };
}

const mockManifest: AgentManifest = {
  id: 'researcher',
  version: '1.0.0',
  name: 'Researcher Agent',
  description: 'Researches topics',
  author: 'VOLT OS',
  capabilities: ['research', 'planning'],
  requiredTools: [],
  requiredModels: ['gpt-4'],
  requiredPermissions: [],
  memoryProfile: {
    workingMemoryMB: 128,
    longTermMemory: true,
    contextWindow: 8192,
  },
  resourceLimits: {
    maxConcurrentTasks: 2,
    maxMemoryMB: 256,
    maxCpuTimeMs: 30_000,
    maxTokensPerTask: 4096,
    executionTimeoutMs: 60_000,
  },
  priority: 1,
  healthChecks: {
    intervalMs: 30_000,
    timeoutMs: 5_000,
    failureThreshold: 3,
  },
  lifecycleHooks: {},
};

const mockPluginManifest: PluginManifest = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  author: 'Test',
  description: 'A test plugin',
  category: 'toolchain',
  permissions: [],
  capabilities: ['test'],
  events: {},
  minimumVoltVersion: '1.0.0',
  sdkVersion: '1.0.0',
  checksum: 'abc123',
  entryPoint: './index.js',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Volt Client', () => {
  describe('Construction', () => {
    it('should create a Volt client with default options', () => {
      const volt = new Volt();
      expect(volt).toBeDefined();
      expect(volt.pipeline).toBeDefined();
      expect(volt.agent).toBeDefined();
      expect(volt.plugin).toBeDefined();
      expect(volt.memory).toBeDefined();
      expect(volt.model).toBeDefined();
      expect(volt.security).toBeDefined();
      expect(volt.events).toBeDefined();
      expect(volt.config).toBeDefined();
    });

    it('should expose SDK version', () => {
      expect(Volt.VERSION).toBe('1.0.0');
    });

    it('should create a Volt client with custom config', () => {
      const volt = new Volt({ apiKey: 'vk_test', timeout: 5000 });
      expect(volt).toBeDefined();
    });

    it('should create a Volt client with subsystem dependencies', () => {
      const eventBus = createMockEventBus();
      const pipelineManager = createMockPipelineManager();
      const agentManager = createMockAgentManager();
      const agentExecutor = createMockAgentExecutor();
      const pluginManager = createMockPluginManager();
      const memoryEngine = createMockMemoryEngine();
      const modelRouter = createMockModelRouter();
      const securityEngine = createMockSecurityEngine();

      const volt = new Volt({}, {
        eventBus,
        pipelineManager: pipelineManager as never,
        agentManager: agentManager as never,
        agentExecutor: agentExecutor as never,
        pluginManager: pluginManager as never,
        memoryEngine: memoryEngine as never,
        modelRouter: modelRouter as never,
        securityEngine: securityEngine as never,
      });

      expect(volt).toBeDefined();
    });
  });

  describe('Health Check', () => {
    it('should return healthy when no subsystems are configured', async () => {
      const volt = new Volt();
      const health = await volt.health();
      expect(health.status).toBe('healthy');
      expect(health.version).toBe('1.0.0');
    });

    it('should return healthy when all subsystems are healthy', async () => {
      const volt = new Volt({}, {
        pipelineManager: createMockPipelineManager() as never,
        agentManager: createMockAgentManager() as never,
        agentExecutor: createMockAgentExecutor() as never,
        pluginManager: createMockPluginManager() as never,
        memoryEngine: createMockMemoryEngine() as never,
        securityEngine: createMockSecurityEngine() as never,
        eventBus: createMockEventBus(),
      });
      const health = await volt.health();
      expect(health.status).toBe('healthy');
      expect(health.subsystems).toBeDefined();
    });

    it('should return subsystem details in health check', async () => {
      const volt = new Volt({}, {
        pipelineManager: createMockPipelineManager() as never,
        memoryEngine: createMockMemoryEngine() as never,
        securityEngine: createMockSecurityEngine() as never,
        eventBus: createMockEventBus(),
      });
      const health = await volt.health();
      expect(health.subsystems.pipeline).toBe('healthy');
      expect(health.subsystems.memory).toBe('healthy');
      expect(health.subsystems.security).toBe('healthy');
    });
  });

  describe('Shutdown', () => {
    it('should perform graceful shutdown', async () => {
      const eventBus = createMockEventBus();
      const volt = new Volt({}, { eventBus });
      await expect(volt.shutdown()).resolves.toBeUndefined();
      expect(eventBus.emit).toHaveBeenCalledWith('sdk:shutdown', expect.objectContaining({
        version: '1.0.0',
      }));
    });
  });

  describe('Unconfigured Subsystem Errors', () => {
    it('should throw on pipeline operations when not configured', async () => {
      const volt = new Volt();
      await expect(volt.pipeline.create({ id: 'p1', name: 'p', tasks: [], config: {} }))
        .rejects.toThrow('pipeline subsystem is not configured');
    });

    it('should throw on pipeline start when not configured', async () => {
      const volt = new Volt();
      await expect(volt.pipeline.start('p1')).rejects.toThrow('pipeline subsystem is not configured');
    });

    it('should throw on pipeline cancel when not configured', async () => {
      const volt = new Volt();
      await expect(volt.pipeline.cancel('p1', 'reason')).rejects.toThrow('pipeline subsystem is not configured');
    });

    it('should return undefined for pipeline get when not configured', () => {
      const volt = new Volt();
      expect(volt.pipeline.get('p1')).toBeUndefined();
    });

    it('should return empty list for pipeline list when not configured', () => {
      const volt = new Volt();
      expect(volt.pipeline.list()).toEqual([]);
    });

    it('should throw on agent operations when not configured', async () => {
      const volt = new Volt();
      await expect(volt.agent.discover(mockManifest)).rejects.toThrow('agent subsystem is not configured');
    });

    it('should throw on agent run when not configured', async () => {
      const volt = new Volt();
      const task: AgentTask = {
        id: 't1', type: 'research', input: {},
        requiredCapabilities: ['research'], context: {},
      };
      await expect(volt.agent.run('researcher', task)).rejects.toThrow('agent subsystem is not configured');
    });

    it('should return empty list for agent list when not configured', () => {
      const volt = new Volt();
      expect(volt.agent.list()).toEqual([]);
    });

    it('should throw on agent health when not configured', async () => {
      const volt = new Volt();
      await expect(volt.agent.health('researcher')).rejects.toThrow('agent subsystem is not configured');
    });

    it('should throw on plugin install when not configured', async () => {
      const volt = new Volt();
      await expect(volt.plugin.install(mockPluginManifest)).rejects.toThrow('plugin subsystem is not configured');
    });

    it('should throw on plugin activate when not configured', async () => {
      const volt = new Volt();
      await expect(volt.plugin.activate('test')).rejects.toThrow('plugin subsystem is not configured');
    });

    it('should return empty list for plugin list when not configured', () => {
      const volt = new Volt();
      expect(volt.plugin.list()).toEqual([]);
    });

    it('should return null for memory read when not configured', async () => {
      const volt = new Volt();
      expect(await volt.memory.read('user', 'u1', 'key')).toBeNull();
    });

    it('should throw on memory write when not configured', async () => {
      const volt = new Volt();
      await expect(volt.memory.write('user', 'u1', 'key', 'val'))
        .rejects.toThrow('memory subsystem is not configured');
    });

    it('should return empty for memory search when not configured', async () => {
      const volt = new Volt();
      expect(await volt.memory.search('query')).toEqual([]);
    });

    it('should return false for memory delete when not configured', async () => {
      const volt = new Volt();
      expect(await volt.memory.delete('user', 'id1')).toBe(false);
    });

    it('should throw on model request when not configured', async () => {
      const volt = new Volt();
      await expect(volt.model.request({ agentId: 'a1', messages: [] }))
        .rejects.toThrow('model subsystem is not configured');
    });

    it('should return empty for model listProviders when not configured', () => {
      const volt = new Volt();
      expect(volt.model.listProviders()).toEqual([]);
    });

    it('should return zero budget for model getBudget when not configured', async () => {
      const volt = new Volt();
      expect(await volt.model.getBudget()).toEqual({ spent: 0, remaining: 0 });
    });

    it('should return unauthenticated for security authenticate when not configured', async () => {
      const volt = new Volt();
      expect(await volt.security.authenticate('token')).toEqual({ authenticated: false });
    });

    it('should return denied for security authorize when not configured', async () => {
      const volt = new Volt();
      const subject: Subject = { id: 'u1', type: 'user', roles: [], permissions: [], metadata: {} };
      expect(await volt.security.authorize(subject, 'read', '/docs'))
        .toEqual({ allowed: false, reason: 'Security subsystem not configured' });
    });

    it('should return null for security secrets.get when not configured', async () => {
      const volt = new Volt();
      expect(await volt.security.secrets.get('KEY')).toBeNull();
    });

    it('should throw on security secrets.store when not configured', async () => {
      const volt = new Volt();
      await expect(volt.security.secrets.store('KEY', 'val'))
        .rejects.toThrow('security subsystem is not configured');
    });
  });
});

// ---------------------------------------------------------------------------
// PipelineAPIImpl
// ---------------------------------------------------------------------------

describe('PipelineAPIImpl', () => {
  let api: PipelineAPIImpl;
  let manager: ReturnType<typeof createMockPipelineManager>;

  beforeEach(() => {
    manager = createMockPipelineManager();
    api = new PipelineAPIImpl(manager as never, createMockEventBus() as never);
  });

  it('should create a pipeline', async () => {
    const def: PipelineDefinition = {
      id: 'p1', name: 'Test', tasks: [],
      config: { timeoutMs: 60_000 },
    };
    const result = await api.create(def);
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.definitionId).toBe('p1');
    expect(manager.createPipeline).toHaveBeenCalledWith(def);
  });

  it('should start a pipeline', async () => {
    await api.start('p1');
    expect(manager.startPipeline).toHaveBeenCalledWith('p1');
  });

  it('should cancel a pipeline', async () => {
    await api.cancel('p1', 'no longer needed');
    expect(manager.cancelPipeline).toHaveBeenCalledWith('p1', 'no longer needed');
  });

  it('should get a pipeline by id', async () => {
    const def: PipelineDefinition = {
      id: 'p1', name: 'Test', tasks: [],
      config: {},
    };
    const instance = await api.create(def);
    expect(api.get(instance.id)).toBe(instance);
  });

  it('should return undefined for non-existent pipeline', () => {
    expect(api.get('nonexistent')).toBeUndefined();
  });

  it('should list all pipelines', async () => {
    expect(api.list()).toEqual([]);
    await api.create({ id: 'p1', name: 'Test 1', tasks: [], config: {} });
    await api.create({ id: 'p2', name: 'Test 2', tasks: [], config: {} });
    expect(api.list()).toHaveLength(2);
  });

  it('should approve a task', async () => {
    await api.approve('p1', 't1');
    expect(manager.approveTask).toHaveBeenCalledWith('p1', 't1');
  });

  it('should reject a task', async () => {
    await api.reject('p1', 't1', 'needs review');
    expect(manager.rejectTask).toHaveBeenCalledWith('p1', 't1', 'needs review');
  });
});

// ---------------------------------------------------------------------------
// AgentAPIImpl
// ---------------------------------------------------------------------------

describe('AgentAPIImpl', () => {
  let api: AgentAPIImpl;
  let manager: ReturnType<typeof createMockAgentManager>;
  let executor: ReturnType<typeof createMockAgentExecutor>;

  beforeEach(() => {
    manager = createMockAgentManager();
    executor = createMockAgentExecutor();
    api = new AgentAPIImpl(manager as never, executor as never);
  });

  it('should discover an agent', async () => {
    await api.discover(mockManifest);
    expect(manager.discover).toHaveBeenCalledWith(mockManifest);
    expect(manager._agents.has('researcher')).toBe(true);
  });

  it('should activate an agent', async () => {
    await api.discover(mockManifest);
    await api.activate('researcher');
    expect(manager.activate).toHaveBeenCalledWith('researcher');
  });

  it('should deactivate an agent', async () => {
    await api.discover(mockManifest);
    await api.deactivate('researcher');
    expect(manager.deactivate).toHaveBeenCalledWith('researcher');
  });

  it('should run a task through an agent', async () => {
    await api.discover(mockManifest);
    await api.activate('researcher');
    const task: AgentTask = {
      id: 't1', type: 'research', input: { query: 'test' },
      requiredCapabilities: ['research'], context: {},
    };
    const result = await api.run('researcher', task);
    expect(result).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ result: 'done' });
    expect(executor.execute).toHaveBeenCalled();
  });

  it('should throw when running task on non-existent agent', async () => {
    const task: AgentTask = {
      id: 't1', type: 'research', input: {},
      requiredCapabilities: [], context: {},
    };
    await expect(api.run('nonexistent', task))
      .rejects.toThrow('Agent "nonexistent" not found');
  });

  it('should list all agents with summary info', async () => {
    expect(api.list()).toEqual([]);
    await api.discover(mockManifest);
    const list = api.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('researcher');
    expect(list[0].capabilities).toContain('research');
  });

  it('should get agent health status', async () => {
    await api.discover(mockManifest);
    const health = await api.health('researcher');
    expect(health).toBeDefined();
    expect(health.status).toBe('healthy');
    expect(typeof health.uptime).toBe('number');
  });

  it('should throw on health check for non-existent agent', async () => {
    await expect(api.health('nonexistent'))
      .rejects.toThrow('Agent "nonexistent" not found');
  });
});

// ---------------------------------------------------------------------------
// PluginAPIImpl
// ---------------------------------------------------------------------------

describe('PluginAPIImpl', () => {
  let api: PluginAPIImpl;
  let manager: ReturnType<typeof createMockPluginManager>;

  beforeEach(() => {
    manager = createMockPluginManager();
    api = new PluginAPIImpl(manager as never);
  });

  it('should install a plugin', async () => {
    await api.install(mockPluginManifest);
    expect(manager.install).toHaveBeenCalled();
    expect(manager._plugins.has('test-plugin')).toBe(true);
  });

  it('should activate a plugin', async () => {
    await api.install(mockPluginManifest);
    await api.activate('test-plugin');
    expect(manager.activate).toHaveBeenCalledWith('test-plugin');
  });

  it('should deactivate a plugin', async () => {
    await api.install(mockPluginManifest);
    await api.deactivate('test-plugin');
    expect(manager.deactivate).toHaveBeenCalledWith('test-plugin');
  });

  it('should uninstall a plugin', async () => {
    await api.install(mockPluginManifest);
    await api.uninstall('test-plugin');
    expect(manager.uninstall).toHaveBeenCalledWith('test-plugin');
  });

  it('should list all plugins with summary info', async () => {
    expect(api.list()).toEqual([]);
    await api.install(mockPluginManifest);
    const list = api.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('test-plugin');
    expect(list[0].category).toBe('toolchain');
  });

  it('should throw on activate non-existent plugin', async () => {
    await expect(api.activate('nonexistent'))
      .rejects.toThrow('Plugin "nonexistent" not found');
  });

  it('should throw on deactivate non-existent plugin', async () => {
    await expect(api.deactivate('nonexistent'))
      .rejects.toThrow('Plugin "nonexistent" not found');
  });

  it('should throw on uninstall non-existent plugin', async () => {
    await expect(api.uninstall('nonexistent'))
      .rejects.toThrow('Plugin "nonexistent" not found');
  });
});

// ---------------------------------------------------------------------------
// MemoryAPIImpl
// ---------------------------------------------------------------------------

describe('MemoryAPIImpl', () => {
  let api: MemoryAPIImpl;
  let engine: ReturnType<typeof createMockMemoryEngine>;

  beforeEach(() => {
    engine = createMockMemoryEngine();
    api = new MemoryAPIImpl(engine as never);
  });

  it('should write a memory entry', async () => {
    const entry = await api.write('user', 'user-1', 'theme', 'dark');
    expect(entry).toBeDefined();
    expect(entry.key).toBe('theme');
    expect(entry.content).toBe('dark');
    expect(entry.scopeId).toBe('user-1');
    expect(entry.layer).toBe('user');
  });

  it('should read a memory entry', async () => {
    await api.write('user', 'user-1', 'theme', 'dark');
    const entry = await api.read('user', 'user-1', 'theme');
    expect(entry).not.toBeNull();
    expect(entry!.content).toBe('dark');
  });

  it('should return null for non-existent entry', async () => {
    const entry = await api.read('user', 'user-1', 'nonexistent');
    expect(entry).toBeNull();
  });

  it('should search memory entries', async () => {
    const results = await api.search('VOLT OS architecture', 5);
    expect(Array.isArray(results)).toBe(true);
    expect(engine.semanticSearch).toHaveBeenCalledWith('VOLT OS architecture', 5);
  });

  it('should delete a memory entry', async () => {
    const entry = await api.write('user', 'user-1', 'temp', 'value');
    const deleted = await api.delete('user', entry.id);
    expect(deleted).toBe(true);
  });

  it('should reject invalid memory layer', async () => {
    await expect(api.read('invalid_layer' as MemoryLayerType, 's1', 'key'))
      .rejects.toThrow('Invalid memory layer');
  });

  it('should reject invalid layer on write', async () => {
    await expect(api.write('bad' as MemoryLayerType, 's1', 'key', 'val'))
      .rejects.toThrow('Invalid memory layer');
  });

  it('should reject invalid layer on delete', async () => {
    await expect(api.delete('bad' as MemoryLayerType, 'id1'))
      .rejects.toThrow('Invalid memory layer');
  });
});

// ---------------------------------------------------------------------------
// ModelAPIImpl
// ---------------------------------------------------------------------------

describe('ModelAPIImpl', () => {
  let api: ModelAPIImpl;
  let router: ReturnType<typeof createMockModelRouter>;

  beforeEach(() => {
    router = createMockModelRouter();
    api = new ModelAPIImpl(router as never);
  });

  it('should send a model request', async () => {
    const response = await api.request({
      agentId: 'researcher',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(response).toBeDefined();
    expect(response.content).toBe('Hello from the model!');
    expect(response.provider).toBe('openai');
    expect(router.route).toHaveBeenCalled();
  });

  it('should auto-generate request id', async () => {
    await api.request({ agentId: 'a1', messages: [] });
    const call = router.route.mock.calls[0] as [ModelRequest];
    expect(call[0].id).toBeDefined();
    expect(typeof call[0].id).toBe('string');
  });

  it('should list providers', () => {
    const providers = api.listProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe('openai');
    expect(providers[0].enabled).toBe(true);
  });

  it('should get budget status', async () => {
    const budget = await api.getBudget();
    expect(budget.spent).toBe(0.5);
    expect(budget.remaining).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// SecurityAPIImpl
// ---------------------------------------------------------------------------

describe('SecurityAPIImpl', () => {
  let api: SecurityAPIImpl;
  let engine: ReturnType<typeof createMockSecurityEngine>;

  beforeEach(() => {
    engine = createMockSecurityEngine();
    api = new SecurityAPIImpl(engine as never);
  });

  it('should authenticate a valid token', async () => {
    const result = await api.authenticate('valid-token');
    expect(result.authenticated).toBe(true);
    expect(result.subject).toBeDefined();
    expect(result.subject!.id).toBe('user-1');
    expect(result.subject!.roles).toContain('admin');
  });

  it('should reject an invalid token', async () => {
    const result = await api.authenticate('invalid-token');
    expect(result.authenticated).toBe(false);
    expect(result.subject).toBeUndefined();
  });

  it('should authorize a subject', async () => {
    const subject: Subject = {
      id: 'u1', type: 'user', roles: ['admin'],
      permissions: [], metadata: {},
    };
    const result = await api.authorize(subject, 'read', '/docs');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('Access granted by policy');
  });

  it('should get a secret', async () => {
    engine._secrets.set('MY_KEY', 'secret-value');
    const value = await api.secrets.get('MY_KEY');
    expect(value).toBe('secret-value');
  });

  it('should return null for non-existent secret', async () => {
    const value = await api.secrets.get('NO_KEY');
    expect(value).toBeNull();
  });

  it('should store a secret', async () => {
    await api.secrets.store('NEW_KEY', 'new-value');
    expect(engine._secrets.get('NEW_KEY')).toBe('new-value');
  });
});

// ---------------------------------------------------------------------------
// EventAPIImpl
// ---------------------------------------------------------------------------

describe('EventAPIImpl', () => {
  let api: EventAPIImpl;
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    eventBus = createMockEventBus();
    api = new EventAPIImpl(eventBus);
  });

  it('should publish an event', async () => {
    await api.publish('pipeline:completed', 'pipeline', 'p-123', { status: 'ok' });
    expect(eventBus.emit).toHaveBeenCalledWith('pipeline:completed', {
      aggregateType: 'pipeline',
      aggregateId: 'p-123',
      status: 'ok',
    });
  });

  it('should subscribe to events', async () => {
    const handler = vi.fn();
    const unsub = await api.subscribe('pipeline:*', handler);
    expect(typeof unsub).toBe('function');
    expect(eventBus.on).toHaveBeenCalled();
  });

  it('should unsubscribe from events', async () => {
    const handler = vi.fn();
    const unsub = await api.subscribe('test:event', handler);
    await unsub();
    expect(eventBus.off).toHaveBeenCalled();
  });

  it('should deliver events to subscribers', async () => {
    const handler = vi.fn();
    await api.subscribe('test:event', handler);

    // Trigger via the event bus directly
    eventBus.emit('test:event', { data: 'hello' });
    expect(handler).toHaveBeenCalledWith({ data: 'hello' });
  });
});

// ---------------------------------------------------------------------------
// ConfigAPIImpl
// ---------------------------------------------------------------------------

describe('ConfigAPIImpl', () => {
  it('should get a config value', () => {
    const api = new ConfigAPIImpl({ theme: 'dark', debug: true });
    expect(api.get('theme')).toBe('dark');
    expect(api.get('debug')).toBe(true);
  });

  it('should return undefined for non-existent key', () => {
    const api = new ConfigAPIImpl({});
    expect(api.get('nonexistent')).toBeUndefined();
  });

  it('should support dot-notation for nested values', () => {
    const api = new ConfigAPIImpl({
      ui: { theme: 'dark', lang: 'en' },
    });
    expect(api.get('ui.theme')).toBe('dark');
    expect(api.get('ui.lang')).toBe('en');
  });

  it('should return undefined for deep non-existent nested key', () => {
    const api = new ConfigAPIImpl({ ui: { theme: 'dark' } });
    expect(api.get('ui.nonexistent')).toBeUndefined();
  });

  it('should return undefined when traversing through non-object', () => {
    const api = new ConfigAPIImpl({ key: 'string-value' });
    expect(api.get('key.nested')).toBeUndefined();
  });

  it('should return all config values', () => {
    const config = { a: 1, b: 'two', c: true };
    const api = new ConfigAPIImpl(config);
    expect(api.getAll()).toEqual(config);
  });

  it('should return a copy of config (not reference)', () => {
    const config = { a: 1 };
    const api = new ConfigAPIImpl(config);
    const all = api.getAll();
    all.a = 999;
    expect(api.get('a')).toBe(1);
  });

  it('should handle empty config', () => {
    const api = new ConfigAPIImpl();
    expect(api.getAll()).toEqual({});
    expect(api.get('anything')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Event API via Volt client
// ---------------------------------------------------------------------------

describe('Event API via Volt Client', () => {
  it('should publish and subscribe to events through Volt client', async () => {
    const eventBus = createMockEventBus();
    const volt = new Volt({}, { eventBus });

    const handler = vi.fn();
    await volt.events.subscribe('test:event', handler);

    await volt.events.publish('test:event', 'aggregate', 'agg-1', { key: 'value' });

    expect(handler).toHaveBeenCalledWith({
      aggregateType: 'aggregate',
      aggregateId: 'agg-1',
      key: 'value',
    });
  });
});

// ---------------------------------------------------------------------------
// Config API via Volt client
// ---------------------------------------------------------------------------

describe('Config API via Volt Client', () => {
  it('should read config values passed during construction', () => {
    const volt = new Volt({}, { config: { ui: { theme: 'dark' } } });
    expect(volt.config.get('ui.theme')).toBe('dark');
  });

  it('should return all config values', () => {
    const volt = new Volt({}, { config: { a: 1, b: 2 } });
    expect(volt.config.getAll()).toEqual({ a: 1, b: 2 });
  });
});
