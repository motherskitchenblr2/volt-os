/**
 * @module __tests__/helpers
 * Shared test utilities for the Vertical Slice test suites.
 */

import type { AgentContext } from '@volt-os/agent-runtime';

/**
 * Create a minimal no-op AgentContext for test initialization.
 * Cast to the expected type so agents can initialize without
 * requiring the full Plugin Runtime sandbox.
 */
export function createMinimalContext(): AgentContext {
  const noop = (): void => { /* noop */ };

  const logger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
  };

  return {
    logger,
    events: {
      publish: async () => {},
      subscribe: async () => async () => {},
    },
    memory: {
      read: async () => null,
      write: async () => {},
      delete: async () => {},
    },
    config: {
      get: () => undefined,
      getAll: () => ({}),
    },
    storage: {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
    },
    tasks: {
      reportProgress: noop,
      checkCancellation: () => false,
    },
  } as AgentContext;
}

/**
 * Create a minimal agent manifest for test registration.
 */
export function createManifest(id: string, capabilities: string[]) {
  return {
    id,
    version: '1.0.0',
    name: `${id} agent`,
    description: `Test agent: ${id}`,
    author: 'test',
    capabilities,
    requiredTools: [],
    requiredModels: [],
    requiredPermissions: [],
    memoryProfile: {
      workingMemoryMB: 64,
      longTermMemory: true,
      contextWindow: 8192,
    },
    resourceLimits: {
      maxConcurrentTasks: 1,
      maxMemoryMB: 128,
      maxCpuTimeMs: 60_000,
      maxTokensPerTask: 4096,
      executionTimeoutMs: 30_000,
    },
    priority: 1,
    healthChecks: {
      intervalMs: 30_000,
      timeoutMs: 5_000,
      failureThreshold: 3,
    },
    lifecycleHooks: {
      onInitialize: 'initialize',
      onExecute: 'execute',
      onShutdown: 'shutdown',
    },
  } as const;
}
