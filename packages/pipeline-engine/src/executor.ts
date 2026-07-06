/**
 * @module executor
 * Executes pipelines layer by layer with parallel task execution within each layer.
 * Handles task timeouts, retries, and approval gates.
 */

import type {
  EventBus,
  PipelineInstance,
  PipelineStatus,
  TaskHandler,
  TaskState,
} from './types.js';
import { PipelineEvents } from './types.js';
import { ApprovalManager } from './approval.js';
import { TaskScheduler } from './scheduler.js';
import { RetryPolicyManager, type RetryPolicyConfig } from './retry.js';

/**
 * Callback to retrieve the current pipeline status (used to check for cancellation).
 */
export type StatusProvider = (pipelineId: string) => PipelineStatus | undefined;

/**
 * Callback to retrieve task definitions for a pipeline.
 */
export type DefinitionsProvider = (definitionId: string) => import('./types.js').TaskDefinition[];

/**
 * Options for constructing a PipelineExecutor.
 */
export interface PipelineExecutorOptions {
  eventBus: EventBus;
  taskHandler: TaskHandler;
  retryPolicy?: Partial<RetryPolicyConfig>;
  approvalManager?: ApprovalManager;
  statusProvider?: StatusProvider;
  definitionsProvider?: DefinitionsProvider;
}

/**
 * Executes pipelines layer by layer, respecting dependencies and parallelism.
 * Handles task execution, timeouts, retries, and approval gates.
 */
export class PipelineExecutor {
  private readonly eventBus: EventBus;
  private readonly taskHandler: TaskHandler;
  private readonly retryManager: RetryPolicyManager;
  private readonly scheduler: TaskScheduler;
  private readonly statusProvider?: StatusProvider;
  private readonly definitionsProvider?: DefinitionsProvider;

  constructor(options: PipelineExecutorOptions) {
    this.eventBus = options.eventBus;
    this.taskHandler = options.taskHandler;
    this.retryManager = new RetryPolicyManager(options.retryPolicy);
    this.scheduler = new TaskScheduler();
    this.statusProvider = options.statusProvider;
    this.definitionsProvider = options.definitionsProvider;
  }

  /**
   * Execute a pipeline to completion.
   * Processes tasks layer by layer, with parallel execution within each layer.
   *
   * @param pipeline - The pipeline instance to execute.
   * @returns The mutated pipeline instance with final status.
   */
  async execute(pipeline: PipelineInstance): Promise<PipelineInstance> {
    const definitions = this.definitionsProvider?.(pipeline.definitionId) ?? [];
    const batches = this.scheduler.getExecutionBatches(pipeline, definitions);

    for (const layer of batches) {
      // Check if pipeline was cancelled
      if (this.isCancelled(pipeline)) {
        break;
      }

      await this.executeLayer(pipeline, layer);

      // Check if any task in the layer failed
      if (this.hasFailedTasks(pipeline, layer)) {
        break;
      }

      // Check if pipeline is waiting for approval
      if (pipeline.status === 'waiting') {
        break;
      }
    }

    return pipeline;
  }

  /**
   * Execute a single layer of tasks in parallel.
   * @param pipeline - The pipeline instance.
   * @param layer - Array of task IDs in this layer.
   */
  async executeLayer(pipeline: PipelineInstance, layer: string[]): Promise<void> {
    const promises = layer.map((taskId) => this.executeTask(pipeline, taskId));
    await Promise.allSettled(promises);
  }

  /**
   * Execute a single task with retry logic, timeout handling, and approval gates.
   * @param pipeline - The pipeline instance.
   * @param taskId - ID of the task to execute.
   * @returns The final task state.
   */
  async executeTask(pipeline: PipelineInstance, taskId: string): Promise<TaskState> {
    const state = pipeline.taskStates.get(taskId);
    if (!state) {
      throw new Error(`Task "${taskId}" not found in pipeline "${pipeline.id}"`);
    }

    // Check if already completed or not in pending/ready state
    if (state.status !== 'pending' && state.status !== 'ready') {
      return state;
    }

    // Mark as running
    state.status = 'running';
    state.startedAt = Date.now();
    pipeline.updatedAt = Date.now();

    this.eventBus.emit(PipelineEvents.TASK_STARTED, {
      pipelineId: pipeline.id,
      taskId,
      timestamp: state.startedAt,
    });

    try {
      const result = await this.taskHandler.execute(taskId, pipeline.context);

      // Success
      state.status = 'completed';
      state.completedAt = Date.now();
      state.result = result;

      this.eventBus.emit(PipelineEvents.TASK_COMPLETED, {
        pipelineId: pipeline.id,
        taskId,
        durationMs: state.completedAt - (state.startedAt ?? state.completedAt),
        timestamp: state.completedAt,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      state.error = errorMsg;

      // Check for retry
      if (this.retryManager.shouldRetry(state)) {
        state.retryCount++;
        state.status = 'pending';
        state.startedAt = undefined;

        this.eventBus.emit(PipelineEvents.TASK_RETRYING, {
          pipelineId: pipeline.id,
          taskId,
          retryCount: state.retryCount,
          delayMs: this.retryManager.getRetryDelay(state),
          timestamp: Date.now(),
        });

        // Wait for retry delay
        const delay = this.retryManager.getRetryDelay(state);
        await this.sleep(delay);

        // Recursively retry
        return this.executeTask(pipeline, taskId);
      }

      // No more retries
      state.status = 'failed';
      state.completedAt = Date.now();

      this.eventBus.emit(PipelineEvents.TASK_FAILED, {
        pipelineId: pipeline.id,
        taskId,
        error: errorMsg,
        timestamp: state.completedAt,
      });
    }

    pipeline.updatedAt = Date.now();
    return state;
  }

  /**
   * Handle a task timeout.
   * @param pipeline - The pipeline instance.
   * @param taskId - The timed-out task ID.
   */
  async handleTimeout(pipeline: PipelineInstance, taskId: string): Promise<void> {
    const state = pipeline.taskStates.get(taskId);
    if (!state || state.status !== 'running') {
      return;
    }

    state.status = 'timed_out';
    state.completedAt = Date.now();
    state.error = 'Task execution timed out';

    this.eventBus.emit(PipelineEvents.TASK_TIMED_OUT, {
      pipelineId: pipeline.id,
      taskId,
      timestamp: state.completedAt,
    });

    pipeline.updatedAt = Date.now();
  }

  /**
   * Check if the pipeline is cancelled via the status provider.
   * @param pipeline - Pipeline to check.
   * @returns `true` if the pipeline status is 'cancelled'.
   */
  private isCancelled(pipeline: PipelineInstance): boolean {
    if (this.statusProvider) {
      const status = this.statusProvider(pipeline.id);
      return status === 'cancelled';
    }
    return pipeline.status === 'cancelled';
  }

  /**
   * Check if any task in the given layer has failed.
   * @param pipeline - The pipeline instance.
   * @param layer - Task IDs to check.
   * @returns `true` if any task failed.
   */
  private hasFailedTasks(pipeline: PipelineInstance, layer: string[]): boolean {
    for (const taskId of layer) {
      const state = pipeline.taskStates.get(taskId);
      if (state && (state.status === 'failed' || state.status === 'timed_out')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Sleep for a given duration.
   * @param ms - Duration in milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
