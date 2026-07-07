/**
 * @module @volt-os/security-engine
 * Enterprise-grade security engine for VOLT OS.
 *
 * Provides authentication (JWT + API keys), authorization (RBAC + policy
 * engine), encrypted secrets management, prompt security, supply-chain
 * scanning, and audit hooks — all designed for SOC 2 Type II readiness.
 *
 * @example
 * ```typescript
 * import { SecurityEngine } from '@volt-os/security-engine';
 * import { InMemoryEventBus } from '@volt-os/event-bus';
 *
 * const bus = new InMemoryEventBus();
 * const engine = new SecurityEngine({
 *   jwtSecret: 'your-32-char-secret-here!!!!!',
 *   policies: [],
 *   eventBus: bus,
 * });
 *
 * // Issue a JWT
 * const token = await engine.jwtAuth.issue({ id: 'user-1', type: 'user', roles: ['admin'], permissions: [], metadata: {} });
 *
 * // Authenticate
 * const result = await engine.authenticate(token);
 * ```
 */

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  AuthMethod,
  AuthResult,
  Subject,
  Permission,
  AuthorizationResult,
  SecretReference,
  SecurityEventType,
  SecuritySeverity,
  SecurityEvent,
  Policy,
  PluginVerificationResult,
  PromptAnalysis,
  PromptThreat,
  APIKeyStore,
  APIKeyRecord,
} from './types.js';

// ── Auth ────────────────────────────────────────────────────────────────────
export { JWTAuth } from './auth/jwt.js';
export { APIKeyAuth } from './auth/api-key.js';

// ── AuthZ ───────────────────────────────────────────────────────────────────
export { Authorizer } from './authz/authorizer.js';
export { RBACManager } from './authz/rbac.js';

// ── Policy ──────────────────────────────────────────────────────────────────
export { PolicyEngine } from './policy/policy-engine.js';

// ── Secrets ─────────────────────────────────────────────────────────────────
export { SecretsManager } from './secrets/secrets-manager.js';
export { EncryptionService } from './secrets/encryption.js';

// ── Prompt Security ─────────────────────────────────────────────────────────
export { PromptGuard } from './prompt/prompt-guard.js';

// ── Supply Chain ────────────────────────────────────────────────────────────
export { SupplyChainScanner } from './supply-chain/scanner.js';

// ── Audit ───────────────────────────────────────────────────────────────────
export { AuditHooks } from './audit/audit-hooks.js';

// ── Engine ──────────────────────────────────────────────────────────────────
export { SecurityEngine } from './engine.js';
