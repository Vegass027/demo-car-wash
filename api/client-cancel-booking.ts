/**
 * /api/client-cancel-booking
 *
 * Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
 *
 * CLIENT-ONLY endpoint. Thin adapter over cancel_own_booking RPC
 * (migrations/002_cancel_own_booking_rpc.sql). No business logic here;
 * mapping table:
 *
 *   RPC error message              → HTTP status
 *   'NOT_FOUND_OR_NOT_OWNED'       → 404 booking_not_found_or_not_owned
 *   'CANNOT_CANCEL_STATUS_<X>'     → 409 cannot_cancel + current_status
 *   (23505 unique_violation etc.)  → 500 (NEVER masked to 200; see T21 reasoning)
 *   anything else                  → 500 rpc_failed
 *
 * Endpoint verifies JWT, RPC is service_role-only and re-checks ownership
 * inside its own transaction.
 *
 * Idempotency is handled by the RPC itself: a second call on the same
 * booking_id returns { already_cancelled: true, booking: … } (200), not 409.
 * Network retries from the Telegram Mini App are safe.
 */

import { createClient } from '@supabase/supabase-js';
import { requireClient } from './_lib/require-client.js';
import { ValidationError, readBody, readUuidRequired } from './_lib/validation.js';

export const config = { maxDuration: 10 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const guard = await requireClient(req);
    if ('errorRes' in guard) return res.status(guard.errorRes.status).json(guard.errorRes.body);
    const { profile_id } = guard.claims;

    const body = readBody(req);
    const booking_id = readUuidRequired(body, 'booking_id');

    const { data, error } = await supabaseAdmin.rpc('cancel_own_booking', {
      p_booking_id: booking_id,
      p_profile_id: profile_id,
    });

    if (error) {
      const msg = error?.message || '';
      const code = error?.code;

      if (msg === 'NOT_FOUND_OR_NOT_OWNED') {
        return res.status(404).json({ error: 'booking_not_found_or_not_owned' });
      }
      if (msg.startsWith('CANNOT_CANCEL_STATUS_')) {
        const st = msg.replace('CANNOT_CANCEL_STATUS_', '');
        return res.status(409).json({ error: 'cannot_cancel', current_status: st });
      }

      // 23505 unique_violation is intentionally NOT mapped to 200/already_cancelled.
      // After FOR UPDATE serialisation within this RPC, the second concurrent
      // caller observes the existing booking_cancellations row and returns
      // already_cancelled=true normally. A 23505 here means a different writer
      // inserted a duplicate event — log and surface as 500.
      console.error('[client-cancel-booking] unexpected RPC error:', {
        code, message: msg, hint: error?.hint, booking_id,
      });
      return res.status(500).json({ error: 'rpc_failed' });
    }

    return res.status(200).json({ data });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    console.error('[client-cancel-booking] uncaught:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
