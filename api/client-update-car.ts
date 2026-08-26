/**
 * /api/client-update-car
 *
 * Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
 *
 * CLIENT-ONLY endpoint. Updates an existing personal car.
 *
 *   request:  POST { car_id, car_model?, plate_number?, car_type?, is_active? }
 *   response: { data: { car } }   // 200
 *
 * Ownership: the car_id must belong to a client whose profile_id matches
 * the JWT. Server verifies via WHERE id = car_id AND client_id = own.id.
 * 0 rows updated → 403 car_id_not_owned.
 */

import { createClient } from '@supabase/supabase-js';
import { requireClient } from './_lib/require-client.js';
import {
  ValidationError,
  readBody,
  readString,
  readCarType,
  readPlateNumber,
  readUuidRequired,
  readBoolean,
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
    const car_id = readUuidRequired(body, 'car_id');

    // Build the patch with only the optional fields the caller actually supplied.
    const patch: Record<string, any> = {};
    if (body.car_model !== undefined) {
      const v = readString(body, 'car_model', { max: 120, required: false })?.trim();
      if (!v) throw new ValidationError('car_model_invalid');
      patch.car_model = v;
    }
    if (body.plate_number !== undefined) {
      patch.plate_number = readPlateNumber(body, 'plate_number');
    }
    if (body.car_type !== undefined) {
      patch.car_type = readCarType(body, 'car_type');
    }
    if (body.is_active !== undefined) {
      patch.is_active = readBoolean(body, 'is_active');
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('no_fields_to_update');
    }

    // Resolve own client.id
    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('profile_id', profile_id)
      .maybeSingle();
    if (clientErr) {
      console.error('[client-update-car] clients lookup error:', clientErr.message);
      return res.status(500).json({ error: 'db_error' });
    }
    if (!clientRow) {
      return res.status(404).json({ error: 'client_profile_not_linked' });
    }
    const ownClientId = clientRow.id as string;

    const { data: car, error: updErr } = await supabaseAdmin
      .from('client_cars')
      .update(patch)
      .eq('id', car_id)
      .eq('client_id', ownClientId)
      .select()
      .maybeSingle();

    if (updErr) {
      console.error('[client-update-car] update error:', updErr.message);
      return res.status(500).json({ error: 'db_error', detail: updErr.message });
    }
    if (!car) return res.status(403).json({ error: 'car_id_not_owned' });

    return res.status(200).json({ data: { car } });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    console.error('[client-update-car] uncaught:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
