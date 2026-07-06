/**
 * @module retry
 * Manages retry logic with exponential backoff for failed tasks.
 */

import type { TaskState } from './types.js';

/**
 * Configuration for the retry policy.
 * @property maxRetries - Maximum number of retry attempts.
 * @property delayMs - Initial delay between retries in milliseconds.
 * @property backoffMultiplier - Multiplier applied to delay after each retry.
 * @property maxDelayMs - Maximum delay between retries in milliseconds.
 */
export interface RetryPolicyConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
}

const DEFAULT_CONFIG: RetryPolicyConfig = {
  maxRetries: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
};

/**
 * Manages retry logic for failed tasks with configurable exponential backoff.
 */
export class RetryPolicyManager {
  private readonly config: RetryPolicyConfig;

  /**
   * Create a retry policy.
   * @param options - Partial configuration overrides.
   */
  constructor(options?: Partial<RetryPolicyConfig>) {
    this.config = {
      maxRetries: options?.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      delayMs: options?.delayMs ?? DEFAULT_CONFIG.delayMs,
      backoffMultiplier: options?.backoffMultiplier ?? DEFAULT_CONFIG.backoffMultiplier,
      maxDelayMs: options?.maxDelayMs ?? DEFAULT_CONFIG.maxDelayMs,
    };
  }

  /**
   * Check whether a failed task should be retried.
   * @param taskState - Current state of the failed task.
   * @returns `true` if the task has retries remaining.
   */
  shouldRetry(taskState: TaskState): boolean {
    return taskState.retryCount < this.config.maxRetries;
  }

  /**
   * Calculate the delay before the next retry attempt.
   * Uses exponential backoff: delay = initialDelay * (backoffMultiplier ^ retryCount).
   * @param taskState - Current state of the task.
   * @returns Delay in milliseconds.
   */
  getRetryDelay(taskState: TaskState): number {
    const delay = this.config.delayMs * Math.pow(this.config.backoffMultiplier, taskState.retryCount);
    return Math.min(delay, this.config.maxDelayMs);
  }

  /**
   * Execute an async function with retry logic.
   * Automatically retries on failure up to `maxRetries` times with exponential backoff.
   *
   * @typeParam T - Return type of the function.
   * @param fn - Async function to execute.
   * @param _taskId - ID of the task (reserved for logging/context).
   * @returns The result of the function.
   * @throws The last error if all retries are exhausted.
   */
  async executeWithRetry<T>(fn: () => Promise<T>, _taskId: string): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt >= this.config.maxRetries) {
          break;
        }

        const delay = this.config.delayMs * Math.pow(this.config.backoffMultiplier, attempt);
        const cappedDelay = Math.min(delay, this.config.maxDelayMs);

        await this.sleep(cappedDelay);
        attempt++;
      }
    }

    throw lastError;
  }

  /**
   * Get the current configuration.
   * @returns A copy of the retry policy config.
   */
  getConfig(): RetryPolicyConfig {
    return { ...this.config };
  }

  /**
   * Sleep for a given duration.
   * @param ms - Duration in milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
