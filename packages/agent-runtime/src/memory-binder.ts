/**
 * @module memory-binder
 * Memory binder — binds agents to their isolated memory scopes.
 * Each agent gets its own memory context for working memory operations.
 */

import type {
  AgentContext,
  AgentInstance,
} from './types.js';
import { AgentContextFactory } from './context.js';

/**
 * Binds agents to their isolated memory scopes.
 * Manages memory context creation and lifecycle for each agent.
 */
export class MemoryBinder {
  /** Active memory contexts indexed by agent id. */
  private readonly contexts = new Map<string, AgentContext>();
  /** Context factory for creating new contexts. */
  private readonly factory = new AgentContextFactory();

  /**
   * Bind an agent to its memory scope.
   * Creates a new isolated AgentContext for the agent.
   * @param agent - The agent instance to bind.
   * @returns The created AgentContext.
   * @throws If the agent is already bound.
   */
  async bind(agent: AgentInstance): Promise<AgentContext> {
    if (this.contexts.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" is already bound to a memory scope`);
    }

    const context = this.factory.createStub(agent);
    this.contexts.set(agent.id, context);
    return context;
  }

  /**
   * Bind an agent to its memory scope using a provided VoltSDK-backed context.
   * @param agent - The agent instance to bind.
   * @param context - The AgentContext to associate with the agent.
   * @returns The provided AgentContext.
   * @throws If the agent is already bound.
   */
  async bindWithContext(agent: AgentInstance, context: AgentContext): Promise<AgentContext> {
    if (this.contexts.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" is already bound to a memory scope`);
    }

    this.contexts.set(agent.id, context);
    return context;
  }

  /**
   * Unbind an agent from its memory scope, releasing the context.
   * @param agentId - The id of the agent to unbind.
   * @throws If the agent is not bound.
   */
  async unbind(agentId: string): Promise<void> {
    if (!this.contexts.has(agentId)) {
      throw new Error(`Agent "${agentId}" is not bound to any memory scope`);
    }

    this.contexts.delete(agentId);
  }

  /**
   * Get the memory context for an agent.
   * @param agentId - The agent id.
   * @returns The AgentContext, or undefined if not bound.
   */
  getContext(agentId: string): AgentContext | undefined {
    return this.contexts.get(agentId);
  }

  /**
   * Check if an agent is currently bound to a memory scope.
   * @param agentId - The agent id.
   * @returns true if the agent has an active memory context.
   */
  isBound(agentId: string): boolean {
    return this.contexts.has(agentId);
  }

  /**
   * Get the count of currently bound agents.
   * @returns Number of bound agents.
   */
  count(): number {
    return this.contexts.size;
  }

  /**
   * Clear all bindings (used in tests).
   */
  clear(): void {
    this.contexts.clear();
  }
}
