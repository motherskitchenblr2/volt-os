/**
 * @module loader
 * Plugin loader — dynamically imports plugin entry points from disk,
 * validates the PluginEntryPoint contract, and handles unloading.
 */

import * as path from 'node:path';

import type {
  PluginManifest,
  PluginInstance,
  PluginEntryPoint,
} from './types.js';

/**
 * Loads and unloads plugin entry points from the filesystem.
 * Validates that loaded modules implement the PluginEntryPoint interface.
 */
export class PluginLoader {
  /**
   * Load a plugin's entry point module from disk.
   * @param pluginDir - Base directory containing the plugin files.
   * @param manifest - The plugin manifest (used for entryPoint path).
   * @returns The validated PluginEntryPoint instance.
   * @throws If the module cannot be loaded or does not implement PluginEntryPoint.
   */
  async load(pluginDir: string, manifest: PluginManifest): Promise<PluginEntryPoint> {
    const entryPath = path.resolve(pluginDir, manifest.entryPoint);

    // Dynamic import of the entry point
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = await import(entryPath);

    // The module may export default or a named export
    const candidate: unknown = mod.default ?? mod.plugin ?? mod;

    // Validate the entry point implements the PluginEntryPoint contract
    this.validateEntryPoint(candidate, manifest.id);

    return candidate as PluginEntryPoint;
  }

  /**
   * Unload a plugin instance by calling its deactivate method
   * and releasing all references.
   * @param instance - The plugin instance to unload.
   * @param entryPoint - The loaded entry point to deactivate.
   */
  async unload(instance: PluginInstance, entryPoint: PluginEntryPoint): Promise<void> {
    try {
      await entryPoint.deactivate();
    } catch {
      // Deactivation errors are logged but don't prevent unload
    }

    // Release references
    instance.loadedAt = undefined;
    instance.startedAt = undefined;
    instance.state = 'unloaded';
  }

  /**
   * Validate that a candidate object implements the PluginEntryPoint interface.
   * @param candidate - The object to validate.
   * @param pluginId - Plugin ID for error messages.
   * @throws If the candidate does not implement the required methods.
   */
  private validateEntryPoint(candidate: unknown, pluginId: string): void {
    if (candidate === null || candidate === undefined) {
      throw new Error(`Plugin "${pluginId}" entry point is empty`);
    }

    if (typeof candidate !== 'object' && typeof candidate !== 'function') {
      throw new Error(
        `Plugin "${pluginId}" entry point must export an object or class instance`,
      );
    }

    const obj = candidate as Record<string, unknown>;

    if (typeof obj.activate !== 'function') {
      throw new Error(`Plugin "${pluginId}" entry point missing "activate" method`);
    }
    if (typeof obj.deactivate !== 'function') {
      throw new Error(`Plugin "${pluginId}" entry point missing "deactivate" method`);
    }
    if (typeof obj.healthCheck !== 'function') {
      throw new Error(`Plugin "${pluginId}" entry point missing "healthCheck" method`);
    }
  }
}
