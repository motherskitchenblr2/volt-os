/**
 * @module @volt-os/event-bus
 * Event bus for inter-module communication in VOLT OS.
 */

export type EventHandler = (data: Record<string, unknown>) => void;

export interface EventBus {
  emit(event: string, data: Record<string, unknown>): void;
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  emit(event: string, data: Record<string, unknown>): void {
    const set = this.handlers.get(event);
    if (set) {
      for (const handler of set) {
        handler(data);
      }
    }
  }

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }
}
