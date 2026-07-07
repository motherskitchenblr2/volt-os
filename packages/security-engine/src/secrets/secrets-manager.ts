/**
 * @module secrets-manager
 * Encrypted secrets storage and lifecycle management for the VOLT OS Security Engine.
 *
 * All secrets are encrypted at rest using AES-256-GCM. Access is logged
 * via the event bus for audit trails. The manager also provides secret
 * scanning to detect leaked credentials in content.
 */

import pino from 'pino';
import type { SecretReference, Subject } from '../types.js';
import type { EventBus } from '@volt-os/event-bus';
import { EncryptionService } from './encryption.js';

const logger = pino({ name: 'volt-os:security:secrets' });

/** Internal record for a stored secret. */
interface SecretRecord {
  reference: SecretReference;
  encryptedValue: string;
  iv: string;
  tag: string;
  metadata: Record<string, unknown>;
}

/** Patterns for common secret types when scanning for leaks. */
const SECRET_PATTERNS: Array<{ type: string; regex: RegExp; severity: string }> = [
  { type: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
  { type: 'AWS Secret Key', regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g, severity: 'critical' },
  { type: 'GitHub Token', regex: /ghp_[A-Za-z0-9]{36}/g, severity: 'high' },
  { type: 'GitHub Fine-grained Token', regex: /github_pat_[A-Za-z0-9_]{82}/g, severity: 'high' },
  { type: 'Stripe Key', regex: /sk_live_[A-Za-z0-9]{24,}/g, severity: 'critical' },
  { type: 'Stripe Publishable Key', regex: /pk_live_[A-Za-z0-9]{24,}/g, severity: 'medium' },
  { type: 'JWT Token', regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, severity: 'medium' },
  { type: 'Private Key Header', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, severity: 'critical' },
  { type: 'Generic API Key', regex: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/gi, severity: 'high' },
  { type: 'Generic Secret', regex: /(?:secret|password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?/gi, severity: 'high' },
];

/**
 * Encrypted secrets manager with access logging and leak detection.
 */
export class SecretsManager {
  private readonly secrets: Map<string, SecretRecord>;
  private readonly encryption: EncryptionService;
  private readonly eventBus: EventBus;
  private readonly encryptionKey: string;

  /**
   * Create a new SecretsManager.
   *
   * @param options - Configuration.
   * @param options.eventBus - Event bus for audit events.
   * @param options.encryptionKey - Hex-encoded AES-256 key (64 hex chars).
   *   If not provided, a key is generated (not persisted).
   */
  constructor(options: { eventBus: EventBus; encryptionKey?: string }) {
    this.secrets = new Map();
    this.encryption = new EncryptionService();
    this.eventBus = options.eventBus;
    this.encryptionKey = options.encryptionKey ?? this.encryption.generateKey(32);
  }

  /**
   * Store an encrypted secret.
   *
   * @param name - Unique name for the secret.
   * @param value - The plaintext secret value.
   * @param metadata - Optional metadata to attach.
   * @returns A reference to the stored secret (never contains the value).
   */
  async store(
    name: string,
    value: string,
    metadata?: Record<string, unknown>,
  ): Promise<SecretReference> {
    const { ciphertext, iv, tag } = await this.encryption.encrypt(value, this.encryptionKey);

    const reference: SecretReference = {
      id: crypto.randomUUID(),
      name,
      provider: 'secrets-manager',
      lastRotated: new Date(),
    };

    const record: SecretRecord = {
      reference,
      encryptedValue: ciphertext,
      iv,
      tag,
      metadata: metadata ?? {},
    };

    this.secrets.set(name, record);

    this.eventBus.emit('secret.rotated', {
      secretId: reference.id,
      name,
      provider: reference.provider,
    });

    logger.info({ name, secretId: reference.id }, 'Secret stored');
    return reference;
  }

  /**
   * Retrieve and decrypt a secret value.
   *
   * @param name - The secret name.
   * @param subject - The subject requesting the secret (for audit logging).
   * @returns The decrypted value, or null if not found.
   */
  async get(name: string, subject: Subject): Promise<string | null> {
    const record = this.secrets.get(name);
    if (!record) {
      logger.warn({ name, subjectId: subject.id }, 'Secret not found');
      return null;
    }

    this.eventBus.emit('secret.accessed', {
      secretId: record.reference.id,
      name,
      subjectId: subject.id,
    });

    logger.info({ name, subjectId: subject.id }, 'Secret accessed');

    const plaintext = await this.encryption.decrypt(
      record.encryptedValue,
      this.encryptionKey,
      record.iv,
      record.tag,
    );

    return plaintext;
  }

  /**
   * Rotate a secret to a new value.
   *
   * @param name - The secret name.
   * @param newValue - The new plaintext value.
   * @returns Updated reference with new rotation timestamp.
   */
  async rotate(name: string, newValue: string): Promise<SecretReference> {
    const { ciphertext, iv, tag } = await this.encryption.encrypt(newValue, this.encryptionKey);
    const existing = this.secrets.get(name);

    const reference: SecretReference = {
      id: existing?.reference.id ?? crypto.randomUUID(),
      name,
      provider: 'secrets-manager',
      lastRotated: new Date(),
      expiresAt: existing?.reference.expiresAt,
    };

    const record: SecretRecord = {
      reference,
      encryptedValue: ciphertext,
      iv,
      tag,
      metadata: existing?.metadata ?? {},
    };

    this.secrets.set(name, record);

    this.eventBus.emit('secret.rotated', {
      secretId: reference.id,
      name,
      provider: reference.provider,
    });

    logger.info({ name, secretId: reference.id }, 'Secret rotated');
    return reference;
  }

  /**
   * Revoke (delete) a secret.
   *
   * @param name - The secret name to revoke.
   */
  async revoke(name: string): Promise<void> {
    const record = this.secrets.get(name);
    if (record) {
      this.secrets.delete(name);
      this.eventBus.emit('secret.leaked', {
        secretId: record.reference.id,
        name,
        action: 'revoked',
      });
      logger.info({ name, secretId: record.reference.id }, 'Secret revoked');
    }
  }

  /**
   * List all stored secrets (metadata only — never returns values).
   *
   * @returns Array of secret references.
   */
  list(): SecretReference[] {
    return Array.from(this.secrets.values()).map((r) => ({ ...r.reference }));
  }

  /**
   * Scan content for potentially leaked secrets.
   *
   * @param content - The content to scan.
   * @returns Array of detected potential secrets with type and severity.
   */
  scanForSecrets(
    content: string,
  ): Array<{ type: string; evidence: string; severity: string }> {
    const findings: Array<{ type: string; evidence: string; severity: string }> = [];

    for (const pattern of SECRET_PATTERNS) {
      // Reset lastIndex for global regexes
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(content)) !== null) {
        findings.push({
          type: pattern.type,
          evidence: match[0].substring(0, 20) + (match[0].length > 20 ? '...' : ''),
          severity: pattern.severity,
        });
      }
    }

    if (findings.length > 0) {
      this.eventBus.emit('secret.leaked', {
        findingCount: findings.length,
        types: findings.map((f) => f.type),
      });
      logger.warn({ findingCount: findings.length }, 'Secrets detected in content');
    }

    return findings;
  }
}
