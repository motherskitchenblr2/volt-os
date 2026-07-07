/**
 * @module manager
 * PluginManager — the top-level orchestrator for the plugin lifecycle.
 * Coordinates install, verify, register, activate, deactivate, uninstall,
 * update, rollback, and health checks across all plugins.
 */

import type {
  PluginManifest,
  PluginInstance,
  PluginEntryPoint,
  PluginResourceLimits,
  HealthCheckResult,
  EventBus,
} from './types.js';
import { PluginEvents } from './types.js';
import { VoltSDKImpl } from './sdk/volt-sdk.js';
import { PluginVerifier } from './verifier.js';
import { PluginLoader } from './loader.js';
import { PluginSandbox } from './sandbox.js';
import { PluginRegistry } from './registry.js';
import { DependencyResolver } from './dependency.js';
import { PluginMetrics } from './metrics.js';

/** Default resource limits applied to plugins unless overridden. */
const DEFAULT_LIMITS: PluginResourceLimits = {
  maxMemoryMB: 128,
  maxCpuTimeMs: 30_000,
  maxTokensPerTask: 10_000,
  maxConcurrentTasks: 4,
  executionTimeoutMs: 60_000,
};

/** Per-plugin backup state for rollback. */
interface PluginBackup {
  manifest: PluginManifest;
  source: Buffer;
}

/**
 * Options for constructing a PluginManager.
 */
export interface PluginManagerOptions {
  /** The event bus for lifecycle events. */
  eventBus: EventBus;
  /** Base directory where plugins are installed. */
  pluginDir: string;
  /** Optional resource limits override. */
  resourceLimits?: Partial<PluginResourceLimits>;
  /** Optional VOLT OS version override (for testing). */
  voltVersion?: string;
}

/**
 * Manages the full lifecycle of VOLT OS plugins.
 * Plugins are ONLY accessed through the VoltSDK — the manager enforces
 * all permission boundaries.
 */
export class PluginManager {
  private readonly eventBus: EventBus;
  private readonly pluginDir: string;
  private readonly resourceLimits: PluginResourceLimits;
  private readonly verifier: PluginVerifier;
  private readonly loader: PluginLoader;
  private readonly sandbox: PluginSandbox;
  private readonly registry: PluginRegistry;
  private readonly metrics: PluginMetrics;
  private readonly dependencyResolver: DependencyResolver;

  /** Loaded entry points indexed by plugin id. */
  private readonly entryPoints = new Map<string, PluginEntryPoint>();

  /** SDK instances indexed by plugin id. */
  private readonly sdkInstances = new Map<string, VoltSDKImpl>();

  /** Backup state for rollback, indexed by plugin id. */
  private readonly backups = new Map<string, PluginBackup>();

  constructor(options: PluginManagerOptions) {
    this.eventBus = options.eventBus;
    this.pluginDir = options.pluginDir;
    this.resourceLimits = {
      ...DEFAULT_LIMITS,
      ...options.resourceLimits,
    };
    this.verifier = new PluginVerifier(
      this.pluginDir,
      options.voltVersion,
    );
    this.loader = new PluginLoader();
    this.sandbox = new PluginSandbox();
    this.registry = new PluginRegistry();
    this.metrics = new PluginMetrics();
    this.dependencyResolver = new DependencyResolver();
  }

  // -------------------------------------------------------------------------
  // Install
  // -------------------------------------------------------------------------

  /**
   * Install a plugin: verify manifest, store source, create instance.
   * @param manifest - The plugin manifest.
   * @param source - The plugin source code as a buffer.
   * @returns The created plugin instance.
   */
  async install(manifest: PluginManifest, source: Buffer): Promise<PluginInstance> {
    // 1. Verify the plugin
    const verification = await this.verifier.verify(manifest);
    if (!verification.valid) {
      throw new Error(
        `Plugin verification failed: ${verification.errors.join('; ')}`,
      );
    }

    // 2. Create instance
    const instance = this.createInstance(manifest);

    // 3. Store backup for potential rollback
    this.backups.set(manifest.id, { manifest, source });

    // 4. Register
    this.registry.register(instance);
    instance.state = 'registered';

    // 5. Record metrics
    this.metrics.recordInstall(manifest.id);

    // 6. Emit lifecycle event
    this.eventBus.emit(PluginEvents.PLUGIN_INSTALLED, { pluginId: manifest.id });

    return instance;
  }

  // -------------------------------------------------------------------------
  // Uninstall
  // -------------------------------------------------------------------------

  /**
   * Uninstall a plugin: deactivate if active, unregister, remove.
   * @param pluginId - The plugin id to uninstall.
   */
  async uninstall(pluginId: string): Promise<void> {
    const instance = this.registry.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin "${pluginId}" not found`);
    }

    // If active, deactivate first
    if (instance.state === 'healthy' || instance.state === 'loaded' || instance.state === 'initialized') {
      await this.deactivate(pluginId);
    }

    // Clean up SDK
    const sdk = this.sdkInstances.get(pluginId);
    if (sdk) {
      await sdk._eventAPI.removeAllSubscriptions();
      this.sdkInstances.delete(pluginId);
    }

    // Clean up entry point reference
    this.entryPoints.delete(pluginId);

    // Remove backup
    this.backups.delete(pluginId);

    // Unregister
    this.registry.unregister(pluginId);

    // Update state
    instance.state = 'removed';

    // Emit lifecycle event
    this.eventBus.emit(PluginEvents.PLUGIN_REMOVED, { pluginId });
  }

  // -------------------------------------------------------------------------
  // Activate
  // -------------------------------------------------------------------------

  /**
   * Activate a plugin: load entry point, create SDK, call activate.
   * @param pluginId - The plugin id to activate.
   */
  async activate(pluginId: string): Promise<void> {
    const instance = this.registry.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin "${pluginId}" not found`);
    }

    const startTime = Date.now();

    // 1. Load the entry point
    const entryPoint = await this.loader.load(this.pluginDir, instance.manifest);
    this.entryPoints.set(pluginId, entryPoint);

    // 2. Create the SDK
    const sdk = new VoltSDKImpl({
      pluginId,
      permissions: instance.manifest.permissions,
      eventBus: this.eventBus,
      config: instance.manifest.config ?? {},
      resourceLimits: this.resourceLimits,
    });
    this.sdkInstances.set(pluginId, sdk);

    // 3. Start sandbox monitoring
    this.sandbox.startMonitoring(instance);

    // 4. Execute activate within sandbox
    instance.state = 'loaded';
    this.eventBus.emit(PluginEvents.PLUGIN_LOADED, { pluginId });

    await this.sandbox.execute(
      instance,
      () => entryPoint.activate(sdk),
      this.resourceLimits,
    );

    instance.state = 'initialized';
    instance.loadedAt = new Date();
    instance.startedAt = new Date();

    // 5. Run health check
    try {
      const health = await this.sandbox.execute(
        instance,
        () => entryPoint.healthCheck(),
        this.resourceLimits,
      );
      instance.state = health.status === 'healthy' ? 'healthy' : 'error';
      if (health.status === 'unhealthy') {
        instance.error = health.details ?? 'Health check returned unhealthy';
        this.eventBus.emit(PluginEvents.PLUGIN_UNHEALTHY, { pluginId, details: health.details });
      } else {
        this.eventBus.emit(PluginEvents.PLUGIN_HEALTHY, { pluginId });
      }
    } catch {
      instance.state = 'error';
      instance.error = 'Health check failed';
    }

    // 6. Record metrics
    const duration = Date.now() - startTime;
    this.metrics.recordActivate(pluginId, duration);

    // 7. Emit activation event
    this.eventBus.emit(PluginEvents.PLUGIN_ACTIVATED, { pluginId, durationMs: duration });
  }

  // -------------------------------------------------------------------------
  // Deactivate
  // -------------------------------------------------------------------------

  /**
   * Deactivate a plugin: call deactivate, stop monitoring, clean up.
   * @param pluginId - The plugin id to deactivate.
   */
  async deactivate(pluginId: string): Promise<void> {
    const instance = this.registry.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin "${pluginId}" not found`);
    }

    // 1. Call deactivate on entry point
    const entryPoint = this.entryPoints.get(pluginId);
    if (entryPoint) {
      try {
        await this.sandbox.execute(
          instance,
          () => entryPoint.deactivate(),
          this.resourceLimits,
        );
      } catch {
        // Deactivation errors are logged but don't prevent cleanup
      }
    }

    // 2. Remove event subscriptions
    const sdk = this.sdkInstances.get(pluginId);
    if (sdk) {
      await sdk._eventAPI.removeAllSubscriptions();
    }

    // 3. Stop sandbox monitoring
    this.sandbox.stopMonitoring(instance);

    // 4. Update state
    instance.state = 'stopped';
    instance.loadedAt = undefined;
    instance.startedAt = undefined;

    // 5. Clean up references (but keep in registry for re-activation)
    this.entryPoints.delete(pluginId);
    this.sdkInstances.delete(pluginId);

    // 6. Record metrics
    this.metrics.recordDeactivate(pluginId);

    // 7. Emit lifecycle event
    this.eventBus.emit(PluginEvents.PLUGIN_DEACTIVATED, { pluginId });
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  /**
   * Update a plugin to a new version.
   * Backs up the current state, deactivates, and installs the new version.
   * @param pluginId - The plugin id to update.
   * @param newManifest - The new plugin manifest.
   * @param source - The new plugin source.
   */
  async update(pluginId: string, newManifest: PluginManifest, source: Buffer): Promise<void> {
    const instance = this.registry.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin "${pluginId}" not found`);
    }

    // Save backup of current state
    const currentBackup = this.backups.get(pluginId);
    if (!currentBackup) {
      // Create backup from current state
      this.backups.set(pluginId, {
        manifest: instance.manifest,
        source: Buffer.from(''), // placeholder — in production, read from disk
      });
    }

    // Deactivate current version
    if (instance.state === 'healthy' || instance.state === 'loaded' || instance.state === 'initialized') {
      await this.deactivate(pluginId);
    }

    // Unregister old
    this.registry.unregister(pluginId);

    // Install new version
    await this.install(newManifest, source);

    // Emit update event
    this.eventBus.emit(PluginEvents.PLUGIN_UPDATED, {
      pluginId,
      oldVersion: instance.manifest.version,
      newVersion: newManifest.version,
    });
  }

  // -------------------------------------------------------------------------
  // Rollback
  // -------------------------------------------------------------------------

  /**
   * Rollback a plugin to its previous version.
   * @param pluginId - The plugin id to rollback.
   */
  async rollback(pluginId: string): Promise<void> {
    const backup = this.backups.get(pluginId);
    if (!backup) {
      throw new Error(`No backup available for plugin "${pluginId}"`);
    }

    // Uninstall current
    const current = this.registry.get(pluginId);
    if (current) {
      await this.uninstall(pluginId);
    }

    // Re-install from backup
    await this.install(backup.manifest, backup.source);

    // Emit rollback event
    this.eventBus.emit(PluginEvents.PLUGIN_ROLLED_BACK, {
      pluginId,
      version: backup.manifest.version,
    });
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /**
   * Get a plugin instance by id.
   * @param pluginId - The plugin id.
   * @returns The plugin instance, or undefined.
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.registry.get(pluginId);
  }

  /**
   * List all registered plugins.
   * @returns Array of plugin instances.
   */
  listPlugins(): PluginInstance[] {
    return this.registry.list();
  }

  // -------------------------------------------------------------------------
  // Health Check
  // -------------------------------------------------------------------------

  /**
   * Run health checks on all active plugins.
   * @returns Aggregate health status.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const plugins: Array<{ id: string; status: string }> = [];
    let hasUnhealthy = false;
    let hasHealthy = false;

    for (const instance of this.registry.list()) {
      if (instance.state === 'healthy' || instance.state === 'initialized') {
        const entryPoint = this.entryPoints.get(instance.id);
        if (entryPoint) {
          try {
            const result = await this.sandbox.execute(
              instance,
              () => entryPoint.healthCheck(),
              this.resourceLimits,
            );
            const status = result.status;
            plugins.push({ id: instance.id, status });
            if (status === 'healthy') {
              hasHealthy = true;
            } else {
              hasUnhealthy = true;
            }
            instance.state = status === 'healthy' ? 'healthy' : 'error';
          } catch {
            plugins.push({ id: instance.id, status: 'unhealthy' });
            hasUnhealthy = true;
            instance.state = 'error';
          }
        } else {
          plugins.push({ id: instance.id, status: 'no_entry_point' });
          hasUnhealthy = true;
        }
      } else {
        plugins.push({ id: instance.id, status: instance.state });
        if (instance.state === 'error') {
          hasUnhealthy = true;
        }
      }
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (hasUnhealthy && hasHealthy) {
      status = 'degraded';
    } else if (hasUnhealthy && !hasHealthy) {
      status = 'unhealthy';
    }

    return { status, plugins };
  }

  // -------------------------------------------------------------------------
  // Dependency Resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve the dependency graph for all registered plugins.
   * @returns Dependency resolution result.
   */
  resolveDependencies(): ReturnType<DependencyResolver['resolve']> {
    const manifests = this.registry.list().map((i) => i.manifest);
    return this.dependencyResolver.resolve(manifests);
  }

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  /**
   * Get all plugin metrics.
   */
  getMetrics(): PluginMetrics {
    return this.metrics;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Create a new PluginInstance from a manifest.
   */
  private createInstance(manifest: PluginManifest): PluginInstance {
    return {
      id: manifest.id,
      manifest,
      state: 'installed',
      resourceUsage: {
        memoryMB: 0,
        cpuTimeMs: 0,
        tokensUsed: 0,
        tasksExecuted: 0,
      },
    };
  }
}
