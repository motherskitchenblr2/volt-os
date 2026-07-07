/**
 * @module encryption
 * AES-256-GCM encryption/decryption utilities for the VOLT OS Security Engine.
 *
 * All secrets are encrypted at rest using AES-256-GCM with random IVs and
 * authentication tags. SHA-256 is used for hashing where one-way integrity
 * checks are needed (e.g. API key storage).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Fixed sizes for AES-256-GCM. */
const AES_KEY_LENGTH = 32;
const AES_IV_LENGTH = 12;
const AES_TAG_LENGTH = 16;

/**
 * Encryption service providing AES-256-GCM encryption/decryption and
 * SHA-256 hashing utilities.
 */
export class EncryptionService {
  /**
   * Encrypt plaintext using AES-256-GCM.
   *
   * @param plaintext - The string to encrypt.
   * @param key - A 32-byte hex-encoded encryption key.
   * @returns An object containing the base64-encoded ciphertext, IV, and auth tag.
   */
  async encrypt(
    plaintext: string,
    key: string,
  ): Promise<{ ciphertext: string; iv: string; tag: string }> {
    const keyBuffer = Buffer.from(key, 'hex');
    if (keyBuffer.length !== AES_KEY_LENGTH) {
      throw new Error(`Encryption key must be ${AES_KEY_LENGTH} bytes (${AES_KEY_LENGTH * 2} hex chars)`);
    }

    const iv = randomBytes(AES_IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv, {
      authTagLength: AES_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  /**
   * Decrypt ciphertext that was encrypted with AES-256-GCM.
   *
   * @param ciphertext - The base64-encoded ciphertext.
   * @param key - The 32-byte hex-encoded encryption key.
   * @param iv - The base64-encoded initialization vector.
   * @param tag - The base64-encoded authentication tag.
   * @returns The decrypted plaintext string.
   */
  async decrypt(
    ciphertext: string,
    key: string,
    iv: string,
    tag: string,
  ): Promise<string> {
    const keyBuffer = Buffer.from(key, 'hex');
    if (keyBuffer.length !== AES_KEY_LENGTH) {
      throw new Error(`Encryption key must be ${AES_KEY_LENGTH} bytes (${AES_KEY_LENGTH * 2} hex chars)`);
    }

    const ivBuffer = Buffer.from(iv, 'base64');
    const tagBuffer = Buffer.from(tag, 'base64');
    const ciphertextBuffer = Buffer.from(ciphertext, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer, {
      authTagLength: AES_TAG_LENGTH,
    });
    decipher.setAuthTag(tagBuffer);

    const decrypted = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
    return decrypted.toString('utf8');
  }

  /**
   * Produce a SHA-256 hash of the input data.
   *
   * @param data - The string to hash.
   * @returns Hex-encoded SHA-256 hash.
   */
  hash(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Generate a cryptographically secure random key.
   *
   * @param length - Key length in bytes (default: 32).
   * @returns Hex-encoded random key.
   */
  generateKey(length: number = AES_KEY_LENGTH): string {
    return randomBytes(length).toString('hex');
  }
}
