/**
 * @module registry
 * Agent registry — central store of registered agent instances.
 * Provides query capabilities by id, capability, and state.
 */

import type {
  AgentInstance,
  AgentState,
} from './types.js';

/**
 * Central registry of all known agent instances.
 * The manager updates the registry as agents move through their lifecycle.
 */
export class AgentRegistry {
  /** Agents indexed by their unique id. */
  private readonly agents = new Map<string, AgentInstance>();

  /**
   * Register an agent instance.
   * @param instance - The agent instance to register.
   * @throws If an agent with the same id is already registered.
   */
  register(instance: AgentInstance): void {
    if (this.agents.has(instance.id)) {
      throw new Error(`Agent "${instance.id}" is already registered`);
    }
    this.agents.set(instance.id, instance);
  }

  /**
   * Unregister an agent by id.
   * @param agentId - The id of the agent to unregister.
   * @returns The removed instance, or undefined if not found.
   */
  unregister(agentId: string): AgentInstance | undefined {
    const instance = this.agents.get(agentId);
    this.agents.delete(agentId);
    return instance;
  }

  /**
   * Get a registered agent by id.
   * @param agentId - The agent id.
   * @returns The agent instance, or undefined if not found.
   */
  get(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List all registered agents.
   * @returns Array of all agent instances.
   */
  list(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get all agents that possess a specific capability.
   * @param capability - The capability to filter by.
   * @returns Array of matching agent instances.
   */
  getByCapability(capability: string): AgentInstance[] {
    return this.list().filter((a) =>
      a.manifest.capabilities.includes(capability),
    );
  }

  /**
   * Get all agents currently in the 'ready' state.
   * @returns Array of ready agent instances.
   */
  getReady(): AgentInstance[] {
    return this.list().filter((a) => a.state === 'ready');
  }

  /**
   * Get all agents in a specific state.
   * @param state - The state to filter by.
   * @returns Array of matching agent instances.
   */
  getByState(state: AgentState): AgentInstance[] {
    return this.list().filter((a) => a.state === state);
  }

  /**
   * Check whether an agent is registered.
   * @param agentId - The agent id.
   * @returns true if the agent is in the registry.
   */
  has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  /**
   * Get the total number of registered agents.
   * @returns The count of registered agents.
   */
  count(): number {
    return this.agents.size;
  }

  /**
   * Clear all entries (used in tests).
   */
  clear(): void {
    this.agents.clear();
  }
}
