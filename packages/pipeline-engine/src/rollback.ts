/**
 * @module rollback
 * Manages pipeline rollback to a previous consistent state.
 * Rolls back completed tasks in reverse topological order.
 */

import type { EventBus, PipelineInstance } from './types.js';
import { PipelineEvents } from './types.js';

/**
 * Manages rollback operations for pipeline instances.
 * Can roll back completed tasks to restore a pipeline to a previous state.
 */
export class RollbackManager {
  private readonly eventBus: EventBus;

  constructor(options: { eventBus: EventBus }) {
    this.eventBus = options.eventBus;
  }

  /**
   * Get rollback points — completed tasks that can serve as rollback targets.
   * Returns tasks in reverse completion order (most recently completed first).
   *
   * @param pipeline - The pipeline instance.
   * @returns Array of task IDs that are completed and can be rolled back to.
   */
  getRollbackPoints(pipeline: PipelineInstance): string[] {
    const points: string[] = [];

    for (const [taskId, state] of pipeline.taskStates) {
      if (state.status === 'completed' && state.completedAt !== undefined) {
        points.push(taskId);
      }
    }

    // Sort by completion time, most recent first
    points.sort((a, b) => {
      const stateA = pipeline.taskStates.get(a)!;
      const stateB = pipeline.taskStates.get(b)!;
      return (stateB.completedAt ?? 0) - (stateA.completedAt ?? 0);
    });

    return points;
  }

  /**
   * Rollback a pipeline to a specific task.
   * Resets the target task and all tasks that were started after it to pending status.
   *
   * @param pipeline - The pipeline instance to roll back.
   * @param toTaskId - The task to roll back to (exclusive — this task and later are reset).
   *                   If omitted, rolls back all completed tasks.
   * @returns The mutated pipeline instance.
   */
  async rollback(pipeline: PipelineInstance, toTaskId?: string): Promise<PipelineInstance> {
    this.eventBus.emit(PipelineEvents.ROLLBACK_STARTED, {
      pipelineId: pipeline.id,
      toTaskId,
      timestamp: Date.now(),
    });

    if (toTaskId) {
      // Find the completion time of the target task
      const targetState = pipeline.taskStates.get(toTaskId);
      if (!targetState) {
        throw new Error(`Task "${toTaskId}" not found in pipeline "${pipeline.id}"`);
      }

      const targetTime = targetState.completedAt ?? 0;

      // Reset all tasks completed after the target
      for (const [, state] of pipeline.taskStates) {
        if (state.completedAt !== undefined && state.completedAt > targetTime) {
          state.status = 'pending';
          state.completedAt = undefined;
          state.result = undefined;
          state.error = undefined;
          state.startedAt = undefined;
          // Don't reset retryCount to preserve retry history
        }
      }

      // Also reset the target task itself
      targetState.status = 'pending';
      targetState.completedAt = undefined;
      targetState.result = undefined;
      targetState.error = undefined;
      targetState.startedAt = undefined;
    } else {
      // Rollback all completed tasks
      for (const [, state] of pipeline.taskStates) {
        if (state.status === 'completed' || state.status === 'failed') {
          state.status = 'pending';
          state.completedAt = undefined;
          state.result = undefined;
          state.error = undefined;
          state.startedAt = undefined;
        }
      }
    }

    pipeline.updatedAt = Date.now();

    this.eventBus.emit(PipelineEvents.ROLLBACK_COMPLETED, {
      pipelineId: pipeline.id,
      toTaskId,
      timestamp: pipeline.updatedAt,
    });

    return pipeline;
  }

  /**
   * Rollback a single task to pending status.
   *
   * @param pipeline - The pipeline instance.
   * @param taskId - The task to rollback.
   * @throws {Error} If the task is not found or is currently running.
   */
  async rollbackTask(pipeline: PipelineInstance, taskId: string): Promise<void> {
    const state = pipeline.taskStates.get(taskId);
    if (!state) {
      throw new Error(`Task "${taskId}" not found in pipeline "${pipeline.id}"`);
    }

    if (state.status === 'running') {
      throw new Error(`Cannot rollback task "${taskId}" while it is running`);
    }

    state.status = 'pending';
    state.startedAt = undefined;
    state.completedAt = undefined;
    state.result = undefined;
    state.error = undefined;

    pipeline.updatedAt = Date.now();
  }
}
