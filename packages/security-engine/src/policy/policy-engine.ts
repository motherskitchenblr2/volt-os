/**
 * @module policy-engine
 * Policy evaluation engine for the VOLT OS Security Engine.
 *
 * Manages a collection of authorization policies and evaluates them
 * against subject/action/resource triples. Detects conflicting or
 * redundant policies and provides applicability analysis.
 */

import pino from 'pino';
import type { AuthorizationResult, Policy, Subject } from '../types.js';

const logger = pino({ name: 'volt-os:security:policy-engine' });

/**
 * Policy evaluation engine.
 *
 * Maintains, validates, and evaluates authorization policies.
 */
export class PolicyEngine {
  private policies: Policy[];

  /**
   * Create a new PolicyEngine.
   *
   * @param options - Configuration.
   * @param options.policies - Initial set of policies.
   */
  constructor(options: { policies: Policy[] }) {
    this.policies = [...options.policies];
  }

  /**
   * Evaluate policies against a subject/action/resource request.
   *
   * Policies are evaluated in descending priority order. The first
   * matching enabled policy determines the outcome. If no policy
   * matches, access is denied by default.
   *
   * @param subject - The subject making the request.
   * @param action - The action being attempted.
   * @param resource - The resource being accessed.
   * @returns An AuthorizationResult with the decision.
   */
  evaluate(subject: Subject, action: string, resource: string): AuthorizationResult {
    const sorted = [...this.policies]
      .filter((p) => p.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const policy of sorted) {
      if (this.subjectMatches(subject, policy) &&
          this.patternMatch(resource, policy.resources) &&
          this.patternMatch(action, policy.actions)) {
        logger.info(
          {
            subjectId: subject.id,
            action,
            resource,
            policyId: policy.id,
            effect: policy.effect,
          },
          'Policy matched',
        );
        return {
          allowed: policy.effect === 'allow',
          reason: policy.effect === 'allow'
            ? `Allowed by policy: ${policy.name}`
            : `Denied by policy: ${policy.name}`,
          matchedPolicy: policy.id,
        };
      }
    }

    return {
      allowed: false,
      reason: 'No applicable policy found (default deny)',
    };
  }

  /**
   * Add a new policy.
   *
   * @param policy - The policy to add.
   */
  addPolicy(policy: Policy): void {
    this.policies.push(policy);
    logger.info({ policyId: policy.id }, 'Policy added to engine');
  }

  /**
   * Remove a policy by ID.
   *
   * @param policyId - The ID of the policy to remove.
   */
  removePolicy(policyId: string): void {
    this.policies = this.policies.filter((p) => p.id !== policyId);
    logger.info({ policyId }, 'Policy removed from engine');
  }

  /**
   * Get all policies that would apply to a given request.
   *
   * @param subject - The subject making the request.
   * @param action - The action being attempted.
   * @param resource - The resource being accessed.
   * @returns Array of matching policies, sorted by priority descending.
   */
  getApplicablePolicies(
    subject: Subject,
    action: string,
    resource: string,
  ): Policy[] {
    return this.policies
      .filter((p) => {
        if (!p.enabled) return false;
        return (
          this.subjectMatches(subject, p) &&
          this.patternMatch(resource, p.resources) &&
          this.patternMatch(action, p.actions)
        );
      })
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Validate a policy for conflicts and structural issues.
   *
   * @param policy - The policy to validate.
   * @returns Validation result with any error messages.
   */
  validatePolicy(policy: Policy): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!policy.id || policy.id.trim().length === 0) {
      errors.push('Policy ID is required');
    }
    if (!policy.name || policy.name.trim().length === 0) {
      errors.push('Policy name is required');
    }
    if (policy.subjects.length === 0) {
      errors.push('Policy must specify at least one subject pattern');
    }
    if (policy.resources.length === 0) {
      errors.push('Policy must specify at least one resource pattern');
    }
    if (policy.actions.length === 0) {
      errors.push('Policy must specify at least one action pattern');
    }

    // Check for direct conflicts with existing policies of same priority
    const conflicts = this.policies.filter(
      (existing) =>
        existing.id !== policy.id &&
        existing.priority === policy.priority &&
        existing.effect !== policy.effect &&
        existing.enabled &&
        this.overlaps(existing, policy),
    );

    if (conflicts.length > 0) {
      errors.push(
        `Conflicting policies at same priority level: ${conflicts.map((c) => c.id).join(', ')}`,
      );
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check whether a subject matches a policy's subject patterns.
   *
   * @private
   */
  private subjectMatches(subject: Subject, policy: Policy): boolean {
    return (
      this.patternMatch(subject.id, policy.subjects) ||
      subject.roles.some((role) => this.patternMatch(role, policy.subjects))
    );
  }

  /**
   * Match a value against an array of patterns (supports * wildcard).
   *
   * @private
   */
  private patternMatch(value: string, patterns: string[]): boolean {
    if (patterns.length === 0) return false;
    return patterns.some((pattern) => {
      if (pattern === '*') return true;
      if (pattern.includes('*')) {
        const regex = new RegExp(
          '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
        );
        return regex.test(value);
      }
      return value === pattern;
    });
  }

  /**
   * Check whether two policies overlap in their subject/resource/action scope.
   *
   * @private
   */
  private overlaps(a: Policy, b: Policy): boolean {
    const subjectOverlap = a.subjects.some((s) =>
      b.subjects.some((bs) => s === '*' || bs === '*' || s === bs),
    );
    const resourceOverlap = a.resources.some((r) =>
      b.resources.some((br) => r === '*' || br === '*' || r === br),
    );
    const actionOverlap = a.actions.some((ac) =>
      b.actions.some((bac) => ac === '*' || bac === '*' || ac === bac),
    );
    return subjectOverlap && resourceOverlap && actionOverlap;
  }
}
