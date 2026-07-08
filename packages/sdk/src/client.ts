/**
 * @module client
 * Volt — The official VOLT OS developer client.
 *
 * One import. One interface. Everything accessible.
 *
 * @example
 * ```ts
 * import { Volt } from "@volt/sdk";
 *
 * const volt = new Volt();
 *
 * // Pipeline
 * const pipeline = await volt.pipeline.create({ ... });
 * await volt.pipeline.start(pipeline.id);
 *
 * // Agent
 * await volt.agent.discover(researcherManifest);
 * const result = await volt.agent.run("researcher", { ... });
 *
 * // Memory
 * await volt.memory.write("user", "u1", "theme", "dark");
 * const results = await volt.memory.search("VOLT OS", 5);
 *
 * // Events
 * await volt.events.publish("pipeline:done", "pipeline", "p1", {});
 * ```
 */

import type {
  VoltConfig,
  PipelineAPI,
  AgentAPI,
  PluginAPI,
  MemoryAPI,
  ModelAPI,
  SecurityAPI,
  EventAPI,
  ConfigAPI,
} from './types.js';
import { PipelineAPIImpl } from './apis/pipeline-api.js';
import { AgentAPIImpl } from './apis/agent-api.js';
import { PluginAPIImpl } from './apis/plugin-api.js';
import { MemoryAPIImpl } from './apis/memory-api.js';
import { ModelAPIImpl } from './apis/model-api.js';
import { SecurityAPIImpl } from './apis/security-api.js';
import { EventAPIImpl } from './apis/event-api.js';
import { ConfigAPIImpl } from './apis/config-api.js';

// Subsystem types for constructor injection
import type {
  PipelineManager as _PipelineManager,
} from '@volt-os/pipeline-engine';
import type {
  AgentManager as _AgentManager,
  AgentExecutor as _AgentExecutor,
} from '@volt-os/agent-runtime';
import type {
  PluginManager as _PluginManager,
} from '@volt-os/plugin-runtime';
import type {
  MemoryEngine as _MemoryEngine,
} from '@volt-os/memory-engine';
import type {
  ModelRouter as _ModelRouter,
} from '@volt-os/model-router';
import type {
  SecurityEngine as _SecurityEngine,
} from '@volt-os/security-engine';
import type {
  EventBus as _SharedEventBus,
} from '@volt-os/event-bus';

/**
 * Full subsystem dependencies that can be injected into the Volt client.
 *
 * All properties are optional — omitted subsystems use stub implementations.
 */
export interface VoltDependencies {
  /** Pipeline engine manager. */
  pipelineManager?: _PipelineManager;
  /** Agent runtime manager. */
  agentManager?: _AgentManager;
  /** Agent executor for running tasks. */
  agentExecutor?: _AgentExecutor;
  /** Plugin runtime manager. */
  pluginManager?: _PluginManager;
  /** Memory engine instance. */
  memoryEngine?: _MemoryEngine;
  /** Model router instance. */
  modelRouter?: _ModelRouter;
  /** Security engine instance. */
  securityEngine?: _SecurityEngine;
  /** Shared event bus. */
  eventBus?: _SharedEventBus;
  /** Initial configuration values. */
  config?: Record<string, unknown>;
}

/**
 * Default error for unimplemented subsystem dependencies.
 */
class SubsystemNotConfiguredError extends Error {
  constructor(subsystem: string) {
    super(
      `${subsystem} subsystem is not configured. ` +
      `Pass the subsystem dependency when creating the Volt client: ` +
      `new Volt({ ${subsystem}: ... })`
    );
    this.name = 'SubsystemNotConfiguredError';
  }
}

/**
 * Volt — The official VOLT OS developer client.
 *
 * Facade over all 8 subsystems providing a single, unified API.
 * The SDK contains NO business logic — it delegates all operations
 * to the underlying subsystem implementations.
 *
 * @example
 * ```ts
 * import { Volt } from "@volt/sdk";
 *
 * const volt = new Volt();
 *
 * // Pipeline management
 * const pipeline = await volt.pipeline.create({
 *   id: 'deploy',
 *   name: 'Deploy Pipeline',
 *   tasks: [],
 *   config: { timeoutMs: 60_000 },
 * });
 * await volt.pipeline.start(pipeline.id);
 *
 * // Agent management
 * await volt.agent.activate('researcher');
 * const result = await volt.agent.run('researcher', {
 *   id: 'task-1',
 *   type: 'research',
 *   input: { query: 'VOLT OS' },
 *   requiredCapabilities: ['research'],
 *   context: {},
 * });
 *
 * // Memory operations
 * await volt.memory.write('user', 'user-1', 'preferences', JSON.stringify({ theme: 'dark' }));
 * const entry = await volt.memory.read('user', 'user-1', 'preferences');
 *
 * // Event publishing
 * await volt.events.publish('agent:completed', 'agent', 'researcher', { taskId: 'task-1' });
 *
 * // Health check
 * const health = await volt.health();
 * console.log(health.status); // 'healthy'
 *
 * // Graceful shutdown
 * await volt.shutdown();
 * ```
 */
export class Volt {
  /**
   * Pipeline subsystem API.
   * Manages pipeline creation, execution, and lifecycle.
   */
  readonly pipeline: PipelineAPI;

  /**
   * Agent subsystem API.
   * Manages agent discovery, activation, execution, and health.
   */
  readonly agent: AgentAPI;

  /**
   * Plugin subsystem API.
   * Manages plugin installation, activation, and lifecycle.
   */
  readonly plugin: PluginAPI;

  /**
   * Memory subsystem API.
   * 6-layer memory system for reading, writing, and searching.
   */
  readonly memory: MemoryAPI;

  /**
   * Model subsystem API.
   * Routes requests to optimal AI model providers.
   */
  readonly model: ModelAPI;

  /**
   * Security subsystem API.
   * Authentication, authorization, and secrets management.
   */
  readonly security: SecurityAPI;

  /**
   * Event subsystem API.
   * Publish and subscribe to events across the system.
   */
  readonly events: EventAPI;

  /**
   * Config subsystem API.
   * Read-only access to VOLT OS configuration.
   */
  readonly config: ConfigAPI;

  /** SDK version. */
  static readonly VERSION = '1.0.0';

  /** Internal event bus reference for shutdown. */
  private readonly eventBus: _SharedEventBus;

  /** Subsystem health check functions, keyed by subsystem name. */
  private readonly healthChecks: Map<string, () => Promise<{ status: string }>> = new Map();

  /**
   * Create a new Volt client.
   *
   * @param options - SDK configuration options (reserved for future use).
   * @param dependencies - Subsystem implementations to inject.
   *
   * @example
   * ```ts
   * // With defaults (stubs for all subsystems)
   * const volt = new Volt();
   *
   * // With subsystem injection
   * const volt = new Volt({}, {
   *   pipelineManager,
   *   agentManager,
   *   eventBus,
   * });
   * ```
   */
  constructor(
    _options: VoltConfig = {},
    dependencies: VoltDependencies = {},
  ) {
    // Use provided event bus or create a minimal stub
    this.eventBus = dependencies.eventBus ?? this.createStubEventBus();

    // Pipeline API
    if (dependencies.pipelineManager) {
      this.pipeline = new PipelineAPIImpl(
        dependencies.pipelineManager,
        this.eventBus,
      );
      this.healthChecks.set('pipeline', async () => {
        const result = await dependencies.pipelineManager!.healthCheck();
        return { status: result.status };
      });
    } else {
      this.pipeline = this.createStubPipelineAPI();
    }

    // Agent API
    if (dependencies.agentManager && dependencies.agentExecutor) {
      this.agent = new AgentAPIImpl(
        dependencies.agentManager,
        dependencies.agentExecutor,
      );
      this.healthChecks.set('agent', async () => {
        const agents = dependencies.agentManager!.listAgents();
        const allHealthy = agents.every(
          (a) => a.health.status === 'healthy' || a.health.status === 'degraded',
        );
        return { status: allHealthy ? 'healthy' : 'degraded' };
      });
    } else {
      this.agent = this.createStubAgentAPI();
    }

    // Plugin API
    if (dependencies.pluginManager) {
      this.plugin = new PluginAPIImpl(dependencies.pluginManager);
      this.healthChecks.set('plugin', async () => {
        const result = await dependencies.pluginManager!.healthCheck();
        return { status: result.status };
      });
    } else {
      this.plugin = this.createStubPluginAPI();
    }

    // Memory API
    if (dependencies.memoryEngine) {
      this.memory = new MemoryAPIImpl(dependencies.memoryEngine);
      this.healthChecks.set('memory', async () => {
        const result = await dependencies.memoryEngine!.healthCheck();
        return { status: result.status };
      });
    } else {
      this.memory = this.createStubMemoryAPI();
    }

    // Model API
    if (dependencies.modelRouter) {
      this.model = new ModelAPIImpl(dependencies.modelRouter);
    } else {
      this.model = this.createStubModelAPI();
    }

    // Security API
    if (dependencies.securityEngine) {
      this.security = new SecurityAPIImpl(dependencies.securityEngine);
      this.healthChecks.set('security', async () => {
        const result = await dependencies.securityEngine!.healthCheck();
        return { status: result.status };
      });
    } else {
      this.security = this.createStubSecurityAPI();
    }

    // Event API
    this.events = new EventAPIImpl(this.eventBus);

    // Config API
    this.config = new ConfigAPIImpl(dependencies.config ?? {});
  }

  /**
   * Health check across all configured subsystems.
   *
   * @returns Overall health status and per-subsystem breakdown.
   *
   * @example
   * ```ts
   * const health = await volt.health();
   * if (health.status === 'unhealthy') {
   *   console.error('System unhealthy:', health.subsystems);
   * }
   * ```
   */
  async health(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    subsystems: Record<string, string>;
    version: string;
  }> {
    const subsystems: Record<string, string> = {};

    // Run all health checks in parallel
    const entries = Array.from(this.healthChecks.entries());

    const results = await Promise.allSettled(
      entries.map(([name, check]) =>
        check().then((result) => ({ name, ...result })),
      ),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        subsystems[result.value.name] = result.value.status;
      } else {
        subsystems['unknown'] = 'unhealthy';
      }
    }

    // Determine overall status
    const statuses = Object.values(subsystems);
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (statuses.includes('unhealthy')) {
      status = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      status = 'degraded';
    }

    // If no health checks were run, mark as healthy (all stubs)
    if (statuses.length === 0) {
      status = 'healthy';
    }

    return {
      status,
      subsystems,
      version: Volt.VERSION,
    };
  }

  /**
   * Graceful shutdown of all subsystems.
   *
   * @example
   * ```ts
   * await volt.shutdown();
   * ```
   */
  async shutdown(): Promise<void> {
    // Emit shutdown event
    this.eventBus.emit('sdk:shutdown', {
      timestamp: Date.now(),
      version: Volt.VERSION,
    });
  }

  // ---------------------------------------------------------------------------
  // Stub factories for unconfigured subsystems
  // ---------------------------------------------------------------------------

  private createStubEventBus(): _SharedEventBus {
    const handlers = new Map<string, Set<(data: Record<string, unknown>) => void>>();
    return {
      emit(event: string, data: Record<string, unknown>): void {
        const set = handlers.get(event);
        if (set) {
          for (const handler of set) {
            handler(data);
          }
        }
      },
      on(event: string, handler: (data: Record<string, unknown>) => void): void {
        if (!handlers.has(event)) {
          handlers.set(event, new Set());
        }
        handlers.get(event)!.add(handler);
      },
      off(event: string, handler: (data: Record<string, unknown>) => void): void {
        handlers.get(event)?.delete(handler);
      },
    };
  }

  private createStubPipelineAPI(): PipelineAPI {
    return {
      async create(): Promise<never> {
        throw new SubsystemNotConfiguredError('pipeline');
      },
      async start(): Promise<never> {
        throw new SubsystemNotConfiguredError('pipeline');
      },
      async cancel(): Promise<never> {
        throw new SubsystemNotConfiguredError('pipeline');
      },
      get(): undefined {
        return undefined;
      },
      list(): [] {
        return [];
      },
      async approve(): Promise<never> {
        throw new SubsystemNotConfiguredError('pipeline');
      },
      async reject(): Promise<never> {
        throw new SubsystemNotConfiguredError('pipeline');
      },
    };
  }

  private createStubAgentAPI(): AgentAPI {
    return {
      async discover(): Promise<never> {
        throw new SubsystemNotConfiguredError('agent');
      },
      async activate(): Promise<never> {
        throw new SubsystemNotConfiguredError('agent');
      },
      async deactivate(): Promise<never> {
        throw new SubsystemNotConfiguredError('agent');
      },
      async run(): Promise<never> {
        throw new SubsystemNotConfiguredError('agent');
      },
      list(): [] {
        return [];
      },
      async health(): Promise<never> {
        throw new SubsystemNotConfiguredError('agent');
      },
    };
  }

  private createStubPluginAPI(): PluginAPI {
    return {
      async install(): Promise<never> {
        throw new SubsystemNotConfiguredError('plugin');
      },
      async activate(): Promise<never> {
        throw new SubsystemNotConfiguredError('plugin');
      },
      async deactivate(): Promise<never> {
        throw new SubsystemNotConfiguredError('plugin');
      },
      async uninstall(): Promise<never> {
        throw new SubsystemNotConfiguredError('plugin');
      },
      list(): [] {
        return [];
      },
    };
  }

  private createStubMemoryAPI(): MemoryAPI {
    return {
      async read(): Promise<null> {
        return null;
      },
      async write(): Promise<never> {
        throw new SubsystemNotConfiguredError('memory');
      },
      async search(): Promise<[]> {
        return [];
      },
      async delete(): Promise<boolean> {
        return false;
      },
    };
  }

  private createStubModelAPI(): ModelAPI {
    return {
      async request(): Promise<never> {
        throw new SubsystemNotConfiguredError('model');
      },
      listProviders(): [] {
        return [];
      },
      async getBudget(): Promise<{ spent: number; remaining: number }> {
        return { spent: 0, remaining: 0 };
      },
    };
  }

  private createStubSecurityAPI(): SecurityAPI {
    return {
      async authenticate(): Promise<{ authenticated: boolean }> {
        return { authenticated: false };
      },
      async authorize(): Promise<{ allowed: boolean; reason: string }> {
        return { allowed: false, reason: 'Security subsystem not configured' };
      },
      secrets: {
        async get(): Promise<null> {
          return null;
        },
        async store(): Promise<never> {
          throw new SubsystemNotConfiguredError('security');
        },
      },
    };
  }
}
