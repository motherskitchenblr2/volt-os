/**
 * @module index
 * Main entry point for the VOLT OS Plugin Runtime.
 * Re-exports all public types, classes, and functions.
 */

// Core Types
export type {
  PluginCategory,
  PluginState,
  PluginManifest,
  PluginPermission,
  PluginInstance,
  PluginResourceUsage,
  PluginResourceLimits,
  VoltSDK,
  PluginLogger,
  PluginEventAPI,
  PluginMemoryAPI,
  PluginConfigAPI,
  PluginStorageAPI,
  PluginTaskAPI,
  PluginEntryPoint,
  EventBus,
  VerificationResult,
  DependencyResolutionResult,
  HealthCheckResult,
} from './types.js';

export { PluginEvents } from './types.js';

// VoltSDK Implementation
export {
  VoltSDKImpl,
  PluginLoggerImpl,
  PluginEventAPIImpl,
  PluginMemoryAPIImpl,
  PluginConfigAPIImpl,
  PluginStorageAPIImpl,
  PluginTaskAPIImpl,
  clearSDKStores,
  setCancellationFlag,
} from './sdk/volt-sdk.js';

// Verifier
export { PluginVerifier } from './verifier.js';

// Loader
export { PluginLoader } from './loader.js';

// Sandbox
export { PluginSandbox, ResourceLimitError, ExecutionTimeoutError } from './sandbox.js';

// Manager
export { PluginManager } from './manager.js';
export type { PluginManagerOptions } from './manager.js';

// Registry
export { PluginRegistry } from './registry.js';

// Dependency Resolver
export { DependencyResolver } from './dependency.js';

// Metrics
export { PluginMetrics } from './metrics.js';
