/**
 * @module context
 * Manages execution context for a pipeline run.
 * Provides variable storage, artifact tracking, and context forking for parallel tasks.
 */

import type { ExecutionContextData } from './types.js';

/**
 * Manages execution state for a pipeline instance.
 * Provides a key-value variable store, artifact tracking, and the ability to fork
 * child contexts for parallel task execution.
 */
export class ExecutionContext {
  /** Internal variable store. */
  private readonly variables: Map<string, unknown>;
  /** List of artifact IDs produced during execution. */
  private readonly artifacts: string[];
  /** ID of the owning pipeline. */
  readonly pipelineId: string;

  /**
   * Create a new execution context.
   * @param pipelineId - ID of the owning pipeline.
   */
  constructor(pipelineId: string) {
    this.pipelineId = pipelineId;
    this.variables = new Map();
    this.artifacts = [];
  }

  /**
   * Set a variable in the context.
   * @param key - Variable name.
   * @param value - Variable value.
   */
  setVariable(key: string, value: unknown): void {
    this.variables.set(key, value);
  }

  /**
   * Get a typed variable from the context.
   * @typeParam T - Expected type of the variable.
   * @param key - Variable name.
   * @returns The variable value, or `undefined` if not set.
   */
  getVariable<T = unknown>(key: string): T | undefined {
    return this.variables.get(key) as T | undefined;
  }

  /**
   * Get all variables as a plain object.
   * @returns Record of all variable key-value pairs.
   */
  getAllVariables(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.variables) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Record an artifact produced during execution.
   * @param artifactId - Unique identifier of the artifact.
   */
  addArtifact(artifactId: string): void {
    if (!this.artifacts.includes(artifactId)) {
      this.artifacts.push(artifactId);
    }
  }

  /**
   * Get all artifact IDs.
   * @returns Array of artifact IDs.
   */
  getArtifacts(): string[] {
    return [...this.artifacts];
  }

  /**
   * Create a child context that inherits all current variables and artifacts.
   * Changes to the child do not affect the parent (deep copy of variables).
   * @returns A new ExecutionContext instance.
   */
  fork(): ExecutionContext {
    const child = new ExecutionContext(this.pipelineId);

    // Copy all variables (shallow copy of values, which is expected for context forking)
    for (const [key, value] of this.variables) {
      child.variables.set(key, value);
    }

    // Copy artifact list
    child.artifacts.push(...this.artifacts);

    return child;
  }

  /**
   * Export the context as a plain data object (for serialization).
   * @returns ExecutionContextData representation.
   */
  toData(): ExecutionContextData {
    return {
      pipelineId: this.pipelineId,
      variables: new Map(this.variables),
      artifacts: [...this.artifacts],
    };
  }

  /**
   * Create an ExecutionContext from a plain data object.
   * @param data - The context data to restore from.
   * @returns A new ExecutionContext instance.
   */
  static fromData(data: ExecutionContextData): ExecutionContext {
    const ctx = new ExecutionContext(data.pipelineId);
    for (const [key, value] of data.variables) {
      ctx.variables.set(key, value);
    }
    ctx.artifacts.push(...data.artifacts);
    return ctx;
  }
}
