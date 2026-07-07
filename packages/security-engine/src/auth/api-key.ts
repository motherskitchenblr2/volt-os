/**
 * @module api-key
 * API-key-based authentication for the VOLT OS Security Engine.
 *
 * API keys are stored as salted SHA-256 hashes; the plaintext key is
 * returned to the caller only once at generation time. All validation
 * and revocation operations work against the hash.
 */

import { randomBytes } from 'node:crypto';
import pino from 'pino';
import type {
  AuthResult,
  SecretReference,
  Subject,
  APIKeyRecord,
  APIKeyStore,
} from '../types.js';
import { EncryptionService } from '../secrets/encryption.js';

const logger = pino({ name: 'volt-os:security:api-key' });

/** Length of the generated API key in bytes (before hex encoding). */
const KEY_BYTE_LENGTH = 32;

/** Prefix for all generated API keys. */
const KEY_PREFIX = 'volt_';

/**
 * API key authentication provider.
 *
 * Generates, validates, and revokes API keys using a pluggable store
 * backend. Keys are hashed before storage; plaintext is returned to
 * the caller only at creation time.
 */
export class APIKeyAuth {
  private readonly store: APIKeyStore;
  private readonly encryption: EncryptionService;

  /**
   * Create a new APIKeyAuth instance.
   *
   * @param options - Configuration.
   * @param options.store - The backend store for API key records.
   */
  constructor(options: { store: APIKeyStore }) {
    this.store = options.store;
    this.encryption = new EncryptionService();
  }

  /**
   * Validate an API key string.
   *
   * @param key - The plaintext API key to validate.
   * @returns An AuthResult indicating success or failure.
   */
  async validate(key: string): Promise<AuthResult> {
    if (!key || key.length === 0) {
      return {
        authenticated: false,
        subject: null,
        method: 'api_key',
        error: 'API key is empty',
      };
    }

    const keyHash = this.encryption.hash(key);
    const record = await this.store.getByHash(keyHash);

    if (!record) {
      logger.warn('API key validation failed: key not found');
      return {
        authenticated: false,
        subject: null,
        method: 'api_key',
        error: 'Invalid API key',
      };
    }

    if (!record.active) {
      logger.warn({ keyId: record.id }, 'API key validation failed: key is inactive');
      return {
        authenticated: false,
        subject: record.subject,
        method: 'api_key',
        error: 'API key has been revoked',
      };
    }

    // Update last-used timestamp (fire-and-forget for performance)
    record.lastUsedAt = new Date();

    logger.info({ keyId: record.id, subjectId: record.subject.id }, 'API key validated successfully');

    return {
      authenticated: true,
      subject: record.subject,
      method: 'api_key',
    };
  }

  /**
   * Generate a new API key for a subject.
   *
   * The plaintext key is returned once; it cannot be retrieved later.
   *
   * @param subject - The subject the key belongs to.
   * @param name - A human-readable name for this key.
   * @returns The plaintext key and a metadata reference.
   */
  async generate(
    subject: Subject,
    name: string,
  ): Promise<{ key: string; reference: SecretReference }> {
    const rawBytes = randomBytes(KEY_BYTE_LENGTH);
    const key = `${KEY_PREFIX}${rawBytes.toString('hex')}`;
    const keyHash = this.encryption.hash(key);

    const record: APIKeyRecord = {
      id: crypto.randomUUID(),
      keyHash,
      name,
      subject,
      createdAt: new Date(),
      active: true,
    };

    await this.store.store(record);

    const reference: SecretReference = {
      id: record.id,
      name,
      provider: 'api-key',
      lastRotated: record.createdAt,
    };

    logger.info({ keyId: record.id, subjectId: subject.id }, 'API key generated');

    return { key, reference };
  }

  /**
   * Revoke an API key by its record ID.
   *
   * @param keyId - The unique identifier of the API key record.
   */
  async revoke(keyId: string): Promise<void> {
    await this.store.deactivate(keyId);
    logger.info({ keyId }, 'API key revoked');
  }
}
