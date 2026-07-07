/**
 * @module sdk/volt-sdk
 * VoltSDK implementation — the ONLY interface plugins use to interact with the host.
 * Every sub-API enforces the plugin's declared permissions before executing.
 */

import type {
  VoltSDK,
  PluginLogger,
  PluginEventAPI,
  PluginMemoryAPI,
  PluginConfigAPI,
  PluginStorageAPI,
  PluginTaskAPI,
  PluginPermission,
  PluginResourceLimits,
  EventBus,
} from '../types.js';

// ---------------------------------------------------------------------------
// Permission Helpers
// ---------------------------------------------------------------------------

/** In-memory store for plugin-scoped key-value memory. */
const memoryStore = new Map<string, Map<string, unknown>>();

/** In-memory store for plugin-scoped persistent storage. */
const storageStore = new Map<string, Map<string, string>>();

/** Active cancellation flags keyed by pluginId. */
const cancellationFlags = new Map<string, boolean>();

/**
 * Check whether a permission list grants a specific access.
 * @param permissions - The plugin's declared permissions.
 * @param type - Resource type to check.
 * @param access - Access level to check.
 * @param target - Optional target to match against targets list.
 * @returns true if the permission is granted.
 */
function hasPermission(
  permissions: PluginPermission[],
  type: PluginPermission['type'],
  access: PluginPermission['access'],
  target?: string,
): boolean {
  return permissions.some((p) => {
    if (p.type !== type || p.access !== access) return false;
    if (target && p.targets && p.targets.length > 0) {
      return p.targets.includes(target);
    }
    return true;
  });
}

/**
 * Throw if the plugin lacks a required permission.
 */
function requirePermission(
  permissions: PluginPermission[],
  type: PluginPermission['type'],
  access: PluginPermission['access'],
  pluginId: string,
  target?: string,
): void {
  if (!hasPermission(permissions, type, access, target)) {
    throw new Error(
      `Plugin "${pluginId}" lacks ${type}/${access} permission` +
        (target ? ` for target "${target}"` : ''),
    );
  }
}

// ---------------------------------------------------------------------------
// PluginLoggerImpl
// ---------------------------------------------------------------------------

/** Logger implementation scoped to a specific plugin. */
export class PluginLoggerImpl implements PluginLogger {
  private readonly prefix: string;

  constructor(pluginId: string) {
    this.prefix = `[plugin:${pluginId}]`;
  }

  /** @inheritdoc */
  info(message: string, data?: Record<string, unknown>): void {
    if (data !== undefined) {
      console.info(`${this.prefix} ${message}`, JSON.stringify(data));
    } else {
      console.info(`${this.prefix} ${message}`);
    }
  }

  /** @inheritdoc */
  warn(message: string, data?: Record<string, unknown>): void {
    if (data !== undefined) {
      console.warn(`${this.prefix} ${message}`, JSON.stringify(data));
    } else {
      console.warn(`${this.prefix} ${message}`);
    }
  }

  /** @inheritdoc */
  error(message: string, data?: Record<string, unknown>): void {
    if (data !== undefined) {
      console.error(`${this.prefix} ${message}`, JSON.stringify(data));
    } else {
      console.error(`${this.prefix} ${message}`);
    }
  }

  /** @inheritdoc */
  debug(message: string, data?: Record<string, unknown>): void {
    if (data !== undefined) {
      console.debug(`${this.prefix} ${message}`, JSON.stringify(data));
    } else {
      console.debug(`${this.prefix} ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// PluginEventAPIImpl
// ---------------------------------------------------------------------------

/**
 * Event API that checks publish/subscribe permissions against the
 * plugin's declared event permissions.
 */
export class PluginEventAPIImpl implements PluginEventAPI {
  /** Handlers registered by this plugin, for cleanup on unsubscribe. */
  private readonly handlers = new Map<string, Set<(payload: Record<string, unknown>) => void>>();

  constructor(
    private readonly pluginId: string,
    private readonly permissions: PluginPermission[],
    private readonly eventBus: EventBus,
  ) {}

  /** @inheritdoc */
  async publish(type: string, payload: Record<string, unknown>): Promise<void> {
    requirePermission(this.permissions, 'event', 'write', this.pluginId, type);
    this.eventBus.emit(type, payload);
  }

  /** @inheritdoc */
  async subscribe(
    type: string,
    handler: (payload: Record<string, unknown>) => void,
  ): Promise<() => Promise<void>> {
    requirePermission(this.permissions, 'event', 'read', this.pluginId, type);

    this.eventBus.on(type, handler);

    // Track for cleanup
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscribe function
    const unsubscribe = async (): Promise<void> => {
      this.eventBus.off(type, handler);
      this.handlers.get(type)?.delete(handler);
      if (this.handlers.get(type)?.size === 0) {
        this.handlers.delete(type);
      }
    };

    return unsubscribe;
  }

  /**
   * Remove all subscriptions registered by this plugin.
   * Called during plugin deactivation.
   */
  async removeAllSubscriptions(): Promise<void> {
    for (const [type, handlers] of this.handlers) {
      for (const handler of handlers) {
        this.eventBus.off(type, handler);
      }
    }
    this.handlers.clear();
  }
}

// ---------------------------------------------------------------------------
// PluginMemoryAPIImpl
// ---------------------------------------------------------------------------

/**
 * Memory API providing isolated key-value storage per plugin.
 * Requires memory/read or memory/write permissions.
 */
export class PluginMemoryAPIImpl implements PluginMemoryAPI {
  constructor(
    private readonly pluginId: string,
    private readonly permissions: PluginPermission[],
  ) {
    // Ensure the plugin has its own isolated namespace
    if (!memoryStore.has(pluginId)) {
      memoryStore.set(pluginId, new Map());
    }
  }

  /** @inheritdoc */
  async read(key: string): Promise<unknown> {
    requirePermission(this.permissions, 'memory', 'read', this.pluginId);
    const ns = memoryStore.get(this.pluginId);
    return ns?.get(key) ?? null;
  }

  /** @inheritdoc */
  async write(key: string, value: unknown): Promise<void> {
    requirePermission(this.permissions, 'memory', 'write', this.pluginId);
    const ns = memoryStore.get(this.pluginId);
    ns?.set(key, value);
  }
}

// ---------------------------------------------------------------------------
// PluginConfigAPIImpl
// ---------------------------------------------------------------------------

/** Read-only configuration API populated from the plugin manifest. */
export class PluginConfigAPIImpl implements PluginConfigAPI {
  private readonly config: Record<string, unknown>;

  constructor(config: Record<string, unknown>) {
    // Freeze to prevent plugins from mutating config
    this.config = Object.freeze({ ...config });
  }

  /** @inheritdoc */
  get(key: string): unknown {
    return this.config[key] ?? null;
  }

  /** @inheritdoc */
  getAll(): Record<string, unknown> {
    return { ...this.config };
  }
}

// ---------------------------------------------------------------------------
// PluginStorageAPIImpl
// ---------------------------------------------------------------------------

/**
 * Persistent storage API providing isolated key-value storage per plugin.
 * Uses an in-memory Map (in production, backed by Redis or disk).
 */
export class PluginStorageAPIImpl implements PluginStorageAPI {
  constructor(private readonly pluginId: string) {
    if (!storageStore.has(pluginId)) {
      storageStore.set(pluginId, new Map());
    }
  }

  /** @inheritdoc */
  async get(key: string): Promise<string | null> {
    const ns = storageStore.get(this.pluginId);
    return ns?.get(key) ?? null;
  }

  /** @inheritdoc */
  async set(key: string, value: string): Promise<void> {
    const ns = storageStore.get(this.pluginId);
    ns?.set(key, value);
  }

  /** @inheritdoc */
  async delete(key: string): Promise<void> {
    const ns = storageStore.get(this.pluginId);
    ns?.delete(key);
  }
}

// ---------------------------------------------------------------------------
// PluginTaskAPIImpl
// ---------------------------------------------------------------------------

/** Task progress and cancellation API. */
export class PluginTaskAPIImpl implements PluginTaskAPI {
  /** Callback for progress reports, set externally by the sandbox. */
  private progressCallback: ((progress: number, message?: string) => void) | null = null;

  constructor(private readonly pluginId: string, _limits: PluginResourceLimits) {}

  /** @inheritdoc */
  reportProgress(progress: number, message?: string): void {
    if (this.progressCallback) {
      this.progressCallback(progress, message);
    }
  }

  /** @inheritdoc */
  checkCancellation(): boolean {
    return cancellationFlags.get(this.pluginId) === true;
  }

  /**
   * Set the progress callback (used by the sandbox).
   * @internal
   */
  setProgressCallback(callback: (progress: number, message?: string) => void): void {
    this.progressCallback = callback;
  }
}

// ---------------------------------------------------------------------------
// VoltSDKImpl — The SDK Factory
// ---------------------------------------------------------------------------

/**
 * The concrete VoltSDK implementation.
 * Each plugin receives its own instance with permission-checked sub-APIs.
 */
export class VoltSDKImpl implements VoltSDK {
  readonly logger: PluginLogger;
  readonly events: PluginEventAPI;
  readonly memory: PluginMemoryAPI;
  readonly config: PluginConfigAPI;
  readonly storage: PluginStorageAPI;
  readonly tasks: PluginTaskAPI;

  /** Expose the event API impl for cleanup. */
  readonly _eventAPI: PluginEventAPIImpl;

  /** Expose the task API impl for sandbox integration. */
  readonly _taskAPI: PluginTaskAPIImpl;

  constructor(options: {
    pluginId: string;
    permissions: PluginPermission[];
    eventBus: EventBus;
    config: Record<string, unknown>;
    resourceLimits: PluginResourceLimits;
  }) {
    this.logger = new PluginLoggerImpl(options.pluginId);
    this._eventAPI = new PluginEventAPIImpl(
      options.pluginId,
      options.permissions,
      options.eventBus,
    );
    this.events = this._eventAPI;
    this.memory = new PluginMemoryAPIImpl(options.pluginId, options.permissions);
    this.config = new PluginConfigAPIImpl(options.config);
    this.storage = new PluginStorageAPIImpl(options.pluginId);
    this._taskAPI = new PluginTaskAPIImpl(options.pluginId, options.resourceLimits);
    this.tasks = this._taskAPI;
  }
}

// ---------------------------------------------------------------------------
// Shared store access (for testing)
// ---------------------------------------------------------------------------

/** Clear all in-memory stores. Used in tests. */
export function clearSDKStores(): void {
  memoryStore.clear();
  storageStore.clear();
  cancellationFlags.clear();
}

/** Set the cancellation flag for a plugin. Used for task cancellation. */
export function setCancellationFlag(pluginId: string, cancelled: boolean): void {
  cancellationFlags.set(pluginId, cancelled);
}
