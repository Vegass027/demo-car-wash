/**
 * /api/_lib/require-staff.ts — single JWT guard for staff (admin/owner) endpoints.
 *
 * Phase 2 / Slice #3a (staff client/car/org writes).
 *
 * Mirrors api/_lib/require-client.ts in shape — every staff endpoint
 * must NOT duplicate JWT verification or role check. If we ever change
 * the auth shape (rotate signing keys, add a new role), this is the only
 * file to edit.
 *
 * Pattern:
 *   const guard = await requireStaff(req);
 *   if ('errorRes' in guard) return res.status(guard.errorRes.status).json(guard.errorRes.body);
 *   const { claims } = guard;
 *   // claims.profile_id is guaranteed uuid, claims.app_role ∈ {'admin','owner'}
 */

import { verifyJwt } from './jwt.js';

export interface StaffClaims {
  profile_id: string;
  app_role: 'admin' | 'owner';
  full_name?: string;
  exp?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StaffGuardResult =
  | { claims: StaffClaims }
  | { errorRes: { status: number; body: { error: string; detail?: string } } };

/**
 * Extract Bearer token, verify HS256, enforce app_role ∈ {'admin', 'owner'}
 * AND uuid-shape on profile_id. Returns either a usable claims object or
 * a ready-to-send error response.
 *
 * Mapping:
 *   - missing/malformed Authorization header → 401
 *   - verifyJwt throws                      → 401
 *   - claims.app_role ∉ {admin, owner}      → 403
 *   - missing/non-uuid profile_id           → 403
 *   - missing SUPABASE_JWT_SECRET           → 500
 */
export async function requireStaff(req: any): Promise<StaffGuardResult> {
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
    console.error('[require-staff] verifyJwt failed:', err?.message);
    return { errorRes: { status: 401, body: { error: 'invalid_or_expired_token' } } };
  }

  const role = claims?.app_role;
  if (role !== 'admin' && role !== 'owner') {
    return {
      errorRes: { status: 403, body: { error: 'wrong_role', detail: 'staff_role_required' } },
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
      app_role: role,
      full_name: typeof claims.full_name === 'string' ? claims.full_name : undefined,
      exp: typeof claims.exp === 'number' ? claims.exp : undefined,
    },
  };
}
