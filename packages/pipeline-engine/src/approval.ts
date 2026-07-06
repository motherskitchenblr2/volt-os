/**
 * @module approval
 * Manages human approval gates for pipeline tasks.
 * When a task requires approval, execution pauses until a human approves or rejects.
 */

import type { EventBus, TaskDefinition } from './types.js';
import { PipelineEvents } from './types.js';

/**
 * Record of a pending approval request.
 */
export interface PendingApproval {
  pipelineId: string;
  taskId: string;
  requestedAt: number;
}

/**
 * Manages human-in-the-loop approval gates.
 * Tasks marked with `requiresApproval` will pause execution until approved or rejected.
 */
export class ApprovalManager {
  /** Map of "pipelineId:taskId" to pending approval records. */
  private readonly pendingApprovals: Map<string, PendingApproval> = new Map();
  private readonly eventBus: EventBus;

  constructor(options: { eventBus: EventBus }) {
    this.eventBus = options.eventBus;
  }

  /**
   * Request approval for a task.
   * @param pipelineId - ID of the pipeline.
   * @param taskId - ID of the task requiring approval.
   */
  async requestApproval(pipelineId: string, taskId: string): Promise<void> {
    const key = `${pipelineId}:${taskId}`;
    const record: PendingApproval = {
      pipelineId,
      taskId,
      requestedAt: Date.now(),
    };

    this.pendingApprovals.set(key, record);

    this.eventBus.emit(PipelineEvents.APPROVAL_REQUESTED, {
      pipelineId,
      taskId,
      requestedAt: record.requestedAt,
    });
  }

  /**
   * Approve a pending task.
   * @param pipelineId - ID of the pipeline.
   * @param taskId - ID of the task to approve.
   * @throws {Error} If no pending approval exists for the task.
   */
  async approve(pipelineId: string, taskId: string): Promise<void> {
    const key = `${pipelineId}:${taskId}`;
    const pending = this.pendingApprovals.get(key);

    if (!pending) {
      throw new Error(`No pending approval for task "${taskId}" in pipeline "${pipelineId}"`);
    }

    this.pendingApprovals.delete(key);

    this.eventBus.emit(PipelineEvents.APPROVAL_GRANTED, {
      pipelineId,
      taskId,
      approvedAt: Date.now(),
    });
  }

  /**
   * Reject a pending task.
   * @param pipelineId - ID of the pipeline.
   * @param taskId - ID of the task to reject.
   * @param reason - Reason for rejection.
   * @throws {Error} If no pending approval exists for the task.
   */
  async reject(pipelineId: string, taskId: string, reason: string): Promise<void> {
    const key = `${pipelineId}:${taskId}`;
    const pending = this.pendingApprovals.get(key);

    if (!pending) {
      throw new Error(`No pending approval for task "${taskId}" in pipeline "${pipelineId}"`);
    }

    this.pendingApprovals.delete(key);

    this.eventBus.emit(PipelineEvents.APPROVAL_REJECTED, {
      pipelineId,
      taskId,
      reason,
      rejectedAt: Date.now(),
    });
  }

  /**
   * Check whether a task definition requires approval.
   * @param task - The task definition.
   * @returns `true` if the task requires approval.
   */
  needsApproval(task: TaskDefinition): boolean {
    return task.requiresApproval === true;
  }

  /**
   * Get all pending approval requests.
   * @returns Array of pending approval records.
   */
  getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values());
  }

  /**
   * Check if a specific task has a pending approval.
   * @param pipelineId - Pipeline ID.
   * @param taskId - Task ID.
   * @returns `true` if there is a pending approval.
   */
  hasPendingApproval(pipelineId: string, taskId: string): boolean {
    return this.pendingApprovals.has(`${pipelineId}:${taskId}`);
  }

  /**
   * Clear all pending approvals (used during pipeline cancellation).
   * @param pipelineId - Pipeline ID to clear approvals for.
   */
  clearPipelineApprovals(pipelineId: string): void {
    for (const key of this.pendingApprovals.keys()) {
      if (key.startsWith(`${pipelineId}:`)) {
        this.pendingApprovals.delete(key);
      }
    }
  }
}
