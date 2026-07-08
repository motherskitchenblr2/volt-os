/**
 * @module pipeline-api
 * Pipeline API implementation for the VOLT OS Developer SDK.
 *
 * Pure delegation to the PipelineManager subsystem — no business logic.
 */

import type {
  PipelineDefinition as _PipelineDefinition,
  PipelineInstance as _PipelineInstance,
} from '@volt-os/pipeline-engine';
import type { PipelineAPI } from '../types.js';

/**
 * PipelineAPI implementation that delegates to the PipelineManager.
 *
 * @example
 * ```ts
 * const api = new PipelineAPIImpl(pipelineManager, eventBus);
 * const pipeline = await api.create({ id: 'p1', name: 'Test', tasks: [], config: {} });
 * await api.start(pipeline.id);
 * ```
 */
export class PipelineAPIImpl implements PipelineAPI {
  /**
   * Create a new PipelineAPIImpl.
   * @param manager - The PipelineManager subsystem.
   * @param _eventBus - The event bus (reserved for future SDK-level events).
   */
  constructor(
    private readonly manager: {
      createPipeline(definition: _PipelineDefinition): Promise<_PipelineInstance>;
      startPipeline(pipelineId: string): Promise<void>;
      cancelPipeline(pipelineId: string, reason: string): Promise<void>;
      getPipeline(pipelineId: string): _PipelineInstance | undefined;
      listPipelines(): _PipelineInstance[];
      approveTask(pipelineId: string, taskId: string): Promise<void>;
      rejectTask(pipelineId: string, taskId: string, reason: string): Promise<void>;
    },
    _eventBus: { emit(event: string, data: Record<string, unknown>): void },
  ) {
    // Store reference for potential future SDK-level event emission
    void _eventBus;
  }

  /**
   * Create a new pipeline instance from a definition.
   * @param definition - Pipeline definition.
   * @returns The created pipeline instance.
   * @throws If the definition is invalid.
   */
  async create(definition: _PipelineDefinition): Promise<_PipelineInstance> {
    return this.manager.createPipeline(definition);
  }

  /**
   * Start execution of a pipeline.
   * @param pipelineId - ID of the pipeline to start.
   * @throws If the pipeline is not found or cannot be started.
   */
  async start(pipelineId: string): Promise<void> {
    return this.manager.startPipeline(pipelineId);
  }

  /**
   * Cancel a running pipeline.
   * @param pipelineId - ID of the pipeline to cancel.
   * @param reason - Reason for cancellation.
   * @throws If the pipeline is not found.
   */
  async cancel(pipelineId: string, reason: string): Promise<void> {
    return this.manager.cancelPipeline(pipelineId, reason);
  }

  /**
   * Get a pipeline instance by ID.
   * @param pipelineId - Pipeline ID.
   * @returns The pipeline instance, or undefined if not found.
   */
  get(pipelineId: string): _PipelineInstance | undefined {
    return this.manager.getPipeline(pipelineId);
  }

  /**
   * List all pipeline instances.
   * @returns Array of all pipeline instances.
   */
  list(): _PipelineInstance[] {
    return this.manager.listPipelines();
  }

  /**
   * Approve a task that is waiting for approval.
   * @param pipelineId - Pipeline ID.
   * @param taskId - Task ID to approve.
   * @throws If the pipeline or task is not found.
   */
  async approve(pipelineId: string, taskId: string): Promise<void> {
    return this.manager.approveTask(pipelineId, taskId);
  }

  /**
   * Reject a task that is waiting for approval.
   * @param pipelineId - Pipeline ID.
   * @param taskId - Task ID to reject.
   * @param reason - Reason for rejection.
   * @throws If the pipeline or task is not found.
   */
  async reject(pipelineId: string, taskId: string, reason: string): Promise<void> {
    return this.manager.rejectTask(pipelineId, taskId, reason);
  }
}
