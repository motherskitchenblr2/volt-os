/**
 * @module state-machine
 * Deterministic state machine for pipeline lifecycle management.
 * Enforces valid state transitions and emits events on every transition.
 */

import type { EventBus, PipelineInstance, PipelineStatus } from './types.js';
import { PipelineEvents } from './types.js';

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class InvalidTransitionError extends Error {
  constructor(from: PipelineStatus, to: PipelineStatus) {
    super(`Invalid transition: "${from}" → "${to}"`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Manages deterministic state transitions for pipeline instances.
 * Every transition is validated against the transition table and emits an event.
 */
export class PipelineStateMachine {
  /**
   * Allowed transitions for each pipeline status.
   * Maps a status to the list of statuses it can transition to.
   */
  private static readonly TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
    created: ['validated', 'cancelled'],
    validated: ['queued', 'cancelled'],
    queued: ['running', 'cancelled'],
    running: ['waiting', 'completed', 'failed', 'cancelled'],
    waiting: ['running', 'cancelled', 'failed'],
    completed: [],
    failed: ['rolled_back', 'cancelled', 'running'],
    cancelled: [],
    timed_out: ['rolled_back', 'cancelled'],
    rolled_back: ['cancelled'],
  };

  private readonly eventBus: EventBus;

  constructor(options: { eventBus: EventBus }) {
    this.eventBus = options.eventBus;
  }

  /**
   * Check whether a transition from one status to another is allowed.
   * @param from - Current status.
   * @param to - Target status.
   * @returns `true` if the transition is valid.
   */
  canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
    const allowed = PipelineStateMachine.TRANSITIONS[from];
    return allowed !== undefined && allowed.includes(to);
  }

  /**
   * Validate that a transition is allowed. Throws if not.
   * @param from - Current status.
   * @param to - Target status.
   * @throws {InvalidTransitionError} If the transition is not allowed.
   */
  validateTransition(from: PipelineStatus, to: PipelineStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidTransitionError(from, to);
    }
  }

  /**
   * Perform a validated state transition on a pipeline instance.
   * Updates the instance in place, sets `updatedAt`, and emits an event.
   *
   * @param pipeline - The pipeline instance to transition.
   * @param to - The target status.
   * @returns The mutated pipeline instance (same reference).
   * @throws {InvalidTransitionError} If the transition is not allowed.
   */
  transition(pipeline: PipelineInstance, to: PipelineStatus): PipelineInstance {
    this.validateTransition(pipeline.status, to);

    const from = pipeline.status;
    pipeline.status = to;
    pipeline.updatedAt = Date.now();

    // Emit a corresponding event
    const eventName = this.getEventForStatus(to);
    if (eventName) {
      this.eventBus.emit(eventName, {
        pipelineId: pipeline.id,
        from,
        to,
        timestamp: pipeline.updatedAt,
      });
    }

    return pipeline;
  }

  /**
   * Map a pipeline status to its canonical event name.
   * @param status - The target status.
   * @returns The event name, or `undefined` if no event is mapped.
   */
  private getEventForStatus(status: PipelineStatus): string | undefined {
    const map: Record<PipelineStatus, string | undefined> = {
      created: PipelineEvents.PIPELINE_CREATED,
      validated: PipelineEvents.PIPELINE_VALIDATED,
      queued: PipelineEvents.PIPELINE_QUEUED,
      running: PipelineEvents.PIPELINE_STARTED,
      waiting: PipelineEvents.PIPELINE_WAITING,
      completed: PipelineEvents.PIPELINE_COMPLETED,
      failed: PipelineEvents.PIPELINE_FAILED,
      cancelled: PipelineEvents.PIPELINE_CANCELLED,
      timed_out: PipelineEvents.PIPELINE_TIMED_OUT,
      rolled_back: PipelineEvents.PIPELINE_ROLLED_BACK,
    };
    return map[status];
  }

  /**
   * Get the list of allowed next statuses from a given status.
   * @param status - Current status.
   * @returns Array of allowed target statuses.
   */
  getAllowedTransitions(status: PipelineStatus): PipelineStatus[] {
    return [...(PipelineStateMachine.TRANSITIONS[status] ?? [])];
  }
}
