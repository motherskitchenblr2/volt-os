/**
 * @module @volt-os/shared
 * Shared utilities for VOLT OS.
 */

/** Generate a unique ID. */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Simple logger factory. */
export function createLogger(_name: string): Console {
  return console;
}
