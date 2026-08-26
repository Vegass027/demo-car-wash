/**
 * /api/client — single dispatcher for all client (Mini App) endpoints.
 *
 * Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
 *
 * Why one file: Vercel Hobby plan allows max 12 serverless functions per
 * deployment. Before consolidation, api/ had 10 existing + 7 slice-1 = 17
 * functions which exceeded the limit and blocked Vercel deploys.
 * Collapsing the 7 slice-1 endpoints into a single dispatcher with
 * ?action= query routing brings the total to 11 (under the limit).
 *
 * Security contract (unchanged from the per-file versions):
 *   - POST only.
 *   - Bearer client JWT required (app_role='client' claim).
 *   - One centralized requireClient() before dispatch.
 *   - Allow-list of 7 known actions; unknown / missing → 404.
 *   - Each action handler preserves its prior HTTP status codes, validation,
 *     ownership checks, structured response shape.
 *
 * Serverless function trust boundary remains the same — same auth, same
 * service-role writes, same DB queries, same error mapping.
 */

import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from './_lib/jwt.js';
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
