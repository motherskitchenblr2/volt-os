/**
 * @module metrics
 * Plugin metrics — tracks install, activate, deactivate, error, and resource
 * usage counters for each plugin.
 */

import type { PluginResourceUsage } from './types.js';

/**
 * Tracks operational metrics for all plugins.
 * Metrics are keyed by `pluginId:metricName`.
 */
export class PluginMetrics {
  /** Metric counters. */
  private readonly counters = new Map<string, number>();

  /**
   * Record a plugin installation.
   * @param pluginId - The plugin id.
   */
  recordInstall(pluginId: string): void {
    this.increment(`${pluginId}:installs`);
  }

  /**
   * Record a plugin activation with its duration.
   * @param pluginId - The plugin id.
   * @param durationMs - Activation duration in milliseconds.
   */
  recordActivate(pluginId: string, durationMs: number): void {
    this.increment(`${pluginId}:activations`);
    this.increment(`${pluginId}:activateDurationMs`, durationMs);
  }

  /**
   * Record a plugin deactivation.
   * @param pluginId - The plugin id.
   */
  recordDeactivate(pluginId: string): void {
    this.increment(`${pluginId}:deactivations`);
  }

  /**
   * Record a plugin error.
   * @param pluginId - The plugin id.
   * @param error - Error message.
   */
  recordError(pluginId: string, error: string): void {
    this.increment(`${pluginId}:errors`);
    // Store last error message
    this.counters.set(`${pluginId}:lastError`, 0); // placeholder
    this.counters.set(`${pluginId}:lastErrorMsg_${error.length}`, 0);
  }

  /**
   * Record resource usage for a plugin.
   * @param pluginId - The plugin id.
   * @param usage - Current resource usage snapshot.
   */
  recordResourceUsage(pluginId: string, usage: PluginResourceUsage): void {
    this.counters.set(`${pluginId}:memoryMB`, usage.memoryMB);
    this.counters.set(`${pluginId}:cpuTimeMs`, usage.cpuTimeMs);
    this.counters.set(`${pluginId}:tokensUsed`, usage.tokensUsed);
    this.counters.set(`${pluginId}:tasksExecuted`, usage.tasksExecuted);
  }

  /**
   * Get all metrics as a flat key-value map.
   * @returns Snapshot of all metric counters.
   */
  getMetrics(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.counters) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Get a specific metric value.
   * @param key - The metric key.
   * @returns The counter value, or 0 if not set.
   */
  getMetric(key: string): number {
    return this.counters.get(key) ?? 0;
  }

  /**
   * Reset all metric counters.
   */
  reset(): void {
    this.counters.clear();
  }

  /**
   * Increment a counter by a given amount.
   */
  private increment(key: string, amount: number = 1): void {
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + amount);
  }
}
