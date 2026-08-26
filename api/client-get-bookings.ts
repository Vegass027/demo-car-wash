/**
 * /api/client-get-bookings
 *
 * Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
 *
 * CLIENT-ONLY endpoint. Returns the client's own bookings for a given date.
 *
 *   request:  POST { date: 'YYYY-MM-DD' }
 *   response: { data: { bookings: Booking[] } }   // may be []
 *
 * Ownership path (service_role, BYPASSRLS):
 *   bookings.client_id = (SELECT id FROM clients WHERE profile_id = jwt.profile_id)
 *
 * Why NOT use created_by_profile_id: an admin / staff-created booking has
 * created_by_profile_id = staff UUID, not client. Using client_id chain
 * is the only way to also surface admin-booked-on-behalf-of-client.
 */

import { createClient } from '@supabase/supabase-js';
import { requireClient } from './_lib/require-client.js';
import {
  ValidationError,
  readBody,
  readISODate,
} from './_lib/validation.js';

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
    const date = readISODate(body, 'date');

    // (1) Resolve client.id from clients.profile_id.
    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('profile_id', profile_id)
      .maybeSingle();

    if (clientErr) {
      console.error('[client-get-bookings] clients lookup error:', clientErr.message);
      return res.status(500).json({ error: 'db_error' });
    }
    if (!clientRow) {
      return res.status(404).json({
        error: 'client_profile_not_linked',
        hint: 'Reopen the Telegram Mini App',
      });
    }
    const ownClientId = clientRow.id as string;

    // (2) bookings for this client on the given date. NO created_by_profile_id check —
    //     admin-created bookings whose client_id = ownClientId are intentionally included.
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('booking_date', date)
      .eq('is_quick_booking', false)
      .eq('client_id', ownClientId)
      .order('start_time', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('[client-get-bookings] db error:', error.message);
      return res.status(500).json({ error: 'db_error' });
    }

    return res.status(200).json({ data: { bookings: data ?? [] } });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    console.error('[client-get-bookings] uncaught:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
