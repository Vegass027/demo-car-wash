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
} from './_lib/validation.js';
import { normalizePhoneNumber } from '../shared/utils/phone.js';

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
