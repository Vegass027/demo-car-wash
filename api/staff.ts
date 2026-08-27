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
  // Slice #3a — staff client/car/org:
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
    p_services: JSON.stringify(recomputed.services),
    p_services_with_quantities: JSON.stringify(recomputed.services_with_quantities),
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
    'box_number', 'payment_method', 'discount', 'notes', 'is_org',
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
  if (body.notes !== undefined)        patch.notes = body.notes === null ? null : readString(body, 'notes', { max: 4000, required: true });
  if (body.is_org !== undefined)       patch.is_org = !!body.is_org;

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

// === C3: add-staff-services ===
async function addStaffServicesAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const service_ids = body.service_ids;
  if (!Array.isArray(service_ids) || service_ids.length === 0) {
    throw new ValidationError('service_ids_required');
  }
  const current = await lockCarwashBooking(booking_id);
  if (current.status === 'ГОТОВО' || current.status === 'ОТМЕНЕНО') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  const merged = [...((current.services as string[]) ?? []), ...service_ids.map((s: any) => String(s))];
  const allow_override = !!body.allow_override;
  const antifreeze_intents = body.antifreeze_intents ?? [];

  const recomputed = await recomputeBookingServices(supabaseAdmin, {
    services: merged,
    car_type: current.car_type,
    antifreeze_intents,
    allow_override,
    discount: Number(current.discount ?? 0),
  });

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({
      services: recomputed.services,
      services_with_quantities: recomputed.services_with_quantities,
      price: recomputed.final_price,
      discount: recomputed.discount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:add-staff-services] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
}

// === C4: remove-staff-services ===
async function removeStaffServicesAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const booking_id = readUuidRequired(body, 'booking_id');
  const service_id = readUuidRequired(body, 'service_id');
  const current = await lockCarwashBooking(booking_id);
  if (current.status === 'ГОТОВО' || current.status === 'ОТМЕНЕНО') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  const merged = ((current.services as string[]) ?? []).filter((x: string) => x !== service_id);
  const recomputed = await recomputeBookingServices(supabaseAdmin, {
    services: merged,
    car_type: current.car_type,
    antifreeze_intents: [],
    allow_override: false,
    discount: Number(current.discount ?? 0),
  });
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({
      services: recomputed.services,
      services_with_quantities: recomputed.services_with_quantities,
      price: recomputed.final_price,
      discount: recomputed.discount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:remove-staff-services] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
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

// === T1: create-staff-tire-booking ===
async function createStaffTireBookingAction(claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  if (!claims.profile_id) throw new ValidationError('missing_profile_id_in_token');

  for (const k of [
    'end_time', 'booking_source', 'created_by_profile_id', 'status',
    'paid_at', 'worker_name', 'org_name', 'signature_data', 'completed_at',
    'services_with_quantities', 'total_price',
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
  const idList = ids.map((x) => `'${x.replace(/'/g, "''")}'`).join(',');
  const { data: tireRows, error: tireErr } = await supabaseAdmin
    .from('tire_services')
    .select('id, name, price, duration_minutes, is_custom_price, is_active')
    .or(`id.in.(${idList})`)
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

  const servicesOut: AnyObj[] = tireRows.map((r: any) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
  }));
  const total_price = servicesOut.reduce((s, r) => s + Number(r.price), 0);

  const payment_method = body.payment_method !== undefined && body.payment_method !== null
    ? readPaymentMethod(body, 'payment_method')
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

  let worker_name: string | null = null;
  let signature_data: string | null = null;
  let signature_obtained_at: string | null = null;
  let org_name: string | null = null;

  if (worker_id) {
    const { data: w } = await supabaseAdmin.from('tire_workers').select('id, full_name').eq('id', worker_id).maybeSingle();
    if (!w) return { status: 404, body: { error: 'tire_worker_not_found' } };
    worker_name = w.full_name;
  }
  if (is_org && organization_id) {
    const { data: o } = await supabaseAdmin.from('organizations').select('id, name').eq('id', organization_id).maybeSingle();
    if (!o) return { status: 404, body: { error: 'organization_not_found' } };
    org_name = o.name;
  }
  if (is_org && driver_id) {
    const { data: d } = await supabaseAdmin.from('organization_drivers').select('id, signature_data').eq('id', driver_id).maybeSingle();
    if (d && d.signature_data) {
      signature_data = d.signature_data;
      signature_obtained_at = new Date().toISOString();
    }
  }

  const insert: AnyObj = {
    client_name, phone, car_model, plate_number,
    booking_date: target_date, start_time, estimated_duration,
    services: servicesOut, total_price,
    payment_method, is_paid, paid_at, status,
    is_org, organization_id, driver_id, car_id, org_name,
    client_id, client_car_id,
    worker_id, worker_name,
    signature_data, signature_obtained_at,
    booking_source: 'admin',
    created_by_profile_id: claims.profile_id,
  };
  if (body.notes !== undefined) insert.notes = body.notes === null ? null : readString(body, 'notes', { max: 4000, required: false });

  const { data, error } = await supabaseAdmin
    .from('tire_bookings').insert(insert).select().maybeSingle();
  if (error) {
    console.error('[staff:create-staff-tire-booking] insert error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
}

// === T2: update-staff-tire-booking ===
async function updateStaffTireBookingAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const ALLOWED = [
    'client_name', 'phone', 'car_model', 'plate_number',
    'booking_date', 'start_time', 'estimated_duration',
    'payment_method', 'notes', 'is_org',
  ];
  const DISALLOWED_NAMES = [
    'status', 'booking_source', 'created_by_profile_id',
    'total_price', 'services', 'services_with_quantities',
    'end_time', 'worker_id', 'worker_name', 'org_name',
    'signature_data', 'signature_obtained_at', 'signature_obtained',
    'client_id', 'organization_id', 'driver_id', 'car_id', 'client_car_id',
    'is_paid', 'paid_at', 'completed_at',
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
  if (body.payment_method !== undefined) patch.payment_method = readPaymentMethod(body, 'payment_method');
  if (body.notes !== undefined)        patch.notes = body.notes === null ? null : readString(body, 'notes', { max: 4000, required: true });
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

// === T3: add-staff-tire-services ===
async function addStaffTireServicesAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const services_in = body.services;
  if (!Array.isArray(services_in) || services_in.length === 0) {
    throw new ValidationError('services_required');
  }
  const ids = services_in.map((s: any) => String(s));
  const idList = ids.map((x) => `'${x.replace(/'/g, "''")}'`).join(',');
  const current = await lockTireBooking(tire_booking_id);
  if (current.status === 'ГОТОВО' || current.status === 'ОТМЕНЕНО') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  const { data: tireRows, error: tireErr } = await supabaseAdmin
    .from('tire_services')
    .select('id, name, price')
    .or(`id.in.(${idList})`)
    .eq('is_active', true);
  if (tireErr) return failAction(500, 'db_error', { detail: tireErr.message });
  if (!tireRows || tireRows.length !== ids.length) {
    const foundIds = new Set((tireRows ?? []).map((r: any) => r.id));
    const missing = ids.filter((x) => !foundIds.has(x));
    return failAction(400, `unknown_tire_service_${missing[0]}`);
  }
  const newOnes = tireRows.map((r: any) => ({ id: r.id, name: r.name, price: Number(r.price) }));
  const merged = [...((current.services as AnyObj[]) ?? []), ...newOnes];
  const total_price = merged.reduce((s, r) => s + Number(r.price), 0);
  const { data, error } = await supabaseAdmin
    .from('tire_bookings')
    .update({ services: merged, total_price, updated_at: new Date().toISOString() })
    .eq('id', tire_booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:add-staff-tire-services] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
}

// === T4: remove-staff-tire-services ===
async function removeStaffTireServicesAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const tire_booking_id = readUuidRequired(body, 'tire_booking_id');
  const service_id = readUuidRequired(body, 'service_id');
  const current = await lockTireBooking(tire_booking_id);
  if (current.status === 'ГОТОВО' || current.status === 'ОТМЕНЕНО') {
    return failAction(409, 'invalid_status_transition', { status: current.status });
  }
  const merged = ((current.services as AnyObj[]) ?? []).filter((x: any) => x.id !== service_id);
  const total_price = merged.reduce((s: number, r: any) => s + Number(r.price ?? 0), 0);
  const { data, error } = await supabaseAdmin
    .from('tire_bookings')
    .update({ services: merged, total_price, updated_at: new Date().toISOString() })
    .eq('id', tire_booking_id)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[staff:remove-staff-tire-services] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
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
  const payment_method = readPaymentMethod(body, 'payment_method');
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

  const patch: AnyObj = { status: 'ОТМЕНЕНО', updated_at: new Date().toISOString() };
  if (cancel_reason) patch.notes = cancel_reason;
  const { data, error } = await supabaseAdmin
    .from('tire_bookings').update(patch).eq('id', tire_booking_id).select().maybeSingle();
  if (error) {
    console.error('[staff:cancel-tire-booking] update error:', error.message);
    return failAction(500, 'db_error', { detail: error.message });
  }
  return { status: 200, body: { data: { booking: data } } };
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

      default:
        return res.status(404).json({ error: 'unknown_action' });
    }
    return res.status(result.status).json(result.body);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.code });
    }
    console.error(`[staff:${action}] uncaught:`, err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
