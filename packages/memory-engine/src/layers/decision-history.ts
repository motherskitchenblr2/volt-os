/**
 * @module layers/decision-history
 * Append-only audit trail of all decisions, with hash chaining.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { DecisionRecord, EventBus, MemoryStore } from '../types.js';

function computeHash(record: Omit<DecisionRecord, 'hash'>): string {
  const payload = [
    record.id,
    record.context,
    record.decision,
    record.rationale,
    record.alternatives.join('|'),
    record.outcome,
    record.actorId,
    record.timestamp instanceof Date
      ? record.timestamp.toISOString()
      : String(record.timestamp),
    record.previousHash,
  ].join('::');
  return createHash('sha256').update(payload).digest('hex');
}

function ensureDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return new Date();
}

function parseDecisionRecord(content: string): DecisionRecord | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      id: parsed.id as string,
      context: parsed.context as string,
      decision: parsed.decision as string,
      rationale: parsed.rationale as string,
      alternatives: parsed.alternatives as string[],
      outcome: parsed.outcome as string,
      actorId: parsed.actorId as string,
      timestamp: ensureDate(parsed.timestamp),
      previousHash: parsed.previousHash as string,
      hash: parsed.hash as string,
    };
  } catch {
    return null;
  }
}

export class DecisionHistoryLayer {
  private lastHash = '0';

  constructor(
    private readonly store: MemoryStore,
    private readonly eventBus?: EventBus,
  ) {}

  /**
   * Append a decision record to the immutable history.
   * Automatically computes hash and chains to previous record.
   */
  async record(
    decision: Omit<DecisionRecord, 'id' | 'hash' | 'previousHash'>,
  ): Promise<DecisionRecord> {
    const id = randomUUID();
    const previousHash = this.lastHash;
    const record: DecisionRecord = {
      ...decision,
      id,
      previousHash,
      hash: '', // placeholder
    };
    record.hash = computeHash(record);
    this.lastHash = record.hash;

    // Persist as a memory entry in the store
    await this.store.insert({
      layer: 'decision_history',
      scopeId: decision.actorId,
      key: `decision:${id}`,
      content: JSON.stringify(record),
      metadata: {
        decisionId: id,
        context: decision.context,
        decisionText: decision.decision,
        hash: record.hash,
        previousHash: record.previousHash,
      },
    });

    this.eventBus?.emit('memory:decision:recorded', {
      id,
      context: decision.context,
      actorId: decision.actorId,
    });
    return record;
  }

  /** Retrieve a decision record by ID. */
  async get(id: string): Promise<DecisionRecord | null> {
    const results = await this.store.query({
      layer: 'decision_history',
    });
    for (const r of results) {
      const parsed = parseDecisionRecord(r.content);
      if (parsed && parsed.id === id) return parsed;
    }
    return null;
  }

  /** Query decisions by context, actor, or time range. */
  async query(filter: {
    context?: string;
    actorId?: string;
    since?: Date;
    limit?: number;
  }): Promise<DecisionRecord[]> {
    const results = await this.store.query({
      layer: 'decision_history',
      scopeId: filter.actorId,
    });

    const records: DecisionRecord[] = [];
    for (const entry of results) {
      const parsed = parseDecisionRecord(entry.content);
      if (!parsed) continue;
      if (filter.context && parsed.context !== filter.context) continue;
      if (filter.actorId && parsed.actorId !== filter.actorId) continue;
      if (filter.since && parsed.timestamp < filter.since) continue;
      records.push(parsed);
    }

    records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (filter.limit) {
      return records.slice(0, filter.limit);
    }
    return records;
  }

  /**
   * Verify the integrity of the hash chain across all decision records.
   * Returns whether the chain is valid and, if broken, the ID where it breaks.
   */
  async verifyIntegrity(): Promise<{ valid: boolean; brokenAt?: string }> {
    const all = await this.store.query({ layer: 'decision_history' });
    const records: DecisionRecord[] = [];
    for (const entry of all) {
      const parsed = parseDecisionRecord(entry.content);
      if (!parsed) {
        return { valid: false, brokenAt: entry.id };
      }
      records.push(parsed);
    }

    // Sort by timestamp
    records.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let prevHash = '0';
    for (const record of records) {
      // Verify chain link
      if (record.previousHash !== prevHash) {
        return { valid: false, brokenAt: record.id };
      }
      // Verify self hash
      const expected = computeHash({
        id: record.id,
        context: record.context,
        decision: record.decision,
        rationale: record.rationale,
        alternatives: record.alternatives,
        outcome: record.outcome,
        actorId: record.actorId,
        timestamp: record.timestamp,
        previousHash: record.previousHash,
      });
      if (expected !== record.hash) {
        return { valid: false, brokenAt: record.id };
      }
      prevHash = record.hash;
    }

    return { valid: true };
  }
}
