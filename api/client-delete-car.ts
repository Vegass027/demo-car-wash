/**
 * /api/client-delete-car
 *
 * Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
 *
 * CLIENT-ONLY endpoint. Soft-deletes a personal car by setting is_active=false.
 *
 *   request:  POST { car_id }
 *   response: { data: { success: true, car_id } }   // 200
 *
 * Ownership: same as client-update-car (id = car_id AND client_id = own.id).
 * 0 rows updated → 403 car_id_not_owned.
 *
 * Soft-delete intentionally (matches current lib/api/clients.ts:deleteClientCar
 * behaviour). Real hard-delete would silently break existing bookings.
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
    const car_id = readUuidRequired(body, 'car_id');

    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('profile_id', profile_id)
      .maybeSingle();
    if (clientErr) {
      console.error('[client-delete-car] clients lookup error:', clientErr.message);
      return res.status(500).json({ error: 'db_error' });
    }
    if (!clientRow) {
      return res.status(404).json({ error: 'client_profile_not_linked' });
    }
    const ownClientId = clientRow.id as string;

    const { data: car, error: updErr } = await supabaseAdmin
      .from('client_cars')
      .update({ is_active: false })
      .eq('id', car_id)
      .eq('client_id', ownClientId)
      .select('id')
      .maybeSingle();

    if (updErr) {
      console.error('[client-delete-car] update error:', updErr.message);
      return res.status(500).json({ error: 'db_error', detail: updErr.message });
    }
    if (!car) return res.status(403).json({ error: 'car_id_not_owned' });

    return res.status(200).json({ data: { success: true, car_id } });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    console.error('[client-delete-car] uncaught:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
