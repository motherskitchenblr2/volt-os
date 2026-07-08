/**
 * @module event-api
 * Event API implementation for the VOLT OS Developer SDK.
 *
 * Pure delegation to the EventBus subsystem — no business logic.
 */

import type { EventAPI } from '../types.js';

/**
 * Minimal interface for the parts of EventBus the SDK needs.
 */
interface EventBusLike {
  emit(event: string, data: Record<string, unknown>): void;
  on(event: string, handler: (data: Record<string, unknown>) => void): void;
  off(event: string, handler: (data: Record<string, unknown>) => void): void;
}

/**
 * EventAPI implementation that delegates to the EventBus.
 *
 * @example
 * ```ts
 * const api = new EventAPIImpl(eventBus);
 * await api.publish('pipeline:completed', 'pipeline', 'p-123', { status: 'ok' });
 * const unsub = await api.subscribe('pipeline:*', (event) => {
 *   console.log(event);
 * });
 * // Later: await unsub();
 * ```
 */
export class EventAPIImpl implements EventAPI {
  /**
   * Create a new EventAPIImpl.
   * @param eventBus - The EventBus subsystem.
   */
  constructor(private readonly eventBus: EventBusLike) {}

  /**
   * Publish an event to the event bus.
   * @param type - Event type.
   * @param aggregateType - Aggregate type (e.g. 'pipeline').
   * @param aggregateId - Aggregate ID.
   * @param payload - Event payload.
   */
  async publish(
    type: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    this.eventBus.emit(type, {
      aggregateType,
      aggregateId,
      ...payload,
    });
  }

  /**
   * Subscribe to events on the event bus.
   * @param type - Event type to subscribe to, or '*' for all events.
   * @param handler - Event handler function.
   * @returns Unsubscribe function.
   */
  async subscribe(
    type: string,
    handler: (event: Record<string, unknown>) => void,
  ): Promise<() => Promise<void>> {
    const wrappedHandler = (data: Record<string, unknown>): void => {
      handler(data);
    };

    this.eventBus.on(type, wrappedHandler);

    return async (): Promise<void> => {
      this.eventBus.off(type, wrappedHandler);
    };
  }
}
