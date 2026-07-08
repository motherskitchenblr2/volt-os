/**
 * @module config-api
 * Config API implementation for the VOLT OS Developer SDK.
 *
 * Provides read-only access to VOLT OS configuration.
 */

import type { ConfigAPI } from '../types.js';

/**
 * ConfigAPI implementation backed by an in-memory configuration store.
 *
 * @example
 * ```ts
 * const api = new ConfigAPIImpl({ 'ui.theme': 'dark', 'debug': true });
 * const theme = api.get('ui.theme'); // 'dark'
 * const all = api.getAll(); // { 'ui.theme': 'dark', 'debug': true }
 * ```
 */
export class ConfigAPIImpl implements ConfigAPI {
  private readonly store: Record<string, unknown>;

  /**
   * Create a new ConfigAPIImpl.
   * @param config - Initial configuration values.
   */
  constructor(config: Record<string, unknown> = {}) {
    this.store = { ...config };
  }

  /**
   * Get a single config value by key.
   * Supports dot-notation for nested values (e.g. 'ui.theme').
   * @param key - Config key.
   * @returns The config value, or undefined if not found.
   */
  get(key: string): unknown {
    const parts = key.split('.');
    let current: unknown = this.store;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Get all config values.
   * @returns A copy of the complete config record.
   */
  getAll(): Record<string, unknown> {
    return { ...this.store };
  }

  /**
   * Update a config value (internal use only, not exposed in SDK interface).
   * @param key - Config key.
   * @param value - Config value.
   */
  set(key: string, value: unknown): void {
    this.store[key] = value;
  }
}
