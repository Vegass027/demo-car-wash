/**
 * Shared JWT helpers for /api/* endpoints.
 *
 * Files prefixed with `_` are NOT exposed as Vercel serverless functions —
 * Vercel docs: "Files in the api directory that begin with an underscore
 * will not be treated as API routes."
 *
 * Used by:
 *   - api/telegram-auth.ts
 *   - api/login.ts
 *   - (future) api/link-client-profile.ts, api/upload-receipt.ts
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