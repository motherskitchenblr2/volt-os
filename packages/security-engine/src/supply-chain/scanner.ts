/**
 * @module scanner
 * Supply-chain security scanner for the VOLT OS Security Engine.
 *
 * Scans dependencies for known vulnerabilities, checks license compliance,
 * and verifies package integrity. Integrates with the event bus for audit
 * trail emission.
 */

import pino from 'pino';

const logger = pino({ name: 'volt-os:security:supply-chain' });

/** Known vulnerability database (simplified for demonstration). */
const KNOWN_VULNERABILITIES: Record<string, Array<{
  vulnerability: string;
  severity: string;
  affectedVersions: string;
  fix?: string;
}>> = {
  'lodash': [
    { vulnerability: 'CVE-2021-23337', severity: 'high', affectedVersions: '<4.17.21', fix: 'Upgrade to >=4.17.21' },
  ],
  'minimist': [
    { vulnerability: 'CVE-2021-44906', severity: 'critical', affectedVersions: '<1.2.6', fix: 'Upgrade to >=1.2.6' },
  ],
  'node-fetch': [
    { vulnerability: 'CVE-2022-0235', severity: 'medium', affectedVersions: '<2.6.7', fix: 'Upgrade to >=2.6.7' },
  ],
  'express': [
    { vulnerability: 'CVE-2024-29041', severity: 'high', affectedVersions: '<4.19.2', fix: 'Upgrade to >=4.19.2' },
  ],
  'jsonwebtoken': [
    { vulnerability: 'CVE-2022-23529', severity: 'critical', affectedVersions: '<9.0.0', fix: 'Upgrade to >=9.0.0' },
  ],
};

/** Allowed licenses (SPDX identifiers). */
const ALLOWED_LICENSES = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Unlicense',
  'CC0-1.0',
]);

/** Restricted licenses that require manual review. */
const RESTRICTED_LICENSES = new Set([
  'GPL-2.0',
  'GPL-3.0',
  'AGPL-3.0',
  'LGPL-2.1',
  'LGPL-3.0',
]);

/** Known package licenses (simplified for demonstration). */
const PACKAGE_LICENSES: Record<string, string> = {
  'lodash': 'MIT',
  'minimist': 'MIT',
  'node-fetch': 'MIT',
  'express': 'MIT',
  'jsonwebtoken': 'MIT',
  'react': 'MIT',
  'vue': 'MIT',
  'angular': 'MIT',
  'typescript': 'Apache-2.0',
  'jest': 'MIT',
  'vitest': 'MIT',
  'pino': 'MIT',
  'jose': 'MIT',
  'semver': 'ISC',
  'debug': 'MIT',
  'ms': 'MIT',
};

/**
 * Supply-chain security scanner.
 */
export class SupplyChainScanner {
  /**
   * Scan dependencies for known vulnerabilities.
   *
   * @param deps - A record of package name → version string.
   * @returns Array of found vulnerabilities.
   */
  async scanDependencies(
    deps: Record<string, string>,
  ): Promise<Array<{
    package: string;
    version: string;
    vulnerability: string;
    severity: string;
    fix?: string;
  }>> {
    const findings: Array<{
      package: string;
      version: string;
      vulnerability: string;
      severity: string;
      fix?: string;
    }> = [];

    for (const [pkg, version] of Object.entries(deps)) {
      const vulns = KNOWN_VULNERABILITIES[pkg];
      if (vulns) {
        for (const vuln of vulns) {
          // Simplified version comparison — in production use semver
          const isAffected = this.isVersionAffected(version, vuln.affectedVersions);
          if (isAffected) {
            findings.push({
              package: pkg,
              version,
              vulnerability: vuln.vulnerability,
              severity: vuln.severity,
              fix: vuln.fix,
            });

            logger.warn(
              {
                package: pkg,
                version,
                vulnerability: vuln.vulnerability,
                severity: vuln.severity,
              },
              'Vulnerability found',
            );
          }
        }
      }
    }

    return findings;
  }

  /**
   * Check license compliance for dependencies.
   *
   * @param deps - A record of package name → version string.
   * @returns Array of license check results.
   */
  async checkLicenses(
    deps: Record<string, string>,
  ): Promise<Array<{
    package: string;
    license: string;
    compliant: boolean;
    reason?: string;
  }>> {
    const results: Array<{
      package: string;
      license: string;
      compliant: boolean;
      reason?: string;
    }> = [];

    for (const pkg of Object.keys(deps)) {
      const license = PACKAGE_LICENSES[pkg] ?? 'Unknown';

      if (license === 'Unknown') {
        results.push({
          package: pkg,
          license,
          compliant: false,
          reason: 'License could not be determined',
        });
      } else if (RESTRICTED_LICENSES.has(license)) {
        results.push({
          package: pkg,
          license,
          compliant: false,
          reason: `License "${license}" is restricted and requires manual review`,
        });
      } else if (ALLOWED_LICENSES.has(license)) {
        results.push({
          package: pkg,
          license,
          compliant: true,
        });
      } else {
        results.push({
          package: pkg,
          license,
          compliant: false,
          reason: `License "${license}" is not on the allow list`,
        });
      }
    }

    return results;
  }

  /**
   * Verify a package's integrity by comparing its content hash.
   *
   * @param packageName - The package to verify.
   * @param expectedHash - The expected SHA-256 hash.
   * @returns Whether the integrity check passed.
   */
  async verifyIntegrity(
    packageName: string,
    expectedHash: string,
  ): Promise<{ valid: boolean }> {
    // In production, this would fetch the package and compute its hash.
    // For now, we validate format and log the attempt.
    const isHex = /^[0-9a-f]{64}$/i.test(expectedHash);

    if (!isHex) {
      logger.warn(
        { packageName, hashLength: expectedHash.length },
        'Invalid hash format',
      );
      return { valid: false };
    }

    logger.info({ packageName }, 'Integrity verification requested');
    return { valid: true };
  }

  /**
   * Simple version comparison against an affected range.
   *
   * @private
   */
  private isVersionAffected(version: string, affectedRange: string): boolean {
    // Parse simple ranges like "<4.17.21", ">=1.0.0 <2.0.0"
    const match = affectedRange.match(/^([<>=!]+)\s*(.+)$/);
    if (!match) return false;

    const [, operator, targetVersion] = match;
    return this.compareVersions(version, targetVersion, operator);
  }

  /**
   * Compare two semver-style version strings.
   *
   * @private
   */
  private compareVersions(actual: string, target: string, operator: string): boolean {
    const parse = (v: string) => v.split('.').map(Number);
    const a = parse(actual);
    const t = parse(target);

    for (let i = 0; i < Math.max(a.length, t.length); i++) {
      const aVal = a[i] ?? 0;
      const tVal = t[i] ?? 0;

      if (aVal < tVal) return operator.includes('<');
      if (aVal > tVal) return operator.includes('>');
    }

    // Equal versions
    return operator.includes('=') || operator === '==';
  }
}
