/**
 * /api/login
 *
 * Phase 1 of carwash-full-security-lockdown-plan.md (Phase 1.3).
 * Staff authentication via login/password.
 *
 * Flow:
 *   1. POST { login, password }
 *   2. Length guards (avoid bcrypt DoS via oversized input)
 *   3. Call verify_password RPC via service_role
 *      - RPC is SECURITY DEFINER + restricted to admin/owner in WHERE clause
 *      - returns success=false for both wrong login AND wrong password
 *        (no info disclosure via enumeration)
 *   4. Log EVERY attempt to auth_logs (success and failure)
 *   5. On success: sign JWT (HS256, 12h TTL) with app_role='admin'|'owner'
 *   6. Return { token, profile_id, app_role, full_name }
 *
 * Replaces direct supabase.rpc('verify_password') calls from Login.tsx
 * in Phase 1.6. Until then, Login.tsx continues using the old path.
 */

import { createClient } from '@supabase/supabase-js';
import { signJwt } from './_lib/jwt.js';

export const config = {
  maxDuration: 10, // 10s — 1 RPC + 1 INSERT + 1 JWT sign
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getClientIp(req: any): string {
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) {
    const first = Array.isArray(xff) ? xff[0] : String(xff).split(',')[0];
    return first.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function getUserAgent(req: any): string {
  return req.headers?.['user-agent'] || 'unknown';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body: any;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { login, password } = body || {};
  if (
    typeof login !== 'string' ||
    typeof password !== 'string' ||
    !login ||
    !password
  ) {
    return res.status(400).json({ error: 'login and password required' });
  }

  // Length guards — profiles.login is VARCHAR(50); reject oversized input
  // before hitting bcrypt (verify_password runs pgcrypt inside the RPC).
  // Also rejects attempts to bloat auth_logs INSERT payload.
  if (login.length > 50 || password.length > 200) {
    await supabaseAdmin.from('auth_logs').insert({
      auth_method: 'password',
      success: false,
      ip_address: getClientIp(req),
      user_agent: getUserAgent(req),
      error_message: `oversized input: login=${login.length}c pwd=${password.length}c`,
    });
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  // 1. Call verify_password RPC (service_role bypasses RLS; RPC is SECURITY DEFINER)
  let rpcResult: any = null;
  let rpcError: any = null;
  try {
    const { data, error } = await supabaseAdmin.rpc('verify_password', {
      p_login: login,
      p_password: password,
    });
    rpcResult = data;
    rpcError = error;
  } catch (e: any) {
    rpcError = e;
  }

  const profile = Array.isArray(rpcResult) ? rpcResult[0] : null;
  const roleOk =
    !!profile?.success &&
    (profile?.role === 'admin' || profile?.role === 'owner');

  // 2. Log EVERY attempt. success = roleOk (not "profile found") so logs
  //    don't leak which logins exist. error_message carries length only,
  //    never the login itself, so credentials don't end up in Vercel logs.
  const { error: logError } = await supabaseAdmin.from('auth_logs').insert({
    profile_id: roleOk ? profile.id : null,
    auth_method: 'password',
    telegram_id: null,
    ip_address: getClientIp(req),
    user_agent: getUserAgent(req),
    success: roleOk,
    error_message: roleOk
      ? null
      : rpcError?.message || `invalid credentials for login=<${login.length}chars>`,
  });
  if (logError) {
    console.error('[login] auth_logs insert error:', logError);
  }

  // 3. RPC-level hard failure (DB unreachable) → 500 (don't expose details)
  if (rpcError && !profile) {
    return res.status(500).json({ error: 'Authentication service unavailable' });
  }

  // 4. Wrong credentials OR right credentials but role not staff → same 401.
  //    No info disclosure: doesn't reveal "account exists but is a client".
  if (!roleOk) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  // 5. Sign JWT
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return res.status(500).json({
      error: 'SUPABASE_JWT_SECRET not configured in Vercel env',
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = signJwt(
    {
      sub: profile.id,
      role: 'authenticated',
      app_role: profile.role,
      profile_id: profile.id,
      iat: now,
      exp: now + 43200, // 12 hours
    },
    secret
  );

  // Best-effort: update last_auth_method on the profile. Failure here doesn't
  // affect auth outcome — staff still gets their JWT. Logged for forensics.
  const { error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update({ last_auth_method: 'password' })
    .eq('id', profile.id);
  if (updateErr) {
    console.error('[login] last_auth_method update error:', updateErr);
  }

  return res.status(200).json({
    token,
    profile_id: profile.id,
    app_role: profile.role,
    full_name: profile.full_name,
  });
}