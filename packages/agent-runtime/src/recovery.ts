/**
 * @module recovery
 * Recovery manager — handles agent failures with exponential backoff
 * restart strategies and recovery status tracking.
 */

import type {
  EventBus,
} from '@volt-os/plugin-runtime';
import type {
  AgentInstance,
} from './types.js';
import { AgentEvents } from './types.js';

/** Maximum number of recovery attempts before giving up. */
const MAX_RECOVERY_ATTEMPTS = 3;

/** Base delay for exponential backoff in milliseconds. */
const BASE_BACKOFF_MS = 1000;

/**
 * Tracks recovery status for an agent.
 */
interface RecoveryEntry {
  /** Number of recovery attempts made. */
  attempts: number;
  /** Timestamp of the last recovery attempt. */
  lastAttempt: Date;
  /** Calculated timestamp for the next retry attempt. */
  nextAttempt?: Date;
  /** Whether recovery has been exhausted. */
  exhausted: boolean;
}

/**
 * Handles agent failure recovery with exponential backoff.
 * Coordinates with the agent manager to restart failed agents.
 */
export class RecoveryManager {
  /** Event bus for recovery events. */
  private readonly eventBus: EventBus;
  /** Recovery entries indexed by agent id. */
  private readonly recoveryEntries = new Map<string, RecoveryEntry>();
  /** Restart callback to invoke for restarting agents. */
  private restartCallback: ((agentId: string) => Promise<void>) | null = null;

  constructor(options: { eventBus: EventBus }) {
    this.eventBus = options.eventBus;
  }

  /**
   * Set the restart callback function that will be invoked to restart an agent.
   * @param callback - Async function that restarts an agent by id.
   */
  setRestartCallback(callback: (agentId: string) => Promise<void>): void {
    this.restartCallback = callback;
  }

  /**
   * Handle an agent failure.
   * Records the failure and attempts restart if within retry limits.
   * @param agentId - The id of the failed agent.
   * @param error - The error that caused the failure.
   */
  async handleFailure(agentId: string, error: Error): Promise<void> {
    const entry = this.recoveryEntries.get(agentId) ?? {
      attempts: 0,
      lastAttempt: new Date(),
      exhausted: false,
    };

    entry.attempts += 1;
    entry.lastAttempt = new Date();

    if (entry.attempts >= MAX_RECOVERY_ATTEMPTS) {
      entry.exhausted = true;
      entry.nextAttempt = undefined;
      this.recoveryEntries.set(agentId, entry);

      this.eventBus.emit(AgentEvents.AGENT_DISABLED, {
        agentId,
        reason: `Recovery exhausted after ${entry.attempts} attempts`,
        lastError: error.message,
      });
      return;
    }

    // Calculate exponential backoff
    const backoffMs = BASE_BACKOFF_MS * Math.pow(2, entry.attempts - 1);
    entry.nextAttempt = new Date(Date.now() + backoffMs);
    this.recoveryEntries.set(agentId, entry);

    this.eventBus.emit(AgentEvents.AGENT_RECOVERY_STARTED, {
      agentId,
      attempt: entry.attempts,
      maxAttempts: MAX_RECOVERY_ATTEMPTS,
      nextAttemptMs: backoffMs,
      error: error.message,
    });
  }

  /**
   * Attempt to restart an agent.
   * Invokes the registered restart callback and emits recovery events.
   * @param agentId - The id of the agent to restart.
   * @throws If no restart callback is registered or restart fails.
   */
  async restart(agentId: string): Promise<void> {
    if (!this.restartCallback) {
      throw new Error('No restart callback registered');
    }

    const entry = this.recoveryEntries.get(agentId);
    if (entry?.exhausted) {
      throw new Error(`Recovery exhausted for agent "${agentId}"`);
    }

    this.eventBus.emit(AgentEvents.AGENT_RESTARTING, {
      agentId,
    });

    try {
      await this.restartCallback(agentId);

      // Reset recovery state on successful restart
      this.recoveryEntries.delete(agentId);

      this.eventBus.emit(AgentEvents.AGENT_RECOVERY_COMPLETED, {
        agentId,
      });
    } catch (error) {
      await this.handleFailure(
        agentId,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Get recovery status for a specific agent.
   * @param agentId - The agent id.
   * @returns Recovery status information.
   */
  getRecoveryStatus(agentId: string): {
    attempts: number;
    lastAttempt: Date;
    nextAttempt?: Date;
  } {
    const entry = this.recoveryEntries.get(agentId);
    if (!entry) {
      return {
        attempts: 0,
        lastAttempt: new Date(0),
      };
    }

    return {
      attempts: entry.attempts,
      lastAttempt: entry.lastAttempt,
      nextAttempt: entry.nextAttempt,
    };
  }

  /**
   * Check if recovery has been exhausted for an agent.
   * @param agentId - The agent id.
   * @returns true if recovery is exhausted.
   */
  isExhausted(agentId: string): boolean {
    return this.recoveryEntries.get(agentId)?.exhausted ?? false;
  }

  /**
   * Reset recovery state for an agent.
   * @param agentId - The agent id.
   */
  reset(agentId: string): void {
    this.recoveryEntries.delete(agentId);
  }

  /**
   * Get the count of agents currently in recovery.
   * @returns Number of agents with active recovery entries.
   */
  count(): number {
    return this.recoveryEntries.size;
  }

  /**
   * Clear all recovery state (used in tests).
   */
  clear(): void {
    this.recoveryEntries.clear();
  }
}
