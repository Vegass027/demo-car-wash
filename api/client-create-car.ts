/**
 * /api/client-create-car
 *
 * Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
 *
 * CLIENT-ONLY endpoint. Adds a personal car to the client's own client_cars row.
 *
 *   request:  POST { car_model, plate_number, car_type }
 *   response: { data: { car } }   // 200
 *
 * No client_car_id, no driver_id, no organization_id in this endpoint
 * (those belong to client-create-booking). Caller's own client.id is
 * resolved server-side from JWT profile_id.
 */

import { createClient } from '@supabase/supabase-js';
import { requireClient } from './_lib/require-client.js';
import {
  ValidationError,
  readBody,
  readString,
  readCarType,
  readPlateNumber,
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
    const car_model = readString(body, 'car_model', { max: 120 })?.trim();
    if (!car_model) throw new ValidationError('car_model_required');

    const plate_number = readPlateNumber(body, 'plate_number');
    const car_type = readCarType(body, 'car_type');

    // Resolve own client.id
    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('profile_id', profile_id)
      .maybeSingle();
    if (clientErr) {
      console.error('[client-create-car] clients lookup error:', clientErr.message);
      return res.status(500).json({ error: 'db_error' });
    }
    if (!clientRow) {
      return res.status(404).json({ error: 'client_profile_not_linked' });
    }
    const ownClientId = clientRow.id as string;

    const { data: car, error: insertErr } = await supabaseAdmin
      .from('client_cars')
      .insert({
        client_id: ownClientId,
        car_model,
        plate_number,
        car_type,
        is_active: true,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[client-create-car] insert error:', insertErr.message);
      return res.status(500).json({ error: 'db_error', detail: insertErr.message });
    }

    return res.status(200).json({ data: { car } });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    console.error('[client-create-car] uncaught:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
