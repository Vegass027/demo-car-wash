/**
 * /api/telegram-auth
 *
 * Phase 1 of carwash-full-security-lockdown-plan.md
 * Verifies Telegram Mini App initData via HMAC-SHA256 (per official Telegram spec),
 * looks up (or creates) the user profile, and issues a JWT signed with
 * SUPABASE_JWT_SECRET.
 *
 * Existing /api/*.ts files are untouched. Old login flow continues to work
 * via initDataUnsafe in App.tsx — this endpoint is a parallel path that
 * only takes effect once Login.tsx / Client*Wrapper.tsx are switched to it.
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 10, // 10 seconds — HMAC + 1-2 DB queries
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Verify Telegram Mini App initData per official spec:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 *   secret_key = HMAC-SHA256(bot_token, "WebAppData")
 *   computed   = HMAC-SHA256(secret_key, data_check_string)
 *   data_check_string = sorted "key=value" pairs joined by "\n", with `hash` excluded
 *
 * Rejects if:
 *   - signature mismatch
 *   - `hash` param missing
 *   - `auth_date` older than 24 hours
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string
): { valid: boolean; user?: any } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { valid: false };
    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (computedHash !== hash) return { valid: false };

    const authDate = Number(params.get('auth_date'));
    if (!authDate || Date.now() / 1000 - authDate > 86400) {
      return { valid: false };
    }

    const user = JSON.parse(params.get('user') || '{}');
    return { valid: true, user };
  } catch {
    return { valid: false };
  }
}

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
  // Only POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body
  let body: any;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { initData } = body || {};
  if (!initData || typeof initData !== 'string') {
    return res.status(400).json({ error: 'initData (string) required in body' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured in Vercel env' });
  }

  // 1. Verify HMAC signature
  const { valid, user } = verifyTelegramInitData(initData, botToken);

  // 2. Log attempt (best effort — don't fail request if logging fails)
  try {
    await supabaseAdmin.from('auth_logs').insert({
      login: `tg:${user?.id ?? 'unknown'}`,
      success: valid && !!user?.id,
      ip_address: getClientIp(req),
      user_agent: getUserAgent(req),
      auth_method: 'telegram',
    });
  } catch (e) {
    console.error('[telegram-auth] Failed to log auth attempt:', e);
  }

  if (!valid || !user?.id) {
    return res.status(401).json({ error: 'Invalid Telegram signature' });
  }

  // 3. Look up existing profile by telegram_id
  let profile: any = null;
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id, role, full_name, phone, telegram_id')
    .eq('telegram_id', user.id)
    .single();
  profile = existing;

  // 4. Self-register if no profile (role HARDCODED 'client' — never from request)
  if (!profile) {
    const fullName =
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      'Telegram User';

    const { data: created } = await supabaseAdmin
      .from('profiles')
      .insert({
        role: 'client', // ← hardcoded, never from body
        full_name: fullName,
        telegram_id: user.id,
        last_auth_method: 'telegram',
      })
      .select('id, role, full_name, phone, telegram_id')
      .single();

    if (created) {
      // Create linked clients row (replaces old anon-insert in ClientBookingWrapper)
      await supabaseAdmin.from('clients').insert({
        profile_id: created.id,
        full_name: created.full_name,
        phone: created.phone || null,
        is_active: true,
      });
    }
    profile = created;
  }

  if (!profile || !['client', 'admin', 'owner'].includes(profile.role)) {
    return res.status(403).json({ error: 'Role not permitted' });
  }

  // 5. Sign JWT (HS256, 12h TTL)
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return res.status(500).json({
      error: 'SUPABASE_JWT_SECRET not configured in Vercel env — needed for JWT signing',
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = signJwt(
    {
      sub: profile.id,
      role: 'authenticated',
      app_role: profile.role,
      profile_id: profile.id,
      telegram_id: user.id,
      iat: now,
      exp: now + 43200, // 12 hours
    },
    secret
  );

  return res.status(200).json({
    token,
    profile_id: profile.id,
    app_role: profile.role,
    telegram_id: user.id,
  });
}