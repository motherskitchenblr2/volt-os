/**
 * @module registry
 * Plugin registry — central store of registered plugin instances.
 * Provides query capabilities by id and category.
 */

import type {
  PluginInstance,
  PluginCategory,
} from './types.js';

/**
 * Central registry of all known plugin instances.
 * The manager updates the registry as plugins move through their lifecycle.
 */
export class PluginRegistry {
  /** Plugins indexed by their unique id. */
  private readonly plugins = new Map<string, PluginInstance>();

  /**
   * Register a plugin instance.
   * @param instance - The plugin instance to register.
   * @throws If a plugin with the same id is already registered.
   */
  register(instance: PluginInstance): void {
    if (this.plugins.has(instance.id)) {
      throw new Error(`Plugin "${instance.id}" is already registered`);
    }
    this.plugins.set(instance.id, instance);
  }

  /**
   * Unregister a plugin by id.
   * @param pluginId - The id of the plugin to unregister.
   * @returns The removed instance, or undefined if not found.
   */
  unregister(pluginId: string): PluginInstance | undefined {
    const instance = this.plugins.get(pluginId);
    this.plugins.delete(pluginId);
    return instance;
  }

  /**
   * Get a registered plugin by id.
   * @param pluginId - The plugin id.
   * @returns The plugin instance, or undefined if not found.
   */
  get(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * List all registered plugins.
   * @returns Array of all plugin instances.
   */
  list(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all plugins belonging to a specific category.
   * @param category - The category to filter by.
   * @returns Array of matching plugin instances.
   */
  getByCategory(category: PluginCategory): PluginInstance[] {
    return this.list().filter((p) => p.manifest.category === category);
  }

  /**
   * Check whether a plugin is registered.
   * @param pluginId - The plugin id.
   * @returns true if the plugin is in the registry.
   */
  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Get the total number of registered plugins.
   */
  get size(): number {
    return this.plugins.size;
  }

  /**
   * Clear all entries (used in tests).
   */
  clear(): void {
    this.plugins.clear();
  }
}
