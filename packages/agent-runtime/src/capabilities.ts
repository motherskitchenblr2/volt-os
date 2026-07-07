/**
 * @module capabilities
 * Capability resolver — matches agents to tasks based on required capabilities.
 * Uses scoring to rank agents by how well they satisfy task requirements.
 */

import type {
  AgentInstance,
  CapabilityScore,
} from './types.js';

/**
 * Resolves agent capabilities against task requirements.
 * Capability-based scheduling ensures the best-matched agent is selected.
 */
export class CapabilityResolver {
  /**
   * Find agents that have ALL required capabilities.
   * @param required - The list of required capability strings.
   * @param agents - The pool of available agents.
   * @returns Array of agents that satisfy all requirements.
   */
  resolve(required: string[], agents: AgentInstance[]): AgentInstance[] {
    if (required.length === 0) {
      return agents;
    }
    return agents.filter((agent) =>
      required.every((cap) => agent.manifest.capabilities.includes(cap)),
    );
  }

  /**
   * Score how well an agent matches the required capabilities.
   * Score is 0–100 based on the ratio of matched capabilities to required ones.
   * @param agent - The agent to score.
   * @param required - The list of required capability strings.
   * @returns A score from 0 to 100.
   */
  score(agent: AgentInstance, required: string[]): number {
    if (required.length === 0) {
      return 100;
    }
    const matched = required.filter((cap) =>
      agent.manifest.capabilities.includes(cap),
    ).length;
    return Math.round((matched / required.length) * 100);
  }

  /**
   * Check if an agent has a specific capability.
   * @param agent - The agent to check.
   * @param capability - The capability to look for.
   * @returns true if the agent possesses the capability.
   */
  hasCapability(agent: AgentInstance, capability: string): boolean {
    return agent.manifest.capabilities.includes(capability);
  }

  /**
   * Get all unique capabilities across a set of agents.
   * @param agents - The set of agents to inspect.
   * @returns A deduplicated array of capability strings.
   */
  getAllCapabilities(agents: AgentInstance[]): string[] {
    const capSet = new Set<string>();
    for (const agent of agents) {
      for (const cap of agent.manifest.capabilities) {
        capSet.add(cap);
      }
    }
    return Array.from(capSet);
  }

  /**
   * Score a batch of agents against requirements and return sorted scores.
   * @param required - The list of required capability strings.
   * @param agents - The agents to score.
   * @returns Array of CapabilityScore objects sorted by score descending.
   */
  scoreBatch(required: string[], agents: AgentInstance[]): CapabilityScore[] {
    return agents
      .map((agent) => ({
        agentId: agent.id,
        capabilities: agent.manifest.capabilities.filter((cap) =>
          required.includes(cap),
        ),
        score: this.score(agent, required),
        available: agent.state === 'ready',
      }))
      .sort((a, b) => b.score - a.score);
  }
}
