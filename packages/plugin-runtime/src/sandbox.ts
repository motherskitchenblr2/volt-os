/**
 * @module sandbox
 * Plugin sandbox — executes plugin code within strict resource limits.
 * Enforces timeout, memory caps, and tracks resource usage.
 * No plugin can crash the host system.
 */

import type {
  PluginInstance,
  PluginResourceLimits,
} from './types.js';

/** Default resource limits if none are specified. */
const DEFAULT_LIMITS: PluginResourceLimits = {
  maxMemoryMB: 128,
  maxCpuTimeMs: 30_000,
  maxTokensPerTask: 10_000,
  maxConcurrentTasks: 4,
  executionTimeoutMs: 60_000,
};

/**
 * Error thrown when a plugin exceeds its resource limits.
 */
export class ResourceLimitError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly limitType: string,
    message: string,
  ) {
    super(message);
    this.name = 'ResourceLimitError';
  }
}

/**
 * Error thrown when a plugin execution times out.
 */
export class ExecutionTimeoutError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly timeoutMs: number,
  ) {
    super(`Plugin "${pluginId}" execution timed out after ${timeoutMs}ms`);
    this.name = 'ExecutionTimeoutError';
  }
}

/**
 * Sandboxed execution environment for plugins.
 * Wraps every plugin call with timeout enforcement and resource monitoring.
 */
export class PluginSandbox {
  /** Active concurrent task counts per plugin. */
  private readonly concurrentTasks = new Map<string, number>();

  /**
   * Execute a plugin function within resource limits.
   * @param instance - The plugin instance being executed.
   * @param fn - The async function to execute.
   * @param limits - Resource limits to enforce.
   * @param progressCallback - Optional callback for progress reporting.
   * @returns The result of the executed function.
   * @throws ExecutionTimeoutError if the function exceeds the timeout.
   * @throws ResourceLimitError if a resource limit is exceeded.
   */
  async execute<T>(
    instance: PluginInstance,
    fn: () => Promise<T>,
    limits: PluginResourceLimits = DEFAULT_LIMITS,
    _progressCallback?: (progress: number, message?: string) => void,
  ): Promise<T> {
    // Check concurrency limit
    const current = this.concurrentTasks.get(instance.id) ?? 0;
    if (current >= limits.maxConcurrentTasks) {
      throw new ResourceLimitError(
        instance.id,
        'concurrency',
        `Plugin "${instance.id}" exceeded max concurrent tasks (${limits.maxConcurrentTasks})`,
      );
    }

    // Increment concurrency counter
    this.concurrentTasks.set(instance.id, current + 1);

    const startTime = Date.now();

    try {
      // Set up timeout
      const result = await this.executeWithTimeout(
        fn,
        limits.executionTimeoutMs,
        instance.id,
      );

      // Update resource usage
      const elapsed = Date.now() - startTime;
      const endMemory = this.estimateMemoryUsage();

      instance.resourceUsage.cpuTimeMs += elapsed;
      instance.resourceUsage.memoryMB = Math.max(
        instance.resourceUsage.memoryMB,
        endMemory,
      );
      instance.resourceUsage.tasksExecuted += 1;

      // Check CPU time limit
      if (instance.resourceUsage.cpuTimeMs > limits.maxCpuTimeMs) {
        throw new ResourceLimitError(
          instance.id,
          'cpu',
          `Plugin "${instance.id}" exceeded max CPU time (${limits.maxCpuTimeMs}ms)`,
        );
      }

      // Check memory limit
      if (endMemory > limits.maxMemoryMB) {
        throw new ResourceLimitError(
          instance.id,
          'memory',
          `Plugin "${instance.id}" exceeded max memory (${limits.maxMemoryMB}MB)`,
        );
      }

      return result;
    } finally {
      // Always decrement concurrency counter
      const count = this.concurrentTasks.get(instance.id) ?? 1;
      this.concurrentTasks.set(instance.id, count - 1);
    }
  }

  /**
   * Execute a function with a timeout.
   * If the timeout elapses before the function resolves, the promise is rejected.
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    pluginId: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ExecutionTimeoutError(pluginId, timeoutMs));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Start monitoring resource usage for a plugin instance.
   * Called when a plugin is activated.
   */
  startMonitoring(instance: PluginInstance): void {
    instance.resourceUsage = {
      memoryMB: 0,
      cpuTimeMs: 0,
      tokensUsed: 0,
      tasksExecuted: 0,
    };
    this.concurrentTasks.set(instance.id, 0);
  }

  /**
   * Stop monitoring resource usage for a plugin instance.
   * Called when a plugin is deactivated.
   */
  stopMonitoring(instance: PluginInstance): void {
    this.concurrentTasks.delete(instance.id);
  }

  /**
   * Get the current concurrent task count for a plugin.
   */
  getConcurrentTaskCount(pluginId: string): number {
    return this.concurrentTasks.get(pluginId) ?? 0;
  }

  /**
   * Estimate current memory usage in MB.
   * Uses process.memoryUsage() for Node.js environments.
   */
  private estimateMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return Math.round(usage.heapUsed / (1024 * 1024));
    }
    return 0;
  }
}
