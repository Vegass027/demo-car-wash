/**
 * /api/staff — single dispatcher for staff (admin/owner) endpoints.
 *
 * Phase 2 / Slice #3a (staff client/car/org writes).
 *
 * Why one file: Vercel Hobby plan allows max 12 serverless functions per
 * deployment. After pre-Slice-3a we had 11; this adds 1 more, reaching
 * the 12-function ceiling exactly. All staff actions live inline in this
 * dispatcher so adding new actions does NOT consume a new slot — only a
 * new serverless file would.
 *
 * Slice #3a ONLY covers: client/car/org reads + writes. Out of scope for
 * this file (Slice #3b): booking CRUD, status mutations, services, payment
 * — those still go through lib/api/bookings.ts.
 *
 * Security contract:
 *   - POST only.
 *   - Bearer staff JWT required (app_role ∈ {'admin', 'owner'}).
 *   - One centralized requireStaff() before dispatch.
 *   - Allow-list of 13 actions; unknown / missing → 404.
 *   - All writes go through service_role (supabaseAdmin).
 *   - patch actions: explicit allow-list per table; require ≥1 patch field
 *     to forbid empty-payload UPDATEs (which silently no-op).
 *
 * Created by profile_id (from JWT) is recorded in §5.10 ownership invariants
 * as audit actor for client/car/org writes. client_id is business owner;
 * see PROJECT_STATE.md §5.10 for the four invariants.
 */

import { createClient } from '@supabase/supabase-js';
import { verifyJwt } from './_lib/jwt.js';
import { requireStaff, StaffClaims } from './_lib/require-staff.js';
import {
  ValidationError,
  readBody,
  readString,
  readNumberInRange,
  readUuidOpt,
  readUuidRequired,
  readCarType,
  readISODate,
  readTimeHHMM,
  readPaymentMethod,
  readBoolean,
} from './_lib/validation.js';
import { normalizePhoneNumber } from '../shared/utils/phone.js';
import { recomputeBookingServices } from './_lib/booking-services.js';
import {
  calculateWorkerEarnings,
  addWorkerEarningAndLedger,
  addTireWorkerEarningAndLedger,
} from './_lib/earnings.js';

export const config = { maxDuration: 10 };

type AnyObj = Record<string, any>;
type ActionResult = { status: number; body: AnyObj };

const ALLOWED_ACTIONS = new Set([
  // Slice #3a — staff client/car/org (13):
  'search-client-by-phone',
  'create-client',
  'update-client',
  'unblock-client',
  'create-client-car',
  'update-client-car',
  'create-organization',
  'update-organization',
  'create-org-driver',
  'update-org-driver',
  'update-driver-signature',
  'create-org-car',
  'update-org-car',

  // Slice #3b — staff carwash booking (11):
  'create-staff-booking',
  'update-staff-booking',
  'add-staff-services',
  'remove-staff-services',
  'assign-staff-worker',
  'unassign-staff-worker',
  'start-staff-work',
  'mark-staff-paid',
  'mark-staff-ready',
  'update-staff-payment-method',
  'staff-cancel-booking',

  // Slice #3b — staff tire booking (10):
  'create-staff-tire-booking',
  'update-staff-tire-booking',
  'add-staff-tire-services',
  'remove-staff-tire-services',
  'assign-staff-tire-technician',
  'start-staff-tire-work',
  'mark-staff-tire-paid',
  'mark-staff-tire-ready',
  'update-staff-tire-payment-method',
  'staff-cancel-tire-booking',

  // Phase 2.1a — staff self-service password change:
  'change-password',

  // Slice #3c — Category A writes (15 actions):
  //   4 admin-or-owner: start-admin-shift, create-earning-transaction,
  //                      create-advance-transaction, create-transfer-transaction
  //  11 owner-only:    create-admin, update-admin, delete-admin,
  //                      admin-give-advance, admin-payout-salary,
  //                      admin-transfer-balance, create-payout-transaction,
  //                      delete-salary-transaction, update-salary-settings,
  //                      create-company-settings, update-company-settings
  'create-admin',
  'update-admin',
  'delete-admin',
  'start-admin-shift',
  'admin-give-advance',
  'admin-payout-salary',
  'admin-transfer-balance',
  'create-earning-transaction',
  'create-advance-transaction',
  'create-payout-transaction',
  'create-transfer-transaction',
  'delete-salary-transaction',
  'update-salary-settings',
  'create-company-settings',
  'update-company-settings',
]);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function failAction(status: number, error: string, extra: AnyObj = {}): ActionResult {
  return { status, body: { error, ...extra } };
}

// Returns true iff this object has at least one of the listed keys
// whose value is non-undefined. Used by patch endpoints to reject empty
// payloads (which SupabaseJS would silently no-op).
function hasAnyField(body: AnyObj, fields: string[]): boolean {
  for (const f of fields) {
    if (body[f] !== undefined) return true;
  }
  return false;
}

// =========================================================================
// Slice #3b — staff booking mutations
// =========================================================================
//
// Shared helpers and 21 actions. Inline to keep the single-serverless-file
// invariant. Carwash + tire use separate SQL tables (bookings / tire_bookings)
// with separate state machines (4-state vs 5-state, with 'ПРОСРОЧЕН' on tire)
// and separate status guards. Tire has a GENERATED end_time column that
// must NEVER appear in any INSERT/UPDATE body.

const CARWASH_STATUSES = ['ОЖИДАЕТ', 'В РАБОТЕ', 'ГОТОВО', 'ОТМЕНЕНО'] as const;
const TIRE_STATUSES = ['ОЖИДАЕТ', 'В РАБОТЕ', 'ГОТОВО', 'ОТМЕНЕНО', 'ПРОСРОЧЕН'] as const;

// Tire bookings DB CHECK constraint allows both 'Наличные' (with 'е') and
// 'Наличный' (carwash form), plus 'Яндекс' (not in carwash API surface).
// See plan OD#2b — keep carwash validation.ts narrow (no 'Яндекс'); mirror
// the tire DB enum locally for tire-only actions.
const TIRE_PAYMENT_METHODS = ['Наличные', 'Наличный', 'Безналичный', 'Перевод', 'СБП', 'Ведомость', 'Яндекс', 'QR-code'] as const;

function readTirePaymentMethod(body: AnyObj, field: string): string {
  const v = body[field];
  if (typeof v !== 'string' || !(TIRE_PAYMENT_METHODS as readonly string[]).includes(v)) {
    throw new ValidationError(`${field}_invalid`);
  }
  return v;
}

function readBookingStatus(body: AnyObj, field: string): string {
  const v = body[field];
  if (typeof v !== 'string' || !CARWASH_STATUSES.includes(v as any)) {
    throw new ValidationError(`${field}_invalid`);
  }
  return v;
}

function readTireStatus(body: AnyObj, field: string): string {
  const v = body[field];
  if (typeof v !== 'string' || !TIRE_STATUSES.includes(v as any)) {
    throw new ValidationError(`${field}_invalid`);
  }
  return v;
}

async function lockCarwashBooking(id: string): Promise<AnyObj> {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`booking_lookup_failed: ${error.message}`);
  if (!data) throw new ValidationError('booking_not_found');
  // supabase-js returns JSONB columns as text (raw JSON-encoded string).
  // Normalize `services` and `services_with_quantities` to JS arrays.
  if (typeof data.services === 'string') {
    try { data.services = JSON.parse(data.services); } catch { data.services = []; }
  }
  if (typeof data.services_with_quantities === 'string') {
    try { data.services_with_quantities = JSON.parse(data.services_with_quantities); } catch { data.services_with_quantities = []; }
  }
  return data;
}

async function lockTireBooking(id: string): Promise<AnyObj> {
  const { data, error } = await supabaseAdmin
    .from('tire_bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`tire_booking_lookup_failed: ${error.message}`);
  if (!data) throw new ValidationError('tire_booking_not_found');
  if (typeof data.services === 'string') {
    try { data.services = JSON.parse(data.services); } catch { data.services = []; }
  }
  return data;
}

// =========================================================================
// Read actions
// =========================================================================

// === action: search-client-by-phone ===
//
// Universal staff search — returns SearchResult-shaped rows for both
// individuals and organizations (matches BookingWizard's searchByPhone()
// shape so the wizard can be switched without a frontend rewrite).
// All fields here are allow-listed explicitly; nothing else is exposed.
//
// LIMIT 5 per type (client / organization) so the response is bounded.
async function searchClientByPhone(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const rawPhone = readString(body, 'phone', { max: 32, required: true });
  if (!rawPhone) throw new ValidationError('phone_required');

  const normalized = normalizePhoneNumber(rawPhone);
  const phone = normalized || rawPhone.trim();

  const [clientRes, orgRes] = await Promise.all([
    supabaseAdmin
      .from('clients')
      .select('id, full_name, phone, profile_id, is_active')
      .or(`phone.eq.${phone},phone.ilike.%${phone}%`)
      .limit(5),
    supabaseAdmin
      .from('organizations')
      .select('id, name, contact_phone, inn, is_active')
      .or(`contact_phone.eq.${phone},contact_phone.ilike.%${phone}%`)
      .limit(5),
  ]);
  if (clientRes.error) {
    console.error('[staff:search-client-by-phone] clients error:', clientRes.error.message);
    return failAction(500, 'db_error');
  }
  if (orgRes.error) {
    console.error('[staff:search-client-by-phone] orgs error:', orgRes.error.message);
    return failAction(500, 'db_error');
  }

  const clients = clientRes.data ?? [];
  const orgs = orgRes.data ?? [];

  // Pull each client's active cars in one query (LIMIT 5 clients => ≤5 rows
  // per client, keyed by client_id).
  let carsByClientId: Record<string, AnyObj[]> = {};
  if (clients.length > 0) {
    const clientIds = clients.map((c: any) => c.id);
    const { data: cars, error: carsErr } = await supabaseAdmin
      .from('client_cars')
      .select('id, client_id, car_model, plate_number, car_type, is_active')
      .in('client_id', clientIds)
      .eq('is_active', true);
    if (carsErr) {
      console.error('[staff:search-client-by-phone] cars error:', carsErr.message);
      return failAction(500, 'db_error');
    }
    for (const car of cars ?? []) {
      const cid = (car as any).client_id;
      if (!carsByClientId[cid]) carsByClientId[cid] = [];
      carsByClientId[cid].push({
        id: car.id,
        car_model: car.car_model,
        plate_number: car.plate_number,
        car_type: car.car_type,
      });
    }
  }

  // Shape-compatible with SearchResult[] used by BookingWizard's
  // searchByPhone() — same keys/types so the wizard component sees the
  // same shape it had before. type field allows discriminating.
  const results: AnyObj[] = [];
  for (const c of clients) {
    results.push({
      type: 'client',
      client_id: c.id,
      client_name: c.full_name,
      client_phone: c.phone,
      profile_id: c.profile_id,
      is_active: c.is_active,
      client_cars: carsByClientId[c.id] ?? [],
    });
  }
  for (const o of orgs) {
    results.push({
      type: 'organization',
      organization_id: o.id,
      organization_name: o.name,
      contact_phone: o.contact_phone,
      inn: o.inn,
      is_active: o.is_active,
    });
  }

  return { status: 200, body: { data: { results } } };
}

// =========================================================================
// Create / Update — clients
// =========================================================================

// === action: create-client ===
//
// profile_id is intentionally NOT a part of this action's contract —
// legacy profile linking stays in /api/link-client-profile.ts (Slice #1.5
// phase). Inserting here always produces profile_id=NULL.
async function createClientAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const full_name = (readString(body, 'full_name', { max: 200, required: true }) ?? '').trim();
  if (!full_name) throw new ValidationError('full_name_required');

  const rawPhone = readString(body, 'phone', { max: 32, required: true });
  if (!rawPhone) throw new ValidationError('phone_required');
  const normalized = normalizePhoneNumber(rawPhone);
  const phone = normalized || rawPhone.trim();
  if (!phone) throw new ValidationError('phone_invalid');

  const notes = readString(body, 'notes', { max: 2000, required: false }) ?? null;
  const email = readString(body, 'email', { max: 200, required: false }) ?? null;
  const is_active = body.is_active === undefined ? true : !!body.is_active;

  // Preflight SELECT on phone UNIQUE — avoid 23505 noise before INSERT.
  const { data: collision, error: collisionErr } = await supabaseAdmin
    .from('clients').select('id').eq('phone', phone).maybeSingle();
  if (collisionErr) {
    console.error('[staff:create-client] collision check error:', collisionErr.message);
    return failAction(500, 'db_error');
  }
  if (collision) return { status: 409, body: { error: 'phone_collision' } };

  const { data: client, error } = await supabaseAdmin
    .from('clients').insert({
      full_name,
      phone,
      is_active,
      notes,
      email,
    }).select().single();
  if (error) {
    // Race: another writer landed a same-phone row between preflight and
    // INSERT. Catch 23505 unique_violation here as well.
    if (error.code === '23505') {
      return { status: 409, body: { error: 'phone_collision' } };
    }
    console.error('[staff:create-client] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { client } } };
}

// === action: update-client ===
//
// Allowed fields: full_name, phone, notes, email, is_active, online_booking_blocked_until.
// Require at least one allowed field. Phone changes go through normalization
// + collision preflight as in create-client.
async function updateClientAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const client_id = readUuidRequired(body, 'client_id');

  const ALLOWED = ['full_name', 'phone', 'notes', 'email', 'is_active', 'online_booking_blocked_until'];
  if (!hasAnyField(body, ALLOWED)) throw new ValidationError('no_fields_to_update');

  const patch: AnyObj = {};
  if (body.full_name !== undefined) {
    const v = (readString(body, 'full_name', { max: 200, required: false }) ?? '').trim();
    if (!v) throw new ValidationError('full_name_invalid');
    patch.full_name = v;
  }
  if (body.phone !== undefined) {
    const normalized = normalizePhoneNumber(body.phone);
    const phone = normalized || String(body.phone).trim();
    if (!phone) throw new ValidationError('phone_invalid');
    // Preflight collision (excluding the same client_id).
    const { data: collision, error: collisionErr } = await supabaseAdmin
      .from('clients').select('id').eq('phone', phone).neq('id', client_id).maybeSingle();
    if (collisionErr) {
      console.error('[staff:update-client] collision check error:', collisionErr.message);
      return failAction(500, 'db_error');
    }
    if (collision) return { status: 409, body: { error: 'phone_collision' } };
    patch.phone = phone;
  }
  if (body.notes !== undefined) {
    patch.notes = readString(body, 'notes', { max: 2000, required: false });
  }
  if (body.email !== undefined) {
    patch.email = readString(body, 'email', { max: 200, required: false });
  }
  if (body.is_active !== undefined) {
    patch.is_active = !!body.is_active;
  }
  if (body.online_booking_blocked_until !== undefined) {
    const v = body.online_booking_blocked_until;
    if (v === null || v === 'null') {
      patch.online_booking_blocked_until = null;
    } else {
      const date = readISODate(body, 'online_booking_blocked_until');
      patch.online_booking_blocked_until = date;
    }
  }
  patch.updated_at = new Date().toISOString();

  const { data: client, error } = await supabaseAdmin
    .from('clients').update(patch).eq('id', client_id).select().maybeSingle();
  if (error) {
    if (error.code === '23505') return { status: 409, body: { error: 'phone_collision' } };
    console.error('[staff:update-client] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!client) return { status: 404, body: { error: 'client_not_found' } };
  return { status: 200, body: { data: { client } } };
}

// === action: unblock-client ===
async function unblockClientAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const client_id = readUuidRequired(body, 'client_id');
  const { data: client, error } = await supabaseAdmin
    .from('clients').update({
      online_booking_blocked_until: null,
      updated_at: new Date().toISOString(),
    }).eq('id', client_id).select('id, full_name, online_booking_blocked_until').maybeSingle();
  if (error) {
    console.error('[staff:unblock-client] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!client) return { status: 404, body: { error: 'client_not_found' } };
  return { status: 200, body: { data: { client } } };
}

// =========================================================================
// Create / Update — client_cars
// =========================================================================

async function createClientCarAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const client_id = readUuidRequired(body, 'client_id');
  const car_model = (readString(body, 'car_model', { max: 120, required: true }) ?? '').trim();
  if (!car_model) throw new ValidationError('car_model_required');
  const plate_number = readString(body, 'plate_number', { max: 12, required: true })!.trim().toUpperCase();
  const car_type = readCarType(body, 'car_type');

  // Verify client exists (service_role SELECT bypasses RLS).
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients').select('id').eq('id', client_id).maybeSingle();
  if (clientErr) {
    console.error('[staff:create-client-car] client lookup error:', clientErr.message);
    return failAction(500, 'db_error');
  }
  if (!client) return { status: 404, body: { error: 'client_not_found' } };

  const { data: car, error } = await supabaseAdmin
    .from('client_cars').insert({
      client_id, car_model, plate_number, car_type, is_active: true,
    }).select().single();
  if (error) {
    console.error('[staff:create-client-car] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { car } } };
}

async function updateClientCarAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const car_id = readUuidRequired(body, 'car_id');
  const ALLOWED = ['car_model', 'plate_number', 'car_type', 'is_active'];
  if (!hasAnyField(body, ALLOWED)) throw new ValidationError('no_fields_to_update');

  const patch: AnyObj = {};
  if (body.car_model !== undefined) {
    const v = (readString(body, 'car_model', { max: 120, required: false }) ?? '').trim();
    if (!v) throw new ValidationError('car_model_invalid');
    patch.car_model = v;
  }
  if (body.plate_number !== undefined) {
    patch.plate_number = readString(body, 'plate_number', { max: 12, required: true })!.trim().toUpperCase();
  }
  if (body.car_type !== undefined) {
    patch.car_type = readCarType(body, 'car_type');
  }
  if (body.is_active !== undefined) {
    patch.is_active = !!body.is_active;
  }

  const { data: car, error } = await supabaseAdmin
    .from('client_cars').update(patch).eq('id', car_id).select().maybeSingle();
  if (error) {
    console.error('[staff:update-client-car] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!car) return { status: 404, body: { error: 'car_not_found' } };
  return { status: 200, body: { data: { car } } };
}

// =========================================================================
// Create / Update — organizations
// =========================================================================

async function createOrganizationAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const name = (readString(body, 'name', { max: 300, required: true }) ?? '').trim();
  if (!name) throw new ValidationError('name_required');

  const ALLOWED = ['inn', 'contact_person', 'contact_phone', 'kpp', 'ogrn', 'legal_address',
                    'payment_account', 'bank_name', 'correspondent_account', 'bik', 'notes'];
  const insert: AnyObj = { name };
  if (body.contact_phone !== undefined) {
    const raw = body.contact_phone;
    const normalized = normalizePhoneNumber(raw);
    insert.contact_phone = normalized || (typeof raw === 'string' ? raw.trim() : null);
  }
  if (body.inn !== undefined) insert.inn = readString(body, 'inn', { max: 32, required: false });
  if (body.contact_person !== undefined) insert.contact_person = readString(body, 'contact_person', { max: 200, required: false });
  if (body.kpp !== undefined) insert.kpp = readString(body, 'kpp', { max: 32, required: false });
  if (body.ogrn !== undefined) insert.ogrn = readString(body, 'ogrn', { max: 32, required: false });
  if (body.legal_address !== undefined) insert.legal_address = readString(body, 'legal_address', { max: 500, required: false });
  if (body.payment_account !== undefined) insert.payment_account = readString(body, 'payment_account', { max: 64, required: false });
  if (body.bank_name !== undefined) insert.bank_name = readString(body, 'bank_name', { max: 200, required: false });
  if (body.correspondent_account !== undefined) insert.correspondent_account = readString(body, 'correspondent_account', { max: 64, required: false });
  if (body.bik !== undefined) insert.bik = readString(body, 'bik', { max: 32, required: false });
  if (body.notes !== undefined) insert.notes = readString(body, 'notes', { max: 2000, required: false });
  insert.is_active = body.is_active === undefined ? true : !!body.is_active;

  // Preflight collision on contact_phone (UNIQUE on organizations).
  if (insert.contact_phone) {
    const { data: collision, error: collisionErr } = await supabaseAdmin
      .from('organizations').select('id').eq('contact_phone', insert.contact_phone).maybeSingle();
    if (collisionErr) {
      console.error('[staff:create-organization] collision check error:', collisionErr.message);
      return failAction(500, 'db_error');
    }
    if (collision) return { status: 409, body: { error: 'contact_phone_collision' } };
  }

  const { data: org, error } = await supabaseAdmin
    .from('organizations').insert(insert).select().single();
  if (error) {
    if (error.code === '23505') return { status: 409, body: { error: 'contact_phone_collision' } };
    console.error('[staff:create-organization] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { organization: org } } };
}

async function updateOrganizationAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const org_id = readUuidRequired(body, 'org_id');
  const ALLOWED = ['name', 'inn', 'contact_person', 'contact_phone', 'kpp', 'ogrn', 'legal_address',
                    'payment_account', 'bank_name', 'correspondent_account', 'bik', 'notes', 'is_active'];
  if (!hasAnyField(body, ALLOWED)) throw new ValidationError('no_fields_to_update');

  const patch: AnyObj = {};
  if (body.name !== undefined) {
    const v = (readString(body, 'name', { max: 300, required: false }) ?? '').trim();
    if (!v) throw new ValidationError('name_invalid');
    patch.name = v;
  }
  if (body.contact_phone !== undefined) {
    const raw = body.contact_phone;
    const normalized = normalizePhoneNumber(raw);
    const contact_phone = normalized || (typeof raw === 'string' ? raw.trim() : null);
    if (contact_phone) {
      const { data: collision, error: collisionErr } = await supabaseAdmin
        .from('organizations').select('id').eq('contact_phone', contact_phone).neq('id', org_id).maybeSingle();
      if (collisionErr) {
        console.error('[staff:update-organization] collision check error:', collisionErr.message);
        return failAction(500, 'db_error');
      }
      if (collision) return { status: 409, body: { error: 'contact_phone_collision' } };
    }
    patch.contact_phone = contact_phone;
  }
  if (body.inn !== undefined) patch.inn = readString(body, 'inn', { max: 32, required: false });
  if (body.contact_person !== undefined) patch.contact_person = readString(body, 'contact_person', { max: 200, required: false });
  if (body.kpp !== undefined) patch.kpp = readString(body, 'kpp', { max: 32, required: false });
  if (body.ogrn !== undefined) patch.ogrn = readString(body, 'ogrn', { max: 32, required: false });
  if (body.legal_address !== undefined) patch.legal_address = readString(body, 'legal_address', { max: 500, required: false });
  if (body.payment_account !== undefined) patch.payment_account = readString(body, 'payment_account', { max: 64, required: false });
  if (body.bank_name !== undefined) patch.bank_name = readString(body, 'bank_name', { max: 200, required: false });
  if (body.correspondent_account !== undefined) patch.correspondent_account = readString(body, 'correspondent_account', { max: 64, required: false });
  if (body.bik !== undefined) patch.bik = readString(body, 'bik', { max: 32, required: false });
  if (body.notes !== undefined) patch.notes = readString(body, 'notes', { max: 2000, required: false });
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  patch.updated_at = new Date().toISOString();

  const { data: org, error } = await supabaseAdmin
    .from('organizations').update(patch).eq('id', org_id).select().maybeSingle();
  if (error) {
    if (error.code === '23505') return { status: 409, body: { error: 'contact_phone_collision' } };
    console.error('[staff:update-organization] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!org) return { status: 404, body: { error: 'organization_not_found' } };
  return { status: 200, body: { data: { organization: org } } };
}

// =========================================================================
// Create / Update — organization_drivers
// =========================================================================

async function createOrgDriverAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const organization_id = readUuidRequired(body, 'organization_id');
  const full_name = (readString(body, 'full_name', { max: 200, required: true }) ?? '').trim();
  if (!full_name) throw new ValidationError('full_name_required');

  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations').select('id').eq('id', organization_id).maybeSingle();
  if (orgErr) {
    console.error('[staff:create-org-driver] org lookup error:', orgErr.message);
    return failAction(500, 'db_error');
  }
  if (!org) return { status: 404, body: { error: 'organization_not_found' } };

  const insert: AnyObj = { organization_id, full_name };
  if (body.phone !== undefined) {
    const raw = body.phone;
    const normalized = normalizePhoneNumber(raw);
    insert.phone = normalized || (typeof raw === 'string' ? raw.trim() : null);
  }
  if (body.signature_data !== undefined) {
    insert.signature_data = readString(body, 'signature_data', { max: 500_000, required: false });
    insert.signature_updated_at = new Date().toISOString();
  }
  insert.is_active = body.is_active === undefined ? true : !!body.is_active;

  const { data: driver, error } = await supabaseAdmin
    .from('organization_drivers').insert(insert).select().single();
  if (error) {
    console.error('[staff:create-org-driver] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { driver } } };
}

async function updateOrgDriverAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const driver_id = readUuidRequired(body, 'driver_id');
  const ALLOWED = ['full_name', 'phone', 'is_active'];
  if (!hasAnyField(body, ALLOWED)) throw new ValidationError('no_fields_to_update');

  const patch: AnyObj = {};
  if (body.full_name !== undefined) {
    const v = (readString(body, 'full_name', { max: 200, required: false }) ?? '').trim();
    if (!v) throw new ValidationError('full_name_invalid');
    patch.full_name = v;
  }
  if (body.phone !== undefined) {
    const raw = body.phone;
    const normalized = normalizePhoneNumber(raw);
    patch.phone = normalized || (typeof raw === 'string' ? raw.trim() : null);
  }
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;

  const { data: driver, error } = await supabaseAdmin
    .from('organization_drivers').update(patch).eq('id', driver_id).select().maybeSingle();
  if (error) {
    console.error('[staff:update-org-driver] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!driver) return { status: 404, body: { error: 'driver_not_found' } };
  return { status: 200, body: { data: { driver } } };
}

// === action: update-driver-signature ===
async function updateDriverSignatureAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const driver_id = readUuidRequired(body, 'driver_id');
  const signature_data = readString(body, 'signature_data', { max: 500_000, required: true });

  const { data: driver, error } = await supabaseAdmin
    .from('organization_drivers').update({
      signature_data,
      signature_updated_at: new Date().toISOString(),
    }).eq('id', driver_id).select('id, full_name, signature_updated_at').maybeSingle();
  if (error) {
    console.error('[staff:update-driver-signature] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!driver) return { status: 404, body: { error: 'driver_not_found' } };
  return { status: 200, body: { data: { driver } } };
}

// =========================================================================
// Create / Update — organization_cars
// =========================================================================

async function createOrgCarAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const organization_id = readUuidRequired(body, 'organization_id');
  const car_model = (readString(body, 'car_model', { max: 120, required: true }) ?? '').trim();
  if (!car_model) throw new ValidationError('car_model_required');
  const plate_number = readString(body, 'plate_number', { max: 12, required: true })!.trim().toUpperCase();
  const car_type = readCarType(body, 'car_type');

  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations').select('id').eq('id', organization_id).maybeSingle();
  if (orgErr) {
    console.error('[staff:create-org-car] org lookup error:', orgErr.message);
    return failAction(500, 'db_error');
  }
  if (!org) return { status: 404, body: { error: 'organization_not_found' } };

  const { data: car, error } = await supabaseAdmin
    .from('organization_cars').insert({
      organization_id, car_model, plate_number, car_type,
      is_active: true,
    }).select().single();
  if (error) {
    console.error('[staff:create-org-car] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { car } } };
}

async function updateOrgCarAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const car_id = readUuidRequired(body, 'car_id');
  const ALLOWED = ['car_model', 'plate_number', 'car_type', 'is_active'];
  if (!hasAnyField(body, ALLOWED)) throw new ValidationError('no_fields_to_update');

  const patch: AnyObj = {};
  if (body.car_model !== undefined) {
    const v = (readString(body, 'car_model', { max: 120, required: false }) ?? '').trim();
    if (!v) throw new ValidationError('car_model_invalid');
    patch.car_model = v;
  }
  if (body.plate_number !== undefined) {
    patch.plate_number = readString(body, 'plate_number', { max: 12, required: true })!.trim().toUpperCase();
  }
  if (body.car_type !== undefined) {
    patch.car_type = readCarType(body, 'car_type');
  }
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;

  const { data: car, error } = await supabaseAdmin
    .from('organization_cars').update(patch).eq('id', car_id).select().maybeSingle();
  if (error) {
    console.error('[staff:update-org-car] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!car) return { status: 404, body: { error: 'car_not_found' } };
  return { status: 200, body: { data: { car } } };
}

// =========================================================================
// Slice #3b action implementations (inserted here)
// =========================================================================

// === C1: create-staff-booking (atomic RPC) ===
async function createStaffBookingAction(claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const target_date    = readISODate(body, 'booking_date');
  const box_number     = readNumberInRange(body, 'box_number', 1, 99, true);
  const start_time     = readTimeHHMM(body, 'start_time');
  const end_time       = readTimeHHMM(body, 'end_time');
  const client_name    = readString(body, 'client_name', { max: 200, required: true })!.trim();
  const car_model      = readString(body, 'car_model', { max: 120, required: true })!.trim();
  const plate_number   = readString(body, 'plate_number', { max: 16, required: true })!.trim().toUpperCase();
  const car_type       = readCarType(body, 'car_type');
  const services       = body.services;
  if (!Array.isArray(services) || services.length === 0) {
    throw new ValidationError('services_required');
  }
  for (const k of [
    'services_with_quantities', 'price', 'booking_source', 'created_by_profile_id',
    'paid_at', 'status', 'worker_name', 'worker_name_2', 'org_name',
    'signature_data', 'completed_at',
  ]) {
    if (body[k] !== undefined) throw new ValidationError(`field_not_allowed_${k}`);
  }

  const phoneRaw = body.phone;
  const phone = phoneRaw ? normalizePhoneNumber(String(phoneRaw)) : null;

  const paymentMethod = body.payment_method !== undefined && body.payment_method !== null
    ? readPaymentMethod(body, 'payment_method')
    : null;

  const is_paid = readBoolean(body, 'is_paid');
  const paid_at = is_paid ? new Date().toISOString() : null;

  const is_org = !!body.is_org;
  const organization_id = is_org ? readUuidOpt(body, 'organization_id') : null;
  const driver_id       = is_org ? readUuidOpt(body, 'driver_id')       : null;
  const car_id          = is_org ? readUuidOpt(body, 'car_id')          : null;
  const client_id       = !is_org ? readUuidOpt(body, 'client_id')      : null;
  const client_car_id   = !is_org ? readUuidOpt(body, 'client_car_id')  : null;
  const worker_id       = readUuidOpt(body, 'worker_id');
  const worker_id_2     = readUuidOpt(body, 'worker_id_2');
  const working_mode    = (body.working_mode !== undefined && body.working_mode !== null)
    ? String(body.working_mode) : null;
  if (working_mode !== null && working_mode !== 'solo' && working_mode !== 'pair') {
    throw new ValidationError('working_mode_invalid');
  }
  if (working_mode === 'pair' && (!worker_id || !worker_id_2)) {
    throw new ValidationError('worker_id_2_required_when_pair');
  }

  const is_quick_booking = !!body.is_quick_booking;
  const discount = body.discount !== undefined
    ? readNumberInRange(body, 'discount', 0, 1_000_000, true)
    : 0;
  const allow_override = !!body.allow_override;
  const antifreeze_intents = body.antifreeze_intents;
  if (antifreeze_intents !== undefined && !allow_override) {
    throw new ValidationError('antifreeze_intents_not_allowed');
  }

  const recomputed = await recomputeBookingServices(supabaseAdmin, {
    services: services.map((s: any) => String(s)),
    car_type,
    antifreeze_intents: antifreeze_intents ?? [],
    allow_override,
    discount,
  });

  if (!claims.profile_id) throw new ValidationError('missing_profile_id_in_token');

  const { data, error } = await supabaseAdmin.rpc('create_staff_carwash_booking', {
    p_target_date: target_date,
    p_box_number: box_number,
    p_start_time: start_time,
    p_end_time: end_time,
    p_client_name: client_name,
    p_phone: phone,
    p_car_model: car_model,
    p_plate_number: plate_number,
    p_car_type: car_type,
    p_services: recomputed.services,
    p_services_with_quantities: recomputed.services_with_quantities,
    p_price: recomputed.final_price,
    p_payment_method: paymentMethod,
    p_worker_id: worker_id,
    p_worker_id_2: worker_id_2,
    p_working_mode: working_mode,
    p_is_org: is_org,
    p_organization_id: organization_id,
    p_driver_id: driver_id,
    p_car_id: car_id,
    p_client_id: client_id,
    p_client_car_id: client_car_id,
    p_signature_obtained_at: null,
    p_is_quick_booking: is_quick_booking,
    p_discount: recomputed.discount,
    p_is_paid: is_paid,
    p_paid_at: paid_at,
    p_created_by_profile_id: claims.profile_id,
  });

  if (error) {
    const msg = String(error.message ?? '');
    if (msg === 'BOX_OVERLAP') return failAction(409, 'box_overlap');
    if (msg === 'BOX_CLOSED')  return failAction(409, 'box_closed');
    console.error('[staff:create-staff-booking] rpc error:', error);
    return failAction(500, 'create_staff_booking_failed', { detail: msg });
  }

  const booking = (data as any)?.booking ?? null;
  return { status: 200, body: { data: { booking } } };
}

// === C2: update-staff-booking ===
async function updateStaffBookingAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const ALLOWED = [
    'client_name', 'phone', 'car_model', 'plate_number', 'car_type',
    'booking_date', 'start_time', 'end_time',
    'box_number', 'payment_method', 'discount', 'is_org',
  ];
  const DISALLOWED_NAMES = [
    'status', 'booking_source', 'created_by_profile_id',
    'worker_name', 'worker_name_2', 'worker_id', 'worker_id_2',
    'org_name', 'signature_data', 'signature_obtained_at', 'signature_obtained',
    'client_id', 'organization_id', 'driver_id', 'car_id', 'client_car_id',
    'services', 'services_with_quantities', 'price', 'is_paid', 'paid_at',
    'completed_at', 'work_start_time', 'work_end_time', 'cancel_comment',
    'is_quick_booking', 'yookassa_payment_id',
  ];
  for (const f of DISALLOWED_NAMES) {
    if (body[f] !== undefined) throw new ValidationError(`field_not_allowed_${f}`);
  }
  if (!hasAnyField(body, ALLOWED)) throw new ValidationError('no_fields_to_update');

  const patch: AnyObj = { updated_at: new Date().toISOString() };
  if (body.client_name !== undefined)  patch.client_name = readString(body, 'client_name', { max: 200, required: true })!.trim();
  if (body.phone !== undefined)        patch.phone = body.phone ? normalizePhoneNumber(String(body.phone)) : null;
  if (body.car_model !== undefined)    patch.car_model = readString(body, 'car_model', { max: 120, required: true })!.trim();
  if (body.plate_number !== undefined) patch.plate_number = readString(body, 'plate_number', { max: 16, required: true })!.trim().toUpperCase();
  if (body.car_type !== undefined)     patch.car_type = readCarType(body, 'car_type');
  if (body.booking_date !== undefined) patch.booking_date = readISODate(body, 'booking_date');
  if (body.start_time !== undefined)   patch.start_time = readTimeHHMM(body, 'start_time');
  if (body.end_time !== undefined)     patch.end_time = readTimeHHMM(body, 'end_time');
  if (body.box_number !== undefined)   patch.box_number = readNumberInRange(body, 'box_number', 1, 99, true);
  if (body.payment_method !== undefined) patch.payment_method = readPaymentMethod(body, 'payment_method');
  if (body.discount !== undefined)     patch.discount = readNumberInRange(body, 'discount', 0, 1_000_000, true);
  if (body.is_org !== undefined)       patch.is_org = !!body.is_org;

  // Price recompute: when car_type or discount changes, the booking's
  // services (and their quantities + unit prices) need re-pricing.
  // Mirror the original lib/api/bookings.ts::updateBookingCarType /
  // updateBooking(discount=0) behavior, but server-side so the price
  // can NEVER come from the browser.
  const needsPriceRecompute = body.car_type !== undefined || body.discount !== undefined;
  if (needsPriceRecompute) {
    const { data: current, error: curErr } = await supabaseAdmin
      .from('bookings')
      .select('services, services_with_quantities, discount, car_type')
      .eq('id', booking_id)
      .maybeSingle();
    if (curErr) {
      console.error('[staff:update-staff-booking] current booking fetch error:', curErr.message);
      return failAction(500, 'db_error', { detail: curErr.message });
    }
    if (!current) return { status: 404, body: { error: 'booking_not_found' } };

    const newCarType = (body.car_type ?? current.car_type) as string;
    const newDiscount = body.discount !== undefined ? Number(body.discount) : Number(current.discount ?? 0);
    const swq = (current.services_with_quantities as Array<{ service_id: string; quantity: number; price: number; total: number }>) ?? [];
    const servicesList: string[] = (current.services as string[]) ?? [];

    // Use services_with_quantities if present (newer bookings); else
    // fall back to a fresh lookup of services table for the IDs.
    let total = 0;
    if (swq.length > 0) {
      for (const q of swq) {
        total += Number(q.total ?? 0);
      }
    } else if (servicesList.length > 0) {
      const { data: rows, error: srvErr } = await supabaseAdmin
        .from('services')
        .select('id, service_id, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan')
        .in('id', servicesList);
      if (srvErr) {
        console.error('[staff:update-staff-booking] services fetch error:', srvErr.message);
        return failAction(500, 'db_error', { detail: srvErr.message });
      }
      for (const r of (rows ?? []) as any[]) {
        const isAntifreeze = r.service_id === 'antifreeze-org' || r.service_id === 'antifreeze-umc';
        let unit = Number(r.price_sedan);
        if (!isAntifreeze) {
          unit = Number(
            newCarType === 'CROSSOVER' ? r.price_crossover :
            newCarType === 'JEEP'      ? r.price_jeep :
            newCarType === 'LARGE_SUV' ? r.price_large_suv :
            newCarType === 'MINIVAN'   ? r.price_minivan :
                                          r.price_sedan,
          );
        }
        total += unit;
      }
    }
    patch.price = Math.max(0, total - Math.max(0, newDiscount));
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update(patch)
    .eq('id', booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:update-staff-booking] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!data) return { status: 404, body: { error: 'booking_not_found' } };
  return { status: 200, body: { data: { booking: data } } };
}

// === C3: add-staff-services (atomic RPC — full read-modify-write inside) ===
async function addStaffServicesAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const service_ids = body.service_ids;
  if (!Array.isArray(service_ids) || service_ids.length === 0) {
    throw new ValidationError('service_ids_required');
  }
  const allow_override = !!body.allow_override;
  const antifreeze_intents = body.antifreeze_intents ?? [];
  if (antifreeze_intents.length > 0 && !allow_override) {
    throw new ValidationError('antifreeze_intents_not_allowed');
  }
  // Atomic RPC: holds FOR UPDATE on booking row, merges services, recomputes
  // price inside the locked transaction. Concurrent handlers serialize on
  // the row-lock, so no two updates land with stale snapshots — closes the
  // lost-update bug that R3b exposed.
  const { data, error } = await supabaseAdmin.rpc('atomic_modify_carwash_services', {
    p_booking_id: booking_id,
    p_action: 'add',
    p_service_ids: service_ids.map((s: any) => String(s)),
    p_antifreeze_intents: antifreeze_intents,
    p_allow_override: allow_override,
    // Pass null so RPC COALESCE keeps the existing booking.discount.
    // add-staff-services must NOT clear a customer's existing discount.
    p_discount: null,
  });
  if (error) {
    const msg = String(error.message ?? '');
    if (msg === 'BOOKING_NOT_FOUND') return { status: 404, body: { error: 'booking_not_found' } };
    if (msg === 'INVALID_STATUS_TRANSITION') {
      return failAction(409, 'invalid_status_transition');
    }
    console.error('[staff:add-staff-services] rpc error:', error);
    return failAction(500, 'db_error', { detail: msg });
  }
  const booking = (data as any)?.booking ?? null;
  return { status: 200, body: { data: { booking } } };
}

// === C4: remove-staff-services (atomic RPC) ===
async function removeStaffServicesAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const service_id = readUuidRequired(body, 'service_id');
  const { data, error } = await supabaseAdmin.rpc('atomic_modify_carwash_services', {
    p_booking_id: booking_id,
    p_action: 'remove',
    p_service_ids: [service_id],
    p_antifreeze_intents: [],
    p_allow_override: false,
    // Pass null so RPC COALESCE keeps the existing booking.discount.
    p_discount: null,
  });
  if (error) {
    const msg = String(error.message ?? '');
    if (msg === 'BOOKING_NOT_FOUND') return { status: 404, body: { error: 'booking_not_found' } };
    if (msg === 'INVALID_STATUS_TRANSITION') {
      return failAction(409, 'invalid_status_transition');
    }
    console.error('[staff:remove-staff-services] rpc error:', error);
    return failAction(500, 'db_error', { detail: msg });
  }
  const booking = (data as any)?.booking ?? null;
  return { status: 200, body: { data: { booking } } };
}

// === C5: assign-staff-worker ===
async function assignStaffWorkerAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const worker_id  = readUuidRequired(body, 'worker_id');
  const working_mode = body.working_mode;
  if (working_mode !== 'solo' && working_mode !== 'pair') {
    throw new ValidationError('working_mode_invalid');
  }
  if (body.worker_name !== undefined || body.worker_name_2 !== undefined || body.partner_name !== undefined) {
    throw new ValidationError('field_not_allowed_worker_name');
  }
  let partner_id: string | null = null;
  if (working_mode === 'pair') {
    partner_id = readUuidRequired(body, 'partner_id');
  }

  const { data: w1 } = await supabaseAdmin.from('workers').select('id, full_name').eq('id', worker_id).maybeSingle();
  if (!w1) return { status: 404, body: { error: 'worker_not_found' } };

  let w2: { id: string; full_name: string } | null = null;
  if (working_mode === 'pair' && partner_id) {
    const { data } = await supabaseAdmin.from('workers').select('id, full_name').eq('id', partner_id).maybeSingle();
    if (!data) return { status: 404, body: { error: 'partner_not_found' } };
    w2 = data;
  }

  const patch: AnyObj = {
    worker_id, worker_name: w1.full_name,
    working_mode,
    worker_id_2: w2?.id ?? null,
    worker_name_2: w2?.full_name ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('bookings').update(patch).eq('id', booking_id).select().maybeSingle();
  if (error) {
    console.error('[staff:assign-staff-worker] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!data) return { status: 404, body: { error: 'booking_not_found' } };
  return { status: 200, body: { data: { booking: data } } };
}

// === C6: unassign-staff-worker ===
async function unassignStaffWorkerAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const current = await lockCarwashBooking(booking_id);
  if (current.status === 'ГОТОВО') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({
      worker_id: null, worker_name: null,
      worker_id_2: null, worker_name_2: null,
      working_mode: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:unassign-staff-worker] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
}

// === C7: start-staff-work ===
async function startStaffWorkAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const current = await lockCarwashBooking(booking_id);
  if (current.status === 'В РАБОТЕ') return { status: 200, body: { data: { booking: current, idempotent: true } } };
  if (current.status !== 'ОЖИДАЕТ') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({
      status: 'В РАБОТЕ',
      work_start_time: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:start-staff-work] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
}

// === C8: mark-staff-paid ===
async function markStaffPaidAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const current = await lockCarwashBooking(booking_id);
  if (current.status === 'ГОТОВО' || current.status === 'ОТМЕНЕНО') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  if (current.is_paid) {
    return { status: 200, body: { data: { booking: current, idempotent: true } } };
  }
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({
      is_paid: true,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:mark-staff-paid] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
}

// === C9: mark-staff-ready ===
async function markStaffReadyAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const current = await lockCarwashBooking(booking_id);
  if (current.status === 'ГОТОВО') return { status: 200, body: { data: { booking: current, idempotent: true } } };
  if (current.status !== 'ОЖИДАЕТ' && current.status !== 'В РАБОТЕ') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  if (!current.is_paid) {
    return failAction(409, 'must_collect_payment_first');
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('bookings')
    .update({
      status: 'ГОТОВО',
      completed_at: new Date().toISOString(),
      work_end_time: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .select()
    .maybeSingle();
  if (updErr) {
    console.error('[staff:mark-staff-ready] update error:', updErr.message);
    return failAction(500, 'db_error', { detail: updErr.message });
  }

  if (current.worker_id) {
    const { data: settings } = await supabaseAdmin
      .from('salary_settings')
      .select('worker_solo_commission, worker_pair_commission')
      .limit(1).maybeSingle();
    if (!settings) {
      console.error('[staff:mark-staff-ready] salary_settings missing', { booking_id });
      return failAction(500, 'salary_settings_missing');
    }
    const { earnings, cars } = calculateWorkerEarnings({
      working_mode: current.working_mode === 'pair' ? 'pair' : 'solo',
      booking_price: Number(current.price ?? 0),
      booking_discount: Number(current.discount ?? 0),
      worker_solo_commission: Number(settings.worker_solo_commission),
      worker_pair_commission: Number(settings.worker_pair_commission),
    });
    const result = await addWorkerEarningAndLedger(supabaseAdmin, {
      worker_id: current.worker_id,
      worker_name: current.worker_name ?? '(unknown)',
      booking_id,
      earnings,
      cars,
    });
    if (!result.rpc_success && !result.ledger_inserted && result.rpc_message !== 'already_added') {
      return failAction(500, 'add_worker_earnings_failed', { rpc_message: result.rpc_message });
    }
    if (result.rpc_success && !result.ledger_inserted) {
      console.error('[staff:mark-staff-ready] COMPENSATION ledger_write_failed', {
        booking_id, worker_id: current.worker_id, worker_name: current.worker_name,
        amount: earnings, rpc_message: result.rpc_message,
      });
      return failAction(500, 'earnings_ledger_write_failed', {
        booking_id, worker_id: current.worker_id,
        rpc_success: true, ledger_inserted: false,
      });
    }
  }

  return { status: 200, body: { data: { booking: updated } } };
}

// === C10: update-staff-payment-method ===
async function updateStaffPaymentMethodAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const payment_method = readPaymentMethod(body, 'payment_method');
  const { data, error } = await supabaseAdmin
    .from('bookings').update({ payment_method, updated_at: new Date().toISOString() })
    .eq('id', booking_id).select().maybeSingle();
  if (error) {
    console.error('[staff:update-staff-payment-method] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!data) return { status: 404, body: { error: 'booking_not_found' } };
  return { status: 200, body: { data: { booking: data } } };
}

// === C11: staff-cancel-booking ===
async function staffCancelBookingAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const cancel_comment = body.cancel_comment !== undefined
    ? readString(body, 'cancel_comment', { max: 4000, required: false })
    : null;
  const current = await lockCarwashBooking(booking_id);
  if (current.status === 'ГОТОВО') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  if (current.status === 'ОТМЕНЕНО') {
    return { status: 200, body: { data: { booking: current, idempotent: true } } };
  }
  await supabaseAdmin
    .from('worksheet_entries')
    .delete()
    .eq('carwash_booking_id', booking_id);

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({
      status: 'ОТМЕНЕНО',
      cancel_comment,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:cancel-booking] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
}

// =========================================================================
// Tire parallels (10 actions)
// =========================================================================

// === T1: create-staff-tire-booking (atomic RPC) ===
async function createStaffTireBookingAction(claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  if (!claims.profile_id) throw new ValidationError('missing_profile_id_in_token');

  for (const k of [
    'end_time', 'booking_source', 'created_by_profile_id', 'status',
    'paid_at', 'worker_name', 'org_name', 'signature_data', 'completed_at',
    'services_with_quantities', 'total_price', 'notes',
  ]) {
    if (body[k] !== undefined) throw new ValidationError(`field_not_allowed_${k}`);
  }

  const target_date    = readISODate(body, 'booking_date');
  const start_time     = readTimeHHMM(body, 'start_time');
  const estimated_duration = readNumberInRange(body, 'estimated_duration', 5, 1440, true);
  const client_name    = readString(body, 'client_name', { max: 200, required: true })!.trim();
  const phoneRaw = body.phone;
  if (!phoneRaw) throw new ValidationError('phone_required');
  const phone = normalizePhoneNumber(String(phoneRaw));
  const car_model = readString(body, 'car_model', { max: 120, required: true })!.trim();
  const plate_number = readString(body, 'plate_number', { max: 16, required: true })!.trim().toUpperCase();

  const services_in = body.services;
  if (!Array.isArray(services_in) || services_in.length === 0) {
    throw new ValidationError('services_required');
  }
  const ids = services_in.map((s: any) => String(s));
  const { data: tireRows, error: tireErr } = await supabaseAdmin
    .from('tire_services')
    .select('id, name, price, duration_minutes, is_custom_price, is_active')
    .in('id', ids)
    .eq('is_active', true);
  if (tireErr) {
    console.error('[staff:create-staff-tire-booking] tire_services query error:', tireErr.message);
    return failAction(500, 'db_error', { detail: tireErr.message });
  }
  if (!tireRows || tireRows.length !== ids.length) {
    const foundIds = new Set((tireRows ?? []).map((r: any) => r.id));
    const missing = ids.filter((x) => !foundIds.has(x));
    return failAction(400, `unknown_tire_service_${missing[0]}`);
  }

  const servicesOut: AnyObj[] = (tireRows as any[]).map((r: any) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
  }));
  const total_price = servicesOut.reduce((s, r) => s + Number(r.price), 0);

  const payment_method = body.payment_method !== undefined && body.payment_method !== null
    ? readTirePaymentMethod(body, 'payment_method')
    : null;

  const is_paid = readBoolean(body, 'is_paid');
  const paid_at = is_paid ? new Date().toISOString() : null;
  const status = body.status !== undefined
    ? readTireStatus(body, 'status')
    : 'ОЖИДАЕТ';
  const is_org = !!body.is_org;
  const organization_id = is_org ? readUuidOpt(body, 'organization_id') : null;
  const driver_id       = is_org ? readUuidOpt(body, 'driver_id')       : null;
  const car_id          = is_org ? readUuidOpt(body, 'car_id')          : null;
  const client_id       = !is_org ? readUuidOpt(body, 'client_id')      : null;
  const client_car_id   = !is_org ? readUuidOpt(body, 'client_car_id')  : null;
  const worker_id       = readUuidOpt(body, 'worker_id');

  // Atomic RPC: holds pg_advisory_xact_lock + rechecks overlap + INSERT
  // in one transaction. Mirrors create_staff_carwash_booking (migrations/008)
  // for tire — see migrations/010 for the lock-key rationale.
  const { data, error } = await supabaseAdmin.rpc('atomic_create_staff_tire_booking', {
    p_target_date: target_date,
    p_start_time: start_time,
    p_estimated_duration: estimated_duration,
    p_client_name: client_name,
    p_phone: phone,
    p_car_model: car_model,
    p_plate_number: plate_number,
    p_services: servicesOut,
    p_total_price: total_price,
    p_payment_method: payment_method,
    p_is_paid: is_paid,
    p_paid_at: paid_at,
    p_status: status,
    p_is_org: is_org,
    p_organization_id: organization_id,
    p_driver_id: driver_id,
    p_car_id: car_id,
    p_client_id: client_id,
    p_client_car_id: client_car_id,
    p_worker_id: worker_id,
    p_signature_obtained_at: null,
    p_booking_source: 'admin',
    p_created_by_profile_id: claims.profile_id,
  });

  if (error) {
    const msg = String(error.message ?? '');
    if (msg === 'TIRE_OVERLAP') return failAction(409, 'tire_overlap');
    console.error('[staff:create-staff-tire-booking] rpc error:', error);
    return failAction(500, 'create_staff_tire_booking_failed', { detail: msg });
  }

  const booking = (data as any)?.booking ?? null;
  return { status: 200, body: { data: { booking } } };
}

// === T2: update-staff-tire-booking ===
async function updateStaffTireBookingAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const ALLOWED = [
    'client_name', 'phone', 'car_model', 'plate_number',
    'booking_date', 'start_time', 'estimated_duration',
    'payment_method', 'is_org',
  ];
  const DISALLOWED_NAMES = [
    'status', 'booking_source', 'created_by_profile_id',
    'total_price', 'services', 'services_with_quantities',
    'end_time', 'worker_id', 'worker_name', 'org_name',
    'signature_data', 'signature_obtained_at', 'signature_obtained',
    'client_id', 'organization_id', 'driver_id', 'car_id', 'client_car_id',
    'is_paid', 'paid_at', 'completed_at',
    'notes',  // tire_bookings has no `notes` column; reject explicitly
  ];
  for (const f of DISALLOWED_NAMES) {
    if (body[f] !== undefined) throw new ValidationError(`field_not_allowed_${f}`);
  }
  if (!hasAnyField(body, ALLOWED)) throw new ValidationError('no_fields_to_update');

  const patch: AnyObj = { updated_at: new Date().toISOString() };
  if (body.client_name !== undefined)  patch.client_name = readString(body, 'client_name', { max: 200, required: true })!.trim();
  if (body.phone !== undefined)        patch.phone = body.phone ? normalizePhoneNumber(String(body.phone)) : null;
  if (body.car_model !== undefined)    patch.car_model = readString(body, 'car_model', { max: 120, required: true })!.trim();
  if (body.plate_number !== undefined) patch.plate_number = readString(body, 'plate_number', { max: 16, required: true })!.trim().toUpperCase();
  if (body.booking_date !== undefined) patch.booking_date = readISODate(body, 'booking_date');
  if (body.start_time !== undefined)   patch.start_time = readTimeHHMM(body, 'start_time');
  if (body.estimated_duration !== undefined) patch.estimated_duration = readNumberInRange(body, 'estimated_duration', 5, 1440, true);
  if (body.payment_method !== undefined) patch.payment_method = readTirePaymentMethod(body, 'payment_method');
  if (body.is_org !== undefined)       patch.is_org = !!body.is_org;

  const { data, error } = await supabaseAdmin
    .from('tire_bookings').update(patch).eq('id', tire_booking_id).select().maybeSingle();
  if (error) {
    console.error('[staff:update-staff-tire-booking] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!data) return { status: 404, body: { error: 'tire_booking_not_found' } };
  return { status: 200, body: { data: { booking: data } } };
}

// === T3: add-staff-tire-services (atomic RPC — full read-modify-write inside) ===
async function addStaffTireServicesAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const services_in = body.services;
  if (!Array.isArray(services_in) || services_in.length === 0) {
    throw new ValidationError('services_required');
  }
  const ids = services_in.map((s: any) => String(s));
  // Atomic RPC: holds FOR UPDATE on tire_booking row, validates service
  // ids exist in tire_services table, merges, recomputes total_price,
  // UPDATE — all in one transaction. Same pattern as atomic_modify_carwash
  // services — concurrent handlers serialize on the row-lock.
  const { data, error } = await supabaseAdmin.rpc('atomic_modify_tire_services', {
    p_tire_booking_id: tire_booking_id,
    p_action: 'add',
    p_service_ids: ids,
  });
  if (error) {
    const msg = String(error.message ?? '');
    if (msg === 'TIRE_BOOKING_NOT_FOUND') return { status: 404, body: { error: 'tire_booking_not_found' } };
    if (msg === 'INVALID_STATUS_TRANSITION') {
      return failAction(409, 'invalid_status_transition');
    }
    console.error('[staff:add-staff-tire-services] rpc error:', error);
    return failAction(500, 'db_error', { detail: msg });
  }
  const booking = (data as any)?.booking ?? null;
  return { status: 200, body: { data: { booking } } };
}

// === T4: remove-staff-tire-services (atomic RPC) ===
async function removeStaffTireServicesAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const service_id = readUuidRequired(body, 'service_id');
  const { data, error } = await supabaseAdmin.rpc('atomic_modify_tire_services', {
    p_tire_booking_id: tire_booking_id,
    p_action: 'remove',
    p_service_ids: [service_id],
  });
  if (error) {
    const msg = String(error.message ?? '');
    if (msg === 'TIRE_BOOKING_NOT_FOUND') return { status: 404, body: { error: 'tire_booking_not_found' } };
    if (msg === 'INVALID_STATUS_TRANSITION') {
      return failAction(409, 'invalid_status_transition');
    }
    console.error('[staff:remove-staff-tire-services] rpc error:', error);
    return failAction(500, 'db_error', { detail: msg });
  }
  const booking = (data as any)?.booking ?? null;
  return { status: 200, body: { data: { booking } } };
}

// === T5: assign-staff-tire-technician ===
async function assignStaffTireTechnicianAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const worker_id = readUuidRequired(body, 'worker_id');
  if (body.worker_name !== undefined) throw new ValidationError('field_not_allowed_worker_name');
  const { data: w } = await supabaseAdmin.from('tire_workers').select('id, full_name').eq('id', worker_id).maybeSingle();
  if (!w) return { status: 404, body: { error: 'tire_worker_not_found' } };
  const { data, error } = await supabaseAdmin
    .from('tire_bookings')
    .update({ worker_id, worker_name: w.full_name, updated_at: new Date().toISOString() })
    .eq('id', tire_booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:assign-staff-tire-technician] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!data) return { status: 404, body: { error: 'tire_booking_not_found' } };
  return { status: 200, body: { data: { booking: data } } };
}

// === T6: start-staff-tire-work ===
// OD#4: tire_bookings has NO work_start_time column. We change status only.
async function startStaffTireWorkAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const current = await lockTireBooking(tire_booking_id);
  if (current.status === 'В РАБОТЕ') return { status: 200, body: { data: { booking: current, idempotent: true } } };
  if (current.status !== 'ОЖИДАЕТ') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  const { data, error } = await supabaseAdmin
    .from('tire_bookings')
    .update({ status: 'В РАБОТЕ', updated_at: new Date().toISOString() })
    .eq('id', tire_booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:start-staff-tire-work] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
}

// === T7: mark-staff-tire-paid ===
async function markStaffTirePaidAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const current = await lockTireBooking(tire_booking_id);
  if (current.status === 'ГОТОВО' || current.status === 'ОТМЕНЕНО') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  if (current.is_paid) {
    return { status: 200, body: { data: { booking: current, idempotent: true } } };
  }
  const { data, error } = await supabaseAdmin
    .from('tire_bookings')
    .update({ is_paid: true, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', tire_booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:mark-staff-tire-paid] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
}

// === T8: mark-staff-tire-ready ===
async function markStaffTireReadyAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const current = await lockTireBooking(tire_booking_id);
  if (current.status === 'ГОТОВО') return { status: 200, body: { data: { booking: current, idempotent: true } } };
  if (current.status !== 'ОЖИДАЕТ' && current.status !== 'В РАБОТЕ') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  if (!current.is_paid) {
    return failAction(409, 'must_collect_payment_first');
  }
  const { data: updated, error: updErr } = await supabaseAdmin
    .from('tire_bookings')
    .update({ status: 'ГОТОВО', updated_at: new Date().toISOString() })
    .eq('id', tire_booking_id)
    .select()
    .maybeSingle();
  if (updErr) {
    console.error('[staff:mark-staff-tire-ready] update error:', updErr.message);
    return failAction(500, 'db_error', { detail: updErr.message });
  }
  if (current.worker_id) {
    const result = await addTireWorkerEarningAndLedger(supabaseAdmin, {
      worker_id: current.worker_id,
      worker_name: current.worker_name ?? '(unknown)',
      booking_id: tire_booking_id,
      total_price: Number(current.total_price ?? 0),
      services: ((current.services as AnyObj[]) ?? []) as any,
    });
    if (!result.rpc_success && !result.ledger_inserted && result.rpc_message !== 'already_added') {
      return failAction(500, 'add_tire_worker_earnings_failed', { rpc_message: result.rpc_message });
    }
    if (result.rpc_success && !result.ledger_inserted) {
      console.error('[staff:mark-staff-tire-ready] COMPENSATION ledger_write_failed', {
        tire_booking_id, worker_id: current.worker_id, worker_name: current.worker_name,
        rpc_message: result.rpc_message,
      });
      return failAction(500, 'earnings_ledger_write_failed', {
        booking_id: tire_booking_id, worker_id: current.worker_id,
        rpc_success: true, ledger_inserted: false,
      });
    }
  }
  return { status: 200, body: { data: { booking: updated } } };
}

// === T9: update-staff-tire-payment-method ===
async function updateStaffTirePaymentMethodAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const payment_method = readTirePaymentMethod(body, 'payment_method');
  const { data, error } = await supabaseAdmin
    .from('tire_bookings')
    .update({ payment_method, updated_at: new Date().toISOString() })
    .eq('id', tire_booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:update-staff-tire-payment-method] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!data) return { status: 404, body: { error: 'tire_booking_not_found' } };
  return { status: 200, body: { data: { booking: data } } };
}

// === T10: staff-cancel-tire-booking ===
async function staffCancelTireBookingAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const cancel_reason = body.cancel_reason !== undefined
    ? readString(body, 'cancel_reason', { max: 4000, required: false })
    : null;
  const current = await lockTireBooking(tire_booking_id);
  if (current.status === 'ГОТОВО') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  if (current.status === 'ОТМЕНЕНО') {
    return { status: 200, body: { data: { booking: current, idempotent: true } } };
  }
  await supabaseAdmin.from('worksheet_entries').delete().eq('tire_booking_id', tire_booking_id);

  // tire_bookings has no `notes` column — cancel_reason is NOT stored on
  // the booking row (no audit field for it either; preserved via auth_logs
  // if needed). Caller can keep cancel_reason in their UI; we just don't
  // echo it back.
  const patch: AnyObj = { status: 'ОТМЕНЕНО', updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin
    .from('tire_bookings').update(patch).eq('id', tire_booking_id).select().maybeSingle();
  if (error) {
    console.error('[staff:cancel-tire-booking] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
}

// =========================================================================
// Phase 2.1a — change-password (staff self-service)
// =========================================================================
//
// Server-side action replacing the legacy direct supabase.rpc('change_password')
// call in components/admin/ChangePasswordWizard.tsx.
//
// Contract:
//   requireStaff (admin OR owner) — verified by caller-side guard.
//   p_user_id is server-stamped from claims.profile_id — NEVER from body.
//     An admin changing another admin's password requires a separate admin
//     action (not in scope for Phase 2.1a — owner self-service is enough
//     for now since ChangePasswordWizard only changes the OWN profile's
//     password).
//   p_old_password and p_new_password validated (1..200 chars).
//   Reject same-as-old to prevent no-op writes (RPC doesn't check this).
//
// RPC `change_password` returns boolean:
//   true  → password updated
//   false → either profile not found OR old_password mismatch
//           (don't leak which — both → 400 invalid_credentials).
//
// After Phase 2.1a is deployed + smoke-tested, this is followed by:
//   migration 016_revoke_change_password.sql
//   REVOKE EXECUTE FROM PUBLIC + FROM anon + FROM authenticated
//   on public.change_password(...) — service_role EXEC preserved.
async function changeStaffPasswordAction(claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  // Reject any attempt to specify p_user_id — must be server-stamped.
  if (body.p_user_id !== undefined) {
    throw new ValidationError('field_not_allowed_p_user_id');
  }
  // Validate both passwords before doing anything else. Use direct checks
  // (not readString) so we can return a single consistent error code
  // 'password_required' for any missing/empty input — easier for the
  // frontend to surface one localized string instead of two different
  // ones (p_old_password_required vs p_new_password_required).
  const oldPassword = body.p_old_password;
  const newPassword = body.p_new_password;
  if (typeof oldPassword !== 'string' || typeof newPassword !== 'string') {
    throw new ValidationError('password_required');
  }
  if (oldPassword.length < 1 || newPassword.length < 1) {
    throw new ValidationError('password_required');
  }
  if (oldPassword.length > 200 || newPassword.length > 200) {
    throw new ValidationError('password_too_long');
  }
  // Reject same-as-old explicitly (RPC allows it but it's a no-op that
  // wastes a write + bumps updated_at).
  if (oldPassword === newPassword) {
    return failAction(400, 'password_same_as_old');
  }

  const { data, error } = await supabaseAdmin.rpc('change_password', {
    p_user_id: claims.profile_id,
    p_old_password: oldPassword,
    p_new_password: newPassword,
  });
  if (error) {
    console.error('[staff:change-password] rpc error:', error.message);
    return failAction(500, 'change_password_failed', { detail: error.message });
  }
  if (data !== true) {
    // RPC returned false — covers both "profile not found" and
    // "old_password mismatch". Don't leak which case.
    return failAction(400, 'invalid_credentials');
  }
  return { status: 200, body: { data: { success: true } } };
}

// =========================================================================
// Slice #3c — Category A writes (Phase 2.4)
// =========================================================================
//
// 15 dispatcher actions replacing direct supabase.from('admins'),
// supabase.from('salary_settings'), etc. from frontend. After
// migration 017 (REVOKE grant-level + new RLS policies), admin dashboard
// reads remain direct via RLS, but all writes MUST go through these
// actions which use supabaseAdmin (service_role) to bypass REVOKE.
//
// Authorization matrix (entry 21 of PROJECT_STATE.md):
//   4 admin-or-owner: start-admin-shift, create-earning-transaction,
//                      create-advance-transaction, create-transfer-transaction
//  11 owner-only:    create-admin, update-admin, delete-admin,
//                      admin-give-advance, admin-payout-salary,
//                      admin-transfer-balance, create-payout-transaction,
//                      delete-salary-transaction, update-salary-settings,
//                      create-company-settings, update-company-settings
//
// Helper: requireOwner(claims) — used for owner-only actions.
// requireStaff already exists for admin-or-owner.

// =========================================================================
// Helper: requireOwner — checks claims.app_role === 'owner'
// =========================================================================
class OwnerOnlyError extends Error {
  code = 'owner_only_required';
}
function requireOwner(claims: StaffClaims): void {
  if (claims.app_role !== 'owner') {
    throw new OwnerOnlyError();
  }
}

// =========================================================================
// admins CRUD (4 actions)
// =========================================================================
async function createAdminAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  // Reject client-supplied id/profile_id/created_at/updated_at.
  for (const f of ['id', 'profile_id', 'created_at', 'updated_at', 'is_active']) {
    if (body[f] !== undefined) throw new ValidationError(`field_not_allowed_${f}`);
  }
  const full_name = readString(body, 'full_name', { max: 200, required: true });
  if (!full_name) throw new ValidationError('full_name_required');
  const phone = body.phone !== undefined ? body.phone : null;
  const card_number = body.card_number !== undefined ? body.card_number : null;
  const payment_phone = body.payment_phone !== undefined ? body.payment_phone : null;
  const fixed_salary = body.fixed_salary !== undefined ? Number(body.fixed_salary) : null;
  if (fixed_salary !== null && (!Number.isFinite(fixed_salary) || fixed_salary < 0)) {
    throw new ValidationError('fixed_salary_invalid');
  }
  const insert: AnyObj = { full_name };
  if (phone !== null) insert.phone = phone;
  if (card_number !== null) insert.card_number = card_number;
  if (payment_phone !== null) insert.payment_phone = payment_phone;
  if (fixed_salary !== null) insert.fixed_salary = fixed_salary;
  const { data, error } = await supabaseAdmin.from('admins').insert(insert).select().maybeSingle();
  if (error) {
    console.error('[staff:create-admin] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { admin: data } } };
}

async function updateAdminAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  const admin_id = readUuidRequired(body, 'admin_id');
  for (const f of ['id', 'profile_id', 'created_at']) {
    if (body[f] !== undefined) throw new ValidationError(`field_not_allowed_${f}`);
  }
  const patch: AnyObj = { updated_at: new Date().toISOString() };
  if (body.full_name !== undefined) {
    const v = readString(body, 'full_name', { max: 200, required: true });
    if (!v) throw new ValidationError('full_name_invalid');
    patch.full_name = v.trim();
  }
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.card_number !== undefined) patch.card_number = body.card_number;
  if (body.payment_phone !== undefined) patch.payment_phone = body.payment_phone;
  if (body.fixed_salary !== undefined) {
    const v = Number(body.fixed_salary);
    if (!Number.isFinite(v) || v < 0) throw new ValidationError('fixed_salary_invalid');
    patch.fixed_salary = v;
  }
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  const { data, error } = await supabaseAdmin
    .from('admins').update(patch).eq('id', admin_id).select().maybeSingle();
  if (error) {
    console.error('[staff:update-admin] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!data) return failAction(404, 'admin_not_found');
  return { status: 200, body: { data: { admin: data } } };
}

async function deleteAdminAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  const admin_id = readUuidRequired(body, 'admin_id');
  const { error } = await supabaseAdmin.from('admins').delete().eq('id', admin_id);
  if (error) {
    console.error('[staff:delete-admin] delete error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { success: true } } };
}

// =========================================================================
// start-admin-shift (admin-or-owner, dispatcher proxy for INVOKER RPC)
// =========================================================================
async function startAdminShiftAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  // No requireOwner — admin-or-owner OK.
  const admin_id = readUuidRequired(body, 'admin_id');
  if (body.p_admin_id !== undefined && body.p_admin_id !== undefined) {
    // already covered by readUuidRequired above
  }
  // p_salary and p_today are server-derived. Caller doesn't pass them.
  // p_today = today date in YYYY-MM-DD format.
  const today = new Date().toISOString().slice(0, 10);
  // p_salary = 0 default; admin shift start doesn't carry a salary param in
  // our admin dashboard (no fixed_salary increase on shift start).
  const { data, error } = await supabaseAdmin.rpc('start_admin_shift', {
    p_admin_id: admin_id,
    p_salary: 0,
    p_today: today,
  });
  if (error) {
    console.error('[staff:start-admin-shift] rpc error:', error.message);
    return failAction(500, 'start_admin_shift_failed', { detail: error.message });
  }
  return { status: 200, body: { data: { admin: data } } };
}

// =========================================================================
// admin-give-advance / admin-payout-salary / admin-transfer-balance
// (all owner-only — admin shouldn't manage their own money out)
// =========================================================================
async function adminGiveAdvanceAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  const admin_id = readUuidRequired(body, 'admin_id');
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('amount_invalid');
  }
  // Direct UPDATE on admins.current_balance + earned_today.
  // Original lib/api/admins.ts:giveAdminAdvance did this in JS with separate
  // SELECT/UPDATE — server-side we combine into one transaction.
  const { data: admin, error: fetchErr } = await supabaseAdmin
    .from('admins').select('current_balance, earned_today').eq('id', admin_id).single();
  if (fetchErr || !admin) {
    console.error('[staff:admin-give-advance] fetch error:', fetchErr?.message);
    return failAction(404, 'admin_not_found');
  }
  const newBalance = Number(admin.current_balance) + amount;
  const newEarned = Number(admin.earned_today) - amount;
  if (newEarned < 0) {
    return failAction(400, 'insufficient_earned_today');
  }
  const { data, error } = await supabaseAdmin
    .from('admins')
    .update({
      current_balance: newBalance,
      earned_today: newEarned,
      is_advance_taken: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', admin_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:admin-give-advance] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  // Create a salary_transactions ledger row (mirroring legacy JS logic).
  const { error: txErr } = await supabaseAdmin.from('salary_transactions').insert({
    worker_type: 'admin',
    worker_id: admin_id,
    amount: amount,
    transaction_type: 'ADVANCE',
    description: `Аванс админу`,
    created_at: new Date().toISOString(),
  });
  if (txErr) {
    console.error('[staff:admin-give-advance] ledger insert error:', txErr.message);
    // Compensate: revert balance update
    await supabaseAdmin.from('admins').update({
      current_balance: admin.current_balance,
      earned_today: admin.earned_today,
      is_advance_taken: false,
    }).eq('id', admin_id);
    return failAction(500, 'salary_transaction_failed', { detail: txErr.message });
  }
  return { status: 200, body: { data: { admin: data } } };
}

async function adminPayoutSalaryAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  const admin_id = readUuidRequired(body, 'admin_id');
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('amount_invalid');
  }
  const { data: admin, error: fetchErr } = await supabaseAdmin
    .from('admins').select('current_balance').eq('id', admin_id).single();
  if (fetchErr || !admin) {
    return failAction(404, 'admin_not_found');
  }
  if (Number(admin.current_balance) < amount) {
    return failAction(400, 'insufficient_balance');
  }
  const newBalance = Number(admin.current_balance) - amount;
  const { data, error } = await supabaseAdmin
    .from('admins')
    .update({
      current_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', admin_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:admin-payout-salary] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  const { error: txErr } = await supabaseAdmin.from('salary_transactions').insert({
    worker_type: 'admin',
    worker_id: admin_id,
    amount: amount,
    transaction_type: 'PAYOUT',
    description: `Выплата зарплаты админу`,
    created_at: new Date().toISOString(),
  });
  if (txErr) {
    await supabaseAdmin.from('admins').update({
      current_balance: admin.current_balance,
    }).eq('id', admin_id);
    return failAction(500, 'salary_transaction_failed', { detail: txErr.message });
  }
  return { status: 200, body: { data: { admin: data } } };
}

async function adminTransferBalanceAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  const admin_id = readUuidRequired(body, 'admin_id');
  const { data: admin, error: fetchErr } = await supabaseAdmin
    .from('admins').select('earned_today, current_balance').eq('id', admin_id).single();
  if (fetchErr || !admin) {
    return failAction(404, 'admin_not_found');
  }
  const earned = Number(admin.earned_today);
  // Idempotent: if earned_today = 0 (admin hasn't earned anything yet),
  // this is a valid business state — return success with idempotent=true
  // instead of 400 error. UI shows no transfer happened.
  if (earned <= 0) {
    return { status: 200, body: { data: { admin, idempotent: true, transferred: 0 } } };
  }
  const newBalance = Number(admin.current_balance) + earned;
  const { data, error } = await supabaseAdmin
    .from('admins')
    .update({
      current_balance: newBalance,
      earned_today: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', admin_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:admin-transfer-balance] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  const { error: txErr } = await supabaseAdmin.from('salary_transactions').insert({
    worker_type: 'admin',
    worker_id: admin_id,
    amount: earned,
    transaction_type: 'TRANSFER',
    description: `Перевод earned → balance (admin)`,
    created_at: new Date().toISOString(),
  });
  if (txErr) {
    await supabaseAdmin.from('admins').update({
      current_balance: admin.current_balance,
      earned_today: admin.earned_today,
    }).eq('id', admin_id);
    return failAction(500, 'salary_transaction_failed', { detail: txErr.message });
  }
  return { status: 200, body: { data: { admin: data } } };
}

// =========================================================================
// salary_transactions writes (4 actions)
// =========================================================================
async function createEarningTransactionAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  // admin-or-owner
  const worker_type = readString(body, 'worker_type', { max: 32, required: true });
  const worker_id = readUuidRequired(body, 'worker_id');
  const worker_name = readString(body, 'worker_name', { max: 200, required: true });
  const amount = Number(body.amount);
  if (!Number.isFinite(amount)) throw new ValidationError('amount_invalid');
  // balance_after is NOT NULL in DB — make it required.
  if (body.balance_after === undefined || body.balance_after === null) {
    throw new ValidationError('balance_after_required');
  }
  const balance_after = Number(body.balance_after);
  if (!Number.isFinite(balance_after)) throw new ValidationError('balance_after_invalid');
  const description = body.description !== undefined ? body.description : null;
  const { data, error } = await supabaseAdmin.from('salary_transactions').insert({
    worker_type,
    worker_id,
    worker_name,
    amount,
    balance_after,
    transaction_type: 'EARNING',
    description,
    created_at: new Date().toISOString(),
  }).select().maybeSingle();
  if (error) {
    console.error('[staff:create-earning-transaction] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { transaction: data } } };
}

async function createAdvanceTransactionAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  // admin-or-owner
  const worker_type = readString(body, 'worker_type', { max: 32, required: true });
  const worker_id = readUuidRequired(body, 'worker_id');
  const worker_name = readString(body, 'worker_name', { max: 200, required: true });
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('amount_invalid');
  if (body.balance_after === undefined || body.balance_after === null) {
    throw new ValidationError('balance_after_required');
  }
  const balance_after = Number(body.balance_after);
  if (!Number.isFinite(balance_after)) throw new ValidationError('balance_after_invalid');
  const description = body.description !== undefined ? body.description : null;
  const notes = body.notes !== undefined ? body.notes : null;
  const { data, error } = await supabaseAdmin.from('salary_transactions').insert({
    worker_type,
    worker_id,
    worker_name,
    amount,
    balance_after,
    transaction_type: 'ADVANCE',
    description,
    notes,
    created_at: new Date().toISOString(),
  }).select().maybeSingle();
  if (error) {
    console.error('[staff:create-advance-transaction] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { transaction: data } } };
}

async function createPayoutTransactionAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  const worker_type = readString(body, 'worker_type', { max: 32, required: true });
  const worker_id = readUuidRequired(body, 'worker_id');
  const worker_name = readString(body, 'worker_name', { max: 200, required: true });
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('amount_invalid');
  if (body.balance_after === undefined || body.balance_after === null) {
    throw new ValidationError('balance_after_required');
  }
  const balance_after = Number(body.balance_after);
  if (!Number.isFinite(balance_after)) throw new ValidationError('balance_after_invalid');
  const description = body.description !== undefined ? body.description : null;
  const notes = body.notes !== undefined ? body.notes : null;
  const { data, error } = await supabaseAdmin.from('salary_transactions').insert({
    worker_type,
    worker_id,
    worker_name,
    amount,
    balance_after,
    transaction_type: 'PAYOUT',
    description,
    notes,
    created_at: new Date().toISOString(),
  }).select().maybeSingle();
  if (error) {
    console.error('[staff:create-payout-transaction] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { transaction: data } } };
}

async function createTransferTransactionAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  // admin-or-owner
  const worker_type = readString(body, 'worker_type', { max: 32, required: true });
  const worker_id = readUuidRequired(body, 'worker_id');
  const worker_name = readString(body, 'worker_name', { max: 200, required: true });
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('amount_invalid');
  if (body.balance_after === undefined || body.balance_after === null) {
    throw new ValidationError('balance_after_required');
  }
  const balance_after = Number(body.balance_after);
  if (!Number.isFinite(balance_after)) throw new ValidationError('balance_after_invalid');
  const description = body.description !== undefined ? body.description : null;
  const { data, error } = await supabaseAdmin.from('salary_transactions').insert({
    worker_type,
    worker_id,
    worker_name,
    amount,
    balance_after,
    transaction_type: 'TRANSFER',
    description,
    created_at: new Date().toISOString(),
  }).select().maybeSingle();
  if (error) {
    console.error('[staff:create-transfer-transaction] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { transaction: data } } };
}

async function deleteSalaryTransactionAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  const transaction_id = readUuidRequired(body, 'transaction_id');
  const { error } = await supabaseAdmin
    .from('salary_transactions').delete().eq('id', transaction_id);
  if (error) {
    console.error('[staff:delete-salary-transaction] delete error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { success: true } } };
}

// =========================================================================
// salary_settings + company_settings (3 actions, all owner-only)
// =========================================================================
async function updateSalarySettingsAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  for (const f of ['id', 'created_at', 'updated_at']) {
    if (body[f] !== undefined) throw new ValidationError(`field_not_allowed_${f}`);
  }
  const patch: AnyObj = { updated_at: new Date().toISOString() };
  // All salary_settings columns are numeric >= 0. Some are 0..1 (commissions),
  // others are unbounded (base/storage). Validate accordingly.
  const NUM_0_1 = (v: any, name: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      throw new ValidationError(`${name}_invalid`);
    }
    return n;
  };
  const NUM_0 = (v: any, name: string): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      throw new ValidationError(`${name}_invalid`);
    }
    return n;
  };
  if (body.worker_solo_base !== undefined)     patch.worker_solo_base     = NUM_0(body.worker_solo_base, 'worker_solo_base');
  if (body.worker_solo_commission !== undefined) patch.worker_solo_commission = NUM_0_1(body.worker_solo_commission, 'worker_solo_commission');
  if (body.worker_pair_base !== undefined)     patch.worker_pair_base     = NUM_0(body.worker_pair_base, 'worker_pair_base');
  if (body.worker_pair_commission !== undefined) patch.worker_pair_commission = NUM_0_1(body.worker_pair_commission, 'worker_pair_commission');
  if (body.tire_worker_commission !== undefined) patch.tire_worker_commission = NUM_0_1(body.tire_worker_commission, 'tire_worker_commission');
  if (body.tire_worker_storage_fee !== undefined) patch.tire_worker_storage_fee = NUM_0(body.tire_worker_storage_fee, 'tire_worker_storage_fee');
  if (body.admin_fixed_salary !== undefined)   patch.admin_fixed_salary   = NUM_0(body.admin_fixed_salary, 'admin_fixed_salary');
  // Singleton: there is exactly one salary_settings row. Read id first,
  // then UPDATE with WHERE (PostgreSQL rejects UPDATE without WHERE).
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('salary_settings').select('id').limit(1).maybeSingle();
  if (fetchErr) {
    console.error('[staff:update-salary-settings] fetch error:', fetchErr.message);
    return failAction(500, 'db_error', { detail: fetchErr.message });
  }
  if (!existing) return failAction(404, 'salary_settings_not_found');
  const { data, error } = await supabaseAdmin
    .from('salary_settings').update(patch).eq('id', existing.id).select().maybeSingle();
  if (error) {
    console.error('[staff:update-salary-settings] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!data) return failAction(404, 'salary_settings_not_found');
  return { status: 200, body: { data: { settings: data } } };
}

async function createCompanySettingsAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  for (const f of ['id', 'created_at', 'updated_at']) {
    if (body[f] !== undefined) throw new ValidationError(`field_not_allowed_${f}`);
  }
  // Required: legal_form, full_legal_name, inn, ogrn, legal_address,
  //           bank_name, bik, correspondent_account, payment_account,
  //           director_name.
  // Optional: short_name, kpp, actual_address, director_position,
  //           accountant_name, is_vat_payer, phone, email, website,
  //           is_active.
  const REQUIRED = [
    'legal_form', 'full_legal_name', 'inn', 'ogrn', 'legal_address',
    'bank_name', 'bik', 'correspondent_account', 'payment_account',
    'director_name',
  ];
  const OPTIONAL_TEXT = [
    'short_name', 'kpp', 'actual_address', 'director_position',
    'accountant_name', 'phone', 'email', 'website',
  ];
  for (const f of REQUIRED) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      throw new ValidationError(`${f}_required`);
    }
  }
  const insert: AnyObj = {};
  for (const f of REQUIRED) insert[f] = String(body[f]);
  for (const f of OPTIONAL_TEXT) {
    if (body[f] !== undefined && body[f] !== null) insert[f] = String(body[f]);
  }
  if (body.is_vat_payer !== undefined) insert.is_vat_payer = !!body.is_vat_payer;
  if (body.is_active !== undefined) insert.is_active = !!body.is_active;
  const { data, error } = await supabaseAdmin
    .from('company_settings').insert(insert).select().maybeSingle();
  if (error) {
    console.error('[staff:create-company-settings] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { settings: data } } };
}

async function updateCompanySettingsAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  requireOwner(_claims);
  const settings_id = readUuidRequired(body, 'settings_id');
  for (const f of ['id', 'created_at']) {
    if (body[f] !== undefined) throw new ValidationError(`field_not_allowed_${f}`);
  }
  const UPDATABLE_TEXT = [
    'legal_form', 'full_legal_name', 'short_name', 'inn', 'kpp', 'ogrn',
    'legal_address', 'actual_address', 'bank_name', 'bik',
    'correspondent_account', 'payment_account', 'director_name',
    'director_position', 'accountant_name', 'phone', 'email', 'website',
  ];
  const patch: AnyObj = { updated_at: new Date().toISOString() };
  for (const k of UPDATABLE_TEXT) {
    if (body[k] !== undefined) patch[k] = body[k] === null ? null : String(body[k]);
  }
  if (body.is_vat_payer !== undefined) patch.is_vat_payer = !!body.is_vat_payer;
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  const { data, error } = await supabaseAdmin
    .from('company_settings').update(patch).eq('id', settings_id).select().maybeSingle();
  if (error) {
    console.error('[staff:update-company-settings] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  if (!data) return failAction(404, 'company_settings_not_found');
  return { status: 200, body: { data: { settings: data } } };
}

// =========================================================================
// Dispatch
// =========================================================================

function extractAction(req: any): string | null {
  let a: any = (req?.query?.action ?? '');
  if (a) return String(a);
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

  const guard = await requireStaff(req);
  if ('errorRes' in guard) return res.status(guard.errorRes.status).json(guard.errorRes.body);

  const action = extractAction(req);
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return res.status(404).json({ error: 'unknown_action' });
  }

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
      case 'search-client-by-phone':       result = await searchClientByPhone(guard.claims, body); break;
      case 'create-client':                result = await createClientAction(guard.claims, body); break;
      case 'update-client':                result = await updateClientAction(guard.claims, body); break;
      case 'unblock-client':               result = await unblockClientAction(guard.claims, body); break;
      case 'create-client-car':            result = await createClientCarAction(guard.claims, body); break;
      case 'update-client-car':            result = await updateClientCarAction(guard.claims, body); break;
      case 'create-organization':          result = await createOrganizationAction(guard.claims, body); break;
      case 'update-organization':          result = await updateOrganizationAction(guard.claims, body); break;
      case 'create-org-driver':            result = await createOrgDriverAction(guard.claims, body); break;
      case 'update-org-driver':            result = await updateOrgDriverAction(guard.claims, body); break;
      case 'update-driver-signature':      result = await updateDriverSignatureAction(guard.claims, body); break;
      case 'create-org-car':               result = await createOrgCarAction(guard.claims, body); break;
      case 'update-org-car':               result = await updateOrgCarAction(guard.claims, body); break;

      // Slice #3b — carwash:
      case 'create-staff-booking':         result = await createStaffBookingAction(guard.claims, body); break;
      case 'update-staff-booking':         result = await updateStaffBookingAction(guard.claims, body); break;
      case 'add-staff-services':           result = await addStaffServicesAction(guard.claims, body); break;
      case 'remove-staff-services':        result = await removeStaffServicesAction(guard.claims, body); break;
      case 'assign-staff-worker':          result = await assignStaffWorkerAction(guard.claims, body); break;
      case 'unassign-staff-worker':        result = await unassignStaffWorkerAction(guard.claims, body); break;
      case 'start-staff-work':             result = await startStaffWorkAction(guard.claims, body); break;
      case 'mark-staff-paid':              result = await markStaffPaidAction(guard.claims, body); break;
      case 'mark-staff-ready':             result = await markStaffReadyAction(guard.claims, body); break;
      case 'update-staff-payment-method':  result = await updateStaffPaymentMethodAction(guard.claims, body); break;
      case 'staff-cancel-booking':         result = await staffCancelBookingAction(guard.claims, body); break;

      // Slice #3b — tire:
      case 'create-staff-tire-booking':         result = await createStaffTireBookingAction(guard.claims, body); break;
      case 'update-staff-tire-booking':         result = await updateStaffTireBookingAction(guard.claims, body); break;
      case 'add-staff-tire-services':           result = await addStaffTireServicesAction(guard.claims, body); break;
      case 'remove-staff-tire-services':        result = await removeStaffTireServicesAction(guard.claims, body); break;
      case 'assign-staff-tire-technician':      result = await assignStaffTireTechnicianAction(guard.claims, body); break;
      case 'start-staff-tire-work':             result = await startStaffTireWorkAction(guard.claims, body); break;
      case 'mark-staff-tire-paid':              result = await markStaffTirePaidAction(guard.claims, body); break;
      case 'mark-staff-tire-ready':             result = await markStaffTireReadyAction(guard.claims, body); break;
      case 'update-staff-tire-payment-method':  result = await updateStaffTirePaymentMethodAction(guard.claims, body); break;
      case 'staff-cancel-tire-booking':         result = await staffCancelTireBookingAction(guard.claims, body); break;

      // Phase 2.1a — staff self-service password change:
      case 'change-password':                    result = await changeStaffPasswordAction(guard.claims, body); break;

      // Slice #3c — Category A writes (15 actions):
      case 'create-admin':                      result = await createAdminAction(guard.claims, body); break;
      case 'update-admin':                      result = await updateAdminAction(guard.claims, body); break;
      case 'delete-admin':                      result = await deleteAdminAction(guard.claims, body); break;
      case 'start-admin-shift':                 result = await startAdminShiftAction(guard.claims, body); break;
      case 'admin-give-advance':                result = await adminGiveAdvanceAction(guard.claims, body); break;
      case 'admin-payout-salary':               result = await adminPayoutSalaryAction(guard.claims, body); break;
      case 'admin-transfer-balance':            result = await adminTransferBalanceAction(guard.claims, body); break;
      case 'create-earning-transaction':         result = await createEarningTransactionAction(guard.claims, body); break;
      case 'create-advance-transaction':         result = await createAdvanceTransactionAction(guard.claims, body); break;
      case 'create-payout-transaction':         result = await createPayoutTransactionAction(guard.claims, body); break;
      case 'create-transfer-transaction':        result = await createTransferTransactionAction(guard.claims, body); break;
      case 'delete-salary-transaction':         result = await deleteSalaryTransactionAction(guard.claims, body); break;
      case 'update-salary-settings':            result = await updateSalarySettingsAction(guard.claims, body); break;
      case 'create-company-settings':           result = await createCompanySettingsAction(guard.claims, body); break;
      case 'update-company-settings':           result = await updateCompanySettingsAction(guard.claims, body); break;

      default:
        return res.status(404).json({ error: 'unknown_action' });
    }
    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    if (err instanceof OwnerOnlyError) {
      return res.status(403).json({ error: err.code });
    }
    console.error(`[staff:${action}] uncaught:`, err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
