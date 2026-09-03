// tests/issue15-quick-booking-null-box.test.mjs
// Issue 15 — quick booking should allow box_number = null on DEMO,
// matching existing PROD semantics (avajtwihzjfpytimfbaw: 20 quick
// bookings already exist there with box_number = NULL).
//
// Four blocks:
//   A. EXECUTABLE: real integration against DEMO DB via @supabase/supabase-js
//      with service_role + live Vercel dispatcher. Each A test:
//        1. Skips cleanly if DEMO_ADMIN_LOGIN / DEMO_ADMIN_PASSWORD env
//           vars are not explicitly set (no default-password fallback).
//        2. Creates throwaway test client (and optional car) directly via
//           service_role, tagged with a unique RUN_TAG marker for forensics.
//        3. POSTs to live /api/staff?action=create-staff-booking.
//        4. Records each successful booking UUID into a per-test list.
//        5. try/finally cleanup: deletes ONLY by exact UUID from that
//           list, then deletes test client (+ car). Verifies 0 rows remain.
//        6. Never logs JWT, password, Authorization header, or DB URL.
//   B. WIRING: api/staff.ts:createStaffBookingAction has conditional
//      box_number validation when is_quick_booking === true.
//   C. REGRESSION: BookingWizard.tsx + App.tsx contracts are unchanged.
//   D. REGRESSION: action stays in ALLOWED_ACTIONS, dispatcher auth path.
//
// Mix of network (A) and pure regex (B/C/D). node:test runner.
// node --test tests/issue15-quick-booking-null-box.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '/Users/dmitriy/Downloads/demo-car-wash/node_modules/@supabase/supabase-js/dist/index.cjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Hard-required env vars for live integration tests. No fallback — if any
// is missing, integration block SKIPs cleanly. This guarantees the test
// never uses a known/default password by accident.
const DEMO_ADMIN_LOGIN = process.env.DEMO_ADMIN_LOGIN;
const DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD;
const APP_URL = process.env.DEMO_APP_URL || 'https://demo-car-wash.vercel.app';

const skipIntegration = !SUPABASE_URL || !SERVICE_ROLE;
const skipLive = !DEMO_ADMIN_LOGIN || !DEMO_ADMIN_PASSWORD;
const admin = skipIntegration
  ? null
  : createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false }, db: { schema: 'public' } });

const staffTs = readFileSync(`${ROOT}/api/staff.ts`, 'utf8');
const appTs = readFileSync(`${ROOT}/App.tsx`, 'utf8');
const bookingWizardTs = readFileSync(`${ROOT}/components/admin/BookingWizard.tsx`, 'utf8');

// Migration 044 should NOT exist (RPC already accepts NULL). If it ever
// appears, this test ensures it doesn't touch grants/RLS/triggers/tables.
const migration044 = existsSync(`${ROOT}/migrations/044_allow_null_box_for_quick_bookings.sql`)
  ? readFileSync(`${ROOT}/migrations/044_allow_null_box_for_quick_bookings.sql`, 'utf8')
  : null;

function log(...args) { console.log(...args); }

// =====================================================================
// Shared setup / cleanup helpers — each integration test creates its own
// throwaway test client tagged with a unique RUN_TAG, uses it for the
// booking, and deletes by exact UUID only (no filter-based DELETE).
// =====================================================================

async function fetchServiceId() {
  // Pick any real service_id (used to satisfy dispatcher's `services_required`
  // check, even for quick bookings). Excludes the bonus free-body-wash service.
  const { data } = await admin
    .from('services')
    .select('service_id')
    .neq('service_id', 'free-body-wash')
    .limit(1)
    .maybeSingle();
  if (!data?.service_id) throw new Error('no service_id found in services table');
  return data.service_id;
}

async function createTestClient(runTag) {
  // Throwaway test client — no link to real profiles/clients. Inserted
  // directly via service_role. Tagged with RUN_TAG in full_name for
  // forensic identification (NOT used for cleanup). Phone MUST be unique
  // (UNIQUE constraint) — derive from runTag.
  const clientId = randomUUID();
  const phone = `+7999${runTag.replace(/[^0-9]/g, '').slice(0, 7).padStart(7, '0')}`;
  const { error } = await admin.from('clients').insert({
    id: clientId,
    full_name: `Issue15-test-${runTag}`,
    phone: phone,
    profile_id: null,
    is_active: true,
  });
  if (error) throw new Error(`createTestClient failed: ${error.message}`);
  return clientId;
}

async function deleteByIds(tableName, ids) {
  // DELETE-only-by-UUID helper. Each ID is one row. If `tableName` is
  // 'bookings', an FK to clients may block delete — caller should remove
  // bookings first. Throws on any DB error or leftover row.
  for (const id of ids) {
    const { data: before } = await admin.from(tableName).select('id').eq('id', id).maybeSingle();
    assert.ok(before, `${tableName}/${id} must exist before delete`);
    const { error } = await admin.from(tableName).delete().eq('id', id);
    assert.ok(!error, `delete ${tableName}/${id} failed: ${error?.message}`);
    const { data: after } = await admin.from(tableName).select('id').eq('id', id).maybeSingle();
    assert.equal(after, null, `${tableName}/${id} must be removed after delete`);
  }
}

// Fallback cleanup using a per-test UUID marker. If response parsing fails
// after a successful booking INSERT, we still know what `client_car_id` we
// sent — every booking row created by THIS test carries that exact UUID in
// `client_car_id`. SELECT by UUID, DELETE by ID.
//
// Why client_car_id and not operation_id:
//   - DEMO `bookings` table has no `operation_id` column (verified via
//     information_schema). operation_id is only used for inventory_arrivals.
//   - dispatcher createStaffBookingAction does NOT accept operation_id in
//     body (no read, no whitelist rejection — just silently ignored).
//   - client_car_id IS a server-accepted UUID FK column that we already
//     generate per test. It is the closest server-known UUID marker that
//     survives response-parsing failures.
async function fallbackCleanupBookingsByClientCarId(testClientCarId) {
  if (!testClientCarId) return [];
  const { data: bookings, error } = await admin
    .from('bookings')
    .select('id')
    .eq('client_car_id', testClientCarId);
  assert.ok(!error, `fallback SELECT failed: ${error?.message}`);
  const foundIds = (bookings || []).map((b) => b.id);
  for (const id of foundIds) {
    const { error: delErr } = await admin.from('bookings').delete().eq('id', id);
    assert.ok(!delErr, `fallback DELETE for ${id} failed: ${delErr?.message}`);
  }
  // Verify 0 rows remain for this marker.
  const { data: after } = await admin
    .from('bookings').select('id').eq('client_car_id', testClientCarId);
  assert.ok(!after || after.length === 0,
    `fallback cleanup must leave 0 bookings for client_car_id=${testClientCarId}, found ${after?.length}`);
  return foundIds;
}

async function loginAndGetToken() {
  // No secrets are echoed. The token is held in a local variable only.
  const res = await fetch(`${APP_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: DEMO_ADMIN_LOGIN, password: DEMO_ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`login failed: HTTP ${res.status} — body length ${txt.length}`);
  }
  const json = await res.json();
  if (!json?.token) throw new Error(`login response missing token`);
  return json.token;
}

// =====================================================================
// Tests
// =====================================================================

test('preflight: env vars + DEMO DB connectivity', async () => {
  if (skipIntegration) {
    log('SKIP — NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  } else {
    assert.ok(SUPABASE_URL.startsWith('https://'));
    assert.ok(SERVICE_ROLE.length > 100);
    // Confirm dispatcher wiring (without exposing content).
    assert.ok(
      /is_quick_booking\s*\?\s*\(body\.box_number\s*===?\s*undefined/.test(staffTs),
      'api/staff.ts must have conditional box_number validation under is_quick_booking'
    );
    assert.ok(
      /body\.is_quick_booking\s*===\s*true/.test(staffTs),
      'is_quick_booking must use strict === true (not !! truthy cast)'
    );
  }
});

test('A1 — live DEMO dispatcher: quick booking 200, is_quick_booking=true, box_number=NULL', async (t) => {
  if (skipIntegration || skipLive) {
    log('SKIP A1 — env vars missing (DEMO_ADMIN_LOGIN / DEMO_ADMIN_PASSWORD)');
    t.skip(); return;
  }

  // Per-test state. RUN_TAG markers all DB rows this test owns.
  const runTag = `a1-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const createdBookingIds = [];
  let createdClientId = null;
  let createdCarId = null;
  let token = null;
  let serviceId = null;

  try {
    // Setup throwaway test rows.
    serviceId = await fetchServiceId();
    createdClientId = await createTestClient(runTag);
    createdCarId = randomUUID();
    // client_cars requires client_id; createdCarId is recorded only to be deleted in cleanup.
    {
      const { error } = await admin.from('client_cars').insert({
        id: createdCarId, client_id: createdClientId,
        car_model: 'TestModel',
        plate_number: `I15${runTag.slice(-5).toUpperCase().padStart(4, '0')}`,
        car_type: 'sedan', is_active: true,
      });
      if (error) throw new Error(`createTestCar failed: ${error.message}`);
    }

    token = await loginAndGetToken();

    const today = new Date().toISOString().slice(0, 10);
    const body = {
      booking_date: today,
      box_number: null,            // ← key: was 400 before Issue 15 fix
      start_time: '23:00',
      end_time: '23:30',
      client_name: `Issue15 Quick Test ${runTag}`,
      phone: null,
      car_model: 'TestModel',
      plate_number: `I15${runTag.slice(-5).toUpperCase().padStart(4, '0')}`,
      car_type: 'sedan',
      services: [serviceId],
      services_with_quantities: [],
      price: 0,
      payment_method: null,
      worker_id: null,
      is_org: false,
      is_quick_booking: true,      // ← key flag
      discount: 0,
      is_paid: false,
      client_id: createdClientId,
      client_car_id: createdCarId,
    };

    const res = await fetch(`${APP_URL}/api/staff?action=create-staff-booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    // In DRAFT state this fails with 400 box_number_required (proves bug exists
    // in deployed code). After deploy with Issue 15 fix, it returns 200.
    const txt = await res.text();
    assert.equal(res.status, 200, `quick booking must succeed (got ${res.status}): body=${txt.slice(0, 200)}`);
    const json = JSON.parse(txt);
    const booking = json?.data?.booking;
    assert.ok(booking?.id, 'response must contain booking with id');
    // Record UUID for cleanup — only AFTER successful 200.
    createdBookingIds.push(booking.id);

    // Re-read from DB to confirm DB-level state (not just response).
    const { data: row } = await admin.from('bookings')
      .select('id, is_quick_booking, box_number, status, client_name')
      .eq('id', booking.id).maybeSingle();
    assert.ok(row, 'booking must exist in DB after create');
    assert.equal(row.is_quick_booking, true);
    assert.equal(row.box_number, null);
    assert.equal(row.client_name, body.client_name);
  } finally {
    // Cleanup — top-level try/finally so this runs even on assertion failure
    // or unexpected exception. Order matters: bookings → client_cars → clients
    // (clients has FK from client_cars, and bookings FK to clients).
    //
    // Fallback cleanup by `client_car_id` (server-known UUID marker) catches
    // the edge case where the booking INSERT succeeded but response parsing
    // failed → createdBookingIds is empty → primary cleanup finds nothing.
    try {
      // 1. Primary cleanup by booking IDs from response.
      await deleteByIds('bookings', createdBookingIds);
      // 2. Fallback cleanup by per-test UUID marker (client_car_id).
      //    Catches rows the primary cleanup missed.
      if (createdCarId) await fallbackCleanupBookingsByClientCarId(createdCarId);
      // 3. Delete client_cars (UUID).
      if (createdCarId) await deleteByIds('client_cars', [createdCarId]);
      // 4. Delete client (UUID).
      if (createdClientId) await deleteByIds('clients', [createdClientId]);
    } catch (e) {
      log('A1 cleanup error (non-fatal):', e.message);
    }
  }
});

test('A2 — live DEMO dispatcher: non-quick without box → 400 box_number_required', async (t) => {
  if (skipIntegration || skipLive) {
    log('SKIP A2 — env vars missing');
    t.skip(); return;
  }

  const runTag = `a2-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  let createdClientId = null;
  let createdCarId = null;

  try {
    const serviceId = await fetchServiceId();
    createdClientId = await createTestClient(runTag);
    createdCarId = randomUUID();
    {
      const { error } = await admin.from('client_cars').insert({
        id: createdCarId, client_id: createdClientId,
        car_model: 'TestModel',
        plate_number: `I15${runTag.slice(-5).toUpperCase().padStart(4, '0')}`,
        car_type: 'sedan', is_active: true,
      });
      if (error) throw new Error(`createTestCar failed: ${error.message}`);
    }

    const token = await loginAndGetToken();

    const today = new Date().toISOString().slice(0, 10);
    const body = {
      booking_date: today,
      box_number: null,            // intentionally omitted
      start_time: '23:00',
      end_time: '23:30',
      client_name: `Issue15 Non-Quick Test ${runTag}`,
      phone: null,
      car_model: 'TestModel',
      plate_number: `I15${runTag.slice(-5).toUpperCase().padStart(4, '0')}`,
      car_type: 'sedan',
      services: [serviceId],
      services_with_quantities: [],
      price: 0,
      payment_method: null,
      worker_id: null,
      is_org: false,
      is_quick_booking: false,     // regular booking
      discount: 0,
      is_paid: false,
      client_id: createdClientId,
      client_car_id: createdCarId,
    };

    const res = await fetch(`${APP_URL}/api/staff?action=create-staff-booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    // Non-quick booking without box → 400 box_number_required (validation
    // must still reject). This should pass in BOTH DRAFT and deployed state.
    assert.equal(res.status, 400, `non-quick booking without box must be 400 (got ${res.status})`);
    const json = await res.json();
    assert.match(json?.error || '', /box_number_required/, 'must return box_number_required error');
  } finally {
    try {
      // Fallback cleanup by client_car_id marker (in case A2 somehow
      // created a booking despite our 400 expectation — defense in depth).
      if (createdCarId) await fallbackCleanupBookingsByClientCarId(createdCarId);
      if (createdCarId) await deleteByIds('client_cars', [createdCarId]);
      if (createdClientId) await deleteByIds('clients', [createdClientId]);
    } catch (e) {
      log('A2 cleanup error (non-fatal):', e.message);
    }
  }
});

test('A3 — string "false" for is_quick_booking does NOT bypass box_number_required', async (t) => {
  if (skipIntegration || skipLive) {
    log('SKIP A3 — env vars missing');
    t.skip(); return;
  }

  const runTag = `a3-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  let createdClientId = null;
  let createdCarId = null;

  try {
    const serviceId = await fetchServiceId();
    createdClientId = await createTestClient(runTag);
    createdCarId = randomUUID();
    {
      const { error } = await admin.from('client_cars').insert({
        id: createdCarId, client_id: createdClientId,
        car_model: 'TestModel',
        plate_number: `I15${runTag.slice(-5).toUpperCase().padStart(4, '0')}`,
        car_type: 'sedan', is_active: true,
      });
      if (error) throw new Error(`createTestCar failed: ${error.message}`);
    }

    const token = await loginAndGetToken();

    const today = new Date().toISOString().slice(0, 10);
    const body = {
      booking_date: today,
      box_number: null,
      start_time: '23:00',
      end_time: '23:30',
      client_name: `Issue15 String-False Test ${runTag}`,
      phone: null,
      car_model: 'TestModel',
      plate_number: `I15${runTag.slice(-5).toUpperCase().padStart(4, '0')}`,
      car_type: 'sedan',
      services: [serviceId],
      services_with_quantities: [],
      price: 0,
      payment_method: null,
      worker_id: null,
      is_org: false,
      is_quick_booking: 'false',   // ← string, not boolean (strict === true rejects)
      discount: 0,
      is_paid: false,
      client_id: createdClientId,
      client_car_id: createdCarId,
    };

    const res = await fetch(`${APP_URL}/api/staff?action=create-staff-booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    // Strict equality `=== true` rejects the string, so box_number_required
    // still fires. 400 expected in BOTH DRAFT and deployed state.
    assert.equal(res.status, 400, `string "false" must NOT bypass box check (got ${res.status})`);
    const json = await res.json();
    assert.match(json?.error || '', /box_number_required/);
  } finally {
    try {
      // Fallback cleanup by client_car_id marker.
      if (createdCarId) await fallbackCleanupBookingsByClientCarId(createdCarId);
      if (createdCarId) await deleteByIds('client_cars', [createdCarId]);
      if (createdClientId) await deleteByIds('clients', [createdClientId]);
    } catch (e) {
      log('A3 cleanup error (non-fatal):', e.message);
    }
  }
});

test('B — wiring: api/staff.ts has conditional box_number validation for quick mode', () => {
  assert.ok(
    /is_quick_booking\s*\?\s*\([\s\S]*?box_number\s*===?\s*undefined[\s\S]*?:\s*readNumberInRange/.test(staffTs),
    'createStaffBookingAction must have ternary on is_quick_booking for box_number'
  );
  assert.ok(
    /body\.is_quick_booking\s*===\s*true/.test(staffTs),
    'strict === true comparison required (no !! truthy cast)'
  );
  assert.ok(
    /readNumberInRange\(body,\s*'box_number',\s*1,\s*99,\s*true\)/.test(staffTs),
    'readNumberInRange with required=true must still exist (for non-quick path)'
  );
});

test('C — UI contract: BookingWizard.tsx + App.tsx are unchanged for quick mode', () => {
  assert.ok(
    /box_number:\s*isQuickBooking\s*\?\s*undefined/.test(bookingWizardTs),
    'BookingWizard.tsx must send box_number: undefined for quick mode'
  );
  assert.ok(
    /onQuickBooking=[\s\S]{0,500}isQuickBooking:\s*true/.test(appTs),
    'App.tsx onQuickBooking handler must set isQuickBooking: true'
  );
});

test('D — regression: ALLOWED_ACTIONS unchanged, no schema migration expected', () => {
  if (migration044) {
    assert.ok(
      !/REVOKE|GRANT.*ON TABLE|ALTER TABLE|DROP TRIGGER/i.test(migration044),
      'migration 044 (if present) must not touch grants/RLS/triggers/tables'
    );
  } else {
    log('INFO — no migration 044 file; fix is dispatcher-only');
  }
  assert.ok(
    staffTs.includes("'create-staff-booking'"),
    "create-staff-booking must remain in ALLOWED_ACTIONS"
  );
});

// Final forensic sweep — confirms NO test rows leaked to DEMO. Uses marker
// substring in client_name to identify rows that belong to this Issue 15
// test session (regardless of which test created them). Should always be 0
// after all tests' try/finally cleanups run.
test('forensic: no leftover Issue15 test bookings (marker-based read-only check)', async (t) => {
  if (skipIntegration) { t.skip(); return; }
  // Bookings carry client_name = "Issue15 Quick Test <runTag>". If cleanup
  // missed anything, this query would find it.
  const { data: bookings, error: e1 } = await admin.from('bookings')
    .select('id, client_name')
    .ilike('client_name', 'Issue15 Quick Test %')
    .limit(10);
  assert.ok(!e1, `bookings read failed: ${e1?.message}`);
  assert.equal(bookings?.length ?? 0, 0,
    `expected 0 leftover Issue15 test bookings, found ${bookings?.length}: ${JSON.stringify(bookings?.map(b => b.id))}`);

  // Clients carry full_name = "Issue15-test-...". Same forensic check.
  const { data: clients, error: e2 } = await admin.from('clients')
    .select('id, full_name')
    .ilike('full_name', 'Issue15-test-%')
    .limit(10);
  assert.ok(!e2, `clients read failed: ${e2?.message}`);
  assert.equal(clients?.length ?? 0, 0,
    `expected 0 leftover Issue15 test clients, found ${clients?.length}: ${JSON.stringify(clients?.map(c => c.id))}`);
});
