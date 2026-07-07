/**
 * @module audit-hooks
 * Audit event emitter for the VOLT OS Security Engine.
 *
 * Captures all security-relevant events and provides query capabilities
 * for audit trails, compliance reporting, and incident investigation.
 * Every security action in the engine is routed through this module.
 */

import pino from 'pino';
import type { EventBus } from '@volt-os/event-bus';
import type { SecurityEvent, SecurityEventType, SecuritySeverity } from '../types.js';

const logger = pino({ name: 'volt-os:security:audit' });

/** Maximum events to retain in memory (ring buffer). */
const MAX_EVENTS = 10_000;

/**
 * Audit event emitter and query engine.
 *
 * Stores security events in a ring buffer and emits them on the event
 * bus for downstream consumers (SIEM, log aggregators, etc.).
 */
export class AuditHooks {
  private readonly eventBus: EventBus;
  private readonly events: SecurityEvent[];

  /**
   * Create a new AuditHooks instance.
   *
   * @param options - Configuration.
   * @param options.eventBus - Event bus for emitting security events.
   */
  constructor(options: { eventBus: EventBus }) {
    this.eventBus = options.eventBus;
    this.events = [];
  }

  /**
   * Emit a security event and store it in the audit log.
   *
   * @param event - The event data (id and timestamp are auto-generated).
   * @returns The complete SecurityEvent with generated fields.
   */
  async emit(
    event: Omit<SecurityEvent, 'id' | 'timestamp'>,
  ): Promise<SecurityEvent> {
    const fullEvent: SecurityEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };

    // Ring buffer management
    if (this.events.length >= MAX_EVENTS) {
      this.events.shift();
    }
    this.events.push(fullEvent);

    // Emit on event bus for downstream consumers
    this.eventBus.emit(`security.${event.type}`, {
      eventId: fullEvent.id,
      type: fullEvent.type,
      severity: fullEvent.severity,
      subjectId: event.subject?.id,
      resource: event.resource,
      action: event.action,
      details: event.details,
      timestamp: fullEvent.timestamp.toISOString(),
    });

    logger.info(
      {
        eventId: fullEvent.id,
        type: fullEvent.type,
        severity: fullEvent.severity,
        source: event.source,
      },
      'Security event emitted',
    );

    return fullEvent;
  }

  /**
   * Get the most recent security events.
   *
   * @param limit - Maximum number of events to return (default: 50).
   * @returns Array of recent events, newest first.
   */
  getRecent(limit: number = 50): SecurityEvent[] {
    return [...this.events].reverse().slice(0, limit);
  }

  /**
   * Get events filtered by type.
   *
   * @param type - The event type to filter by.
   * @param limit - Maximum number of events to return (default: 50).
   * @returns Array of matching events, newest first.
   */
  getByType(type: SecurityEventType, limit: number = 50): SecurityEvent[] {
    return [...this.events]
      .filter((e) => e.type === type)
      .reverse()
      .slice(0, limit);
  }

  /**
   * Get events filtered by severity.
   *
   * @param severity - The severity level to filter by.
   * @param limit - Maximum number of events to return (default: 50).
   * @returns Array of matching events, newest first.
   */
  getBySeverity(severity: SecuritySeverity, limit: number = 50): SecurityEvent[] {
    return [...this.events]
      .filter((e) => e.severity === severity)
      .reverse()
      .slice(0, limit);
  }

  /**
   * Get event count grouped by type.
   *
   * @returns A record mapping each event type to its count.
   */
  getCountByType(): Record<SecurityEventType, number> {
    const counts = {} as Record<SecurityEventType, number>;
    for (const event of this.events) {
      counts[event.type] = (counts[event.type] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * Get the total number of stored events.
   *
   * @returns The total event count.
   */
  getTotalCount(): number {
    return this.events.length;
  }
}
