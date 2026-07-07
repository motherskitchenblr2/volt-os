/**
 * @module model-binder
 * Model binder — binds agents to their model providers.
 * Each agent can be configured with specific model endpoints and parameters.
 */

import type {
  AgentInstance,
} from './types.js';

/**
 * Binds agents to their model provider configurations.
 * Manages model configuration lookup and lifecycle for each agent.
 */
export class ModelBinder {
  /** Model configurations indexed by agent id. */
  private readonly configs = new Map<string, Record<string, unknown>>();

  /**
   * Bind an agent to its model provider.
   * Extracts model configuration from the agent manifest and stores it.
   * @param agent - The agent instance to bind.
   * @throws If the agent is already bound to a model.
   */
  async bind(agent: AgentInstance): Promise<void> {
    if (this.configs.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" is already bound to a model`);
    }

    const modelConfig: Record<string, unknown> = {
      requiredModels: agent.manifest.requiredModels,
      maxTokensPerTask: agent.manifest.resourceLimits.maxTokensPerTask,
      memoryProfile: agent.manifest.memoryProfile,
    };

    this.configs.set(agent.id, modelConfig);
  }

  /**
   * Bind an agent to a custom model configuration.
   * @param agent - The agent instance to bind.
   * @param config - The custom model configuration to associate.
   * @throws If the agent is already bound to a model.
   */
  async bindWithConfig(agent: AgentInstance, config: Record<string, unknown>): Promise<void> {
    if (this.configs.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" is already bound to a model`);
    }

    this.configs.set(agent.id, { ...config });
  }

  /**
   * Unbind an agent from its model provider, releasing the configuration.
   * @param agentId - The id of the agent to unbind.
   * @throws If the agent is not bound.
   */
  async unbind(agentId: string): Promise<void> {
    if (!this.configs.has(agentId)) {
      throw new Error(`Agent "${agentId}" is not bound to any model`);
    }

    this.configs.delete(agentId);
  }

  /**
   * Get the model configuration for an agent.
   * @param agentId - The agent id.
   * @returns The model configuration, or undefined if not bound.
   */
  getModelConfig(agentId: string): Record<string, unknown> | undefined {
    return this.configs.get(agentId);
  }

  /**
   * Check if an agent is currently bound to a model.
   * @param agentId - The agent id.
   * @returns true if the agent has an active model configuration.
   */
  isBound(agentId: string): boolean {
    return this.configs.has(agentId);
  }

  /**
   * Get the count of currently bound agents.
   * @returns Number of bound agents.
   */
  count(): number {
    return this.configs.size;
  }

  /**
   * Clear all bindings (used in tests).
   */
  clear(): void {
    this.configs.clear();
  }
}
