/**
 * @module security-api
 * Security API implementation for the VOLT OS Developer SDK.
 *
 * Pure delegation to the SecurityEngine subsystem — no business logic.
 */

import type {
  Subject as _Subject,
  AuthResult as _AuthResult,
  AuthorizationResult as _AuthorizationResult,
} from '@volt-os/security-engine';
import type { SecurityAPI } from '../types.js';

/**
 * Minimal interface for the parts of SecurityEngine the SDK needs.
 */
interface SecurityEngineLike {
  authenticate(token: string): Promise<_AuthResult>;
  authorize(
    subject: _Subject,
    action: string,
    resource: string,
  ): Promise<_AuthorizationResult>;
  secrets: {
    get(name: string, subject: _Subject): Promise<string | null>;
    store(name: string, value: string): Promise<unknown>;
  };
}

/**
 * System-level subject used for SDK-initiated secret operations.
 */
const SDK_SYSTEM_SUBJECT: _Subject = {
  id: '__volt_sdk__',
  type: 'service_account',
  roles: ['system'],
  permissions: [],
  metadata: { source: 'volt-sdk' },
};

/**
 * SecurityAPI implementation that delegates to the SecurityEngine.
 *
 * @example
 * ```ts
 * const api = new SecurityAPIImpl(securityEngine);
 * const auth = await api.authenticate(jwtToken);
 * if (auth.authenticated && auth.subject) {
 *   const decision = await api.authorize(auth.subject, 'read', '/docs');
 * }
 * await api.secrets.store('API_KEY', 'sk_abc123');
 * ```
 */
export class SecurityAPIImpl implements SecurityAPI {
  /**
   * Create a new SecurityAPIImpl.
   * @param engine - The SecurityEngine subsystem.
   */
  constructor(private readonly engine: SecurityEngineLike) {}

  /**
   * Authenticate a JWT token.
   * @param token - JWT string.
   * @returns Authentication result with subject or error.
   */
  async authenticate(token: string): Promise<{ authenticated: boolean; subject?: _Subject }> {
    const result = await this.engine.authenticate(token);
    if (result.authenticated && result.subject) {
      return {
        authenticated: true,
        subject: result.subject,
      };
    }
    return { authenticated: false };
  }

  /**
   * Authorize a subject to perform an action on a resource.
   * @param subject - The subject requesting access.
   * @param action - The action to authorize.
   * @param resource - The target resource.
   * @returns Authorization decision with reason.
   */
  async authorize(
    subject: _Subject,
    action: string,
    resource: string,
  ): Promise<{ allowed: boolean; reason: string }> {
    const result = await this.engine.authorize(subject, action, resource);
    return {
      allowed: result.allowed,
      reason: result.reason,
    };
  }

  /**
   * Secrets management sub-API that delegates to the SecurityEngine.
   * Uses a system-level subject for SDK-initiated operations.
   */
  secrets = {
    /**
     * Retrieve a secret by name.
     * @param name - Secret name.
     * @returns The secret value, or null if not found.
     */
    get: async (name: string): Promise<string | null> => {
      return this.engine.secrets.get(name, SDK_SYSTEM_SUBJECT);
    },

    /**
     * Store a secret.
     * @param name - Secret name.
     * @param value - Secret value.
     */
    store: async (name: string, value: string): Promise<void> => {
      await this.engine.secrets.store(name, value);
    },
  };
}
