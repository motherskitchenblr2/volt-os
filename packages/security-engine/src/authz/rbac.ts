/**
 * @module rbac
 * Role-Based Access Control (RBAC) manager for the VOLT OS Security Engine.
 *
 * Maps roles to permission sets and tracks role assignments per subject.
 * The RBACManager is a pure in-memory store; integrate with a persistent
 * backend for production use.
 */

import pino from 'pino';
import type { Permission } from '../types.js';

const logger = pino({ name: 'volt-os:security:rbac' });

/**
 * Role-Based Access Control manager.
 *
 * Maintains a mapping of role names to permission sets, and tracks
 * which subjects have been assigned which roles.
 */
export class RBACManager {
  /** Role name → permission set. */
  private readonly roles: Map<string, Permission[]>;
  /** Subject ID → set of assigned role names. */
  private readonly assignments: Map<string, Set<string>>;

  constructor() {
    this.roles = new Map();
    this.assignments = new Map();
  }

  /**
   * Define or redefine a role with the given permissions.
   *
   * @param name - The role name.
   * @param permissions - The permissions granted by this role.
   */
  defineRole(name: string, permissions: Permission[]): void {
    this.roles.set(name, [...permissions]);
    logger.info({ role: name, permissionCount: permissions.length }, 'Role defined');
  }

  /**
   * Remove a role definition entirely.
   *
   * @param name - The role name to remove.
   */
  removeRole(name: string): void {
    this.roles.delete(name);
    logger.info({ role: name }, 'Role removed');
  }

  /**
   * Get the permissions directly associated with a role.
   *
   * @param name - The role name.
   * @returns Array of permissions, or empty if role is undefined.
   */
  getRolePermissions(name: string): Permission[] {
    return this.roles.get(name) ?? [];
  }

  /**
   * Assign a role to a subject.
   *
   * @param subjectId - The subject's unique identifier.
   * @param role - The role name to assign.
   */
  assignRole(subjectId: string, role: string): void {
    if (!this.roles.has(role)) {
      throw new Error(`Role "${role}" is not defined`);
    }
    if (!this.assignments.has(subjectId)) {
      this.assignments.set(subjectId, new Set());
    }
    this.assignments.get(subjectId)!.add(role);
    logger.info({ subjectId, role }, 'Role assigned');
  }

  /**
   * Revoke a role from a subject.
   *
   * @param subjectId - The subject's unique identifier.
   * @param role - The role name to revoke.
   */
  revokeRole(subjectId: string, role: string): void {
    const roles = this.assignments.get(subjectId);
    if (roles) {
      roles.delete(role);
      if (roles.size === 0) {
        this.assignments.delete(subjectId);
      }
    }
    logger.info({ subjectId, role }, 'Role revoked');
  }

  /**
   * Get the names of all roles assigned to a subject.
   *
   * @param subjectId - The subject's unique identifier.
   * @returns Array of role names.
   */
  getSubjectRoles(subjectId: string): string[] {
    const roles = this.assignments.get(subjectId);
    return roles ? Array.from(roles) : [];
  }

  /**
   * Compute the effective (unioned) permissions for a subject across
   * all assigned roles. Duplicate permissions are deduplicated by
   * the stringified key (resource + action + effect).
   *
   * @param subjectId - The subject's unique identifier.
   * @returns Deduplicated array of effective permissions.
   */
  getEffectivePermissions(subjectId: string): Permission[] {
    const roles = this.assignments.get(subjectId);
    if (!roles || roles.size === 0) {
      return [];
    }

    const seen = new Set<string>();
    const result: Permission[] = [];

    for (const roleName of roles) {
      const perms = this.roles.get(roleName) ?? [];
      for (const perm of perms) {
        const key = `${perm.resource}|${perm.action}|${perm.effect}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ ...perm });
        }
      }
    }

    return result;
  }

  /**
   * Check whether a specific role includes a given permission.
   *
   * @param role - The role name.
   * @param permission - The permission to check.
   * @returns True if the role contains an identical permission entry.
   */
  roleHasPermission(role: string, permission: Permission): boolean {
    const perms = this.roles.get(role) ?? [];
    return perms.some(
      (p) =>
        p.resource === permission.resource &&
        p.action === permission.action &&
        p.effect === permission.effect,
    );
  }
}
