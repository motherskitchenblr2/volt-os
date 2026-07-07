/**
 * @module jwt
 * JWT-based authentication for the VOLT OS Security Engine.
 *
 * Uses the `jose` library for standards-compliant JWT creation and
 * verification. Supports token revocation, expiration tracking, and
 * structured audit logging via the event bus.
 */

import { SignJWT, jwtVerify, type JWTHeaderParameters } from 'jose';
import pino from 'pino';
import type { AuthResult, Subject } from '../types.js';

const logger = pino({ name: 'volt-os:security:jwt' });

/** Internal structure of a VOLT OS JWT payload. */
interface JWTPayload {
  sub: string;
  type: Subject['type'];
  roles: string[];
  permissions: Array<{ resource: string; action: string; effect: 'allow' | 'deny' }>;
  metadata: Record<string, unknown>;
}

/**
 * JWT-based authentication provider.
 *
 * Handles issuance, verification, and revocation of JWT tokens.
 * Revoked token IDs are tracked in an in-memory set; production
 * deployments should back this with a persistent store.
 */
export class JWTAuth {
  private readonly secret: Uint8Array;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly revokedTokens = new Set<string>();

  /**
   * Create a new JWTAuth instance.
   *
   * @param options - Configuration options.
   * @param options.secret - HMAC secret for signing (at least 32 bytes).
   * @param options.issuer - Token issuer claim (default: 'volt-os').
   * @param options.audience - Token audience claim (default: 'volt-os-api').
   */
  constructor(options: { secret: string; issuer?: string; audience?: string }) {
    this.secret = new TextEncoder().encode(options.secret);
    this.issuer = options.issuer ?? 'volt-os';
    this.audience = options.audience ?? 'volt-os-api';
  }

  /**
   * Issue a signed JWT for the given subject.
   *
   * @param subject - The subject to issue the token for.
   * @param expiresInSeconds - Token lifetime in seconds (default: 3600).
   * @returns The signed JWT string.
   */
  async issue(subject: Subject, expiresInSeconds: number = 3600): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: subject.id,
      type: subject.type,
      roles: subject.roles,
      permissions: subject.permissions.map((p) => ({
        resource: p.resource,
        action: p.action,
        effect: p.effect,
      })),
      metadata: subject.metadata,
    };

    const header: JWTHeaderParameters = { alg: 'HS256' };

    const token = await new SignJWT(payload as unknown as Record<string, unknown>)
      .setProtectedHeader(header)
      .setIssuedAt(now)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setExpirationTime(`${expiresInSeconds}s`)
      .setJti(crypto.randomUUID())
      .sign(this.secret);

    logger.info({ subjectId: subject.id, expiresIn: expiresInSeconds }, 'JWT issued');
    return token;
  }

  /**
   * Verify a JWT and return an authentication result.
   *
   * @param token - The JWT string to verify.
   * @returns An AuthResult with the authenticated subject or error details.
   */
  async verify(token: string): Promise<AuthResult> {
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
      });

      // Check revocation
      const jti = payload['jti'];
      if (typeof jti === 'string' && this.revokedTokens.has(jti)) {
        logger.warn({ jti }, 'Attempted use of revoked JWT');
        return {
          authenticated: false,
          subject: null,
          method: 'jwt',
          error: 'Token has been revoked',
        };
      }

      const sub = payload['sub'];
      if (typeof sub !== 'string') {
        return {
          authenticated: false,
          subject: null,
          method: 'jwt',
          error: 'Invalid subject claim',
        };
      }

      const roles = Array.isArray(payload['roles'])
        ? (payload['roles'] as string[])
        : [];

      const rawPermissions = Array.isArray(payload['permissions'])
        ? (payload['permissions'] as Array<Record<string, unknown>>)
        : [];

      const permissions = rawPermissions.map((p) => ({
        resource: typeof p['resource'] === 'string' ? p['resource'] : '*',
        action: typeof p['action'] === 'string' ? p['action'] : '*',
        effect: (p['effect'] === 'deny' ? 'deny' : 'allow') as 'allow' | 'deny',
      }));

      const meta = typeof payload['metadata'] === 'object' && payload['metadata'] !== null
        ? (payload['metadata'] as Record<string, unknown>)
        : {};

      const subjectType = typeof payload['type'] === 'string'
        ? (payload['type'] as Subject['type'])
        : 'user';

      const subject: Subject = {
        id: sub,
        type: subjectType,
        roles,
        permissions,
        metadata: meta,
      };

      const exp = payload['exp'];
      const expiresAt = typeof exp === 'number' ? new Date(exp * 1000) : undefined;

      logger.info({ subjectId: sub, alg: protectedHeader.alg }, 'JWT verified successfully');

      return {
        authenticated: true,
        subject,
        method: 'jwt',
        expiresAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.warn({ error: message }, 'JWT verification failed');
      return {
        authenticated: false,
        subject: null,
        method: 'jwt',
        error: message,
      };
    }
  }

  /**
   * Revoke a JWT by its JTI (token ID).
   *
   * @param tokenId - The JTI claim of the token to revoke.
   */
  async revoke(tokenId: string): Promise<void> {
    this.revokedTokens.add(tokenId);
    logger.info({ tokenId }, 'JWT revoked');
  }

  /**
   * Check whether a token has been revoked.
   *
   * @param tokenId - The JTI claim to check.
   * @returns True if the token is revoked.
   */
  async isRevoked(tokenId: string): Promise<boolean> {
    return this.revokedTokens.has(tokenId);
  }
}
