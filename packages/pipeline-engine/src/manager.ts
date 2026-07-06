/**
 * @module manager
 * High-level API for creating, inspecting, and controlling pipelines.
 * Orchestrates the state machine, executor, and supporting subsystems.
 */

import { randomUUID } from 'node:crypto';
import type {
  EventBus,
  PipelineDefinition,
  PipelineInstance,
  TaskState,
} from './types.js';
import { PipelineEvents } from './types.js';
import { PipelineStateMachine } from './state-machine.js';
import { PipelineExecutor } from './executor.js';
import { DependencyResolver } from './resolver.js';
import { ApprovalManager } from './approval.js';
import { RollbackManager } from './rollback.js';
import { PipelineMetrics } from './metrics.js';
import { ExecutionContext } from './context.js';

/**
 * Options for constructing a PipelineManager.
 */
export interface PipelineManagerOptions {
  eventBus: EventBus;
  executor: PipelineExecutor;
  stateMachine: PipelineStateMachine;
  approvalManager?: ApprovalManager;
  rollbackManager?: RollbackManager;
  metrics?: PipelineMetrics;
  /** External storage for pipeline definitions, keyed by definition ID. */
  definitions?: Map<string, PipelineDefinition>;
}

/**
 * High-level API for the pipeline engine.
 * Provides methods for creating, starting, cancelling, and inspecting pipelines.
 */
export class PipelineManager {
  /** In-memory store of pipeline instances, keyed by pipeline ID. */
  private readonly pipelines: Map<string, PipelineInstance> = new Map();
  /** External registry of pipeline definitions, keyed by definition ID. */
  private readonly definitions: Map<string, PipelineDefinition>;

  private readonly eventBus: EventBus;
  private readonly executor: PipelineExecutor;
  private readonly stateMachine: PipelineStateMachine;
  private readonly approvalManager: ApprovalManager;
  private readonly rollbackManager: RollbackManager;
  private readonly metrics: PipelineMetrics;

  constructor(options: PipelineManagerOptions) {
    this.eventBus = options.eventBus;
    this.executor = options.executor;
    this.stateMachine = options.stateMachine;
    this.approvalManager = options.approvalManager ?? new ApprovalManager({ eventBus: options.eventBus });
    this.rollbackManager = options.rollbackManager ?? new RollbackManager({ eventBus: options.eventBus });
    this.metrics = options.metrics ?? new PipelineMetrics();
    this.definitions = options.definitions ?? new Map();
  }

  /**
   * Create a new pipeline instance from a definition.
   * Validates the definition, creates task states, and transitions to 'created'.
   *
   * @param definition - Pipeline definition to instantiate.
   * @returns The newly created pipeline instance.
   * @throws {Error} If the definition is invalid.
   */
  async createPipeline(definition: PipelineDefinition): Promise<PipelineInstance> {
    const resolver = new DependencyResolver();
    const validation = resolver.validate(definition);
    if (!validation.valid) {
      throw new Error(`Invalid pipeline definition: ${validation.errors.join('; ')}`);
    }

    // Store the definition for later reference
    this.definitions.set(definition.id, definition);

    // Create task states
    const taskStates = new Map<string, TaskState>();
    for (const task of definition.tasks) {
      taskStates.set(task.id, {
        taskId: task.id,
        status: 'pending',
        retryCount: 0,
      });
    }

    // Create execution context
    const context = new ExecutionContext(randomUUID());
    const pipelineId = randomUUID();
    context.setVariable('pipelineDefinitionId', definition.id);

    const now = Date.now();
    const pipeline: PipelineInstance = {
      id: pipelineId,
      definitionId: definition.id,
      status: 'created',
      taskStates,
      context: context.toData(),
      createdAt: now,
      updatedAt: now,
    };

    this.pipelines.set(pipelineId, pipeline);
    this.metrics.recordPipelineCreated();

    this.eventBus.emit(PipelineEvents.PIPELINE_CREATED, {
      pipelineId,
      definitionId: definition.id,
      taskCount: definition.tasks.length,
      timestamp: now,
    });

    return pipeline;
  }

  /**
   * Start execution of a pipeline.
   * Transitions through validated → queued → running and begins execution.
   *
   * @param pipelineId - ID of the pipeline to start.
   * @throws {Error} If the pipeline is not found or cannot be started.
   */
  async startPipeline(pipelineId: string): Promise<void> {
    const pipeline = this.requirePipeline(pipelineId);

    // Transition through validation states
    this.stateMachine.transition(pipeline, 'validated');
    this.stateMachine.transition(pipeline, 'queued');
    this.stateMachine.transition(pipeline, 'running');

    // Execute
    await this.executor.execute(pipeline);

    // Determine final status based on task states
    if (pipeline.status === 'cancelled' || pipeline.status === 'waiting') {
      return;
    }

    const allCompleted = this.allTasksInStatus(pipeline, 'completed');
    const hasFailures = this.anyTasksInStatus(pipeline, 'failed') || this.anyTasksInStatus(pipeline, 'timed_out');

    if (allCompleted) {
      this.stateMachine.transition(pipeline, 'completed');
      const duration = pipeline.updatedAt - pipeline.createdAt;
      this.metrics.recordPipelineCompleted(duration);
    } else if (hasFailures) {
      this.stateMachine.transition(pipeline, 'failed');
      this.metrics.recordPipelineFailed('task_failure');
    }
  }

  /**
   * Cancel a running pipeline.
   * @param pipelineId - ID of the pipeline to cancel.
   * @param reason - Reason for cancellation.
   * @throws {Error} If the pipeline is not found or cannot be cancelled.
   */
  async cancelPipeline(pipelineId: string, reason: string): Promise<void> {
    const pipeline = this.requirePipeline(pipelineId);

    // Cancel pending/ready tasks
    for (const [, state] of pipeline.taskStates) {
      if (state.status === 'pending' || state.status === 'ready') {
        state.status = 'cancelled';
      }
    }

    this.stateMachine.transition(pipeline, 'cancelled');

    // Clear any pending approvals
    this.approvalManager.clearPipelineApprovals(pipelineId);

    this.eventBus.emit(PipelineEvents.PIPELINE_CANCELLED, {
      pipelineId,
      reason,
      timestamp: pipeline.updatedAt,
    });
  }

  /**
   * Get a pipeline instance by ID.
   * @param pipelineId - Pipeline ID.
   * @returns The pipeline instance, or `undefined` if not found.
   */
  getPipeline(pipelineId: string): PipelineInstance | undefined {
    return this.pipelines.get(pipelineId);
  }

  /**
   * List all pipeline instances.
   * @returns Array of all pipeline instances.
   */
  listPipelines(): PipelineInstance[] {
    return Array.from(this.pipelines.values());
  }

  /**
   * Approve a task that is waiting for approval.
   * @param pipelineId - Pipeline ID.
   * @param taskId - Task ID to approve.
   * @throws {Error} If the pipeline or task is not found.
   */
  async approveTask(pipelineId: string, taskId: string): Promise<void> {
    const pipeline = this.requirePipeline(pipelineId);
    const state = pipeline.taskStates.get(taskId);
    if (!state) {
      throw new Error(`Task "${taskId}" not found in pipeline "${pipelineId}"`);
    }

    await this.approvalManager.approve(pipelineId, taskId);

    state.approvalStatus = 'approved';

    // If pipeline is waiting, resume
    if (pipeline.status === 'waiting') {
      this.stateMachine.transition(pipeline, 'running');
      await this.executor.execute(pipeline);

      // Check final status
      if (this.allTasksInStatus(pipeline, 'completed')) {
        this.stateMachine.transition(pipeline, 'completed');
        const duration = pipeline.updatedAt - pipeline.createdAt;
        this.metrics.recordPipelineCompleted(duration);
      }
    }
  }

  /**
   * Reject a task that is waiting for approval.
   * @param pipelineId - Pipeline ID.
   * @param taskId - Task ID to reject.
   * @param reason - Reason for rejection.
   * @throws {Error} If the pipeline or task is not found.
   */
  async rejectTask(pipelineId: string, taskId: string, reason: string): Promise<void> {
    const pipeline = this.requirePipeline(pipelineId);
    const state = pipeline.taskStates.get(taskId);
    if (!state) {
      throw new Error(`Task "${taskId}" not found in pipeline "${pipelineId}"`);
    }

    await this.approvalManager.reject(pipelineId, taskId, reason);

    state.approvalStatus = 'rejected';
    state.status = 'failed';
    state.error = `Approval rejected: ${reason}`;
    state.completedAt = Date.now();

    this.stateMachine.transition(pipeline, 'failed');
    this.metrics.recordPipelineFailed('approval_rejected');
  }

  /**
   * Retry a failed pipeline, optionally from a specific task.
   * @param pipelineId - Pipeline ID.
   * @param fromTaskId - Task to restart from (rolls back all tasks after this).
   * @throws {Error} If the pipeline is not found.
   */
  async retryPipeline(pipelineId: string, fromTaskId?: string): Promise<void> {
    const pipeline = this.requirePipeline(pipelineId);

    // Rollback to the specified task (or all)
    await this.rollbackManager.rollback(pipeline, fromTaskId);

    // Reset pipeline status
    this.stateMachine.transition(pipeline, 'running');

    // Resume execution
    await this.executor.execute(pipeline);

    // Determine final status
    if (this.allTasksInStatus(pipeline, 'completed')) {
      this.stateMachine.transition(pipeline, 'completed');
      const duration = pipeline.updatedAt - pipeline.createdAt;
      this.metrics.recordPipelineCompleted(duration);
    } else if (this.anyTasksInStatus(pipeline, 'failed') || this.anyTasksInStatus(pipeline, 'timed_out')) {
      this.stateMachine.transition(pipeline, 'failed');
      this.metrics.recordPipelineFailed('retry_exhausted');
    }
  }

  /**
   * Get the execution graph for visualization.
   * @param pipelineId - Pipeline ID.
   * @returns Object with nodes (id + status) and edges (from → to).
   * @throws {Error} If the pipeline is not found.
   */
  getExecutionGraph(pipelineId: string): {
    nodes: Array<{ id: string; status: string }>;
    edges: Array<{ from: string; to: string }>;
  } {
    const pipeline = this.requirePipeline(pipelineId);
    const definition = this.definitions.get(pipeline.definitionId);

    const nodes = Array.from(pipeline.taskStates.entries()).map(([id, state]) => ({
      id,
      status: state.status,
    }));

    const edges: Array<{ from: string; to: string }> = [];
    if (definition) {
      for (const task of definition.tasks) {
        for (const depId of task.dependencies) {
          edges.push({ from: depId, to: task.id });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Perform a health check on the pipeline engine.
   * @returns Health status including active and completed pipeline counts.
   */
  async healthCheck(): Promise<{
    status: string;
    activePipelines: number;
    completedPipelines: number;
  }> {
    let activePipelines = 0;
    let completedPipelines = 0;

    for (const pipeline of this.pipelines.values()) {
      if (pipeline.status === 'completed' || pipeline.status === 'cancelled') {
        completedPipelines++;
      } else {
        activePipelines++;
      }
    }

    return {
      status: 'healthy',
      activePipelines,
      completedPipelines,
    };
  }

  /**
   * Get the metrics instance.
   * @returns The pipeline metrics tracker.
   */
  getMetrics(): PipelineMetrics {
    return this.metrics;
  }

  /**
   * Get the approval manager.
   * @returns The approval manager instance.
   */
  getApprovalManager(): ApprovalManager {
    return this.approvalManager;
  }

  /**
   * Require a pipeline by ID, throwing if not found.
   * @param pipelineId - Pipeline ID.
   * @returns The pipeline instance.
   * @throws {Error} If the pipeline is not found.
   */
  private requirePipeline(pipelineId: string): PipelineInstance {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline "${pipelineId}" not found`);
    }
    return pipeline;
  }

  /**
   * Check if all tasks in a pipeline are in a given status.
   * @param pipeline - Pipeline instance.
   * @param status - Status to check.
   * @returns `true` if all tasks match.
   */
  private allTasksInStatus(pipeline: PipelineInstance, status: string): boolean {
    if (pipeline.taskStates.size === 0) return false;
    for (const [, state] of pipeline.taskStates) {
      if (state.status !== status) return false;
    }
    return true;
  }

  /**
   * Check if any tasks in a pipeline are in a given status.
   * @param pipeline - Pipeline instance.
   * @param status - Status to check.
   * @returns `true` if any task matches.
   */
  private anyTasksInStatus(pipeline: PipelineInstance, status: string): boolean {
    for (const [, state] of pipeline.taskStates) {
      if (state.status === status) return true;
    }
    return false;
  }
}
