/**
 * @module types
 * Core type definitions for the VOLT OS Pipeline Engine.
 * Defines all status enums, data structures, and interfaces used throughout the system.
 */

// ---------------------------------------------------------------------------
// Status Types
// ---------------------------------------------------------------------------

/** Possible statuses of a pipeline instance. */
export type PipelineStatus =
  | 'created'
  | 'validated'
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'rolled_back';

/** Possible statuses of an individual task within a pipeline. */
export type TaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'skipped';

/** Approval status for tasks that require human approval. */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// ---------------------------------------------------------------------------
// Task & Pipeline Definitions
// ---------------------------------------------------------------------------

/**
 * Retry policy configuration for failed tasks.
 * @property maxRetries - Maximum number of retry attempts.
 * @property delayMs - Initial delay between retries in milliseconds.
 * @property backoffMultiplier - Multiplier applied to delay after each retry.
 * @property maxDelayMs - Maximum delay between retries in milliseconds.
 */
export interface RetryPolicy {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

/**
 * Configuration for a pipeline definition.
 * @property retryPolicy - Default retry policy for all tasks in the pipeline.
 * @property timeoutMs - Default timeout for tasks in milliseconds.
 */
export interface PipelineConfig {
  retryPolicy?: Partial<RetryPolicy>;
  timeoutMs?: number;
}

/**
 * Definition of a single task within a pipeline.
 * @property id - Unique identifier for the task.
 * @property name - Human-readable name.
 * @property type - Task type identifier (used by the task handler).
 * @property dependencies - IDs of tasks that must complete before this one.
 * @property config - Arbitrary task configuration.
 * @property timeoutMs - Task-specific timeout override.
 * @property retryPolicy - Task-specific retry policy override.
 * @property requiresApproval - Whether the task needs human approval before execution.
 */
export interface TaskDefinition {
  id: string;
  name: string;
  type: string;
  dependencies: string[];
  config: Record<string, unknown>;
  timeoutMs?: number;
  retryPolicy?: Partial<RetryPolicy>;
  requiresApproval?: boolean;
}

/**
 * A pipeline is a named collection of tasks with a shared configuration.
 * @property id - Unique identifier for the pipeline definition.
 * @property name - Human-readable name.
 * @property tasks - List of task definitions.
 * @property config - Pipeline-level configuration.
 */
export interface PipelineDefinition {
  id: string;
  name: string;
  tasks: TaskDefinition[];
  config: PipelineConfig;
}

// ---------------------------------------------------------------------------
// Runtime State
// ---------------------------------------------------------------------------

/**
 * Runtime state of a single task within a pipeline instance.
 * @property taskId - The task this state belongs to.
 * @property status - Current execution status.
 * @property startedAt - Timestamp when execution started.
 * @property completedAt - Timestamp when execution completed.
 * @property result - Output produced by the task.
 * @property error - Error message if the task failed.
 * @property retryCount - Number of retries attempted so far.
 * @property approvalStatus - Current approval status if approval is required.
 */
export interface TaskState {
  taskId: string;
  status: TaskStatus;
  startedAt?: number;
  completedAt?: number;
  result?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  approvalStatus?: ApprovalStatus;
}

/**
 * Execution context passed to tasks during execution.
 * @property pipelineId - ID of the owning pipeline.
 * @property variables - Shared mutable variables accessible by tasks.
 * @property artifacts - IDs of artifacts produced during execution.
 */
export interface ExecutionContextData {
  pipelineId: string;
  variables: Map<string, unknown>;
  artifacts: string[];
}

/**
 * A live pipeline instance created from a definition.
 * @property id - Unique runtime identifier.
 * @property definitionId - Reference to the pipeline definition.
 * @property status - Current pipeline status.
 * @property taskStates - Map of task ID to runtime task state.
 * @property context - Execution context for this run.
 * @property createdAt - Timestamp when the instance was created.
 * @property updatedAt - Timestamp of last state change.
 */
export interface PipelineInstance {
  id: string;
  definitionId: string;
  status: PipelineStatus;
  taskStates: Map<string, TaskState>;
  context: ExecutionContextData;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Minimal event bus interface used by the pipeline engine.
 * Implementations are provided by @volt-os/event-bus.
 */
export interface EventBus {
  /** Emit an event with associated data. */
  emit(event: string, data: Record<string, unknown>): void;
  /** Subscribe to an event. */
  on(event: string, handler: (data: Record<string, unknown>) => void): void;
  /** Unsubscribe from an event. */
  off(event: string, handler: (data: Record<string, unknown>) => void): void;
}

/**
 * Task handler interface implemented by the agent runtime.
 * Responsible for actually executing a task's work.
 */
export interface TaskHandler {
  execute(taskId: string, context: ExecutionContextData): Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Event Names
// ---------------------------------------------------------------------------

/** Canonical event names emitted by the pipeline engine. */
export const PipelineEvents = {
  PIPELINE_CREATED: 'pipeline:created',
  PIPELINE_VALIDATED: 'pipeline:validated',
  PIPELINE_QUEUED: 'pipeline:queued',
  PIPELINE_STARTED: 'pipeline:started',
  PIPELINE_COMPLETED: 'pipeline:completed',
  PIPELINE_FAILED: 'pipeline:failed',
  PIPELINE_CANCELLED: 'pipeline:cancelled',
  PIPELINE_TIMED_OUT: 'pipeline:timed_out',
  PIPELINE_ROLLED_BACK: 'pipeline:rolled_back',
  PIPELINE_WAITING: 'pipeline:waiting',
  TASK_STARTED: 'task:started',
  TASK_COMPLETED: 'task:completed',
  TASK_FAILED: 'task:failed',
  TASK_CANCELLED: 'task:cancelled',
  TASK_TIMED_OUT: 'task:timed_out',
  TASK_RETRYING: 'task:retrying',
  TASK_SKIPPED: 'task:skipped',
  APPROVAL_REQUESTED: 'approval:requested',
  APPROVAL_GRANTED: 'approval:granted',
  APPROVAL_REJECTED: 'approval:rejected',
  ROLLBACK_STARTED: 'rollback:started',
  ROLLBACK_COMPLETED: 'rollback:completed',
} as const;
