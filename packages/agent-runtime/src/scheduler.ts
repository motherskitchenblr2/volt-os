/**
 * @module scheduler
 * Agent scheduler — capability-based scheduling that selects the best
 * agent for a task based on capability matching, priority, and availability.
 */

import type {
  EventBus,
} from '@volt-os/plugin-runtime';
import type {
  AgentInstance,
  AgentTask,
  AgentResult,
  CapabilityScore,
} from './types.js';
import { AgentEvents } from './types.js';
import { AgentRegistry } from './registry.js';
import { CapabilityResolver } from './capabilities.js';

/**
 * Capability-based agent scheduler.
 * Selects the optimal agent for a task by scoring capabilities, availability,
 * and priority. Manages task assignment and completion lifecycle events.
 */
export class AgentScheduler {
  /** Agent registry for looking up available agents. */
  private readonly registry: AgentRegistry;
  /** Event bus for lifecycle events. */
  private readonly eventBus: EventBus;
  /** Capability resolver for scoring. */
  private readonly resolver: CapabilityResolver;

  /** Pending tasks waiting for assignment. */
  private readonly pendingTasks: AgentTask[] = [];

  /** Task-to-agent assignment map. */
  private readonly assignments = new Map<string, string>();

  constructor(options: { registry: AgentRegistry; eventBus: EventBus }) {
    this.registry = options.registry;
    this.eventBus = options.eventBus;
    this.resolver = new CapabilityResolver();
  }

  /**
   * Find the best agent for a task based on capabilities.
   * Selects the highest-scoring, available agent that satisfies all requirements.
   * @param task - The task to find an agent for.
   * @returns The best matching agent, or null if none available.
   */
  findBestAgent(task: AgentTask): AgentInstance | null {
    const readyAgents = this.registry.getReady();
    if (readyAgents.length === 0) {
      return null;
    }

    // Filter agents that are not already at max concurrent tasks
    const availableAgents = readyAgents.filter((agent) => {
      const currentAssignments = this.getAgentAssignmentCount(agent.id);
      return currentAssignments < agent.manifest.resourceLimits.maxConcurrentTasks;
    });

    if (availableAgents.length === 0) {
      return null;
    }

    // Score all available agents
    const scores = availableAgents.map((agent) => ({
      agent,
      score: this.scoreAgent(agent, task),
    }));

    // Sort by score descending, then by priority ascending (lower = higher priority)
    scores.sort((a, b) => {
      if (b.score.score !== a.score.score) {
        return b.score.score - a.score.score;
      }
      return a.agent.manifest.priority - b.agent.manifest.priority;
    });

    // Return the best match (score > 0)
    const best = scores[0];
    if (best.score.score === 0) {
      return null;
    }

    return best.agent;
  }

  /**
   * Score an agent for a task.
   * Combines capability match score with availability.
   * @param agent - The agent to score.
   * @param task - The task to score against.
   * @returns A CapabilityScore with the agent's match assessment.
   */
  scoreAgent(agent: AgentInstance, task: AgentTask): CapabilityScore {
    const capabilityScore = this.resolver.score(agent, task.requiredCapabilities);
    const currentAssignments = this.getAgentAssignmentCount(agent.id);
    const available =
      agent.state === 'ready' &&
      currentAssignments < agent.manifest.resourceLimits.maxConcurrentTasks;

    const matchedCaps = agent.manifest.capabilities.filter((cap) =>
      task.requiredCapabilities.includes(cap),
    );

    return {
      agentId: agent.id,
      capabilities: matchedCaps,
      score: capabilityScore,
      available,
    };
  }

  /**
   * Assign a task to an agent.
   * Emits AGENT_ASSIGNED and AGENT_TASK_ASSIGNED events.
   * @param agentId - The agent to assign the task to.
   * @param task - The task to assign.
   * @throws If the agent is not found or not available.
   */
  async assign(agentId: string, task: AgentTask): Promise<void> {
    const agent = this.registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    if (agent.state !== 'ready' && agent.state !== 'assigned') {
      throw new Error(`Agent "${agentId}" is not available (state: ${agent.state})`);
    }

    const currentAssignments = this.getAgentAssignmentCount(agentId);
    if (currentAssignments >= agent.manifest.resourceLimits.maxConcurrentTasks) {
      throw new Error(`Agent "${agentId}" has reached maximum concurrent tasks`);
    }

    // Update agent state (stay assigned if already assigned)
    if (agent.state === 'ready') {
      agent.state = 'assigned';
    }
    agent.assignedTask = task.id;
    this.assignments.set(task.id, agentId);

    // Emit lifecycle events
    this.eventBus.emit(AgentEvents.AGENT_ASSIGNED, {
      agentId,
      taskId: task.id,
    });
    this.eventBus.emit(AgentEvents.AGENT_TASK_ASSIGNED, {
      agentId,
      taskId: task.id,
      taskType: task.type,
    });
  }

  /**
   * Mark a task as completed on an agent.
   * Emits AGENT_COMPLETED and AGENT_TASK_COMPLETED events.
   * @param agentId - The agent that completed the task.
   * @param result - The task result.
   * @throws If the agent is not found.
   */
  async complete(agentId: string, result: AgentResult): Promise<void> {
    const agent = this.registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    const taskId = agent.assignedTask;

    // Update state
    agent.state = 'completed';
    agent.completedAt = new Date();
    agent.assignedTask = undefined;

    if (taskId) {
      this.assignments.delete(taskId);
    }

    // Emit lifecycle events
    this.eventBus.emit(AgentEvents.AGENT_COMPLETED, {
      agentId,
      taskId,
      status: result.status,
    });
    if (taskId) {
      this.eventBus.emit(AgentEvents.AGENT_TASK_COMPLETED, {
        agentId,
        taskId,
        status: result.status,
      });
    }

    // Return agent to ready state
    agent.state = 'ready';
  }

  /**
   * Mark a task as failed on an agent.
   * Emits AGENT_FAILED and AGENT_TASK_FAILED events.
   * @param agentId - The agent that failed the task.
   * @param error - The error message.
   */
  async fail(agentId: string, error: string): Promise<void> {
    const agent = this.registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    const taskId = agent.assignedTask;

    agent.state = 'failed';
    agent.error = error;
    agent.assignedTask = undefined;

    if (taskId) {
      this.assignments.delete(taskId);
    }

    this.eventBus.emit(AgentEvents.AGENT_FAILED, {
      agentId,
      taskId,
      error,
    });
    if (taskId) {
      this.eventBus.emit(AgentEvents.AGENT_TASK_FAILED, {
        agentId,
        taskId,
        error,
      });
    }
  }

  /**
   * Add a task to the pending queue.
   * @param task - The task to enqueue.
   */
  enqueue(task: AgentTask): void {
    this.pendingTasks.push(task);
    // Sort by priority (lower = higher priority)
    this.pendingTasks.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  /**
   * Dequeue the highest-priority pending task.
   * @returns The next pending task, or undefined if the queue is empty.
   */
  dequeue(): AgentTask | undefined {
    return this.pendingTasks.shift();
  }

  /**
   * Get the current queue status.
   * @returns Object with counts of pending, assigned, and running tasks.
   */
  getQueueStatus(): { pending: number; assigned: number; running: number } {
    const assigned = this.registry.getByState('assigned').length;
    const running = this.registry.getByState('running').length;
    return {
      pending: this.pendingTasks.length,
      assigned,
      running,
    };
  }

  /**
   * Get the agent assigned to a specific task.
   * @param taskId - The task identifier.
   * @returns The assigned agent id, or undefined.
   */
  getAssignedAgent(taskId: string): string | undefined {
    return this.assignments.get(taskId);
  }

  /**
   * Get the number of tasks assigned to a specific agent.
   * @param agentId - The agent identifier.
   * @returns Number of currently assigned tasks.
   */
  getAgentAssignmentCount(agentId: string): number {
    let count = 0;
    for (const [, assignedAgentId] of this.assignments) {
      if (assignedAgentId === agentId) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get all pending tasks.
   * @returns Array of pending tasks.
   */
  getPendingTasks(): AgentTask[] {
    return [...this.pendingTasks];
  }

  /**
   * Clear the pending queue (used in tests).
   */
  clearPending(): void {
    this.pendingTasks.length = 0;
  }
}
