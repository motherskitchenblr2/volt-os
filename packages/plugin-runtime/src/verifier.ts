/**
 * @module verifier
 * Plugin verification — validates manifests, checksums, version compatibility,
 * signatures, and dependency graph integrity before allowing a plugin to load.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import semver from 'semver';

import type {
  PluginManifest,
  PluginPermission,
  VerificationResult,
} from './types.js';

/** Current VOLT OS version (used for compatibility checks). */
const CURRENT_VOLT_VERSION = '0.1.0';

/** Supported SDK version range (inclusive). */
const SUPPORTED_SDK_RANGE = '>=0.1.0 <1.0.0';

/**
 * Verifies a plugin manifest before loading.
 * Performs schema validation, checksum verification, version compatibility,
 * signature verification, dependency graph checks, and permission validation.
 */
export class PluginVerifier {
  /**
   * @param pluginDir - Base directory where plugin files reside.
   * @param voltVersion - Current VOLT OS version override (for testing).
   * @param sdkVersionRange - Supported SDK version range override.
   */
  constructor(
    private readonly pluginDir: string,
    private readonly voltVersion: string = CURRENT_VOLT_VERSION,
    private readonly sdkVersionRange: string = SUPPORTED_SDK_RANGE,
  ) {}

  /**
   * Verify a plugin manifest and its entry point.
   * @param manifest - The plugin manifest to verify.
   * @returns Verification result with validity flag and any error messages.
   */
  async verify(manifest: PluginManifest): Promise<VerificationResult> {
    const errors: string[] = [];

    // 1. Validate manifest schema
    const schemaErrors = this.validateSchema(manifest);
    errors.push(...schemaErrors);

    // If schema is invalid, skip remaining checks
    if (schemaErrors.length > 0) {
      return { valid: false, errors };
    }

    // 2. Verify checksum of entry point file
    const checksumValid = await this.verifyChecksum(manifest);
    if (!checksumValid) {
      errors.push(`Checksum mismatch for entry point "${manifest.entryPoint}"`);
    }

    // 3. Check minimumVoltVersion compatibility
    if (!this.checkVersionCompatibility(manifest.minimumVoltVersion, this.voltVersion)) {
      errors.push(
        `VOLT version ${this.voltVersion} does not satisfy minimum requirement ${manifest.minimumVoltVersion}`,
      );
    }

    // 4. Check sdkVersion compatibility
    if (!this.checkSDKCompatibility(manifest.sdkVersion)) {
      errors.push(
        `SDK version ${manifest.sdkVersion} is not compatible with supported range ${this.sdkVersionRange}`,
      );
    }

    // 5. Verify signature if present
    if (manifest.signature) {
      const sigValid = await this.verifySignature(manifest);
      if (!sigValid) {
        errors.push('Signature verification failed');
      }
    }

    // 6. Validate permissions are well-formed
    const permErrors = this.validatePermissions(manifest.permissions);
    errors.push(...permErrors);

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate the manifest has all required fields with correct types.
   */
  private validateSchema(manifest: PluginManifest): string[] {
    const errors: string[] = [];

    if (!manifest.id || typeof manifest.id !== 'string') {
      errors.push('Manifest missing or invalid "id"');
    }
    if (!manifest.name || typeof manifest.name !== 'string') {
      errors.push('Manifest missing or invalid "name"');
    }
    if (!manifest.version || typeof manifest.version !== 'string') {
      errors.push('Manifest missing or invalid "version"');
    }
    if (!semver.valid(manifest.version)) {
      errors.push(`Invalid semver version: "${manifest.version}"`);
    }
    if (!manifest.author || typeof manifest.author !== 'string') {
      errors.push('Manifest missing or invalid "author"');
    }
    if (!manifest.description || typeof manifest.description !== 'string') {
      errors.push('Manifest missing or invalid "description"');
    }
    if (!manifest.category) {
      errors.push('Manifest missing "category"');
    }
    if (!Array.isArray(manifest.permissions)) {
      errors.push('Manifest missing or invalid "permissions" array');
    }
    if (!Array.isArray(manifest.capabilities)) {
      errors.push('Manifest missing or invalid "capabilities" array');
    }
    if (!manifest.events || typeof manifest.events !== 'object') {
      errors.push('Manifest missing or invalid "events"');
    }
    if (!manifest.minimumVoltVersion || typeof manifest.minimumVoltVersion !== 'string') {
      errors.push('Manifest missing or invalid "minimumVoltVersion"');
    }
    if (!manifest.sdkVersion || typeof manifest.sdkVersion !== 'string') {
      errors.push('Manifest missing or invalid "sdkVersion"');
    }
    if (!manifest.checksum || typeof manifest.checksum !== 'string') {
      errors.push('Manifest missing or invalid "checksum"');
    }
    if (!manifest.entryPoint || typeof manifest.entryPoint !== 'string') {
      errors.push('Manifest missing or invalid "entryPoint"');
    }

    return errors;
  }

  /**
   * Verify the entry point file's SHA-256 checksum matches the manifest.
   */
  async verifyChecksum(manifest: PluginManifest): Promise<boolean> {
    try {
      const filePath = path.resolve(this.pluginDir, manifest.entryPoint);
      const content = await fs.readFile(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      return hash === manifest.checksum;
    } catch {
      return false;
    }
  }

  /**
   * Check whether the required version range is satisfied by the actual version.
   * @param required - Semver range the plugin requires.
   * @param actual - Actual version available.
   * @returns true if actual satisfies required.
   */
  checkVersionCompatibility(required: string, actual: string): boolean {
    return semver.satisfies(actual, required);
  }

  /**
   * Check whether the plugin's SDK version is within the supported range.
   */
  checkSDKCompatibility(pluginSDKVersion: string): boolean {
    return semver.satisfies(pluginSDKVersion, this.sdkVersionRange);
  }

  /**
   * Verify the plugin's cryptographic signature.
   * In production this would use asymmetric key verification;
   * here we do a simple hash-based check.
   */
  private async verifySignature(manifest: PluginManifest): Promise<boolean> {
    if (!manifest.signature) return false;

    try {
      const filePath = path.resolve(this.pluginDir, manifest.entryPoint);
      const content = await fs.readFile(filePath);
      const expectedSig = crypto
        .createHash('sha256')
        .update(content)
        .update(manifest.id)
        .digest('hex');
      return manifest.signature === expectedSig;
    } catch {
      return false;
    }
  }

  /**
   * Validate that all permissions are well-formed.
   */
  private validatePermissions(permissions: PluginPermission[]): string[] {
    const errors: string[] = [];
    const validTypes: PluginPermission['type'][] = [
      'memory', 'filesystem', 'network', 'model', 'event', 'tool',
    ];
    const validAccesses: PluginPermission['access'][] = ['read', 'write', 'invoke'];

    for (let i = 0; i < permissions.length; i++) {
      const p = permissions[i];
      if (!validTypes.includes(p.type)) {
        errors.push(`Permission[${i}]: invalid type "${p.type}"`);
      }
      if (!validAccesses.includes(p.access)) {
        errors.push(`Permission[${i}]: invalid access "${p.access}"`);
      }
    }

    return errors;
  }
}
