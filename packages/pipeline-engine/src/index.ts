/**
 * @module index
 * Main entry point for the VOLT OS Pipeline Engine.
 * Re-exports all public types, classes, and functions.
 */

// Core types
export type {
  PipelineStatus,
  TaskStatus,
  ApprovalStatus,
  RetryPolicy,
  PipelineConfig,
  TaskDefinition,
  PipelineDefinition,
  TaskState,
  ExecutionContextData,
  PipelineInstance,
  EventBus,
  TaskHandler,
} from './types.js';

export { PipelineEvents } from './types.js';

// DAG & Graph
export { DAG } from './graph/dag.js';
export { getExecutionLayers } from './graph/topological.js';

// State Machine
export { PipelineStateMachine, InvalidTransitionError } from './state-machine.js';

// Execution Context
export { ExecutionContext } from './context.js';

// Scheduler
export { TaskScheduler } from './scheduler.js';

// Approval
export { ApprovalManager } from './approval.js';
export type { PendingApproval } from './approval.js';

// Retry
export { RetryPolicyManager } from './retry.js';
export type { RetryPolicyConfig } from './retry.js';

// Rollback
export { RollbackManager } from './rollback.js';

// Metrics
export { PipelineMetrics } from './metrics.js';

// Resolver
export { DependencyResolver } from './resolver.js';
export type { ValidationResult } from './resolver.js';

// Executor
export { PipelineExecutor } from './executor.js';
export type { PipelineExecutorOptions, StatusProvider, DefinitionsProvider } from './executor.js';

// Manager
export { PipelineManager } from './manager.js';
export type { PipelineManagerOptions } from './manager.js';
