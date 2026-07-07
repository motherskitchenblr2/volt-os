/**
 * @module types
 * Core type definitions for the VOLT OS Agent Runtime.
 * These types define the frozen IAgent v1.0 interface, agent manifests,
 * instances, tasks, results, and capability scoring.
 *
 * @remarks
 * The IAgent interface is FROZEN after this implementation.
 * Breaking changes require IAgent v2.0 and an ADR.
 */

import type {
  PluginLogger,
  PluginEventAPI,
  PluginMemoryAPI,
  PluginConfigAPI,
  PluginStorageAPI,
  PluginTaskAPI,
  PluginPermission,
} from '@volt-os/plugin-runtime';
import type { EventBus } from '@volt-os/plugin-runtime';

// ---------------------------------------------------------------------------
// Agent State Machine
// ---------------------------------------------------------------------------

/** Possible lifecycle states of an agent instance. */
export type AgentState =
  | 'discovered'
  | 'verified'
  | 'registered'
  | 'loaded'
  | 'ready'
  | 'assigned'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'restarting'
  | 'disabled';

// ---------------------------------------------------------------------------
// Agent Manifest
// ---------------------------------------------------------------------------

/**
 * Declarative manifest describing an agent's identity, capabilities,
 * resource requirements, and lifecycle hooks.
 */
export interface AgentManifest {
  /** Unique agent identifier (e.g. "volt-os/researcher"). */
  id: string;
  /** Semver version string. */
  version: string;
  /** Human-readable name. */
  name: string;
  /** Short description of the agent's purpose. */
  description: string;
  /** Agent author. */
  author: string;
  /** Named capabilities this agent provides (e.g. ['research', 'planning', 'reasoning']). */
  capabilities: string[];
  /** Tool identifiers required by this agent. */
  requiredTools: string[];
  /** Model identifiers required by this agent. */
  requiredModels: string[];
  /** Plugin permissions this agent requires. */
  requiredPermissions: PluginPermission[];
  /** Memory resource profile for the agent. */
  memoryProfile: {
    /** Working memory limit in megabytes. */
    workingMemoryMB: number;
    /** Whether the agent uses long-term persistent memory. */
    longTermMemory: boolean;
    /** Maximum context window size in tokens. */
    contextWindow: number;
  };
  /** Hard resource limits enforced by the runtime. */
  resourceLimits: {
    /** Maximum concurrent tasks this agent can handle. */
    maxConcurrentTasks: number;
    /** Maximum memory in megabytes. */
    maxMemoryMB: number;
    /** Maximum CPU time per execution in milliseconds. */
    maxCpuTimeMs: number;
    /** Maximum tokens per single task. */
    maxTokensPerTask: number;
    /** Per-call execution timeout in milliseconds. */
    executionTimeoutMs: number;
  };
  /** Scheduling priority — lower number = higher priority. */
  priority: number;
  /** Health check configuration. */
  healthChecks: {
    /** Interval between health checks in milliseconds. */
    intervalMs: number;
    /** Timeout for a single health check in milliseconds. */
    timeoutMs: number;
    /** Number of consecutive failures before marking unhealthy. */
    failureThreshold: number;
  };
  /** Lifecycle hook method names on the agent implementation. */
  lifecycleHooks: {
    onInitialize?: string;
    onExecute?: string;
    onComplete?: string;
    onError?: string;
    onShutdown?: string;
  };
}

// ---------------------------------------------------------------------------
// Agent Instance
// ---------------------------------------------------------------------------

/** Runtime representation of a loaded agent. */
export interface AgentInstance {
  /** Unique instance identifier (matches manifest id). */
  id: string;
  /** The agent's manifest. */
  manifest: AgentManifest;
  /** Current lifecycle state. */
  state: AgentState;
  /** Identifier of the currently assigned task, if any. */
  assignedTask?: string;
  /** When the agent was loaded into memory. */
  loadedAt?: Date;
  /** When the agent started executing. */
  startedAt?: Date;
  /** When the agent completed its last task. */
  completedAt?: Date;
  /** Error message if state is 'failed'. */
  error?: string;
  /** Current resource usage counters. */
  resourceUsage: AgentResourceUsage;
  /** Current health status. */
  health: AgentHealthStatus;
}

// ---------------------------------------------------------------------------
// Resource Types
// ---------------------------------------------------------------------------

/** Accumulated resource usage for an agent instance. */
export interface AgentResourceUsage {
  /** Memory consumed in megabytes. */
  memoryMB: number;
  /** Cumulative CPU time in milliseconds. */
  cpuTimeMs: number;
  /** Tokens consumed. */
  tokensUsed: number;
  /** Total tasks completed successfully. */
  tasksCompleted: number;
  /** Total tasks that failed. */
  tasksFailed: number;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Health status for an agent instance. */
export interface AgentHealthStatus {
  /** Overall health status. */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Timestamp of the last health check. */
  lastCheck: Date;
  /** Number of consecutive health check failures. */
  consecutiveFailures: number;
  /** Uptime in milliseconds since the agent was loaded. */
  uptime: number;
}

// ---------------------------------------------------------------------------
// IAgent v1.0 — FROZEN INTERFACE
// ---------------------------------------------------------------------------

/**
 * IAgent v1.0 — Frozen agent interface.
 *
 * Every agent must implement this interface.
 * This interface will NOT change within the v1.x series.
 * Breaking changes require IAgent v2.0 and an ADR.
 *
 * @sealed
 */
export interface IAgent {
  /**
   * Initialize the agent with its runtime context.
   * Called once when the agent is first loaded.
   * @param context - The agent's sandboxed runtime context.
   */
  initialize(context: AgentContext): Promise<void>;

  /**
   * Execute a task and return the result.
   * @param task - The task to execute.
   * @returns The execution result.
   */
  execute(task: AgentTask): Promise<AgentResult>;

  /**
   * Validate whether the agent can handle a given task.
   * @param task - The task to validate.
   * @returns Validation result with errors if invalid.
   */
  validate(task: AgentTask): Promise<{ valid: boolean; errors: string[] }>;

  /**
   * Perform a health check and return current status.
   * @returns Current health status.
   */
  heartbeat(): Promise<AgentHealthStatus>;

  /**
   * Gracefully shut down the agent, releasing all resources.
   */
  shutdown(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Agent Context
// ---------------------------------------------------------------------------

/**
 * The runtime context provided to an agent during initialization.
 * Wraps VoltSDK sub-APIs for agent-scoped access.
 */
export interface AgentContext {
  /** Structured logger scoped to the agent. */
  readonly logger: PluginLogger;
  /** Event bus publish/subscribe API. */
  readonly events: PluginEventAPI;
  /** Key-value memory API (sandboxed per agent). */
  readonly memory: PluginMemoryAPI;
  /** Read-only agent configuration. */
  readonly config: PluginConfigAPI;
  /** Persistent key-value storage (sandboxed per agent). */
  readonly storage: PluginStorageAPI;
  /** Task progress reporting and cancellation checking. */
  readonly tasks: PluginTaskAPI;
}

// ---------------------------------------------------------------------------
// Agent Task
// ---------------------------------------------------------------------------

/** A task to be executed by an agent. */
export interface AgentTask {
  /** Unique task identifier. */
  id: string;
  /** Task type identifier (e.g. "research", "code-generation"). */
  type: string;
  /** Task input parameters. */
  input: Record<string, unknown>;
  /** Capabilities required to execute this task. */
  requiredCapabilities: string[];
  /** Additional context data for the task. */
  context: Record<string, unknown>;
  /** Optional execution timeout override in milliseconds. */
  timeout?: number;
  /** Optional priority override (lower = higher priority). */
  priority?: number;
}

// ---------------------------------------------------------------------------
// Agent Result
// ---------------------------------------------------------------------------

/** Result produced by an agent after executing a task. */
export interface AgentResult {
  /** Execution status. */
  status: 'completed' | 'failed' | 'partial';
  /** Task output data. */
  output: Record<string, unknown>;
  /** Paths or identifiers of produced artifacts. */
  artifacts: string[];
  /** Memory updates to apply after execution. */
  memoryUpdates: Record<string, unknown>[];
  /** Additional execution metadata. */
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Capability Scoring
// ---------------------------------------------------------------------------

/** Score describing how well an agent matches a task's requirements. */
export interface CapabilityScore {
  /** Agent identifier. */
  agentId: string;
  /** Capabilities the agent possesses that match the requirements. */
  capabilities: string[];
  /** Score from 0–100, where 100 is a perfect match. */
  score: number;
  /** Whether the agent is currently available for assignment. */
  available: boolean;
}

// ---------------------------------------------------------------------------
// Lifecycle Event Names
// ---------------------------------------------------------------------------

/** Canonical event names emitted by the agent runtime. */
export const AgentEvents = {
  AGENT_DISCOVERED: 'agent:discovered',
  AGENT_VERIFIED: 'agent:verified',
  AGENT_REGISTERED: 'agent:registered',
  AGENT_LOADED: 'agent:loaded',
  AGENT_READY: 'agent:ready',
  AGENT_ASSIGNED: 'agent:assigned',
  AGENT_RUNNING: 'agent:running',
  AGENT_WAITING: 'agent:waiting',
  AGENT_COMPLETED: 'agent:completed',
  AGENT_FAILED: 'agent:failed',
  AGENT_PAUSED: 'agent:paused',
  AGENT_RESTARTING: 'agent:restarting',
  AGENT_DISABLED: 'agent:disabled',
  AGENT_STATE_CHANGED: 'agent:state_changed',
  AGENT_HEALTH_CHECK: 'agent:health_check',
  AGENT_UNHEALTHY: 'agent:unhealthy',
  AGENT_RECOVERY_STARTED: 'agent:recovery_started',
  AGENT_RECOVERY_COMPLETED: 'agent:recovery_completed',
  AGENT_TASK_ASSIGNED: 'agent:task_assigned',
  AGENT_TASK_COMPLETED: 'agent:task_completed',
  AGENT_TASK_FAILED: 'agent:task_failed',
} as const;
