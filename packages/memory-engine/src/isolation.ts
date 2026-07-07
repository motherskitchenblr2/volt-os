/**
 * @module isolation
 * Memory isolation — access control per agent.
 * Every memory access goes through this module.
 */

import type { AccessRule, MemoryEntry, MemoryLayerType } from '../types.js';

/** Default rules: knowledge_base and decision_history are read-only for all agents. */
const DEFAULT_RULES: AccessRule[] = [
  {
    agentId: '*',
    layers: ['knowledge_base', 'decision_history'],
  },
];

export class MemoryIsolation {
  private readonly rules: AccessRule[];

  constructor(customRules?: AccessRule[]) {
    this.rules = [...DEFAULT_RULES, ...(customRules ?? [])];
  }

  /**
   * Check if an agent can access a specific memory entry.
   * Returns true if any rule grants access.
   */
  canAccess(agentId: string, entry: MemoryEntry): boolean {
    for (const rule of this.rules) {
      if (rule.agentId !== '*' && rule.agentId !== agentId) continue;
      if (!rule.layers.includes(entry.layer)) continue;
      if (
        rule.allowedScopeIds &&
        !rule.allowedScopeIds.includes(entry.scopeId)
      ) {
        continue;
      }
      return true;
    }
    return false;
  }

  /** Filter a list of entries to only those accessible by the given agent. */
  filterAccessible(agentId: string, entries: MemoryEntry[]): MemoryEntry[] {
    return entries.filter((entry) => this.canAccess(agentId, entry));
  }

  /** Get the set of layers an agent can access. */
  getAccessibleLayers(agentId: string): MemoryLayerType[] {
    const layers = new Set<MemoryLayerType>();
    for (const rule of this.rules) {
      if (rule.agentId === '*' || rule.agentId === agentId) {
        for (const layer of rule.layers) {
          layers.add(layer);
        }
      }
    }
    return Array.from(layers);
  }

  /** Add a runtime access rule. */
  addRule(rule: AccessRule): void {
    this.rules.push(rule);
  }

  /** Remove all custom rules (keeps defaults). */
  resetRules(): void {
    this.rules.length = 0;
    this.rules.push(...DEFAULT_RULES);
  }
}
