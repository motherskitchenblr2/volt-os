/**
 * @module manager
 * Agent manager — the top-level orchestrator for the agent lifecycle.
 * Coordinates discovery, verification, loading, activation, deactivation,
 * disabling, and restart across all agents.
 *
 * Agents are NEVER exposed directly — they always execute through the IAgent interface.
 * Every state transition emits EventBus events.
 */

import type {
  EventBus,
} from '@volt-os/plugin-runtime';
import type {
  AgentManifest,
  AgentInstance,
  AgentState,
  AgentHealthStatus,
} from './types.js';
import type { IAgent } from './agent/agent-interface.js';
import { AgentEvents } from './types.js';
import { AgentRegistry } from './registry.js';
import { RecoveryManager } from './recovery.js';

/**
 * Options for constructing an AgentManager.
 */
export interface AgentManagerOptions {
  /** The event bus for lifecycle events. */
  eventBus: EventBus;
  /** The agent registry. */
  registry: AgentRegistry;
}

/**
 * Manages the full lifecycle of VOLT OS agents.
 * Agents execute through the IAgent interface — never exposed directly.
 * Every state transition emits EventBus events.
 */
export class AgentManager {
  private readonly eventBus: EventBus;
  private readonly registry: AgentRegistry;
  private readonly recoveryManager: RecoveryManager;

  constructor(options: AgentManagerOptions) {
    this.eventBus = options.eventBus;
    this.registry = options.registry;
    this.recoveryManager = new RecoveryManager({ eventBus: options.eventBus });

    // Wire up recovery restart callback
    this.recoveryManager.setRestartCallback(async (agentId: string) => {
      await this.restart(agentId);
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Discover a new agent from its manifest.
   * Creates an instance in the 'discovered' state.
   * @param manifest - The agent manifest.
   * @returns The created agent instance.
   * @throws If an agent with the same id is already registered.
   */
  async discover(manifest: AgentManifest): Promise<AgentInstance> {
    const instance = this.createInstance(manifest);
    instance.state = 'discovered';

    this.registry.register(instance);

    this.eventBus.emit(AgentEvents.AGENT_DISCOVERED, {
      agentId: manifest.id,
      capabilities: manifest.capabilities,
    });

    return instance;
  }

  /**
   * Verify an agent's manifest and requirements.
   * Transitions from 'discovered' to 'verified'.
   * @param agentId - The agent to verify.
   * @throws If the agent is not found or not in 'discovered' state.
   */
  async verify(agentId: string): Promise<void> {
    const agent = this.requireAgent(agentId);
    this.requireState(agent, 'discovered');

    // Basic verification: check manifest has required fields
    if (!agent.manifest.id || !agent.manifest.version || !agent.manifest.name) {
      throw new Error(`Agent "${agentId}" has invalid manifest`);
    }

    if (agent.manifest.resourceLimits.maxConcurrentTasks < 1) {
      throw new Error(`Agent "${agentId}" must allow at least 1 concurrent task`);
    }

    this.transitionState(agent, 'verified');

    this.eventBus.emit(AgentEvents.AGENT_VERIFIED, {
      agentId,
      version: agent.manifest.version,
    });
  }

  /**
   * Load an agent implementation into the runtime.
   * Transitions from 'verified' to 'loaded'.
   * @param agentId - The agent to load.
   * @param agentImpl - The IAgent implementation.
   * @throws If the agent is not found or not in 'verified' state.
   */
  async load(agentId: string, agentImpl: IAgent): Promise<void> {
    const agent = this.requireAgent(agentId);
    this.requireState(agent, 'verified');

    // Initialize the agent implementation
    // The context will be provided by the memory binder at execution time
    this.transitionState(agent, 'loaded');
    agent.loadedAt = new Date();

    this.eventBus.emit(AgentEvents.AGENT_LOADED, {
      agentId,
      loadedAt: agent.loadedAt,
    });
  }

  /**
   * Activate an agent, making it ready to accept tasks.
   * Transitions from 'loaded' to 'ready'.
   * @param agentId - The agent to activate.
   * @throws If the agent is not found or not in 'loaded' state.
   */
  async activate(agentId: string): Promise<void> {
    const agent = this.requireAgent(agentId);
    this.requireState(agent, 'loaded');

    this.transitionState(agent, 'ready');

    this.eventBus.emit(AgentEvents.AGENT_READY, {
      agentId,
      capabilities: agent.manifest.capabilities,
    });
  }

  /**
   * Deactivate an agent, removing it from the ready pool.
   * Transitions from 'ready' to 'paused'.
   * @param agentId - The agent to deactivate.
   * @throws If the agent is not found or not in 'ready' state.
   */
  async deactivate(agentId: string): Promise<void> {
    const agent = this.requireAgent(agentId);
    this.requireState(agent, 'ready');

    this.transitionState(agent, 'paused');

    this.eventBus.emit(AgentEvents.AGENT_PAUSED, {
      agentId,
    });
  }

  /**
   * Disable an agent with a reason.
   * Can be called from any active state.
   * @param agentId - The agent to disable.
   * @param reason - The reason for disabling.
   * @throws If the agent is not found.
   */
  async disable(agentId: string, reason: string): Promise<void> {
    const agent = this.requireAgent(agentId);

    this.transitionState(agent, 'disabled');
    agent.error = reason;

    this.eventBus.emit(AgentEvents.AGENT_DISABLED, {
      agentId,
      reason,
    });
  }

  /**
   * Restart an agent by shutting it down and re-initializing.
   * @param agentId - The agent to restart.
   * @throws If the agent is not found.
   */
  async restart(agentId: string): Promise<void> {
    const agent = this.requireAgent(agentId);

    this.transitionState(agent, 'restarting');

    this.eventBus.emit(AgentEvents.AGENT_RESTARTING, {
      agentId,
    });

    // Reset agent state for re-initialization
    agent.assignedTask = undefined;
    agent.error = undefined;
    agent.resourceUsage = {
      memoryMB: 0,
      cpuTimeMs: 0,
      tokensUsed: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
    };

    // Move back through the lifecycle
    this.transitionState(agent, 'loaded');
    agent.loadedAt = new Date();

    this.transitionState(agent, 'ready');

    this.eventBus.emit(AgentEvents.AGENT_READY, {
      agentId,
      capabilities: agent.manifest.capabilities,
      restarted: true,
    });
  }

  // -------------------------------------------------------------------------
  // State Queries
  // -------------------------------------------------------------------------

  /**
   * Get an agent instance by id.
   * @param agentId - The agent id.
   * @returns The agent instance, or undefined.
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.registry.get(agentId);
  }

  /**
   * List all registered agents.
   * @returns Array of agent instances.
   */
  listAgents(): AgentInstance[] {
    return this.registry.list();
  }

  /**
   * Get all agents in a specific state.
   * @param state - The state to filter by.
   * @returns Array of matching agent instances.
   */
  getAgentsByState(state: AgentState): AgentInstance[] {
    return this.registry.getByState(state);
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /**
   * Run a health check on a specific agent.
   * @param agentId - The agent to check.
   * @returns The health status.
   * @throws If the agent is not found.
   */
  async healthCheck(agentId: string): Promise<AgentHealthStatus> {
    const agent = this.requireAgent(agentId);
    return agent.health;
  }

  /**
   * Run health checks on all registered agents.
   * @returns Array of health statuses.
   */
  async healthCheckAll(): Promise<AgentHealthStatus[]> {
    return this.registry.list().map((agent) => agent.health);
  }

  // -------------------------------------------------------------------------
  // Recovery
  // -------------------------------------------------------------------------

  /**
   * Get the recovery manager for external access.
   * @returns The RecoveryManager instance.
   */
  getRecoveryManager(): RecoveryManager {
    return this.recoveryManager;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Create a new AgentInstance from a manifest.
   * @param manifest - The agent manifest.
   * @returns A new agent instance in 'discovered' state.
   */
  private createInstance(manifest: AgentManifest): AgentInstance {
    return {
      id: manifest.id,
      manifest,
      state: 'discovered',
      resourceUsage: {
        memoryMB: 0,
        cpuTimeMs: 0,
        tokensUsed: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
      },
      health: {
        status: 'healthy',
        lastCheck: new Date(),
        consecutiveFailures: 0,
        uptime: 0,
      },
    };
  }

  /**
   * Transition an agent to a new state with event emission.
   * @param agent - The agent to transition.
   * @param newState - The target state.
   */
  private transitionState(agent: AgentInstance, newState: AgentState): void {
    const oldState = agent.state;
    agent.state = newState;

    this.eventBus.emit(AgentEvents.AGENT_STATE_CHANGED, {
      agentId: agent.id,
      oldState,
      newState,
    });
  }

  /**
   * Get an agent or throw if not found.
   * @param agentId - The agent id.
   * @returns The agent instance.
   * @throws If the agent is not found.
   */
  private requireAgent(agentId: string): AgentInstance {
    const agent = this.registry.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }
    return agent;
  }

  /**
   * Require an agent to be in a specific state, or throw.
   * @param agent - The agent instance.
   * @param expectedState - The required state.
   * @throws If the agent is not in the expected state.
   */
  private requireState(agent: AgentInstance, expectedState: AgentState): void {
    if (agent.state !== expectedState) {
      throw new Error(
        `Agent "${agent.id}" is in state "${agent.state}", expected "${expectedState}"`,
      );
    }
  }
}
