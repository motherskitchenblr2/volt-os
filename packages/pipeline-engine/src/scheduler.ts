/**
 * @module scheduler
 * Manages task queuing and execution scheduling within a pipeline.
 * Determines which tasks are ready to execute based on dependency satisfaction.
 */

import { DAG } from './graph/dag.js';
import { getExecutionLayers } from './graph/topological.js';
import type { PipelineInstance, TaskDefinition } from './types.js';

/**
 * Manages the scheduling of tasks within a pipeline.
 * Uses the DAG structure to determine which tasks are ready for execution.
 */
export class TaskScheduler {
  /**
   * Get tasks that are ready to execute — all dependencies are completed.
   * @param pipeline - The pipeline instance.
   * @param definitions - Task definitions to know dependencies.
   * @returns Array of task IDs that are ready.
   */
  getReadyTasks(pipeline: PipelineInstance, definitions: TaskDefinition[]): string[] {
    const ready: string[] = [];

    for (const def of definitions) {
      const state = pipeline.taskStates.get(def.id);
      if (!state || state.status !== 'pending') {
        continue;
      }

      if (this.areDependenciesSatisfied(def.id, pipeline, definitions)) {
        ready.push(def.id);
      }
    }

    return ready;
  }

  /**
   * Check whether all dependencies of a task are satisfied (completed).
   * @param taskId - The task to check.
   * @param pipeline - The pipeline instance.
   * @param definitions - Task definitions to resolve dependencies.
   * @returns `true` if all dependencies are completed.
   */
  areDependenciesSatisfied(
    taskId: string,
    pipeline: PipelineInstance,
    definitions: TaskDefinition[],
  ): boolean {
    const def = definitions.find((d) => d.id === taskId);
    if (!def) {
      return false;
    }

    for (const depId of def.dependencies) {
      const depState = pipeline.taskStates.get(depId);
      if (!depState || depState.status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  /**
   * Get parallel execution batches (layers) for the pipeline.
   * Each batch contains tasks that can execute simultaneously.
   *
   * @param _pipeline - The pipeline instance (reserved for future use).
   * @param definitions - Task definitions to build the DAG.
   * @returns 2D array of task ID batches.
   */
  getExecutionBatches(
    _pipeline: PipelineInstance,
    definitions: TaskDefinition[],
  ): string[][] {
    const dag = new DAG<string>();

    // Build DAG from definitions
    for (const def of definitions) {
      dag.addNode(def.id, def.id);
    }
    for (const def of definitions) {
      for (const depId of def.dependencies) {
        // Edge: depId → def.id (dep must complete before def)
        // In our DAG, addEdge(from, to) means from completes before to
        if (dag.nodeIds().includes(depId)) {
          dag.addEdge(depId, def.id);
        }
      }
    }

    return getExecutionLayers(dag);
  }
}
