/**
 * @module agent/agent-interface
 * IAgent v1.0 — Frozen agent interface.
 *
 * Every agent must implement this interface.
 * This interface will NOT change within the v1.x series.
 * Breaking changes require IAgent v2.0 and an ADR.
 *
 * @sealed
 */

import type {
  AgentContext,
  AgentTask,
  AgentResult,
  AgentHealthStatus,
} from '../types.js';

/**
 * IAgent v1.0 — Frozen agent interface.
 *
 * Every agent must implement this interface.
 * This interface will NOT change within the v1.x series.
 * Breaking changes require IAgent v2.0 and an ADR.
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
