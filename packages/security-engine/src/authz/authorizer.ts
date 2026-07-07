/**
 * @module authorizer
 * Authorization engine for the VOLT OS Security Engine.
 *
 * Evaluates authorization requests against a set of ordered policies.
 * Policies are evaluated by priority (descending); the first matching
 * policy produces the decision. If no policy matches, access is denied
 * by default (least-privilege).
 */

import pino from 'pino';
import type {
  AuthorizationResult,
  Permission,
  Policy,
  Subject,
} from '../types.js';
import type { EventBus } from '@volt-os/event-bus';

const logger = pino({ name: 'volt-os:security:authorizer' });

/**
 * Core authorization engine.
 *
 * Maintains an ordered set of policies and evaluates authorization
 * requests against them. Emits authorization events via the event bus.
 */
export class Authorizer {
  private policies: Policy[];
  private readonly eventBus: EventBus;

  /**
   * Create a new Authorizer.
   *
   * @param options - Configuration.
   * @param options.policies - Initial set of policies.
   * @param options.eventBus - Event bus for emitting authorization events.
   */
  constructor(options: { policies: Policy[]; eventBus: EventBus }) {
    this.policies = [...options.policies].sort((a, b) => b.priority - a.priority);
    this.eventBus = options.eventBus;
  }

  /**
   * Evaluate an authorization request.
   *
   * Policies are checked in descending priority order. An explicit deny
   * in any matching policy takes precedence. If no policy matches, the
   * request is denied by default.
   *
   * @param subject - The subject requesting access.
   * @param action - The action being attempted.
   * @param resource - The resource being accessed.
   * @returns An AuthorizationResult with the decision and reason.
   */
  authorize(subject: Subject, action: string, resource: string): AuthorizationResult {
    for (const policy of this.policies) {
      if (!policy.enabled) continue;

      if (
        this.matchesPattern(subject.id, policy.subjects) &&
        this.matchesPattern(resource, policy.resources) &&
        this.matchesPattern(action, policy.actions)
      ) {
        const result: AuthorizationResult = {
          allowed: policy.effect === 'allow',
          reason: policy.effect === 'allow'
            ? `Granted by policy: ${policy.name}`
            : `Denied by policy: ${policy.name}`,
          matchedPolicy: policy.id,
        };

        const eventType = result.allowed
          ? 'authz.permission.granted'
          : 'authz.permission.denied';

        this.eventBus.emit(eventType, {
          subjectId: subject.id,
          action,
          resource,
          policyId: policy.id,
          allowed: result.allowed,
        });

        logger.info(
          {
            subjectId: subject.id,
            action,
            resource,
            policyId: policy.id,
            allowed: result.allowed,
          },
          'Authorization decision',
        );

        return result;
      }
    }

    // Default deny
    this.eventBus.emit('authz.permission.denied', {
      subjectId: subject.id,
      action,
      resource,
      reason: 'No matching policy found (default deny)',
    });

    logger.info(
      { subjectId: subject.id, action, resource },
      'Authorization denied: no matching policy',
    );

    return {
      allowed: false,
      reason: 'No matching policy found (default deny)',
    };
  }

  /**
   * Add a policy and re-sort the policy list.
   *
   * @param policy - The policy to add.
   */
  addPolicy(policy: Policy): void {
    this.policies.push(policy);
    this.policies.sort((a, b) => b.priority - a.priority);
    logger.info({ policyId: policy.id, name: policy.name }, 'Policy added');
  }

  /**
   * Remove a policy by ID.
   *
   * @param policyId - The ID of the policy to remove.
   */
  removePolicy(policyId: string): void {
    const before = this.policies.length;
    this.policies = this.policies.filter((p) => p.id !== policyId);
    if (this.policies.length < before) {
      logger.info({ policyId }, 'Policy removed');
    }
  }

  /**
   * Get all current policies (sorted by priority descending).
   *
   * @returns A copy of the sorted policy array.
   */
  getPolicies(): Policy[] {
    return [...this.policies];
  }

  /**
   * Check whether a subject has a specific permission.
   *
   * This checks the subject's inline permissions only, not RBAC roles.
   *
   * @param subject - The subject to check.
   * @param permission - The permission to verify.
   * @returns True if the subject has an exact match for the permission.
   */
  hasPermission(subject: Subject, permission: Permission): boolean {
    return subject.permissions.some(
      (p) =>
        p.resource === permission.resource &&
        p.action === permission.action &&
        p.effect === permission.effect,
    );
  }

  /**
   * Match a value against an array of patterns.
   * Supports exact matches and wildcard '*' (matches everything).
   *
   * @private
   */
  private matchesPattern(value: string, patterns: string[]): boolean {
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
}
