/**
 * @module types
 * Core type definitions for the VOLT OS Plugin Runtime.
 * These types define the strict boundary between plugins and the host system.
 */

// ---------------------------------------------------------------------------
// Plugin Categories
// ---------------------------------------------------------------------------

/** Categories that classify a plugin's primary function. */
export type PluginCategory =
  | 'agent'
  | 'memory'
  | 'model'
  | 'security'
  | 'deployment'
  | 'integration'
  | 'toolchain'
  | 'auth'
  | 'ui';

// ---------------------------------------------------------------------------
// Plugin State Machine
// ---------------------------------------------------------------------------

/** Possible lifecycle states of a plugin instance. */
export type PluginState =
  | 'installed'
  | 'verified'
  | 'registered'
  | 'loaded'
  | 'initialized'
  | 'healthy'
  | 'executing'
  | 'paused'
  | 'stopped'
  | 'unloaded'
  | 'removed'
  | 'error';

// ---------------------------------------------------------------------------
// Plugin Manifest
// ---------------------------------------------------------------------------

/**
 * Declarative manifest describing a plugin's identity, requirements, and contract.
 * The manifest is the ONLY metadata a plugin exposes to the host.
 */
export interface PluginManifest {
  /** Unique plugin identifier (e.g. "volt-os/memory-summarizer"). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Semver version string. */
  version: string;
  /** Plugin author. */
  author: string;
  /** Short description. */
  description: string;
  /** Primary category. */
  category: PluginCategory;
  /** Permissions the plugin requests. */
  permissions: PluginPermission[];
  /** Named capabilities the plugin advertises. */
  capabilities: string[];
  /** Event types the plugin subscribes to or publishes. */
  events: { subscribe?: string[]; publish?: string[] };
  /** Plugin-to-plugin dependency map (id → semver range). */
  dependencies?: Record<string, string>;
  /** Minimum VOLT OS version required. */
  minimumVoltVersion: string;
  /** SDK version the plugin was built against. */
  sdkVersion: string;
  /** Optional cryptographic signature. */
  signature?: string;
  /** SHA-256 checksum of the entry point file. */
  checksum: string;
  /** Relative path to the plugin's entry point module. */
  entryPoint: string;
  /** Default plugin-specific configuration values. */
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Plugin Permissions
// ---------------------------------------------------------------------------

/**
 * A single permission grant for a plugin.
 * The SDK checks these before every system interaction.
 */
export interface PluginPermission {
  /** Resource type the plugin wants to access. */
  type: 'memory' | 'filesystem' | 'network' | 'model' | 'event' | 'tool';
  /** Access level: read, write, or invoke. */
  access: 'read' | 'write' | 'invoke';
  /** Optional scope qualifier (e.g. specific namespace). */
  scope?: string;
  /** Optional target filter (e.g. specific event types). */
  targets?: string[];
}

// ---------------------------------------------------------------------------
// Plugin Instance
// ---------------------------------------------------------------------------

/** Runtime representation of a loaded plugin. */
export interface PluginInstance {
  /** Unique instance identifier (matches manifest id). */
  id: string;
  /** The plugin's manifest. */
  manifest: PluginManifest;
  /** Current lifecycle state. */
  state: PluginState;
  /** When the plugin was loaded into memory. */
  loadedAt?: Date;
  /** When the plugin was started (activated). */
  startedAt?: Date;
  /** Error message if state is 'error'. */
  error?: string;
  /** Current resource usage counters. */
  resourceUsage: PluginResourceUsage;
}

// ---------------------------------------------------------------------------
// Resource Types
// ---------------------------------------------------------------------------

/** Accumulated resource usage for a plugin instance. */
export interface PluginResourceUsage {
  /** Memory consumed in megabytes. */
  memoryMB: number;
  /** Cumulative CPU time in milliseconds. */
  cpuTimeMs: number;
  /** Tokens consumed (for model-calling plugins). */
  tokensUsed: number;
  /** Total tasks executed. */
  tasksExecuted: number;
}

/** Hard limits enforced by the sandbox. */
export interface PluginResourceLimits {
  /** Maximum resident memory in MB. */
  maxMemoryMB: number;
  /** Maximum CPU time per execution in ms. */
  maxCpuTimeMs: number;
  /** Maximum tokens per single task. */
  maxTokensPerTask: number;
  /** Maximum concurrent tasks. */
  maxConcurrentTasks: number;
  /** Per-call execution timeout in ms. */
  executionTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// VoltSDK — The ONLY interface plugins interact with
// ---------------------------------------------------------------------------

/**
 * The VoltSDK is the sole interface through which a plugin interacts with
 * the VOLT OS host. Every sub-API enforces the plugin's declared permissions.
 * Plugins MUST NOT access any internal system directly.
 */
export interface VoltSDK {
  /** Structured logger scoped to the plugin. */
  readonly logger: PluginLogger;
  /** Event bus publish/subscribe API. */
  readonly events: PluginEventAPI;
  /** Key-value memory API (sandboxed per plugin). */
  readonly memory: PluginMemoryAPI;
  /** Read-only plugin configuration. */
  readonly config: PluginConfigAPI;
  /** Persistent key-value storage (sandboxed per plugin). */
  readonly storage: PluginStorageAPI;
  /** Task progress reporting and cancellation checking. */
  readonly tasks: PluginTaskAPI;
}

// ---------------------------------------------------------------------------
// SDK Sub-APIs
// ---------------------------------------------------------------------------

/** Logger scoped to the plugin. All messages are prefixed with the plugin id. */
export interface PluginLogger {
  /** Log an informational message. */
  info(message: string, data?: Record<string, unknown>): void;
  /** Log a warning. */
  warn(message: string, data?: Record<string, unknown>): void;
  /** Log an error. */
  error(message: string, data?: Record<string, unknown>): void;
  /** Log a debug message. */
  debug(message: string, data?: Record<string, unknown>): void;
}

/** Event API with permission-checked publish and subscribe. */
export interface PluginEventAPI {
  /** Publish an event. Requires event/write permission. */
  publish(type: string, payload: Record<string, unknown>): Promise<void>;
  /** Subscribe to an event. Requires event/read permission. Returns an unsubscribe function. */
  subscribe(
    type: string,
    handler: (payload: Record<string, unknown>) => void,
  ): Promise<() => Promise<void>>;
}

/** Key-value memory API. Each plugin gets an isolated namespace. */
export interface PluginMemoryAPI {
  /** Read a value. Requires memory/read permission. */
  read(key: string): Promise<unknown>;
  /** Write a value. Requires memory/write permission. */
  write(key: string, value: unknown): Promise<void>;
}

/** Read-only plugin configuration API. */
export interface PluginConfigAPI {
  /** Get a single config value by key. */
  get(key: string): unknown;
  /** Get all config values. */
  getAll(): Record<string, unknown>;
}

/** Persistent storage API. Each plugin gets an isolated namespace. */
export interface PluginStorageAPI {
  /** Get a stored string value. */
  get(key: string): Promise<string | null>;
  /** Set a stored string value. */
  set(key: string, value: string): Promise<void>;
  /** Delete a stored value. */
  delete(key: string): Promise<void>;
}

/** Task progress and cancellation API. */
export interface PluginTaskAPI {
  /** Report execution progress (0–100). */
  reportProgress(progress: number, message?: string): void;
  /** Check if the current task has been cancelled. */
  checkCancellation(): boolean;
}

// ---------------------------------------------------------------------------
// Plugin Entry Point
// ---------------------------------------------------------------------------

/**
 * The entry point module a plugin must export.
 * The loader validates this contract before activation.
 */
export interface PluginEntryPoint {
  /** Activate the plugin with the provided SDK. Called during initialization. */
  activate(sdk: VoltSDK): Promise<void>;
  /** Deactivate and release resources. Called during shutdown. */
  deactivate(): Promise<void>;
  /** Health check returning current status. */
  healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }>;
}

// ---------------------------------------------------------------------------
// EventBus Interface (local)
// ---------------------------------------------------------------------------

/**
 * Minimal event bus contract used by the plugin runtime.
 * Mirrors the interface from @volt-os/event-bus so this package
 * can be tested and used independently.
 */
export interface EventBus {
  /** Emit an event with associated data. */
  emit(event: string, data: Record<string, unknown>): void;
  /** Subscribe to an event. Returns an unsubscribe handle or void. */
  on(
    event: string,
    handler: (data: Record<string, unknown>) => void,
  ): void | (() => void);
  /** Unsubscribe from an event. */
  off(event: string, handler: (data: Record<string, unknown>) => void): void;
}

// ---------------------------------------------------------------------------
// Lifecycle Event Names
// ---------------------------------------------------------------------------

/** Canonical event names emitted by the plugin runtime. */
export const PluginEvents = {
  PLUGIN_INSTALLED: 'plugin:installed',
  PLUGIN_VERIFIED: 'plugin:verified',
  PLUGIN_REGISTERED: 'plugin:registered',
  PLUGIN_LOADED: 'plugin:loaded',
  PLUGIN_INITIALIZED: 'plugin:initialized',
  PLUGIN_HEALTHY: 'plugin:healthy',
  PLUGIN_UNHEALTHY: 'plugin:unhealthy',
  PLUGIN_ACTIVATED: 'plugin:activated',
  PLUGIN_DEACTIVATED: 'plugin:deactivated',
  PLUGIN_REMOVED: 'plugin:removed',
  PLUGIN_ERROR: 'plugin:error',
  PLUGIN_UPDATED: 'plugin:updated',
  PLUGIN_ROLLED_BACK: 'plugin:rolled_back',
} as const;

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/** Result of plugin verification. */
export interface VerificationResult {
  /** Whether the plugin passed all checks. */
  valid: boolean;
  /** List of error messages (empty if valid). */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Dependency Resolution
// ---------------------------------------------------------------------------

/** Result of dependency graph resolution. */
export interface DependencyResolutionResult {
  /** Whether the graph is valid (no cycles, no missing deps). */
  valid: boolean;
  /** Topological load order (plugin ids). */
  loadOrder: string[];
  /** Error messages (empty if valid). */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/** Aggregate health status across all plugins. */
export interface HealthCheckResult {
  /** Overall status: 'healthy' if all ok, 'degraded' if some unhealthy, 'unhealthy' if critical. */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Per-plugin health. */
  plugins: Array<{ id: string; status: string }>;
}
