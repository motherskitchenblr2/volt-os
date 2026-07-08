/**
 * @module @volt/sdk
 * Official Developer SDK for VOLT OS.
 *
 * One import. One interface. Everything accessible.
 *
 * @example
 * ```ts
 * import { Volt } from "@volt/sdk";
 *
 * const volt = new Volt();
 *
 * await volt.pipeline.start(...);
 * await volt.agent.run(...);
 * await volt.memory.search(...);
 * await volt.events.publish(...);
 * ```
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Main Client
// ---------------------------------------------------------------------------
export { Volt } from './client.js';
export type { VoltDependencies } from './client.js';

// ---------------------------------------------------------------------------
// SDK-Specific Types
// ---------------------------------------------------------------------------
export type {
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

// ---------------------------------------------------------------------------
// API Implementations (for advanced usage / testing)
// ---------------------------------------------------------------------------
export { PipelineAPIImpl } from './apis/pipeline-api.js';
export { AgentAPIImpl } from './apis/agent-api.js';
export { PluginAPIImpl } from './apis/plugin-api.js';
export { MemoryAPIImpl } from './apis/memory-api.js';
export { ModelAPIImpl } from './apis/model-api.js';
export { SecurityAPIImpl } from './apis/security-api.js';
export { EventAPIImpl } from './apis/event-api.js';
export { ConfigAPIImpl } from './apis/config-api.js';

// ---------------------------------------------------------------------------
// Re-export subsystem public types for convenience
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
export type {
  _PipelineDefinition as PipelineDefinition,
  _PipelineInstance as PipelineInstance,
  _PipelineStatus as PipelineStatus,
  _TaskDefinition as TaskDefinition,
  _TaskState as TaskState,
  _RetryPolicy as RetryPolicy,
  _PipelineConfig as PipelineConfig,
};

// Agent Runtime
import type {
  AgentManifest as _AgentManifest,
  AgentTask as _AgentTask,
  AgentResult as _AgentResult,
  AgentState as _AgentState,
  AgentInstance as _AgentInstance,
  AgentHealthStatus as _AgentHealthStatus,
} from '@volt-os/agent-runtime';
export type {
  _AgentManifest as AgentManifest,
  _AgentTask as AgentTask,
  _AgentResult as AgentResult,
  _AgentState as AgentState,
  _AgentInstance as AgentInstance,
  _AgentHealthStatus as AgentHealthStatus,
};

// Plugin Runtime
import type {
  PluginManifest as _PluginManifest,
  PluginInstance as _PluginInstance,
  PluginState as _PluginState,
  PluginCategory as _PluginCategory,
  PluginPermission as _PluginPermission,
} from '@volt-os/plugin-runtime';
export type {
  _PluginManifest as PluginManifest,
  _PluginInstance as PluginInstance,
  _PluginState as PluginState,
  _PluginCategory as PluginCategory,
  _PluginPermission as PluginPermission,
};

// Memory Engine
import type {
  MemoryEntry as _MemoryEntry,
  MemoryQuery as _MemoryQuery,
  MemoryLayerType as _MemoryLayerType,
} from '@volt-os/memory-engine';
export type {
  _MemoryEntry as MemoryEntry,
  _MemoryQuery as MemoryQuery,
  _MemoryLayerType as MemoryLayerType,
};

// Model Router
import type {
  ModelRequest as _ModelRequest,
  ModelResponse as _ModelResponse,
  ModelProviderConfig as _ModelProviderConfig,
  TokenUsage as _TokenUsage,
  ChatMessage as _ChatMessage,
  BudgetConfig as _BudgetConfig,
} from '@volt-os/model-router';
export type {
  _ModelRequest as ModelRequest,
  _ModelResponse as ModelResponse,
  _ModelProviderConfig as ModelProviderConfig,
  _TokenUsage as TokenUsage,
  _ChatMessage as ChatMessage,
  _BudgetConfig as BudgetConfig,
};

// Security Engine
import type {
  Subject as _Subject,
  Permission as _Permission,
  Policy as _Policy,
  SecurityEvent as _SecurityEvent,
  AuthResult as _AuthResult,
  AuthorizationResult as _AuthorizationResult,
} from '@volt-os/security-engine';
export type {
  _Subject as Subject,
  _Permission as Permission,
  _Policy as Policy,
  _SecurityEvent as SecurityEvent,
  _AuthResult as AuthResult,
  _AuthorizationResult as AuthorizationResult,
};

// Event Bus
import type {
  EventBus as _SharedEventBus,
  EventHandler as _EventHandler,
} from '@volt-os/event-bus';
export type {
  _SharedEventBus as SharedEventBus,
  _EventHandler as EventHandler,
};
