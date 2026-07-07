/**
 * @module index
 * Main entry point for the VOLT OS Agent Runtime.
 * Re-exports all public types, classes, and functions.
 */

// Core Types
export type {
  AgentState,
  AgentManifest,
  AgentInstance,
  AgentResourceUsage,
  AgentHealthStatus,
  AgentContext,
  AgentTask,
  AgentResult,
  CapabilityScore,
} from './types.js';

export { AgentEvents } from './types.js';

// Frozen Agent Interface
export type { IAgent } from './agent/agent-interface.js';

// Registry
export { AgentRegistry } from './registry.js';

// Manager
export { AgentManager } from './manager.js';
export type { AgentManagerOptions } from './manager.js';

// Scheduler
export { AgentScheduler } from './scheduler.js';

// Executor
export { AgentExecutor } from './executor.js';

// Health Monitor
export { AgentHealthMonitor } from './health.js';

// Capability Resolver
export { CapabilityResolver } from './capabilities.js';

// Memory Binder
export { MemoryBinder } from './memory-binder.js';

// Model Binder
export { ModelBinder } from './model-binder.js';

// Recovery Manager
export { RecoveryManager } from './recovery.js';

// Context Factory
export { AgentContextFactory } from './context.js';
