/**
 * /api/link-client-profile
 *
 * Phase 1.5 of carwash-full-security-lockdown-plan.md.
 *
 * CLIENT-ONLY endpoint. Replaces 2 anon requests (createClient +
 * anon UPDATE profile_id) in Client*Wrapper auto-create flow.
 *
 * NOT for admin/owner — BookingWizard.tsx stays on anon-INSERT until
 * separate staff-client-create phase. admin/owner → 403.
 *
 * Flow:
 *   1. POST { full_name, phone, notes? } with Authorization: Bearer <jwt>
 *   2. Verify JWT (HS256 allow-list, strict base64url, alg confusion safe)
 *   3. STRICT: app_role === 'client' (admin/owner → 403); profile_id from JWT only
 *   4. service_role: SELECT existing row by claims.profile_id
 *   5. State-based validation:
 *        - row missing + phone empty   → HTTP 400 (placeholder path is /api/telegram-auth)
 *        - row missing + full_name empty → HTTP 400
 *        - row exists + input phone empty → keep existing phone (don't blank out)
 *        - row exists + input phone non-empty + conflict → HTTP 400
 *   6. service_role upsert with onConflict: 'profile_id'
 *   7. Return client row
 *
 * Why empty phone is NOT a valid new-client value:
 *   clients_phone_unique UNIQUE allows only ONE row with phone=''.
 *   /api/telegram-auth already creates that one placeholder on first
 *   Mini App open. Any new client with phone='' would hit the UNIQUE
 *   constraint (or pre-check) and fail.
 */

import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from './_lib/jwt.js';

export const config = { maxDuration: 10 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Authorization
  const authHeader = req.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.slice(7);

  // 2. JWT verify (all errors → 401, not 500)
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'SUPABASE_JWT_SECRET not configured' });
  }
  let claims;
  try {
    claims = verifyJwt(token, secret);
  } catch (err: any) {
    console.error('[link-client-profile] verifyJwt failed:', err?.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // 3. STRICT: client-only
  if (claims.app_role !== 'client') {
    return res.status(403).json({
      error: 'Telegram Mini App is for client role only',
    });
  }
  if (!claims.profile_id) {
    return res.status(403).json({ error: 'Token missing profile_id claim' });
  }

  // 4. Body validation (length guards to avoid DoS / huge payloads)
  const { full_name, phone, notes } = req.body || {};
  if (typeof full_name !== 'string' || typeof phone !== 'string') {
    return res.status(400).json({ error: 'full_name and phone required' });
  }
  if (full_name.length > 200 || phone.length > 50) {
    return res.status(400).json({ error: 'full_name or phone exceeds max length' });
  }
  if (notes !== undefined && typeof notes !== 'string') {
    return res.status(400).json({ error: 'notes must be a string' });
  }
  if (typeof notes === 'string' && notes.length > 2000) {
    return res.status(400).json({ error: 'notes too long' });
  }

  const trimmedFullName = full_name.trim();
  const trimmedPhone = phone.trim();

  // 5. Lookup existing row by claims.profile_id
  const { data: existingClient, error: lookupErr } = await supabaseAdmin
    .from('clients')
    .select('id, full_name, phone')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();

  if (lookupErr) {
    console.error('[link-client-profile] lookup error:', lookupErr);
    return res.status(500).json({ error: 'Lookup failed' });
  }

  const isNew = !existingClient;
  const inputPhoneEmpty = trimmedPhone === '';
  const inputNameEmpty = trimmedFullName === '';

  // 6a. INSERT requires non-empty full_name AND non-empty phone
  if (isNew && inputPhoneEmpty) {
    return res.status(400).json({
      error:
        'Phone is required when creating a new client. ' +
        'Open Mini App via Telegram first — /api/telegram-auth creates ' +
        'a placeholder row that you can update via this endpoint.',
    });
  }
  if (isNew && inputNameEmpty) {
    return res.status(400).json({
      error: 'full_name is required when creating a new client',
    });
  }

  // 6b. UPDATE: don't blank out existing non-empty values if user sent ''
  const effectivePhone = isNew
    ? trimmedPhone                            // INSERT: non-empty (validated)
    : (inputPhoneEmpty && existingClient.phone !== ''
        ? existingClient.phone                 // UPDATE: keep existing non-empty
        : trimmedPhone);                        // UPDATE: apply new (may be '' if was '')

  const effectiveFullName = isNew
    ? trimmedFullName                          // INSERT: non-empty (validated)
    : (inputNameEmpty && existingClient.full_name !== ''
        ? existingClient.full_name              // UPDATE: keep existing non-empty
        : trimmedFullName);                      // UPDATE: apply new

  // 7. Pre-check phone uniqueness — whenever effectivePhone DIFFERS from
  //    existing phone. Runs for both INSERT (existingClient?.phone is undefined,
  //    so any change triggers) and UPDATE (only if value actually changes).
  //    Empty phone IS checked: catches the "another profile already holds
  //    the placeholder phone=''" race (could happen via DB admin edits or
  //    future schema changes). The clients_phone_unique UNIQUE constraint
  //    is the final race protection (caught in 23505 below).
  if (effectivePhone !== existingClient?.phone) {
    const { data: phoneConflict } = await supabaseAdmin
      .from('clients')
      .select('id, profile_id')
      .eq('phone', effectivePhone)
      .neq('profile_id', claims.profile_id)
      .maybeSingle();

    if (phoneConflict) {
      console.warn(
        '[link-client-profile] phone conflict:',
        { phone: effectivePhone, claimed_by: phoneConflict.profile_id,
          attempted_by: claims.profile_id }
      );
      return res.status(400).json({
        error: 'Phone already used by another client',
      });
    }
  }

  // 8. service_role upsert with onConflict: 'profile_id'
  const { data, error } = await supabaseAdmin
    .from('clients')
    .upsert(
      {
        profile_id: claims.profile_id,
        full_name: effectiveFullName,
        phone: effectivePhone,
        notes: typeof notes === 'string' ? notes.trim() || null : null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('[link-client-profile] upsert error:', error);
    // Postgres 23505 = unique_violation (race between pre-check and upsert)
    if (error.code === '23505') {
      return res.status(400).json({
        error: 'Phone already used by another client',
      });
    }
    return res.status(500).json({ error: 'Failed to upsert client' });
  }

  return res.status(200).json({ client: data });
}