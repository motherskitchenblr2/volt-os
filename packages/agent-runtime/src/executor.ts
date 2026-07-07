/**
 * @module executor
 * Agent executor — executes tasks through agent instances with
 * timeout enforcement, error handling, and event emission.
 */

import type {
  EventBus,
} from '@volt-os/plugin-runtime';
import type {
  AgentInstance,
  AgentTask,
  AgentResult,
} from './types.js';
import type { IAgent } from './agent/agent-interface.js';
import { AgentEvents } from './types.js';

/**
 * Default execution timeout in milliseconds.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Executes tasks through the IAgent interface.
 * Handles timeout enforcement, error recovery, and lifecycle event emission.
 */
export class AgentExecutor {
  /** Event bus for lifecycle events. */
  private readonly eventBus: EventBus;
  /** Optional sandbox reference for execution isolation. */
  private readonly sandbox: unknown;

  /** Agent implementations indexed by agent id. */
  private readonly implementations = new Map<string, IAgent>();

  constructor(options: { eventBus: EventBus; sandbox?: unknown }) {
    this.eventBus = options.eventBus;
    this.sandbox = options.sandbox;
  }

  /**
   * Register an agent implementation for execution.
   * @param agentId - The agent identifier.
   * @param impl - The IAgent implementation.
   */
  registerImplementation(agentId: string, impl: IAgent): void {
    this.implementations.set(agentId, impl);
  }

  /**
   * Get a registered agent implementation.
   * @param agentId - The agent identifier.
   * @returns The IAgent implementation, or undefined.
   */
  getImplementation(agentId: string): IAgent | undefined {
    return this.implementations.get(agentId);
  }

  /**
   * Remove a registered agent implementation.
   * @param agentId - The agent identifier.
   * @returns The removed implementation, or undefined.
   */
  unregisterImplementation(agentId: string): IAgent | undefined {
    const impl = this.implementations.get(agentId);
    this.implementations.delete(agentId);
    return impl;
  }

  /**
   * Execute a task through an agent.
   * Emits AGENT_RUNNING before execution and AGENT_COMPLETED or AGENT_FAILED after.
   * @param agent - The agent instance to execute through.
   * @param task - The task to execute.
   * @returns The execution result.
   * @throws If no implementation is registered for the agent.
   */
  async execute(agent: AgentInstance, task: AgentTask): Promise<AgentResult> {
    const impl = this.implementations.get(agent.id);
    if (!impl) {
      throw new Error(`No implementation registered for agent "${agent.id}"`);
    }

    // Emit running event
    this.eventBus.emit(AgentEvents.AGENT_RUNNING, {
      agentId: agent.id,
      taskId: task.id,
    });

    const startTime = Date.now();
    const timeoutMs = task.timeout ?? agent.manifest.resourceLimits.executionTimeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
      const result = await this.executeWithTimeout(impl, task, timeoutMs);

      const elapsed = Date.now() - startTime;
      agent.resourceUsage.cpuTimeMs += elapsed;
      agent.resourceUsage.tasksCompleted += 1;

      // Emit completed event
      this.eventBus.emit(AgentEvents.AGENT_COMPLETED, {
        agentId: agent.id,
        taskId: task.id,
        status: result.status,
        elapsedMs: elapsed,
      });

      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      agent.resourceUsage.cpuTimeMs += elapsed;
      agent.resourceUsage.tasksFailed += 1;

      await this.handleError(agent, task, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Execute a task with timeout enforcement.
   * @param agent - The IAgent implementation.
   * @param task - The task to execute.
   * @param timeoutMs - Maximum execution time in milliseconds.
   * @returns The execution result.
   * @throws If execution exceeds the timeout.
   */
  private async executeWithTimeout(
    agent: IAgent,
    task: AgentTask,
    timeoutMs: number,
  ): Promise<AgentResult> {
    return new Promise<AgentResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Agent execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      agent
        .execute(task)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Handle execution errors by emitting failure events.
   * @param agent - The agent that failed.
   * @param task - The task that failed.
   * @param error - The error that occurred.
   */
  private async handleError(
    agent: AgentInstance,
    task: AgentTask,
    error: Error,
  ): Promise<void> {
    agent.error = error.message;

    this.eventBus.emit(AgentEvents.AGENT_FAILED, {
      agentId: agent.id,
      taskId: task.id,
      error: error.message,
      stack: error.stack,
    });

    // Attempt to call onError hook if available
    const impl = this.implementations.get(agent.id);
    if (impl) {
      try {
        // The onError lifecycle hook is handled by the agent implementation itself
        // within the execute method's error handling path
      } catch {
        // Swallow secondary errors during error handling
      }
    }
  }

  /**
   * Get the count of registered implementations.
   * @returns Number of registered agent implementations.
   */
  count(): number {
    return this.implementations.size;
  }
}
