/**
 * @module @volt-os/config
 * Configuration utilities for VOLT OS.
 */

export interface VoltConfig {
  [key: string]: unknown;
}

export function loadConfig(_overrides?: VoltConfig): VoltConfig {
  return {};
}
