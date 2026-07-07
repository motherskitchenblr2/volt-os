/**
 * @module types
 * Core type definitions for the VOLT OS Security Engine.
 *
 * These types define the boundaries for authentication, authorization,
 * secrets management, policy enforcement, prompt security, supply-chain
 * scanning, and audit trails. Every type is designed to be reviewable
 * and enforceable through policy for SOC 2 Type II readiness.
 */

// ── Authentication ──────────────────────────────────────────────────────────

/** Supported authentication methods. */
export type AuthMethod = 'jwt' | 'oauth' | 'api_key' | 'service_account';

/** Result of an authentication attempt. */
export interface AuthResult {
  /** Whether authentication succeeded. */
  authenticated: boolean;
  /** The authenticated subject, or null on failure. */
  subject: Subject | null;
  /** The method used for authentication. */
  method: AuthMethod;
  /** When the authentication token expires, if applicable. */
  expiresAt?: Date;
  /** Human-readable error message on failure. */
  error?: string;
}

/** A security subject — a user, agent, or service account. */
export interface Subject {
  /** Unique identifier for the subject. */
  id: string;
  /** The type of subject. */
  type: 'user' | 'agent' | 'service_account';
  /** Roles assigned to this subject. */
  roles: string[];
  /** Explicit permissions granted to this subject. */
  permissions: Permission[];
  /** Arbitrary metadata (e.g. display name, department). */
  metadata: Record<string, unknown>;
}

// ── Authorization ───────────────────────────────────────────────────────────

/** A single permission entry. */
export interface Permission {
  /** The resource pattern this permission applies to. */
  resource: string;
  /** The action this permission covers. */
  action: string;
  /** Whether this is an allow or deny rule. */
  effect: 'allow' | 'deny';
  /** Optional conditions that must be satisfied. */
  conditions?: Record<string, unknown>;
}

/** Result of an authorization check. */
export interface AuthorizationResult {
  /** Whether access is allowed. */
  allowed: boolean;
  /** Human-readable reason for the decision. */
  reason: string;
  /** The ID of the policy that produced this decision, if any. */
  matchedPolicy?: string;
}

// ── Secrets ─────────────────────────────────────────────────────────────────

/** Metadata reference to a stored secret (never contains the value). */
export interface SecretReference {
  /** Unique identifier for the secret. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Which provider stores this secret. */
  provider: string;
  /** When the secret was last rotated. */
  lastRotated: Date;
  /** When the secret expires, if applicable. */
  expiresAt?: Date;
}

// ── Security Events ─────────────────────────────────────────────────────────

/** All security event types emitted by the engine. */
export type SecurityEventType =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.token.expired'
  | 'auth.token.revoked'
  | 'authz.permission.granted'
  | 'authz.permission.denied'
  | 'secret.accessed'
  | 'secret.rotated'
  | 'secret.leaked'
  | 'plugin.verified'
  | 'plugin.verification_failed'
  | 'plugin.permission_denied'
  | 'prompt.injection_detected'
  | 'prompt.jailbreak_detected'
  | 'prompt.data_exfiltration'
  | 'supply_chain.vulnerability_found'
  | 'supply_chain.license_violation'
  | 'security.policy_violation'
  | 'security.anomaly_detected';

/** Severity levels for security events. */
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** A structured security event. */
export interface SecurityEvent {
  /** Unique identifier for this event. */
  id: string;
  /** The type of security event. */
  type: SecurityEventType;
  /** Severity of the event. */
  severity: SecuritySeverity;
  /** The subject involved, if any. */
  subject?: Subject;
  /** The resource targeted, if any. */
  resource?: string;
  /** The action attempted, if any. */
  action?: string;
  /** Structured event details. */
  details: Record<string, unknown>;
  /** When the event occurred. */
  timestamp: Date;
  /** The subsystem that emitted this event. */
  source: string;
}

// ── Policy ──────────────────────────────────────────────────────────────────

/** A named authorization policy. */
export interface Policy {
  /** Unique policy identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Description of what this policy does. */
  description: string;
  /** Whether this policy allows or denies access. */
  effect: 'allow' | 'deny';
  /** Subject patterns this policy applies to (supports wildcards). */
  subjects: string[];
  /** Resource patterns this policy covers. */
  resources: string[];
  /** Actions this policy covers. */
  actions: string[];
  /** Optional conditions that must be satisfied. */
  conditions?: Record<string, unknown>;
  /** Evaluation priority — higher values are evaluated first. */
  priority: number;
  /** Whether this policy is currently active. */
  enabled: boolean;
}

// ── Plugin Verification ─────────────────────────────────────────────────────

/** Result of a plugin verification check. */
export interface PluginVerificationResult {
  /** Whether all checks passed. */
  valid: boolean;
  /** Individual check results. */
  checks: {
    /** Whether the plugin checksum matches. */
    checksum: boolean;
    /** Whether the plugin signature is valid. */
    signature: boolean;
    /** Whether the SDK compatibility check passes. */
    sdkCompatibility: boolean;
    /** Whether the VOLT OS version is compatible. */
    voltVersion: boolean;
    /** Whether dependency integrity checks pass. */
    dependencyIntegrity: boolean;
    /** Whether the plugin's declared permissions are valid. */
    permissionsValid: boolean;
  };
  /** Any error messages from failed checks. */
  errors: string[];
}

// ── Prompt Security ─────────────────────────────────────────────────────────

/** Result of prompt analysis. */
export interface PromptAnalysis {
  /** Whether the prompt is safe. */
  safe: boolean;
  /** List of detected threats. */
  threats: PromptThreat[];
  /** Sanitized version of the prompt, if threats were found. */
  sanitized?: string;
}

/** A detected prompt threat. */
export interface PromptThreat {
  /** The type of threat detected. */
  type: 'injection' | 'tool_injection' | 'context_poisoning' | 'jailbreak' | 'data_exfiltration';
  /** Confidence score (0–1). */
  confidence: number;
  /** The evidence that triggered detection. */
  evidence: string;
  /** Recommended action. */
  recommendation: string;
}

// ── API Key Store Interface ─────────────────────────────────────────────────

/** Stored API key record. */
export interface APIKeyRecord {
  /** Unique key identifier. */
  id: string;
  /** Key hash (never stored in plaintext). */
  keyHash: string;
  /** Human-readable name. */
  name: string;
  /** The subject this key belongs to. */
  subject: Subject;
  /** When the key was created. */
  createdAt: Date;
  /** When the key was last used. */
  lastUsedAt?: Date;
  /** Whether the key is currently active. */
  active: boolean;
}

/** Interface for API key storage backends. */
export interface APIKeyStore {
  /** Store a new API key record. */
  store(record: APIKeyRecord): Promise<void>;
  /** Retrieve a key record by its hash. */
  getByHash(keyHash: string): Promise<APIKeyRecord | null>;
  /** Retrieve a key record by its ID. */
  getById(id: string): Promise<APIKeyRecord | null>;
  /** Mark a key as inactive. */
  deactivate(id: string): Promise<void>;
  /** List all keys for a subject. */
  listBySubject(subjectId: string): Promise<APIKeyRecord[]>;
}
