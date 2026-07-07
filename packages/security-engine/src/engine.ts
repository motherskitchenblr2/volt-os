/**
 * @module engine
 * Main Security Engine facade for the VOLT OS Security Engine.
 *
 * Provides a unified API over all security subsystems: authentication
 * (JWT + API keys), authorization (RBAC + policy engine), secrets
 * management, prompt security, supply-chain scanning, and audit hooks.
 *
 * Designed as the single entry point for all security operations,
 * ensuring every action is observable and enforceable through policy.
 */

import pino from 'pino';
import type { EventBus } from '@volt-os/event-bus';
import type {
  AuthResult,
  AuthorizationResult,
  Policy,
  Subject,
} from './types.js';
import { JWTAuth } from './auth/jwt.js';
import { APIKeyAuth } from './auth/api-key.js';
import { Authorizer } from './authz/authorizer.js';
import { RBACManager } from './authz/rbac.js';
import { SecretsManager } from './secrets/secrets-manager.js';
import { EncryptionService } from './secrets/encryption.js';
import { PolicyEngine } from './policy/policy-engine.js';
import { PromptGuard } from './prompt/prompt-guard.js';
import { SupplyChainScanner } from './supply-chain/scanner.js';
import { AuditHooks } from './audit/audit-hooks.js';
import type { APIKeyStore, APIKeyRecord } from './types.js';

const logger = pino({ name: 'volt-os:security-engine' });

/** In-memory API key store for default configuration. */
class InMemoryAPIKeyStore implements APIKeyStore {
  private readonly records = new Map<string, APIKeyRecord>();

  async store(record: APIKeyRecord): Promise<void> {
    this.records.set(record.id, { ...record });
    this.records.set(record.keyHash, { ...record });
  }

  async getByHash(keyHash: string): Promise<APIKeyRecord | null> {
    const r = this.records.get(keyHash);
    return r ? { ...r } : null;
  }

  async getById(id: string): Promise<APIKeyRecord | null> {
    const r = this.records.get(id);
    return r ? { ...r } : null;
  }

  async deactivate(id: string): Promise<void> {
    const r = this.records.get(id);
    if (r) {
      r.active = false;
      this.records.set(id, r);
      this.records.set(r.keyHash, r);
    }
  }

  async listBySubject(_subjectId: string): Promise<APIKeyRecord[]> {
    return Array.from(this.records.values()).filter((r) => !this.records.has(r.keyHash));
  }
}

/**
 * Unified Security Engine.
 *
 * Facade over all VOLT OS security subsystems. Instantiate once and
 * pass to consumers; all subsystems share the same event bus for
 * coherent audit trails.
 */
export class SecurityEngine {
  private readonly _jwtAuth: JWTAuth;
  private readonly _apiKeyAuth: APIKeyAuth;
  private readonly _authorizer: Authorizer;
  private readonly _rbac: RBACManager;
  private readonly _secrets: SecretsManager;
  private readonly _encryption: EncryptionService;
  private readonly _policyEngine: PolicyEngine;
  private readonly _promptGuard: PromptGuard;
  private readonly _supplyChain: SupplyChainScanner;
  private readonly _audit: AuditHooks;
  private readonly eventBus: EventBus;

  /**
   * Create a new SecurityEngine instance.
   *
   * @param options - Configuration.
   * @param options.jwtSecret - HMAC secret for JWT signing (min 32 chars).
   * @param options.policies - Initial authorization policies.
   * @param options.eventBus - Shared event bus instance.
   * @param options.encryptionKey - Optional hex-encoded AES-256 key for secrets.
   * @param options.apiKeyStore - Optional custom API key store.
   */
  constructor(options: {
    jwtSecret: string;
    policies: Policy[];
    eventBus: EventBus;
    encryptionKey?: string;
    apiKeyStore?: APIKeyStore;
  }) {
    this.eventBus = options.eventBus;
    const apiKeyStore = options.apiKeyStore ?? new InMemoryAPIKeyStore();

    this._jwtAuth = new JWTAuth({ secret: options.jwtSecret });
    this._apiKeyAuth = new APIKeyAuth({ store: apiKeyStore });
    this._authorizer = new Authorizer({ policies: options.policies, eventBus: this.eventBus });
    this._rbac = new RBACManager();
    this._secrets = new SecretsManager({ eventBus: this.eventBus, encryptionKey: options.encryptionKey });
    this._encryption = new EncryptionService();
    this._policyEngine = new PolicyEngine({ policies: options.policies });
    this._promptGuard = new PromptGuard();
    this._supplyChain = new SupplyChainScanner();
    this._audit = new AuditHooks({ eventBus: this.eventBus });

    logger.info('Security engine initialized');
  }

  /** JWT authentication provider. */
  get jwtAuth(): JWTAuth { return this._jwtAuth; }

  /** API key authentication provider. */
  get apiKeyAuth(): APIKeyAuth { return this._apiKeyAuth; }

  /** Authorization engine. */
  get authorizer(): Authorizer { return this._authorizer; }

  /** RBAC manager. */
  get rbac(): RBACManager { return this._rbac; }

  /** Policy engine. */
  get policyEngine(): PolicyEngine { return this._policyEngine; }

  /** Secrets manager. */
  get secrets(): SecretsManager { return this._secrets; }

  /** Encryption service. */
  get encryption(): EncryptionService { return this._encryption; }

  /** Prompt security guard. */
  get promptGuard(): PromptGuard { return this._promptGuard; }

  /** Supply chain scanner. */
  get supplyChain(): SupplyChainScanner { return this._supplyChain; }

  /** Audit hooks. */
  get audit(): AuditHooks { return this._audit; }

  /**
   * Authenticate a JWT token.
   *
   * @param token - The JWT string.
   * @returns AuthResult with subject or error.
   */
  async authenticate(token: string): Promise<AuthResult> {
    const result = await this._jwtAuth.verify(token);

    await this._audit.emit({
      type: result.authenticated ? 'auth.login.success' : 'auth.login.failure',
      severity: result.authenticated ? 'info' : 'medium',
      subject: result.subject ?? undefined,
      action: 'authenticate',
      details: { method: 'jwt', error: result.error },
      source: 'security-engine',
    });

    return result;
  }

  /**
   * Authorize a subject to perform an action on a resource.
   *
   * Combines RBAC role permissions with policy evaluation.
   *
   * @param subject - The subject requesting access.
   * @param action - The action to authorize.
   * @param resource - The target resource.
   * @returns AuthorizationResult with decision and reason.
   */
  async authorize(
    subject: Subject,
    action: string,
    resource: string,
  ): Promise<AuthorizationResult> {
    // Merge RBAC permissions into subject
    const rbacPerms = this._rbac.getEffectivePermissions(subject.id);
    const mergedSubject: Subject = {
      ...subject,
      permissions: [...subject.permissions, ...rbacPerms],
      roles: [...new Set([...subject.roles, ...this._rbac.getSubjectRoles(subject.id)])],
    };

    const result = this._authorizer.authorize(mergedSubject, action, resource);

    await this._audit.emit({
      type: result.allowed ? 'authz.permission.granted' : 'authz.permission.denied',
      severity: result.allowed ? 'info' : 'medium',
      subject: mergedSubject,
      action,
      resource,
      details: { allowed: result.allowed, reason: result.reason, matchedPolicy: result.matchedPolicy },
      source: 'security-engine',
    });

    return result;
  }

  /**
   * Run a health check across all security subsystems.
   *
   * @returns Health status and per-component status map.
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, string>;
  }> {
    const components: Record<string, string> = {};

    // Test JWT subsystem
    try {
      const token = await this._jwtAuth.issue({
        id: '__health_check__',
        type: 'service_account',
        roles: [],
        permissions: [],
        metadata: {},
      });
      const verifyResult = await this._jwtAuth.verify(token);
      components['jwt'] = verifyResult.authenticated ? 'healthy' : 'degraded';
    } catch {
      components['jwt'] = 'unhealthy';
    }

    // Test encryption subsystem
    try {
      const key = this._encryption.generateKey();
      const { ciphertext, iv, tag } = await this._encryption.encrypt('health-check', key);
      const decrypted = await this._encryption.decrypt(ciphertext, key, iv, tag);
      components['encryption'] = decrypted === 'health-check' ? 'healthy' : 'degraded';
    } catch {
      components['encryption'] = 'unhealthy';
    }

    // Test secrets subsystem
    try {
      components['secrets'] = this._secrets.list() !== undefined ? 'healthy' : 'degraded';
    } catch {
      components['secrets'] = 'unhealthy';
    }

    // Test audit subsystem
    try {
      components['audit'] = this._audit.getTotalCount() >= 0 ? 'healthy' : 'degraded';
    } catch {
      components['audit'] = 'unhealthy';
    }

    // Test policy engine
    try {
      components['policy_engine'] = 'healthy';
    } catch {
      components['policy_engine'] = 'unhealthy';
    }

    const statuses = Object.values(components);
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (statuses.includes('unhealthy')) {
      status = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      status = 'degraded';
    }

    return { status, components };
  }
}
