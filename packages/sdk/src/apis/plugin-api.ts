/**
 * @module plugin-api
 * Plugin API implementation for the VOLT OS Developer SDK.
 *
 * Pure delegation to the PluginManager subsystem — no business logic.
 */

import type {
  PluginManifest as _PluginManifest,
  PluginInstance as _PluginInstance,
} from '@volt-os/plugin-runtime';
import type { PluginAPI } from '../types.js';

/**
 * Minimal interface for the parts of PluginManager the SDK needs.
 */
interface PluginManagerLike {
  install(manifest: _PluginManifest, source?: Buffer): Promise<_PluginInstance>;
  activate(pluginId: string): Promise<void>;
  deactivate(pluginId: string): Promise<void>;
  uninstall(pluginId: string): Promise<void>;
  listPlugins(): _PluginInstance[];
}

/**
 * PluginAPI implementation that delegates to the PluginManager.
 *
 * @example
 * ```ts
 * const api = new PluginAPIImpl(pluginManager);
 * await api.install(myPluginManifest);
 * await api.activate('my-plugin');
 * const plugins = api.list();
 * ```
 */
export class PluginAPIImpl implements PluginAPI {
  /**
   * Create a new PluginAPIImpl.
   * @param manager - The PluginManager subsystem.
   */
  constructor(private readonly manager: PluginManagerLike) {}

  /**
   * Install a plugin from its manifest.
   * @param manifest - The plugin manifest.
   * @throws If verification fails.
   */
  async install(manifest: _PluginManifest): Promise<void> {
    // PluginManager.install expects (manifest, source) but the SDK
    // facade accepts just the manifest for convenience. The actual
    // source loading is handled by the PluginManager internally.
    const emptySource = Buffer.alloc(0);
    await this.manager.install(manifest, emptySource);
  }

  /**
   * Activate a plugin, making it operational.
   * @param pluginId - Plugin ID to activate.
   * @throws If the plugin is not found.
   */
  async activate(pluginId: string): Promise<void> {
    await this.manager.activate(pluginId);
  }

  /**
   * Deactivate a plugin, stopping its execution.
   * @param pluginId - Plugin ID to deactivate.
   * @throws If the plugin is not found.
   */
  async deactivate(pluginId: string): Promise<void> {
    await this.manager.deactivate(pluginId);
  }

  /**
   * Uninstall a plugin, removing it from the system.
   * @param pluginId - Plugin ID to uninstall.
   * @throws If the plugin is not found.
   */
  async uninstall(pluginId: string): Promise<void> {
    await this.manager.uninstall(pluginId);
  }

  /**
   * List all registered plugins with summary info.
   * @returns Array of plugin summaries with id, state, and category.
   */
  list(): Array<{ id: string; state: string; category: string }> {
    return this.manager.listPlugins().map((plugin: _PluginInstance) => ({
      id: plugin.id,
      state: plugin.state,
      category: plugin.manifest.category,
    }));
  }
}
