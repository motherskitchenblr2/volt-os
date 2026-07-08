/**
 * @module types
 * SDK type definitions for VOLT OS Developer SDK.
 *
 * Re-exports all public types from subsystems and defines SDK-specific
 * interfaces for the developer-facing API surface.
 */

// ---------------------------------------------------------------------------
// Import subsystem types
// ---------------------------------------------------------------------------

// Pipeline Engine
import type {
  PipelineDefinition as _PipelineDefinition,
  PipelineInstance as _PipelineInstance,
  PipelineStatus as _PipelineStatus,
  TaskDefinition as _TaskDefinition,
  TaskState as _TaskState,
  RetryPolicy as _RetryPolicy,
  PipelineConfig as _PipelineConfig,
} from '@volt-os/pipeline-engine';

// Agent Runtime
import type {
  AgentManifest as _AgentManifest,
  AgentTask as _AgentTask,
  AgentResult as _AgentResult,
  AgentState as _AgentState,
  AgentInstance as _AgentInstance,
  AgentHealthStatus as _AgentHealthStatus,
} from '@volt-os/agent-runtime';

// Plugin Runtime
import type {
  PluginManifest as _PluginManifest,
  PluginInstance as _PluginInstance,
  PluginState as _PluginState,
  PluginCategory as _PluginCategory,
  PluginPermission as _PluginPermission,
} from '@volt-os/plugin-runtime';

// Memory Engine
import type {
  MemoryEntry as _MemoryEntry,
  MemoryQuery as _MemoryQuery,
  MemoryLayerType as _MemoryLayerType,
} from '@volt-os/memory-engine';

// Model Router
import type {
  ModelRequest as _ModelRequest,
  ModelResponse as _ModelResponse,
  ModelProviderConfig as _ModelProviderConfig,
  TokenUsage as _TokenUsage,
  ChatMessage as _ChatMessage,
  BudgetConfig as _BudgetConfig,
} from '@volt-os/model-router';

// Security Engine
import type {
  Subject as _Subject,
  Permission as _Permission,
  Policy as _Policy,
  SecurityEvent as _SecurityEvent,
  AuthResult as _AuthResult,
  AuthorizationResult as _AuthorizationResult,
} from '@volt-os/security-engine';

// Event Bus
import type {
  EventBus as _SharedEventBus,
  EventHandler as _EventHandler,
} from '@volt-os/event-bus';

// ---------------------------------------------------------------------------
// Re-export subsystem types
// ---------------------------------------------------------------------------

export type {
  _PipelineDefinition as PipelineDefinition,
  _PipelineInstance as PipelineInstance,
  _PipelineStatus as PipelineStatus,
  _TaskDefinition as TaskDefinition,
  _TaskState as TaskState,
  _RetryPolicy as RetryPolicy,
  _PipelineConfig as PipelineConfig,
};

export type {
  _AgentManifest as AgentManifest,
  _AgentTask as AgentTask,
  _AgentResult as AgentResult,
  _AgentState as AgentState,
  _AgentInstance as AgentInstance,
  _AgentHealthStatus as AgentHealthStatus,
};

export type {
  _PluginManifest as PluginManifest,
  _PluginInstance as PluginInstance,
  _PluginState as PluginState,
  _PluginCategory as PluginCategory,
  _PluginPermission as PluginPermission,
};

export type {
  _MemoryEntry as MemoryEntry,
  _MemoryQuery as MemoryQuery,
  _MemoryLayerType as MemoryLayerType,
};

export type {
  _ModelRequest as ModelRequest,
  _ModelResponse as ModelResponse,
  _ModelProviderConfig as ModelProviderConfig,
  _TokenUsage as TokenUsage,
  _ChatMessage as ChatMessage,
  _BudgetConfig as BudgetConfig,
};

export type {
  _Subject as Subject,
  _Permission as Permission,
  _Policy as Policy,
  _SecurityEvent as SecurityEvent,
  _AuthResult as AuthResult,
  _AuthorizationResult as AuthorizationResult,
};

export type {
  _SharedEventBus as SharedEventBus,
  _EventHandler as EventHandler,
};

// ---------------------------------------------------------------------------
// SDK-Specific Types
// ---------------------------------------------------------------------------

/**
 * Configuration options for the Volt client.
 *
 * @example
 * ```ts
 * const volt = new Volt({
 *   apiUrl: 'https://api.voltos.dev',
 *   apiKey: 'vk_abc123',
 *   timeout: 30_000,
 * });
 * ```
 */
export interface VoltConfig {
  /** Base URL for the VOLT OS API (for remote mode). */
  apiUrl?: string;
  /** API key for authentication. */
  apiKey?: string;
  /** JWT token for authentication. */
  jwtToken?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;
}

/**
 * Pipeline subsystem API.
 *
 * Manages pipeline creation, execution, and lifecycle control.
 *
 * @example
 * ```ts
 * const pipeline = await volt.pipeline.create({
 *   id: 'deploy-pipeline',
 *   name: 'Deployment Pipeline',
 *   tasks: [...],
 *   config: { timeoutMs: 120_000 },
 * });
 * await volt.pipeline.start(pipeline.id);
 * ```
 */
export interface PipelineAPI {
  /**
   * Create a new pipeline instance from a definition.
   * @param definition - The pipeline definition.
   * @returns The created pipeline instance.
   * @throws If the definition is invalid.
   */
  create(definition: _PipelineDefinition): Promise<_PipelineInstance>;

  /**
   * Start execution of a pipeline.
   * @param pipelineId - ID of the pipeline to start.
   * @throws If the pipeline is not found or cannot be started.
   */
  start(pipelineId: string): Promise<void>;

  /**
   * Cancel a running pipeline.
   * @param pipelineId - ID of the pipeline to cancel.
   * @param reason - Reason for cancellation.
   * @throws If the pipeline is not found.
   */
  cancel(pipelineId: string, reason: string): Promise<void>;

  /**
   * Get a pipeline instance by ID.
   * @param pipelineId - Pipeline ID.
   * @returns The pipeline instance, or undefined if not found.
   */
  get(pipelineId: string): _PipelineInstance | undefined;

  /**
   * List all pipeline instances.
   * @returns Array of all pipeline instances.
   */
  list(): _PipelineInstance[];

  /**
   * Approve a task that is waiting for approval.
   * @param pipelineId - Pipeline ID.
   * @param taskId - Task ID to approve.
   * @throws If the pipeline or task is not found.
   */
  approve(pipelineId: string, taskId: string): Promise<void>;

  /**
   * Reject a task that is waiting for approval.
   * @param pipelineId - Pipeline ID.
   * @param taskId - Task ID to reject.
   * @param reason - Reason for rejection.
   * @throws If the pipeline or task is not found.
   */
  reject(pipelineId: string, taskId: string, reason: string): Promise<void>;
}

/**
 * Agent subsystem API.
 *
 * Manages agent discovery, activation, execution, and health monitoring.
 *
 * @example
 * ```ts
 * await volt.agent.discover(researcherManifest);
 * await volt.agent.activate('researcher');
 * const result = await volt.agent.run('researcher', {
 *   id: 'task-1',
 *   type: 'research',
 *   input: { query: 'VOLT OS architecture' },
 *   requiredCapabilities: ['research'],
 *   context: {},
 * });
 * ```
 */
export interface AgentAPI {
  /**
   * Discover and register a new agent from its manifest.
   * @param manifest - The agent manifest.
   * @throws If an agent with the same ID is already registered.
   */
  discover(manifest: _AgentManifest): Promise<void>;

  /**
   * Activate an agent, making it ready to accept tasks.
   * @param agentId - Agent ID to activate.
   * @throws If the agent is not found or cannot be activated.
   */
  activate(agentId: string): Promise<void>;

  /**
   * Deactivate an agent, removing it from the ready pool.
   * @param agentId - Agent ID to deactivate.
   * @throws If the agent is not found.
   */
  deactivate(agentId: string): Promise<void>;

  /**
   * Run a task through an agent.
   * @param agentId - Agent ID to run the task on.
   * @param task - The task to execute.
   * @returns The execution result.
   * @throws If the agent is not found or execution fails.
   */
  run(agentId: string, task: _AgentTask): Promise<_AgentResult>;

  /**
   * List all registered agents with summary info.
   * @returns Array of agent summaries.
   */
  list(): Array<{ id: string; state: string; capabilities: string[] }>;

  /**
   * Get health status for a specific agent.
   * @param agentId - Agent ID.
   * @returns Health status and uptime.
   * @throws If the agent is not found.
   */
  health(agentId: string): Promise<{ status: string; uptime: number }>;
}

/**
 * Plugin subsystem API.
 *
 * Manages plugin installation, activation, and lifecycle.
 *
 * @example
 * ```ts
 * await volt.plugin.install(myPluginManifest);
 * await volt.plugin.activate('my-plugin');
 * ```
 */
export interface PluginAPI {
  /**
   * Install a plugin from its manifest.
   * @param manifest - The plugin manifest.
   * @throws If verification fails.
   */
  install(manifest: _PluginManifest): Promise<void>;

  /**
   * Activate a plugin, making it operational.
   * @param pluginId - Plugin ID to activate.
   * @throws If the plugin is not found.
   */
  activate(pluginId: string): Promise<void>;

  /**
   * Deactivate a plugin, stopping its execution.
   * @param pluginId - Plugin ID to deactivate.
   * @throws If the plugin is not found.
   */
  deactivate(pluginId: string): Promise<void>;

  /**
   * Uninstall a plugin, removing it from the system.
   * @param pluginId - Plugin ID to uninstall.
   * @throws If the plugin is not found.
   */
  uninstall(pluginId: string): Promise<void>;

  /**
   * List all registered plugins with summary info.
   * @returns Array of plugin summaries.
   */
  list(): Array<{ id: string; state: string; category: string }>;
}

/**
 * Memory subsystem API.
 *
 * Provides access to the 6-layer memory system for reading, writing,
 * searching, and deleting memory entries.
 *
 * @example
 * ```ts
 * await volt.memory.write('user', 'user-123', 'theme', 'dark');
 * const entry = await volt.memory.read('user', 'user-123', 'theme');
 * const results = await volt.memory.search('VOLT OS architecture', 5);
 * ```
 */
export interface MemoryAPI {
  /**
   * Read a memory entry by layer, scope, and key.
   * @param layer - Memory layer type.
   * @param scopeId - Scope identifier.
   * @param key - Semantic key.
   * @returns The memory entry, or null if not found.
   */
  read(layer: string, scopeId: string, key: string): Promise<_MemoryEntry | null>;

  /**
   * Write a memory entry to a specific layer.
   * @param layer - Memory layer type.
   * @param scopeId - Scope identifier.
   * @param key - Semantic key.
   * @param content - Content payload.
   * @returns The created/updated memory entry.
   */
  write(layer: string, scopeId: string, key: string, content: string): Promise<_MemoryEntry>;

  /**
   * Semantic search across all vector-indexed memory.
   * @param query - Search query text.
   * @param topK - Maximum number of results (default: 10).
   * @returns Array of entries with similarity scores.
   */
  search(query: string, topK?: number): Promise<Array<{ entry: _MemoryEntry; score: number }>>;

  /**
   * Delete a memory entry by layer and ID.
   * @param layer - Memory layer type.
   * @param id - Entry ID.
   * @returns True if deleted, false if not found.
   */
  delete(layer: string, id: string): Promise<boolean>;
}

/**
 * Model subsystem API.
 *
 * Routes requests to optimal AI model providers with failover,
 * budget enforcement, and streaming support.
 *
 * @example
 * ```ts
 * const response = await volt.model.request({
 *   agentId: 'researcher',
 *   messages: [{ role: 'user', content: 'Explain VOLT OS' }],
 * });
 * ```
 */
export interface ModelAPI {
  /**
   * Send a model request and get a response.
   * @param modelRequest - The model request (id is auto-generated).
   * @returns The model response.
   * @throws If no providers are available or budget is exceeded.
   */
  request(modelRequest: Omit<_ModelRequest, 'id'>): Promise<_ModelResponse>;

  /**
   * List all configured model providers.
   * @returns Array of provider summaries.
   */
  listProviders(): Array<{ id: string; name: string; enabled: boolean }>;

  /**
   * Get current budget usage and remaining quota.
   * @returns Budget status.
   */
  getBudget(): Promise<{ spent: number; remaining: number }>;
}

/**
 * Security subsystem API.
 *
 * Handles authentication, authorization, and secrets management.
 *
 * @example
 * ```ts
 * const auth = await volt.security.authenticate(jwtToken);
 * if (auth.authenticated) {
 *   const decision = await volt.security.authorize(auth.subject!, 'read', '/docs');
 * }
 * const apiKey = await volt.security.secrets.get('MY_API_KEY');
 * ```
 */
export interface SecurityAPI {
  /**
   * Authenticate a JWT token.
   * @param token - JWT string.
   * @returns Authentication result with subject or error.
   */
  authenticate(token: string): Promise<{ authenticated: boolean; subject?: _Subject }>;

  /**
   * Authorize a subject to perform an action on a resource.
   * @param subject - The subject requesting access.
   * @param action - The action to authorize.
   * @param resource - The target resource.
   * @returns Authorization decision with reason.
   */
  authorize(subject: _Subject, action: string, resource: string): Promise<{ allowed: boolean; reason: string }>;

  /**
   * Secrets management sub-API.
   */
  secrets: {
    /**
     * Retrieve a secret by name.
     * @param name - Secret name.
     * @returns The secret value, or null if not found.
     */
    get(name: string): Promise<string | null>;

    /**
     * Store a secret.
     * @param name - Secret name.
     * @param value - Secret value.
     */
    store(name: string, value: string): Promise<void>;
  };
}

/**
 * Event subsystem API.
 *
 * Publish and subscribe to events across the VOLT OS system.
 *
 * @example
 * ```ts
 * await volt.events.publish('pipeline:completed', 'pipeline', 'p-123', { status: 'ok' });
 * const unsub = await volt.events.subscribe('pipeline:*', (event) => {
 *   console.log(event);
 * });
 * // Later: await unsub();
 * ```
 */
export interface EventAPI {
  /**
   * Publish an event.
   * @param type - Event type.
   * @param aggregateType - Aggregate type (e.g. 'pipeline').
   * @param aggregateId - Aggregate ID.
   * @param payload - Event payload.
   */
  publish(type: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>): Promise<void>;

  /**
   * Subscribe to events.
   * @param type - Event type to subscribe to, or '*' for all.
   * @param handler - Event handler function.
   * @returns Unsubscribe function.
   */
  subscribe(type: string, handler: (event: Record<string, unknown>) => void): Promise<() => Promise<void>>;
}

/**
 * Config subsystem API.
 *
 * Read-only access to VOLT OS configuration.
 *
 * @example
 * ```ts
 * const theme = volt.config.get('ui.theme');
 * const all = volt.config.getAll();
 * ```
 */
export interface ConfigAPI {
  /**
   * Get a single config value by key.
   * @param key - Config key (supports dot notation).
   * @returns The config value, or undefined if not found.
   */
  get(key: string): unknown;

  /**
   * Get all config values.
   * @returns Complete config record.
   */
  getAll(): Record<string, unknown>;
}
