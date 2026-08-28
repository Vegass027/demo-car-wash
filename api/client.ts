/**
 * /api/client — single dispatcher for all client (Mini App) endpoints.
 *
 * Phase 2 / Slice #1 (carwash client flow, 7 actions) + Phase 2 / Slice #2
 * (tire client flow, 3 actions).
 *
 * Why one file: Vercel Hobby plan allows max 12 serverless functions per
 * deployment. Before consolidation, api/ had 10 existing + 7 slice-1 = 17
 * functions which exceeded the limit and blocked Vercel deploys.
 * Collapsing the 7 slice-1 endpoints into a single dispatcher with
 * ?action= query routing brings the total to 11 (under the limit).
 *
 * Slice #2 adds 3 tire actions on top, total 10 serverless actions (well
 * within 12-function Hobby limit). No new serverless file.
 *
 * Security contract (unchanged from the per-file versions):
 *   - POST only.
 *   - Bearer client JWT required (app_role='client' claim).
 *   - One centralized requireClient() before dispatch.
 *   - Allow-list of 10 known actions; unknown / missing → 404.
 *   - Each action handler preserves its prior HTTP status codes, validation,
 *     ownership checks, structured response shape.
 *
 * Serverless function trust boundary remains the same — same auth, same
 * service-role writes, same DB queries, same error mapping.
 */

import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from './_lib/jwt.js';
import { LOYALTY_CONFIG } from '../shared/config/loyalty.js';
import {
  ValidationError,
  readBody,
  readString,
  readNumberInRange,
  readISODate,
  readTimeHHMM,
  readUuidOpt,
  readUuidRequired,
  readPlateNumber,
  readCarType,
  readPaymentMethod,
  readServicesArray,
  readTireServicesArray,
  readBoolean,
} from './_lib/validation.js';

export const config = { maxDuration: 10 };

type AnyObj = Record<string, any>;
type ActionResult = { status: number; body: AnyObj };

const ALLOWED_ACTIONS = new Set([
  'get-my-cars',
  'get-bookings',
  'create-booking',
  'cancel-booking',
  'create-car',
  'update-car',
  'delete-car',
  // Slice #2 — tire client flow:
  'get-tire-bookings',
  'create-tire-booking',
  'cancel-tire-booking',
  // Phase B — client-side cancellation/loyalty reads (server-side identity only):
  'get-my-cancellation-count',
  'get-my-block-status',
  'get-my-loyalty-progress',
  'get-my-free-wash-status',
  'get-my-washes-until-next-free-wash',
  'get-my-profile',
  'get-my-client',
  'get-my-client-email',
]);

const ACTIVE_STATUSES = ['ОЖИДАЕТ', 'В РАБОТЕ'] as const;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------- single client guard (used by every action) ----------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireClient(req: any): Promise<
  | { claims: { profile_id: string; app_role: 'client'; full_name?: string; telegram_id?: number; exp?: number } }
  | { errorRes: { status: number; body: AnyObj } }
> {
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
    return { errorRes: { status: 500, body: { error: 'server_misconfigured', detail: 'jwt_secret_missing' } } };
  }
  let claims: any;
  try {
    claims = verifyJwt(token, secret);
  } catch (err: any) {
    console.error('[require-client] verifyJwt failed:', err?.message);
    return { errorRes: { status: 401, body: { error: 'invalid_or_expired_token' } } };
  }
  if (claims?.app_role !== 'client') {
    return { errorRes: { status: 403, body: { error: 'wrong_role', detail: 'client_role_required' } } };
  }
  const profile_id = claims?.profile_id;
  if (typeof profile_id !== 'string' || !UUID_RE.test(profile_id)) {
    return { errorRes: { status: 403, body: { error: 'invalid_claims', detail: 'profile_id_missing_or_not_uuid' } } };
  }
  return {
    claims: {
      profile_id,
      app_role: 'client',
      full_name: typeof claims.full_name === 'string' ? claims.full_name : undefined,
      telegram_id: typeof claims.telegram_id === 'number' ? claims.telegram_id : undefined,
      exp: typeof claims.exp === 'number' ? claims.exp : undefined,
    },
  };
}

// ---------- action helpers (each returns a structured ActionResult) ----------

function failAction(status: number, error: string, extra: AnyObj = {}): ActionResult {
  return { status, body: { error, ...extra } };
}

// === action: get-my-cars ===
async function getMyCars(claims: { profile_id: string }): Promise<ActionResult> {
  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id, phone, online_booking_blocked_until')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (clientErr) {
    console.error('[client:get-my-cars] clients lookup error:', clientErr.message);
    return failAction(500, 'db_error');
  }
  if (!clientRow) {
    return { status: 404, body: { error: 'client_profile_not_linked', hint: 'Reopen the Telegram Mini App' } };
  }
  const ownClientId = clientRow.id as string;
  const ownPhone = (clientRow.phone ?? null) as string | null;
  const blockedUntil = (clientRow.online_booking_blocked_until ?? null) as string | null;
  const combined_cars: AnyObj[] = [];

  const { data: personalCars, error: personalErr } = await supabaseAdmin
    .from('client_cars')
    .select('id, car_model, plate_number, car_type')
    .eq('client_id', ownClientId)
    .eq('is_active', true);
  if (personalErr) {
    console.error('[client:get-my-cars] client_cars lookup error:', personalErr.message);
    return failAction(500, 'db_error');
  }
  for (const car of personalCars ?? []) {
    combined_cars.push({
      id: car.id,
      car_model: car.car_model,
      plate_number: car.plate_number,
      car_type: car.car_type,
      type: 'personal',
    });
  }

  if (ownPhone) {
    const { data: drivers, error: driverErr } = await supabaseAdmin
      .from('organization_drivers')
      .select('id, organization_id')
      .eq('phone', ownPhone)
      .eq('is_active', true)
      .limit(1);
    if (driverErr) {
      console.error('[client:get-my-cars] org_drivers lookup error:', driverErr.message);
      return failAction(500, 'db_error');
    }
    const driver = drivers?.[0];
    if (driver) {
      const orgId = driver.organization_id as string;
      const [{ data: org, error: orgErr }, { data: orgCars, error: orgCarsErr }] = await Promise.all([
        supabaseAdmin.from('organizations').select('name').eq('id', orgId).maybeSingle(),
        supabaseAdmin
          .from('organization_cars')
          .select('id, car_model, plate_number, car_type')
          .eq('organization_id', orgId)
          .eq('is_active', true),
      ]);
      if (orgErr || orgCarsErr) {
        console.error('[client:get-my-cars] org/org_cars lookup error:', orgErr?.message, orgCarsErr?.message);
        return failAction(500, 'db_error');
      }
      const organizationName = (org?.name ?? '') as string;
      for (const car of orgCars ?? []) {
        combined_cars.push({
          id: car.id,
          car_model: car.car_model,
          plate_number: car.plate_number,
          car_type: car.car_type ?? 'SEDAN',
          type: 'organization',
          organization_id: orgId,
          organization_name: organizationName,
        });
      }
    }
  }

  return {
    status: 200,
    body: {
      data: {
        client: { id: ownClientId, phone: ownPhone, online_booking_blocked_until: blockedUntil },
        combined_cars,
      },
    },
  };
}

// === action: get-bookings ===
async function getBookings(claims: { profile_id: string }, body: AnyObj): Promise<ActionResult> {
  const date = readISODate(body, 'date'); // throws ValidationError → outer try/catch
  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (clientErr) {
    console.error('[client:get-bookings] clients lookup error:', clientErr.message);
    return failAction(500, 'db_error');
  }
  if (!clientRow) {
    return { status: 404, body: { error: 'client_profile_not_linked', hint: 'Reopen the Telegram Mini App' } };
  }
  const ownClientId = clientRow.id as string;
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('booking_date', date)
    .eq('is_quick_booking', false)
    .eq('client_id', ownClientId)
    .order('start_time', { ascending: true, nullsFirst: false });
  if (error) {
    console.error('[client:get-bookings] db error:', error.message);
    return failAction(500, 'db_error');
  }
  return { status: 200, body: { data: { bookings: data ?? [] } } };
}

// === action: create-booking ===
//
// Validation readers throw ValidationError — caught by the outer try/catch
// at the dispatch site (no per-action try/catch needed because all readers
// are throw-based; their return-error marker is unreachable in practice).
async function createBooking(claims: { profile_id: string }, body: AnyObj): Promise<ActionResult> {
  const car_model = (readString(body, 'car_model', { max: 120 }) ?? '').trim();
  if (!car_model) throw new ValidationError('car_model_required');

  const plate_number = readString(body, 'plate_number', { max: 12, required: true })!.trim().toUpperCase();

  const car_type = readCarType(body, 'car_type');
  const services = readServicesArray(body, 'services', { min: 1, max: 50 });
  const price = readNumberInRange(body, 'price', 0, 1_000_000) ?? 0;
  const payment_method = readPaymentMethod(body, 'payment_method');
  const booking_date = readISODate(body, 'booking_date');
  const start_time = readTimeHHMM(body, 'start_time');
  const box_number = readNumberInRange(body, 'box_number', 1, 99) ?? 1;

  const client_car_id = readUuidOpt(body, 'client_car_id') || null;
  const car_id = readUuidOpt(body, 'car_id') || null;

  if (client_car_id && car_id) throw new ValidationError('client_car_id_and_car_id_mutually_exclusive');

  const organization_id = readUuidOpt(body, 'organization_id') || null;
  const driver_id = readUuidOpt(body, 'driver_id') || null;

  if (car_id && (!organization_id || !driver_id)) {
    throw new ValidationError('org_booking_requires_organization_id_and_driver_id');
  }
  if (driver_id && !organization_id) {
    throw new ValidationError('driver_id_requires_organization_id');
  }

  // (1) resolve own client.id + phone + full_name
  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id, phone, full_name')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (clientErr) {
    console.error('[client:create-booking] clients lookup error:', clientErr.message);
    return failAction(500, 'db_error');
  }
  if (!clientRow) {
    return { status: 404, body: { error: 'client_profile_not_linked', hint: 'Reopen the Telegram Mini App' } };
  }
  const ownClientId = clientRow.id as string;
  const ownPhone = (clientRow.phone ?? null) as string | null;
  const clientName = ((clientRow.full_name ?? '') as string).trim()
    || `Client ${claims.profile_id.slice(0, 8)}`;

  // (2) ownership
  if (client_car_id) {
    const { data: own, error } = await supabaseAdmin
      .from('client_cars')
      .select('id').eq('id', client_car_id).eq('client_id', ownClientId).maybeSingle();
    if (error) {
      console.error('[client:create-booking] client_car_id ownership error:', error.message);
      return failAction(500, 'db_error');
    }
    if (!own) return { status: 403, body: { error: 'client_car_id_not_owned' } };
  }
  if (driver_id) {
    if (!ownPhone) return { status: 403, body: { error: 'driver_id_phone_missing' } };
    const { data: own, error } = await supabaseAdmin
      .from('organization_drivers')
      .select('id').eq('id', driver_id).eq('phone', ownPhone).eq('is_active', true).maybeSingle();
    if (error) {
      console.error('[client:create-booking] driver_id ownership error:', error.message);
      return failAction(500, 'db_error');
    }
    if (!own) return { status: 403, body: { error: 'driver_id_not_owned' } };
  }
  if (organization_id) {
    if (!ownPhone) return { status: 403, body: { error: 'organization_id_phone_missing' } };
    const { data: own, error } = await supabaseAdmin
      .from('organization_drivers').select('id')
      .eq('organization_id', organization_id).eq('phone', ownPhone).eq('is_active', true).limit(1);
    if (error) {
      console.error('[client:create-booking] organization_id ownership error:', error.message);
      return failAction(500, 'db_error');
    }
    if (!own || own.length === 0) return { status: 403, body: { error: 'organization_id_not_owned' } };
  }
  if (car_id) {
    const { data: own, error } = await supabaseAdmin
      .from('organization_cars').select('id')
      .eq('id', car_id).eq('organization_id', organization_id).eq('is_active', true).maybeSingle();
    if (error) {
      console.error('[client:create-booking] car_id ownership error:', error.message);
      return failAction(500, 'db_error');
    }
    if (!own) return { status: 403, body: { error: 'car_id_not_owned' } };
  }

  // (3) box-overlap check (read-then-insert, best-effort)
  const startTimeSec = start_time.length === 5 ? `${start_time}:00` : start_time;
  const startHour = parseInt(start_time.split(':')[0], 10);
  const endHour = (startHour + 1) % 24;
  const endTimeSec = endHour <= startHour
    ? '23:59:59'
    : `${String(endHour).padStart(2, '0')}:00:00`;

  const { data: overlaps, error: overlapErr } = await supabaseAdmin
    .from('bookings').select('id')
    .eq('box_number', box_number).eq('booking_date', booking_date)
    .eq('is_quick_booking', false)
    .in('status', [...ACTIVE_STATUSES])
    .lt('start_time', endTimeSec).gt('end_time', startTimeSec)
    .limit(1);
  if (overlapErr) {
    console.error('[client:create-booking] overlap check error:', overlapErr.message);
    return failAction(500, 'db_error');
  }
  if (overlaps && overlaps.length > 0) {
    return { status: 409, body: { error: 'box_occupied', box: box_number, time: start_time } };
  }

  // (4) closed_boxes check
  const { data: closed, error: closedErr } = await supabaseAdmin
    .from('closed_boxes').select('open_hours')
    .eq('box_number', box_number).eq('closed_date', booking_date).eq('is_closed', true)
    .maybeSingle();
  if (closedErr) {
    console.error('[client:create-booking] closed_boxes check error:', closedErr.message);
    return failAction(500, 'db_error');
  }
  if (closed) {
    const openHours = (closed.open_hours ?? []) as number[];
    if (!openHours.includes(startHour)) {
      return { status: 409, body: { error: 'box_closed', box: box_number, time: start_time } };
    }
  }

  // (5) duplicate-check
  if (client_car_id) {
    const { data: dup, error: dupErr } = await supabaseAdmin
      .from('bookings').select('id, box_number')
      .eq('client_car_id', client_car_id).eq('booking_date', booking_date)
      .eq('start_time', startTimeSec.slice(0, 5))
      .in('status', [...ACTIVE_STATUSES])
      .limit(1);
    if (dupErr) {
      console.error('[client:create-booking] duplicate check error:', dupErr.message);
      return failAction(500, 'db_error');
    }
    if (dup && dup.length > 0) {
      return {
        status: 409,
        body: { error: 'duplicate_booking_for_car', box: dup[0].box_number, time: start_time },
      };
    }
  }

  // (6) INSERT
  const insertPayload: AnyObj = {
    client_id: ownClientId,
    client_name: clientName,
    created_by_profile_id: claims.profile_id,
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
    .from('bookings').insert(insertPayload).select().single();
  if (insertErr) {
    console.error('[client:create-booking] insert error:', insertErr.message);
    return failAction(500, 'db_error', { detail: insertErr.message });
  }
  return { status: 200, body: { data: { booking } } };
}

// === action: cancel-booking ===
async function cancelBooking(claims: { profile_id: string }, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');

  const { data, error } = await supabaseAdmin.rpc('cancel_own_booking', {
    p_booking_id: booking_id,
    p_profile_id: claims.profile_id,
  });
  if (error) {
    const msg = error?.message || '';
    const code = error?.code;
    if (msg === 'NOT_FOUND_OR_NOT_OWNED') {
      return { status: 404, body: { error: 'booking_not_found_or_not_owned' } };
    }
    if (msg.startsWith('CANNOT_CANCEL_STATUS_')) {
      return {
        status: 409,
        body: { error: 'cannot_cancel', current_status: msg.replace('CANNOT_CANCEL_STATUS_', '') },
      };
    }
    // 23505 unique_violation is NOT masked to 200/already_cancelled.
    // After FOR UPDATE serialisation within this RPC, the second concurrent
    // caller observes the existing booking_cancellations row and returns
    // already_cancelled=true normally. A 23505 means a different writer
    // inserted a duplicate event — log and surface as 500.
    console.error('[client:cancel-booking] unexpected RPC error:', { code, message: msg, hint: error?.hint, booking_id });
    return failAction(500, 'rpc_failed');
  }
  return { status: 200, body: { data } };
}

// === action: create-car ===
async function createCarAction(claims: { profile_id: string }, body: AnyObj): Promise<ActionResult> {
  const car_model = (readString(body, 'car_model', { max: 120, required: true }) ?? '').trim();
  if (!car_model) throw new ValidationError('car_model_required');
  const plate_number = readPlateNumber(body, 'plate_number');
  const car_type = readCarType(body, 'car_type');

  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients').select('id').eq('profile_id', claims.profile_id).maybeSingle();
  if (clientErr) {
    console.error('[client:create-car] clients lookup error:', clientErr.message);
    return failAction(500, 'db_error');
  }
  if (!clientRow) return { status: 404, body: { error: 'client_profile_not_linked' } };
  const ownClientId = clientRow.id as string;

  const { data: car, error: insertErr } = await supabaseAdmin
    .from('client_cars').insert({
      client_id: ownClientId,
      car_model,
      plate_number,
      car_type,
      is_active: true,
    }).select().single();
  if (insertErr) {
    console.error('[client:create-car] insert error:', insertErr.message);
    return failAction(500, 'db_error', { detail: insertErr.message });
  }
  return { status: 200, body: { data: { car } } };
}

// === action: update-car ===
async function updateCarAction(claims: { profile_id: string }, body: AnyObj): Promise<ActionResult> {
  const car_id = readUuidRequired(body, 'car_id');
  const patch: AnyObj = {};
  if (body.car_model !== undefined) {
    const v = (readString(body, 'car_model', { max: 120, required: false }) ?? '').trim();
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

  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients').select('id').eq('profile_id', claims.profile_id).maybeSingle();
  if (clientErr) {
    console.error('[client:update-car] clients lookup error:', clientErr.message);
    return failAction(500, 'db_error');
  }
  if (!clientRow) return { status: 404, body: { error: 'client_profile_not_linked' } };
  const ownClientId = clientRow.id as string;

  const { data: car, error: updErr } = await supabaseAdmin
    .from('client_cars').update(patch)
    .eq('id', car_id).eq('client_id', ownClientId)
    .select().maybeSingle();
  if (updErr) {
    console.error('[client:update-car] update error:', updErr.message);
    return failAction(500, 'db_error', { detail: updErr.message });
  }
  if (!car) return { status: 403, body: { error: 'car_id_not_owned' } };
  return { status: 200, body: { data: { car } } };
}

// === action: delete-car ===
async function deleteCarAction(claims: { profile_id: string }, body: AnyObj): Promise<ActionResult> {
  const car_id = readUuidRequired(body, 'car_id');

  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients').select('id').eq('profile_id', claims.profile_id).maybeSingle();
  if (clientErr) {
    console.error('[client:delete-car] clients lookup error:', clientErr.message);
    return failAction(500, 'db_error');
  }
  if (!clientRow) return { status: 404, body: { error: 'client_profile_not_linked' } };
  const ownClientId = clientRow.id as string;

  const { data: car, error: updErr } = await supabaseAdmin
    .from('client_cars').update({ is_active: false })
    .eq('id', car_id).eq('client_id', ownClientId)
    .select('id').maybeSingle();
  if (updErr) {
    console.error('[client:delete-car] update error:', updErr.message);
    return failAction(500, 'db_error', { detail: updErr.message });
  }
  if (!car) return { status: 403, body: { error: 'car_id_not_owned' } };
  return { status: 200, body: { data: { success: true, car_id } } };
}

// =========================================================================
// Slice #2 — tire client flow (3 actions, inline handlers below)
// =========================================================================

// Convert "HH:MM" or "HH:MM:SS" string to minutes since midnight.
// Postgres time arithmetic companion used to feed find_tire_booking_overlap
// (RPC which compares via EXTRACT(EPOCH FROM start_time)::int / 60).
function timeToMinutesHHMM(s: string): number {
  const parts = s.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  return h * 60 + m;
}

// === action: get-tire-bookings ===
//
// Same shape as carwash get-bookings but for tire_bookings. Returns OWN
// bookings only (server-side resolve profile_id → client_id).
async function getTireBookings(claims: { profile_id: string }, body: AnyObj): Promise<ActionResult> {
  const date = readISODate(body, 'date');

  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients').select('id')
    .eq('profile_id', claims.profile_id).maybeSingle();
  if (clientErr) {
    console.error('[client:get-tire-bookings] clients lookup error:', clientErr.message);
    return failAction(500, 'db_error');
  }
  if (!clientRow) {
    return { status: 404, body: { error: 'client_profile_not_linked', hint: 'Reopen the Telegram Mini App' } };
  }
  const ownClientId = clientRow.id as string;

  const { data, error } = await supabaseAdmin
    .from('tire_bookings')
    .select('id, booking_date, start_time, estimated_duration, end_time, status, '
      + 'client_name, phone, car_model, plate_number, services, total_price, '
      + 'payment_method, is_paid, is_org, organization_id, driver_id, car_id, '
      + 'client_car_id, signature_data, signature_obtained_at, '
      + 'worker_id, worker_name, created_at, updated_at, booking_source, '
      + 'created_by_profile_id')
    .eq('booking_date', date)
    .eq('client_id', ownClientId)
    .order('start_time', { ascending: true, nullsFirst: false });
  if (error) {
    // Log FULL error object so Vercel logs shows hint/code/details fields
    // (not just `message`). Helps debug DB-side failures (RLS, column
    // permissions, missing relations) without re-deploying instrumentation.
    console.error('[client:get-tire-bookings] full error:', JSON.stringify(error));
    return failAction(500, 'db_error');
  }
  return { status: 200, body: { data: { bookings: data ?? [] } } };
}

// === action: create-tire-booking ===
//
// Server-resolves client_id, validates 4-ID ownership chain, checks overlap
// via find_tire_booking_overlap RPC, INSERTs with computed end_time.
async function createTireBooking(claims: { profile_id: string }, body: AnyObj): Promise<ActionResult> {
  const car_model = (readString(body, 'car_model', { max: 120, required: true }) ?? '').trim();
  if (!car_model) throw new ValidationError('car_model_required');

  const plate_number = readString(body, 'plate_number', { max: 12, required: true })!.trim().toUpperCase();

  // tire_bookings.services is a JSONB array of TireServiceItem objects
  // (different shape from carwash bookings.services which is just string[]).
  const services = readTireServicesArray(body, 'services', { min: 1, max: 50 });
  const total_price = readNumberInRange(body, 'total_price', 0, 1_000_000) ?? 0;
  const payment_method = readPaymentMethod(body, 'payment_method');
  const booking_date = readISODate(body, 'booking_date');
  const start_time = readTimeHHMM(body, 'start_time');
  const estimated_duration = readNumberInRange(body, 'estimated_duration', 30, 240) ?? 60;

  // Tire has a single post (no box_number). Is_org is implied by which IDs
  // are present, consistent with TireTimeline (employee uses 1 fixed post).
  const is_org = !!(body.organization_id || body.driver_id || body.car_id);
  const organization_id = readUuidOpt(body, 'organization_id') || null;
  const driver_id = readUuidOpt(body, 'driver_id') || null;
  const car_id = readUuidOpt(body, 'car_id') || null;
  const client_car_id = readUuidOpt(body, 'client_car_id') || null;

  if (client_car_id && car_id) {
    throw new ValidationError('client_car_id_and_car_id_mutually_exclusive');
  }
  if (car_id && (!organization_id || !driver_id)) {
    throw new ValidationError('org_booking_requires_organization_id_and_driver_id');
  }
  if (driver_id && !organization_id) {
    throw new ValidationError('driver_id_requires_organization_id');
  }

  // (1) resolve own client.id + phone + full_name
  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id, phone, full_name')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (clientErr) {
    console.error('[client:create-tire-booking] clients lookup error:', clientErr.message);
    return failAction(500, 'db_error');
  }
  if (!clientRow) {
    return { status: 404, body: { error: 'client_profile_not_linked', hint: 'Reopen the Telegram Mini App' } };
  }
  const ownClientId = clientRow.id as string;
  const ownPhone = (clientRow.phone ?? null) as string | null;
  const clientName = ((clientRow.full_name ?? '') as string).trim()
    || `Client ${claims.profile_id.slice(0, 8)}`;

  // (2) ownership checks (mirror carwash create-booking)
  if (client_car_id) {
    const { data: own, error } = await supabaseAdmin
      .from('client_cars').select('id')
      .eq('id', client_car_id).eq('client_id', ownClientId).maybeSingle();
    if (error) {
      console.error('[client:create-tire-booking] client_car_id ownership error:', error.message);
      return failAction(500, 'db_error');
    }
    if (!own) return { status: 403, body: { error: 'client_car_id_not_owned' } };
  }
  if (driver_id) {
    if (!ownPhone) return { status: 403, body: { error: 'driver_id_phone_missing' } };
    const { data: own, error } = await supabaseAdmin
      .from('organization_drivers').select('id')
      .eq('id', driver_id).eq('phone', ownPhone).eq('is_active', true).maybeSingle();
    if (error) {
      console.error('[client:create-tire-booking] driver_id ownership error:', error.message);
      return failAction(500, 'db_error');
    }
    if (!own) return { status: 403, body: { error: 'driver_id_not_owned' } };
  }
  if (organization_id) {
    if (!ownPhone) return { status: 403, body: { error: 'organization_id_phone_missing' } };
    const { data: own, error } = await supabaseAdmin
      .from('organization_drivers').select('id')
      .eq('organization_id', organization_id).eq('phone', ownPhone).eq('is_active', true).limit(1);
    if (error) {
      console.error('[client:create-tire-booking] organization_id ownership error:', error.message);
      return failAction(500, 'db_error');
    }
    if (!own || own.length === 0) return { status: 403, body: { error: 'organization_id_not_owned' } };
  }
  if (car_id) {
    const { data: own, error } = await supabaseAdmin
      .from('organization_cars').select('id')
      .eq('id', car_id).eq('organization_id', organization_id).eq('is_active', true).maybeSingle();
    if (error) {
      console.error('[client:create-tire-booking] car_id ownership error:', error.message);
      return failAction(500, 'db_error');
    }
    if (!own) return { status: 403, body: { error: 'car_id_not_owned' } };
  }

  // (3) overlap check via find_tire_booking_overlap RPC
  const startTimeSec = start_time.length === 5 ? `${start_time}:00` : start_time;
  const startMinutes = timeToMinutesHHMM(startTimeSec);
  const { data: overlaps, error: overlapErr } = await supabaseAdmin
    .rpc('find_tire_booking_overlap', {
      p_target_date: booking_date,
      p_start_minutes: startMinutes,
      p_duration_minutes: estimated_duration,
    });
  if (overlapErr) {
    console.error('[client:create-tire-booking] overlap RPC error:', overlapErr.message);
    return failAction(500, 'rpc_failed');
  }
  if (overlaps && overlaps.length > 0) {
    return {
      status: 409,
      body: {
        error: 'slot_occupied',
        time: start_time,
        conflicting_count: overlaps.length,
      },
    };
  }

  // (4) duplicate-check (same as carwash Slice #1, against partial UNIQUE INDEX).
  //     Same car + same date + same start_time = blocked by DB even without
  //     this check, but a friendly 409 is better than a 23P01.
  if (client_car_id) {
    const { data: dup, error: dupErr } = await supabaseAdmin
      .from('tire_bookings').select('id')
      .eq('client_car_id', client_car_id).eq('booking_date', booking_date)
      .eq('start_time', startTimeSec.slice(0, 5))
      .not('status', 'in', '(ОТМЕНЕНО,ГОТОВО)').limit(1);
    if (dupErr) {
      console.error('[client:create-tire-booking] duplicate check error:', dupErr.message);
      return failAction(500, 'db_error');
    }
    if (dup && dup.length > 0) {
      return { status: 409, body: { error: 'duplicate_booking_for_car', time: start_time } };
    }
  }

  // (5) Compute end_time server-side (HH:MM, no seconds). start_time +
  //     estimated_duration minutes, may roll past midnight (caller must not
  //     ask for > 24:00; UI's DURATION_OPTIONS tops out at 240 min / 4h).
  const endMinutes = (startMinutes + estimated_duration) % (24 * 60);
  const endHH = Math.floor(endMinutes / 60);
  const endMM = endMinutes % 60;
  const endTimeStr = `${String(endHH).padStart(2, '0')}:${String(endMM).padStart(2, '0')}`;

  // (6) INSERT
  const insertPayload: AnyObj = {
    client_id: ownClientId,
    client_name: clientName,
    phone: ownPhone || `+7${claims.profile_id.replace(/-/g, '').slice(0, 10)}`,
    car_model,
    plate_number,
    booking_date,
    start_time: startTimeSec.slice(0, 5),
    // end_time is a GENERATED ALWAYS AS column on tire_bookings — Postgres
    // computes (start_time + make_interval(mins => estimated_duration)) on
    // every INSERT/UPDATE. We must NOT include it in the INSERT payload,
    // else postgres raises "cannot insert a non-DEFAULT value into
    // column end_time".
    estimated_duration,
    services,
    total_price,
    payment_method,
    is_paid: false,
    status: 'ОЖИДАЕТ',
    is_org,
    booking_source: 'online',
    created_by_profile_id: claims.profile_id,
  };
  if (client_car_id) insertPayload.client_car_id = client_car_id;
  if (car_id) insertPayload.car_id = car_id;
  if (organization_id) insertPayload.organization_id = organization_id;
  if (driver_id) insertPayload.driver_id = driver_id;

  const { data: booking, error: insertErr } = await supabaseAdmin
    .from('tire_bookings').insert(insertPayload).select().single();
  if (insertErr) {
    console.error('[client:create-tire-booking] insert error:', insertErr.message);
    return failAction(500, 'db_error', { detail: insertErr.message });
  }
  return { status: 200, body: { data: { booking } } };
}

// === action: cancel-tire-booking ===
//
// Thin RPC adapter (same shape as cancel-booking for carwash).
async function cancelTireBooking(claims: { profile_id: string }, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const reason = readString(body, 'reason', { max: 500, required: false }) ?? null;

  const { data, error } = await supabaseAdmin.rpc('cancel_own_tire_booking', {
    p_tire_booking_id: tire_booking_id,
    p_profile_id: claims.profile_id,
    p_reason: reason,
  });
  if (error) {
    const msg = error?.message || '';
    const code = error?.code;
    if (msg === 'NOT_FOUND_OR_NOT_OWNED') {
      return { status: 404, body: { error: 'tire_booking_not_found_or_not_owned' } };
    }
    if (msg.startsWith('CANNOT_CANCEL_STATUS_')) {
      return {
        status: 409,
        body: { error: 'cannot_cancel', current_status: msg.replace('CANNOT_CANCEL_STATUS_', '') },
      };
    }
    // 23505 unique_violation on booking_cancellations.tire_booking_id would
    // surface here under concurrent races (UNIQUE INDEX from migration 006).
    // RPC FOR UPDATE serialises within, so we only see this if a non-RPC
    // writer inserted a duplicate — treat as 500.
    console.error('[client:cancel-tire-booking] unexpected RPC error:', { code, message: msg, hint: error?.hint, tire_booking_id });
    return failAction(500, 'rpc_failed');
  }
  return { status: 200, body: { data } };
}

// ---------- dispatch ----------

// Defensive action extractor: prefer Vercel/Next pre-parsed req.query, fall
// back to manual URL parsing (Vercel runtime differences).
function extractAction(req: any): string | null {
  let a: any = (req?.query?.action ?? '');
  if (a) return String(a);
  // Fallback: parse URL manually.
  const url = req?.url ?? req?.headers?.['x-original-url'] ?? '';
  if (typeof url === 'string' && url.includes('action=')) {
    try {
      const u = new URL(url, 'http://localhost');
      a = u.searchParams.get('action') ?? '';
      if (a) return String(a);
    } catch { /* ignore */ }
  }
  return null;
}

// =========================================================================
// Phase B — client-side cancellation / loyalty reads.
// All 8 handlers take (claims) ONLY. Identity = claims.profile_id from JWT.
// Zero reads of body.profile_id (defense in depth + consistency with
// existing Slice #1/#2 handler pattern).
// =========================================================================

// === Phase B action: get-my-cancellation-count ===
async function getMyCancellationCount(claims: { profile_id: string }): Promise<ActionResult> {
  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (clientErr) return failAction(500, 'db_error', { detail: clientErr.message });
  if (!clientRow) return { status: 200, body: { data: { count: 0 } } };

  const startDate = new Date();
  startDate.setTime(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { count, error } = await supabaseAdmin
    .from('booking_cancellations')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientRow.id)
    .gte('cancelled_at', startDate.toISOString());
  if (error) return failAction(500, 'db_error', { detail: error.message });
  return { status: 200, body: { data: { count: count || 0 } } };
}

// === Phase B action: get-my-block-status ===
async function getMyBlockStatus(claims: { profile_id: string }): Promise<ActionResult> {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('online_booking_blocked_until')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (error) return failAction(500, 'db_error', { detail: error.message });
  if (!data) return { status: 200, body: { data: { blocked: false, until: null } } };

  const blockedUntil = data.online_booking_blocked_until;
  let isBlocked = false;
  if (blockedUntil) {
    const blockedDate = new Date(blockedUntil);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    isBlocked = blockedDate >= today;
  }
  return { status: 200, body: { data: { blocked: isBlocked, until: blockedUntil } } };
}

// === Phase B action: get-my-loyalty-progress ===
async function getMyLoyaltyProgress(claims: { profile_id: string }): Promise<ActionResult> {
  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (clientErr) return failAction(500, 'db_error', { detail: clientErr.message });
  if (!clientRow) return { status: 200, body: { data: { progress: null } } };

  const { data, error } = await supabaseAdmin
    .from('loyalty_carwash_progress')
    .select('*')
    .eq('client_id', clientRow.id)
    .maybeSingle();
  if (error) return failAction(500, 'db_error', { detail: error.message });
  return { status: 200, body: { data: { progress: data } } };
}

// === Phase B action: get-my-free-wash-status ===
async function getMyFreeWashStatus(claims: { profile_id: string }): Promise<ActionResult> {
  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (clientErr) return failAction(500, 'db_error', { detail: clientErr.message });
  if (!clientRow) return { status: 200, body: { data: { hasFreeWash: false } } };

  const { data, error } = await supabaseAdmin
    .from('loyalty_carwash_progress')
    .select('free_wash_pending')
    .eq('client_id', clientRow.id)
    .maybeSingle();
  if (error) return failAction(500, 'db_error', { detail: error.message });
  return { status: 200, body: { data: { hasFreeWash: data?.free_wash_pending === true } } };
}

// === Phase B action: get-my-washes-until-next-free-wash ===
async function getMyWashesUntilNextFreeWash(claims: { profile_id: string }): Promise<ActionResult> {
  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (clientErr) return failAction(500, 'db_error', { detail: clientErr.message });
  if (!clientRow) return { status: 200, body: { data: { remaining: LOYALTY_CONFIG.FREE_WASH_AFTER } } };

  const { data, error } = await supabaseAdmin
    .from('loyalty_carwash_progress')
    .select('total_washes_with_body')
    .eq('client_id', clientRow.id)
    .maybeSingle();
  if (error) return failAction(500, 'db_error', { detail: error.message });
  if (!data) return { status: 200, body: { data: { remaining: LOYALTY_CONFIG.FREE_WASH_AFTER } } };

  const current = data.total_washes_with_body;
  const nextFree = Math.ceil(current / LOYALTY_CONFIG.FREE_WASH_AFTER) * LOYALTY_CONFIG.FREE_WASH_AFTER;
  return { status: 200, body: { data: { remaining: nextFree - current } } };
}

// === Phase B action: get-my-profile ===
async function getMyProfile(claims: { profile_id: string }): Promise<ActionResult> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, full_name, phone, telegram_id, last_auth_method, created_at')
    .eq('id', claims.profile_id)
    .maybeSingle();
  if (error) return failAction(500, 'db_error', { detail: error.message });
  if (!data) return failAction(404, 'profile_not_found');
  return { status: 200, body: { data: { profile: data } } };
}

// === Phase B action: get-my-client ===
async function getMyClient(claims: { profile_id: string }): Promise<ActionResult> {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, full_name, phone, email, online_booking_blocked_until, profile_id, is_active, notes, created_at, updated_at')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (error) return failAction(500, 'db_error', { detail: error.message });
  if (!data) return failAction(404, 'client_not_found');
  return { status: 200, body: { data: { client: data } } };
}

// === Phase B action: get-my-client-email ===
async function getMyClientEmail(claims: { profile_id: string }): Promise<ActionResult> {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('email')
    .eq('profile_id', claims.profile_id)
    .maybeSingle();
  if (error) return failAction(500, 'db_error', { detail: error.message });
  return { status: 200, body: { data: { email: data?.email ?? null } } };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const guard = await requireClient(req);
  if ('errorRes' in guard) return res.status(guard.errorRes.status).json(guard.errorRes.body);

  const action = extractAction(req);
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return res.status(404).json({ error: 'unknown_action' });
  }

  // parse body once; allowed to throw ValidationError → mapped to 400
  let body: AnyObj = {};
  try {
    body = readBody(req);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    throw err;
  }

  try {
    let result: ActionResult;
    switch (action) {
      case 'get-my-cars': {
        result = await getMyCars(guard.claims);
        break;
      }
      case 'get-bookings': {
        result = await getBookings(guard.claims, body);
        break;
      }
      case 'create-booking': {
        result = await createBooking(guard.claims, body);
        break;
      }
      case 'cancel-booking': {
        result = await cancelBooking(guard.claims, body);
        break;
      }
      case 'create-car': {
        result = await createCarAction(guard.claims, body);
        break;
      }
      case 'update-car': {
        result = await updateCarAction(guard.claims, body);
        break;
      }
      case 'delete-car': {
        result = await deleteCarAction(guard.claims, body);
        break;
      }
      // ---- Slice #2: tire client flow ----
      case 'get-tire-bookings': {
        result = await getTireBookings(guard.claims, body);
        break;
      }
      case 'create-tire-booking': {
        result = await createTireBooking(guard.claims, body);
        break;
      }
      case 'cancel-tire-booking': {
        result = await cancelTireBooking(guard.claims, body);
        break;
      }
      // ---- Phase B: client-side cancellation/loyalty reads ----
      case 'get-my-cancellation-count': {
        result = await getMyCancellationCount(guard.claims);
        break;
      }
      case 'get-my-block-status': {
        result = await getMyBlockStatus(guard.claims);
        break;
      }
      case 'get-my-loyalty-progress': {
        result = await getMyLoyaltyProgress(guard.claims);
        break;
      }
      case 'get-my-free-wash-status': {
        result = await getMyFreeWashStatus(guard.claims);
        break;
      }
      case 'get-my-washes-until-next-free-wash': {
        result = await getMyWashesUntilNextFreeWash(guard.claims);
        break;
      }
      case 'get-my-profile': {
        result = await getMyProfile(guard.claims);
        break;
      }
      case 'get-my-client': {
        result = await getMyClient(guard.claims);
        break;
      }
      case 'get-my-client-email': {
        result = await getMyClientEmail(guard.claims);
        break;
      }
      default:
        // ALLOWED_ACTIONS allowed-list already covered this branch; defensive.
        return res.status(404).json({ error: 'unknown_action' });
    }
    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    console.error(`[client:${action}] uncaught:`, err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
