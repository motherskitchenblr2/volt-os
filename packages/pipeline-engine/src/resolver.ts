/**
 * @module resolver
 * Validates and resolves pipeline definitions.
 * Checks for cycles, missing dependencies, and duplicate task IDs.
 */

import { DAG } from './graph/dag.js';
import { getExecutionLayers } from './graph/topological.js';
import type { PipelineDefinition } from './types.js';

/**
 * Result of validating a pipeline definition.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates and resolves pipeline definitions before execution.
 * Ensures structural integrity of the pipeline DAG.
 */
export class DependencyResolver {
  /**
   * Validate that a pipeline definition has no cycles and all references are valid.
   * @param definition - Pipeline definition to validate.
   * @returns Validation result with errors if any.
   */
  validate(definition: PipelineDefinition): ValidationResult {
    const errors: string[] = [];

    // Check for duplicate IDs
    const duplicates = this.findDuplicateIds(definition);
    if (duplicates.length > 0) {
      errors.push(`Duplicate task IDs: ${duplicates.join(', ')}`);
    }

    // Check for missing dependencies
    const missing = this.findMissingDependencies(definition);
    if (missing.length > 0) {
      errors.push(`Missing dependencies: ${missing.join(', ')}`);
    }

    // Build DAG and check for cycles
    if (errors.length === 0) {
      try {
        const dag = this.buildDAG(definition);
        if (dag.hasCycle()) {
          errors.push('Pipeline contains a cycle');
        }
      } catch (err) {
        errors.push(
          `Failed to build dependency graph: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Resolve execution order into parallel layers.
   * @param definition - Pipeline definition to resolve.
   * @returns 2D array of execution layers.
   * @throws {Error} If the definition contains cycles.
   */
  resolve(definition: PipelineDefinition): string[][] {
    const validation = this.validate(definition);
    if (!validation.valid) {
      throw new Error(`Invalid pipeline definition: ${validation.errors.join('; ')}`);
    }

    const dag = this.buildDAG(definition);
    return getExecutionLayers(dag);
  }

  /**
   * Find task IDs that reference non-existent dependencies.
   * @param definition - Pipeline definition to check.
   * @returns Array of error strings describing missing dependencies.
   */
  findMissingDependencies(definition: PipelineDefinition): string[] {
    const taskIds = new Set(definition.tasks.map((t) => t.id));
    const missing: string[] = [];

    for (const task of definition.tasks) {
      for (const dep of task.dependencies) {
        if (!taskIds.has(dep)) {
          missing.push(`Task "${task.id}" depends on non-existent task "${dep}"`);
        }
      }
    }

    return missing;
  }

  /**
   * Find duplicate task IDs in the definition.
   * @param definition - Pipeline definition to check.
   * @returns Array of duplicate task IDs.
   */
  findDuplicateIds(definition: PipelineDefinition): string[] {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const task of definition.tasks) {
      if (seen.has(task.id)) {
        duplicates.push(task.id);
      } else {
        seen.add(task.id);
      }
    }

    return duplicates;
  }

  /**
   * Build a DAG from a pipeline definition.
   * @param definition - Pipeline definition.
   * @returns A DAG of task IDs.
   * @throws {Error} If nodes or edges are invalid.
   */
  private buildDAG(definition: PipelineDefinition): DAG<string> {
    const dag = new DAG<string>();

    for (const task of definition.tasks) {
      dag.addNode(task.id, task.id);
    }

    for (const task of definition.tasks) {
      for (const depId of task.dependencies) {
        // dep must complete before task: edge from dep to task
        dag.addEdge(depId, task.id);
      }
    }

    return dag;
  }
}
