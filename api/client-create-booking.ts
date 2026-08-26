/**
 * /api/client-create-booking
 *
 * Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
 *
 * CLIENT-ONLY endpoint. The only client-side endpoint with non-trivial
 * server logic in this slice:
 *
 *   1) Resolve client.id from JWT profile_id.
 *   2) For each optional ID (client_car_id / car_id / organization_id /
 *      driver_id), run an ownership SELECT to confirm it really belongs
 *      to this client. NEVER trust IDs from request body alone.
 *   3) Box-overlap check (active statuses only) via service_role direct
 *      query against bookings. Overlap predicate:
 *         existing.start_time < new_end_time
 *         AND existing.end_time   > new_start_time
 *      Covers hourly strict slots (current prod: 132/132 hourly)
 *      AND any future sub-hour bookings.
 *   4) closed_boxes check: box is_closed=true and (open_hours empty OR
 *      new_start_hour not in open_hours).
 *   5) duplicate-check for the same client car (DB-level UNIQUE will
 *      also enforce).
 *   6) INSERT bookings with client_id and created_by_profile_id DERIVED
 *      from JWT (never from body). end_time = start_time + 1 hour
 *      (server-derived).
 *
 * CONCURRENCY SAFETY — read-then-insert above is best-effort.
 * Real protection will be added in slice #4 (DB-level EXCLUDE constraint
 * on bookings overlap OR transactional SECURITY DEFINER RPC
 * create_booking_atomic). Until then, double-booking across truly
 * concurrent requests remains theoretically possible. Sequential
 * conflict regression test (test-client-carwash-endpoints.mjs T-CB-2)
 * passes but does not prove concurrency safety.
 */

import { createClient } from '@supabase/supabase-js';
import { requireClient } from './_lib/require-client.js';
import {
  ValidationError,
  readBody,
  readString,
  readNumberInRange,
  readISODate,
  readTimeHHMM,
  readUuidOpt,
  readCarType,
  readPaymentMethod,
  readServicesArray,
} from './_lib/validation.js';

export const config = { maxDuration: 10 };

const ACTIVE_STATUSES = ['ОЖИДАЕТ', 'В РАБОТЕ'] as const;

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

    const car_model = readString(body, 'car_model', { max: 120 })?.trim() ?? '';
    if (!car_model) throw new ValidationError('car_model_required');

    const plate_number_raw = readString(body, 'plate_number', { max: 12 });
    if (plate_number_raw == null) throw new ValidationError('plate_number_required');
    const plate_number = plate_number_raw.trim().toUpperCase();

    const car_type = readCarType(body, 'car_type');
    const services = readServicesArray(body, 'services', { min: 1, max: 50 });
    const price = readNumberInRange(body, 'price', 0, 1_000_000) ?? 0;
    const payment_method = readPaymentMethod(body, 'payment_method');
    const booking_date = readISODate(body, 'booking_date');
    const start_time = readTimeHHMM(body, 'start_time');
    const box_number = readNumberInRange(body, 'box_number', 1, 99) ?? 1;

    const client_car_id = readUuidOpt(body, 'client_car_id');
    const car_id = readUuidOpt(body, 'car_id');

    if (client_car_id && car_id) {
      throw new ValidationError('client_car_id_and_car_id_mutually_exclusive');
    }

    const organization_id = readUuidOpt(body, 'organization_id');
    const driver_id = readUuidOpt(body, 'driver_id');

    if (car_id && (!organization_id || !driver_id)) {
      throw new ValidationError('org_booking_requires_organization_id_and_driver_id');
    }
    if (driver_id && !organization_id) {
      throw new ValidationError('driver_id_requires_organization_id');
    }

    // (1) Resolve own client.id, phone AND full_name (bookings.client_name is NOT NULL).
    const { data: clientRow, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, phone, full_name')
      .eq('profile_id', profile_id)
      .maybeSingle();

    if (clientErr) {
      console.error('[client-create-booking] clients lookup error:', clientErr.message);
      return res.status(500).json({ error: 'db_error' });
    }
    if (!clientRow) {
      return res.status(404).json({
        error: 'client_profile_not_linked',
        hint: 'Reopen the Telegram Mini App',
      });
    }
    const ownClientId = clientRow.id as string;
    const ownPhone = (clientRow.phone ?? null) as string | null;
    const clientName = ((clientRow.full_name ?? '') as string).trim()
      || `Client ${profile_id.slice(0, 8)}`; // last-resort fallback if clients.full_name is empty

    // (2) ownership checks
    if (client_car_id) {
      const { data: own, error } = await supabaseAdmin
        .from('client_cars')
        .select('id')
        .eq('id', client_car_id)
        .eq('client_id', ownClientId)
        .maybeSingle();
      if (error) {
        console.error('[client-create-booking] client_car_id ownership error:', error.message);
        return res.status(500).json({ error: 'db_error' });
      }
      if (!own) return res.status(403).json({ error: 'client_car_id_not_owned' });
    }

    if (driver_id) {
      if (!ownPhone) return res.status(403).json({ error: 'driver_id_phone_missing' });
      const { data: own, error } = await supabaseAdmin
        .from('organization_drivers')
        .select('id')
        .eq('id', driver_id)
        .eq('phone', ownPhone)
        .eq('is_active', true)
        .maybeSingle();
      if (error) {
        console.error('[client-create-booking] driver_id ownership error:', error.message);
        return res.status(500).json({ error: 'db_error' });
      }
      if (!own) return res.status(403).json({ error: 'driver_id_not_owned' });
    }

    if (organization_id) {
      if (!ownPhone) return res.status(403).json({ error: 'organization_id_phone_missing' });
      const { data: own, error } = await supabaseAdmin
        .from('organization_drivers')
        .select('id')
        .eq('organization_id', organization_id)
        .eq('phone', ownPhone)
        .eq('is_active', true)
        .limit(1);
      if (error) {
        console.error('[client-create-booking] organization_id ownership error:', error.message);
        return res.status(500).json({ error: 'db_error' });
      }
      if (!own || own.length === 0)
        return res.status(403).json({ error: 'organization_id_not_owned' });
    }

    if (car_id) {
      const { data: own, error } = await supabaseAdmin
        .from('organization_cars')
        .select('id')
        .eq('id', car_id)
        .eq('organization_id', organization_id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) {
        console.error('[client-create-booking] car_id ownership error:', error.message);
        return res.status(500).json({ error: 'db_error' });
      }
      if (!own) return res.status(403).json({ error: 'car_id_not_owned' });
    }

    // (3) box overlap check (read-then-insert, best-effort)
    const startTimeSec = start_time.length === 5 ? `${start_time}:00` : start_time;
    const startHour = parseInt(start_time.split(':')[0], 10);
    const endHour = (startHour + 1) % 24;
    const endTimeSec =
      endHour <= startHour
        ? `23:59:59`
        : `${String(endHour).padStart(2, '0')}:00:00`;

    const { data: overlaps, error: overlapErr } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('box_number', box_number)
      .eq('booking_date', booking_date)
      .eq('is_quick_booking', false)
      .in('status', [...ACTIVE_STATUSES])
      .lt('start_time', endTimeSec)
      .gt('end_time', startTimeSec)
      .limit(1);

    if (overlapErr) {
      console.error('[client-create-booking] overlap check error:', overlapErr.message);
      return res.status(500).json({ error: 'db_error' });
    }
    if (overlaps && overlaps.length > 0) {
      return res.status(409).json({ error: 'box_occupied', box: box_number, time: start_time });
    }

    // (4) closed_boxes check
    const { data: closed, error: closedErr } = await supabaseAdmin
      .from('closed_boxes')
      .select('open_hours')
      .eq('box_number', box_number)
      .eq('closed_date', booking_date)
      .eq('is_closed', true)
      .maybeSingle();

    if (closedErr) {
      console.error('[client-create-booking] closed_boxes check error:', closedErr.message);
      return res.status(500).json({ error: 'db_error' });
    }
    if (closed) {
      const openHours = (closed.open_hours ?? []) as number[];
      if (!openHours.includes(startHour)) {
        return res.status(409).json({ error: 'box_closed', box: box_number, time: start_time });
      }
    }

    // (5) duplicate-check for same client_car on same date+time
    if (client_car_id) {
      const { data: dup, error: dupErr } = await supabaseAdmin
        .from('bookings')
        .select('id, box_number')
        .eq('client_car_id', client_car_id)
        .eq('booking_date', booking_date)
        .eq('start_time', startTimeSec.slice(0, 5))
        .in('status', [...ACTIVE_STATUSES])
        .limit(1);

      if (dupErr) {
        console.error('[client-create-booking] duplicate check error:', dupErr.message);
        return res.status(500).json({ error: 'db_error' });
      }
      if (dup && dup.length > 0) {
        return res.status(409).json({
          error: 'duplicate_booking_for_car',
          box: dup[0].box_number,
          time: start_time,
        });
      }
    }

    // (6) INSERT with derived fields
    const insertPayload: Record<string, any> = {
      client_id: ownClientId,
      client_name: clientName, // NOT NULL column on bookings
      created_by_profile_id: profile_id,
      booking_source: 'online',
      is_quick_booking: false,
      is_org: !!car_id,
      signature_obtained: false,
      status: 'ОЖИДАЕТ',
      booking_date,
      start_time,
      end_time: endTimeSec.slice(0, 5),
      box_number,
      car_model,
      plate_number,
      car_type,
      services,
      price,
      payment_method,
      is_paid: false,
    };
    if (client_car_id) insertPayload.client_car_id = client_car_id;
    if (car_id) insertPayload.car_id = car_id;
    if (organization_id) insertPayload.organization_id = organization_id;
    if (driver_id) insertPayload.driver_id = driver_id;

    const { data: booking, error: insertErr } = await supabaseAdmin
      .from('bookings')
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      console.error('[client-create-booking] insert error:', insertErr.message);
      return res.status(500).json({ error: 'db_error', detail: insertErr.message });
    }

    return res.status(200).json({ data: { booking } });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    console.error('[client-create-booking] uncaught:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
