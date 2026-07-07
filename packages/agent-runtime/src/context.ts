/**
 * @module context
 * Agent context factory — creates sandboxed AgentContext instances
 * that wrap the VoltSDK sub-APIs for agent-scoped access.
 */

import type {
  VoltSDK,
} from '@volt-os/plugin-runtime';
import type {
  AgentContext,
  AgentInstance,
} from './types.js';

/**
 * Creates sandboxed AgentContext instances for agents.
 * Each agent receives its own isolated context built from the VoltSDK.
 */
export class AgentContextFactory {
  /**
   * Create an AgentContext for an agent from the VoltSDK.
   * The context provides agent-scoped access to logging, events,
   * memory, config, storage, and task APIs.
   * @param sdk - The VoltSDK instance to wrap.
   * @returns A new AgentContext bound to the SDK.
   */
  create(sdk: VoltSDK): AgentContext {
    return {
      logger: sdk.logger,
      events: sdk.events,
      memory: sdk.memory,
      config: sdk.config,
      storage: sdk.storage,
      tasks: sdk.tasks,
    };
  }

  /**
   * Create a no-op AgentContext for testing or agents that don't
   * require full SDK access.
   * @param agent - The agent instance for logging context.
   * @returns A minimal AgentContext with stub implementations.
   */
  createStub(agent: AgentInstance): AgentContext {
    const noopLogger = {
      info: (_msg: string, _data?: Record<string, unknown>): void => {},
      warn: (_msg: string, _data?: Record<string, unknown>): void => {},
      error: (_msg: string, _data?: Record<string, unknown>): void => {},
      debug: (_msg: string, _data?: Record<string, unknown>): void => {},
    };

    const noopEvents = {
      publish: async (_type: string, _payload: Record<string, unknown>): Promise<void> => {},
      subscribe: async (
        _type: string,
        _handler: (payload: Record<string, unknown>) => void,
      ): Promise<() => Promise<void>> => {
        return async (): Promise<void> => {};
      },
    };

    const noopMemory = {
      read: async (_key: string): Promise<unknown> => null,
      write: async (_key: string, _value: unknown): Promise<void> => {},
    };

    const noopConfig = {
      get: (_key: string): unknown => null,
      getAll: (): Record<string, unknown> => ({}),
    };

    const noopStorage = {
      get: async (_key: string): Promise<string | null> => null,
      set: async (_key: string, _value: string): Promise<void> => {},
      delete: async (_key: string): Promise<void> => {},
    };

    const noopTasks = {
      reportProgress: (_progress: number, _message?: string): void => {},
      checkCancellation: (): boolean => false,
    };

    return {
      logger: noopLogger,
      events: noopEvents,
      memory: noopMemory,
      config: noopConfig,
      storage: noopStorage,
      tasks: noopTasks,
    };
  }
}
