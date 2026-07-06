/**
 * @module metrics
 * Tracks operational metrics for pipelines and tasks.
 * Provides counter-based metrics for monitoring and observability.
 */

/**
 * Tracks operational metrics for the pipeline engine.
 * All metrics are simple counters for pipeline and task lifecycle events.
 */
export class PipelineMetrics {
  /** Map of metric name to current value. */
  private readonly counters: Map<string, number> = new Map();

  /**
   * Record a pipeline creation event.
   */
  recordPipelineCreated(): void {
    this.increment('pipelines.created');
  }

  /**
   * Record a pipeline completion event.
   * @param durationMs - Total execution duration in milliseconds.
   */
  recordPipelineCompleted(durationMs: number): void {
    this.increment('pipelines.completed');
    this.increment('pipelines.duration_ms', durationMs);
  }

  /**
   * Record a pipeline failure event.
   * @param error - Error description.
   */
  recordPipelineFailed(error: string): void {
    this.increment('pipelines.failed');
    this.increment(`pipelines.errors.${error}`);
  }

  /**
   * Record a task start event.
   * @param pipelineId - ID of the owning pipeline.
   * @param taskId - ID of the task.
   */
  recordTaskStarted(pipelineId: string, taskId: string): void {
    this.increment('tasks.started');
    this.increment(`tasks.${pipelineId}.${taskId}.started`);
  }

  /**
   * Record a task completion event.
   * @param pipelineId - ID of the owning pipeline.
   * @param taskId - ID of the task.
   * @param durationMs - Task execution duration in milliseconds.
   */
  recordTaskCompleted(pipelineId: string, taskId: string, durationMs: number): void {
    this.increment('tasks.completed');
    this.increment(`tasks.${pipelineId}.${taskId}.completed`);
    this.increment('tasks.duration_ms', durationMs);
  }

  /**
   * Record a task failure event.
   * @param pipelineId - ID of the owning pipeline.
   * @param taskId - ID of the task.
   * @param error - Error description.
   */
  recordTaskFailed(pipelineId: string, taskId: string, error: string): void {
    this.increment('tasks.failed');
    this.increment(`tasks.${pipelineId}.${taskId}.failed`);
    this.increment(`tasks.errors.${error}`);
  }

  /**
   * Record an approval request event.
   */
  recordApprovalRequested(): void {
    this.increment('approvals.requested');
  }

  /**
   * Record an approval granted event.
   */
  recordApprovalGranted(): void {
    this.increment('approvals.granted');
  }

  /**
   * Record an approval rejected event.
   */
  recordApprovalRejected(): void {
    this.increment('approvals.rejected');
  }

  /**
   * Record a task retry event.
   * @param pipelineId - ID of the owning pipeline.
   * @param taskId - ID of the task.
   */
  recordRetry(pipelineId: string, taskId: string): void {
    this.increment('retries.total');
    this.increment(`retries.${pipelineId}.${taskId}`);
  }

  /**
   * Record a rollback event.
   * @param pipelineId - ID of the pipeline being rolled back.
   */
  recordRollback(pipelineId: string): void {
    this.increment('rollbacks.total');
    this.increment(`rollbacks.${pipelineId}`);
  }

  /**
   * Get all metrics as a plain object.
   * @returns Record of metric names to their current values.
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
   * @param name - Metric name.
   * @returns The current value, or 0 if not set.
   */
  getMetric(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  /**
   * Reset all metrics to zero.
   */
  reset(): void {
    this.counters.clear();
  }

  /**
   * Increment a counter by a given amount.
   * @param name - Metric name.
   * @param amount - Amount to increment by (default: 1).
   */
  private increment(name: string, amount: number = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }
}
