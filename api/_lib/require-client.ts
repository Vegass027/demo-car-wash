/**
 * /api/_lib/require-client.ts — single JWT guard for all client endpoints.
 *
 * Why one place: 7 client endpoints must not duplicate JWT verification,
 * role check, and error mapping. If we ever change the auth shape
 * (e.g. rotate signing keys, add a new role), this is the only file to edit.
 *
 * Pattern:
 *   const guard = await requireClient(req);
 *   if ('errorRes' in guard) return res.status(guard.errorRes.status).json(guard.errorRes.body);
 *   const { claims } = guard;
 *   // claims.profile_id is guaranteed uuid-shaped, claims.app_role is 'client'
 */

import { verifyJwt } from './jwt.js';

export interface ClientClaims {
  profile_id: string;
  app_role: 'client';
  full_name?: string;
  telegram_id?: number;
  exp?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GuardResult =
  | { claims: ClientClaims }
  | { errorRes: { status: number; body: { error: string; detail?: string } } };

/**
 * Extract Bearer token, verify HS256, enforce app_role='client' AND
 * uuid-shape on profile_id. Returns either a usable claims object or a
 * ready-to-send error response.
 *
 * Mapping:
 *   - missing/malformed Authorization header  → 401
 *   - verifyJwt throws                       → 401 (does not leak verifier detail)
 *   - claims.app_role !== 'client'           → 403
 *   - missing/non-uuid profile_id            → 403
 *   - missing SUPABASE_JWT_SECRET            → 500
 */
export async function requireClient(req: any): Promise<GuardResult> {
  const authHeader = req?.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { errorRes: { status: 401, body: { error: 'missing_authorization' } } };
  }
  const token = authHeader.slice(7);
  if (!token) {
    return { errorRes: { status: 401, body: { error: 'missing_token' } } };
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return {
      errorRes: { status: 500, body: { error: 'server_misconfigured', detail: 'jwt_secret_missing' } },
    };
  }

  let claims: any;
  try {
    claims = verifyJwt(token, secret);
  } catch (err: any) {
    // All verifier errors → 401, do not leak which check failed (timing/clarity)
    console.error('[require-client] verifyJwt failed:', err?.message);
    return { errorRes: { status: 401, body: { error: 'invalid_or_expired_token' } } };
  }

  if (claims?.app_role !== 'client') {
    return {
      errorRes: { status: 403, body: { error: 'wrong_role', detail: 'client_role_required' } },
    };
  }

  const profile_id = claims?.profile_id;
  if (typeof profile_id !== 'string' || !UUID_RE.test(profile_id)) {
    return {
      errorRes: {
        status: 403,
        body: { error: 'invalid_claims', detail: 'profile_id_missing_or_not_uuid' },
      },
    };
  }

  return {
    claims: {
      profile_id,
      app_role: 'client',
      full_name: typeof claims.full_name === 'string' ? claims.full_name : undefined,
      telegram_id: typeof claims.telegram_id === 'number' ? claims.telegram_id : undefined,
      exp: typeof claims.exp === 'number' ? claims.exp : undefined,
    },
  };
}
