/**
 * Shared JWT helpers for /api/* endpoints.
 *
 * Files prefixed with `_` are NOT exposed as Vercel serverless functions —
 * Vercel docs: "Files in the api directory that begin with an underscore
 * will not be treated as API routes."
 *
 * Used by:
 *   - api/telegram-auth.ts (signJwt)
 *   - api/login.ts (signJwt)
 *   - api/link-client-profile.ts (verifyJwt) — added in Phase 1.5
 */

import crypto from 'crypto';

/**
 * Base64URL encoder for JWT (RFC 7515 §2 — base64url without padding).
 */
export function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * HS256 JWT signer (RFC 7519) using built-in crypto.
 * No external dependency — avoids adding `jsonwebtoken` to package.json.
 *
 * Token shape:
 *   header  = base64url({"alg":"HS256","typ":"JWT"})
 *   payload = base64url({...claims})
 *   sig     = base64url(HMAC-SHA256(secret, header + "." + payload))
 *   token   = header + "." + payload + "." + sig
 */
export function signJwt(payload: object, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${base64url(signature)}`;
}

export interface JwtClaims {
  sub?: string;
  role?: string;
  app_role?: 'client' | 'admin' | 'owner';
  profile_id?: string;
  telegram_id?: number;
  iat?: number;
  exp?: number;
}

/**
 * Strict base64url decoder per RFC 4648 §5.
 * - Validates alphabet [A-Za-z0-9_-]+ before any conversion
 * - Applies correct '=' padding based on (length % 4)
 * - Throws on malformed input (caller maps to HTTP 401)
 *
 * Why strict alphabet: a malformed base64url like "abcd===" would otherwise
 * silently decode to garbage JSON, causing confusing parse errors.
 */
function decodeBase64Url(input: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) {
    throw new Error('Invalid base64url: non-alphabet character');
  }
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

/**
 * Verify HS256 JWT with strict algorithm allow-list.
 *
 * Throws on:
 *   - not 3 parts (malformed token)
 *   - non-HS256 algorithm in header (alg=none → algorithm confusion attack)
 *   - missing typ=JWT
 *   - non-base64url alphabet
 *   - invalid signature (constant-time compare)
 *   - malformed JSON in header or payload
 *   - expired (exp < now)
 *
 * Caller is responsible for app_role check, profile_id presence, etc.
 */
export function verifyJwt(token: string, secret: string): JwtClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token: not 3 parts');
  }
  const [encodedHeader, encodedPayload, encodedSig] = parts;

  // 1. Decode + parse header. Allow-list {alg: HS256, typ: JWT}.
  //    Prevents alg-confusion: HS512/RS256/none attacks.
  let header: { alg?: string; typ?: string };
  let headerBytes: Buffer;
  try {
    headerBytes = decodeBase64Url(encodedHeader);
    header = JSON.parse(headerBytes.toString('utf8'));
  } catch {
    throw new Error('Malformed JWT header');
  }
  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new Error(
      `Unsupported JWT algorithm: alg=${header.alg ?? '?'} typ=${header.typ ?? '?'}`
    );
  }

  // 2. Verify signature (constant-time compare via timingSafeEqual).
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  let actualSig: Buffer;
  try {
    actualSig = decodeBase64Url(encodedSig);
  } catch {
    throw new Error('Malformed JWT signature');
  }
  if (
    actualSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(actualSig, expectedSig)
  ) {
    throw new Error('Invalid signature');
  }

  // 3. Decode + parse payload (also strict base64url + JSON).
  let claims: JwtClaims;
  try {
    claims = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8'));
  } catch {
    throw new Error('Malformed JWT payload');
  }

  // 4. Expiry check.
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) {
    throw new Error('Token expired');
  }
  return claims;
}