/**
 * @module agent-api
 * Agent API implementation for the VOLT OS Developer SDK.
 *
 * Pure delegation to the AgentManager, AgentScheduler, and AgentExecutor
 * subsystems — no business logic.
 */

import type {
  AgentManifest as _AgentManifest,
  AgentTask as _AgentTask,
  AgentResult as _AgentResult,
  AgentInstance as _AgentInstance,
  AgentHealthStatus as _AgentHealthStatus,
} from '@volt-os/agent-runtime';
import type { AgentAPI } from '../types.js';

/**
 * Minimal interface for the parts of AgentManager the SDK needs.
 */
interface AgentManagerLike {
  discover(manifest: _AgentManifest): Promise<_AgentInstance>;
  activate(agentId: string): Promise<void>;
  deactivate(agentId: string): Promise<void>;
  getAgent(agentId: string): _AgentInstance | undefined;
  listAgents(): _AgentInstance[];
  healthCheck(agentId: string): Promise<_AgentHealthStatus>;
}

/**
 * Minimal interface for the parts of AgentExecutor the SDK needs.
 */
interface AgentExecutorLike {
  execute(agent: _AgentInstance, task: _AgentTask): Promise<_AgentResult>;
}

/**
 * AgentAPI implementation that delegates to the AgentManager and AgentExecutor.
 *
 * @example
 * ```ts
 * const api = new AgentAPIImpl(agentManager, agentExecutor);
 * await api.discover(researcherManifest);
 * await api.activate('researcher');
 * const result = await api.run('researcher', task);
 * ```
 */
export class AgentAPIImpl implements AgentAPI {
  /**
   * Create a new AgentAPIImpl.
   * @param manager - The AgentManager subsystem.
   * @param executor - The AgentExecutor subsystem.
   */
  constructor(
    private readonly manager: AgentManagerLike,
    private readonly executor: AgentExecutorLike,
  ) {}

  /**
   * Discover and register a new agent from its manifest.
   * @param manifest - The agent manifest.
   * @throws If an agent with the same ID is already registered.
   */
  async discover(manifest: _AgentManifest): Promise<void> {
    await this.manager.discover(manifest);
  }

  /**
   * Activate an agent, making it ready to accept tasks.
   * @param agentId - Agent ID to activate.
   * @throws If the agent is not found or cannot be activated.
   */
  async activate(agentId: string): Promise<void> {
    await this.manager.activate(agentId);
  }

  /**
   * Deactivate an agent, removing it from the ready pool.
   * @param agentId - Agent ID to deactivate.
   * @throws If the agent is not found.
   */
  async deactivate(agentId: string): Promise<void> {
    await this.manager.deactivate(agentId);
  }

  /**
   * Run a task through an agent.
   * @param agentId - Agent ID to run the task on.
   * @param task - The task to execute.
   * @returns The execution result.
   * @throws If the agent is not found or execution fails.
   */
  async run(agentId: string, task: _AgentTask): Promise<_AgentResult> {
    const agent = this.requireAgent(agentId);
    return this.executor.execute(agent, task);
  }

  /**
   * List all registered agents with summary info.
   * @returns Array of agent summaries with id, state, and capabilities.
   */
  list(): Array<{ id: string; state: string; capabilities: string[] }> {
    return this.manager.listAgents().map((agent: _AgentInstance) => ({
      id: agent.id,
      state: agent.state,
      capabilities: agent.manifest.capabilities,
    }));
  }

  /**
   * Get health status for a specific agent.
   * @param agentId - Agent ID.
   * @returns Health status and uptime.
   * @throws If the agent is not found.
   */
  async health(agentId: string): Promise<{ status: string; uptime: number }> {
    const healthStatus = await this.manager.healthCheck(agentId);
    return {
      status: healthStatus.status,
      uptime: healthStatus.uptime,
    };
  }

  /**
   * Get an agent or throw if not found.
   * @param agentId - Agent ID.
   * @returns The agent instance.
   * @throws If the agent is not found.
   */
  private requireAgent(agentId: string): _AgentInstance {
    const agent = this.manager.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    return agent;
  }
}
