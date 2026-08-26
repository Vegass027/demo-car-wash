// /test-client-carwash-endpoints.mjs
//
// Slice #1 curl matrix — all 7 client endpoints under /api/.
//
// Uses supabase-js admin client (BYPASSRLS) to:
//   - generate a valid client JWT (signJwt must match the api/_lib/jwt.ts format)
//   - reset DB state (delete test cars, reset status fields, etc.)
//   - verify post-state directly
//
// Each endpoint test:
//   - happy path (200)
//   - validation failure (400)
//   - ownership failure (403) where applicable
//
// Run from demo-car-wash root:
//   node test-client-carwash-endpoints.mjs

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// ---- env ----
const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const BASE = process.env.BASE_URL || 'http://localhost:3000';

if (!PROJECT_URL || !SERVICE_KEY || !JWT_SECRET) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET');
  process.exit(2);
}

const admin = createClient(PROJECT_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- JWT helpers (mirror api/_lib/jwt.ts) ----
function base64url(input) {
  return Buffer.from(typeof input === 'string' ? input : input)
    .toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = base64url(JSON.stringify(header));
  const p = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest();
  return `${h}.${p}.${base64url(sig)}`;
}

// ---- test fixture IDs (verified earlier) ----
const TEST_PROFILE = 'b33e4171-7ba4-44b3-bf7a-babe766cb338'; // test client
const TEST_CLIENT_ID = 'f2799b3d-37aa-4976-a23a-df5cba10e463';
const OTHER_PROFILE = '11111111-1111-1111-1111-111111111111'; // not the test client

let PASS = 0, FAIL = 0;
function ok(name, cond, detail) {
  if (cond) { PASS++; console.log('  [PASS]', name); }
  else { FAIL++; console.log('  [FAIL]', name, detail ? '— ' + detail : ''); }
}

// ---- HTTP helper ----
async function call(path, opts = {}) {
  const url = `${BASE}${path}`;
  const init = {
    method: opts.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    return { status: 0, body: null, error: String(err) };
  }
  let body;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

// ---- JWT for tests ----
function clientJwt(role = 'client', profile_id = TEST_PROFILE) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      sub: profile_id,
      role: 'authenticated',
      app_role: role,
      profile_id,
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET
  );
}

// ---- setup / teardown helpers ----
const createdCarIds = [];
function trackCar(id) {
  if (id && !createdCarIds.includes(id)) createdCarIds.push(id);
}
async function setup() {
  // Tests rely on existing linked clients in the demo DB; nothing to do here.
}
async function teardown() {
  // Soft-delete any test cars we created (tracked by id). Bookings cancelled
  // inline as part of the test that created them.
  for (const id of createdCarIds) {
    try { await admin.from('client_cars').update({ is_active: false }).eq('id', id); }
    catch (_) { /* best-effort */ }
  }
}

// =============================================================
// Tests
// =============================================================
(async () => {
  await setup();
  // 8-char Russian-format plates: [А-Я]\d{3}[А-ЯА]{2}. А77X range avoids
  // collision with existing prod data.
  // 6-char Russian-format plates: [А-Я]\d{3}[А-Я]{2}.
  // А77X / А78X ranges avoid collision with existing prod data.
  const TEST_PLATE_A = 'А779АА';
  const TEST_PLATE_B = 'А788АА';
  const TEST_PLATE_C = 'А789АА';
  let test_car_id;
  const tokens = {
    client: clientJwt('client', TEST_PROFILE),
    other: clientJwt('client', OTHER_PROFILE),
    bad: 'not-a-jwt',
  };

  console.log('\n=== Slice #1 client endpoint curl matrix ===\n');

  // -------------------------------------------------------------------------
  // T1: client-get-my-cars — happy path returns combined profile+cars
  // -------------------------------------------------------------------------
  console.log('# T1: client-get-my-cars');
  {
    const r = await call('/api/client-get-my-cars', { token: tokens.client });
    ok('200 with combined shape',
       r.status === 200 && r.body?.data?.client?.id === TEST_CLIENT_ID && Array.isArray(r.body?.data?.combined_cars),
       JSON.stringify(r.body).slice(0, 200));
    ok('phone field present', r.body?.data?.client?.phone != null);
    ok('blocked_until field present', 'online_booking_blocked_until' in (r.body?.data?.client || {}));
  }
  {
    // no JWT
    const r = await call('/api/client-get-my-cars');
    ok('no-token → 401', r.status === 401);
  }
  {
    // bad JWT
    const r = await call('/api/client-get-my-cars', { token: tokens.bad });
    ok('bad-token → 401', r.status === 401);
  }
  {
    // admin role → 403
    const r = await call('/api/client-get-my-cars', { token: clientJwt('admin', TEST_PROFILE) });
    ok('admin-role → 403', r.status === 403);
  }

  // -------------------------------------------------------------------------
  // T2: client-get-bookings — own only via client_id chain
  // -------------------------------------------------------------------------
  console.log('\n# T2: client-get-bookings');
  {
    const r = await call('/api/client-get-bookings', {
      token: tokens.client,
      body: { date: '2026-08-26' },
    });
    ok('200 with own bookings array',
       r.status === 200 && Array.isArray(r.body?.data?.bookings),
       JSON.stringify(r.body).slice(0, 200));
    // All bookings MUST be linked to our test client (no leakage)
    const all_own = (r.body?.data?.bookings || []).every((b) => b.client_id === TEST_CLIENT_ID);
    ok('every booking client_id === TEST_CLIENT_ID', all_own);
  }
  {
    const r = await call('/api/client-get-bookings', {
      token: tokens.client,
      body: { date: 'not-a-date' },
    });
    ok('400 invalid date', r.status === 400);
  }

  // -------------------------------------------------------------------------
  // T3: client-create-car — creates a test car (cleanup suffix)
  // -------------------------------------------------------------------------
  console.log('\n# T3: client-create-car');
  {
    const r = await call('/api/client-create-car', {
      token: tokens.client,
      body: { car_model: 'Test Car', plate_number: TEST_PLATE_A, car_type: 'SEDAN' },
    });
    ok('200 car created',
       r.status === 200 && typeof r.body?.data?.car?.id === 'string',
       JSON.stringify(r.body).slice(0, 200));
    test_car_id = r.body?.data?.car?.id;
    trackCar(test_car_id);
  }
  {
    const r = await call('/api/client-create-car', {
      token: tokens.client,
      body: { car_model: '', plate_number: TEST_PLATE_B, car_type: 'SEDAN' },
    });
    ok('400 empty car_model', r.status === 400);
  }
  {
    const r = await call('/api/client-create-car', {
      token: tokens.client,
      body: { car_model: 'X', plate_number: 'invalid', car_type: 'SEDAN' },
    });
    ok('400 invalid plate', r.status === 400);
  }
  {
    const r = await call('/api/client-create-car', {
      token: tokens.client,
      body: { car_model: 'X', plate_number: 'А111АА77', car_type: 'SPACESHIP' },
    });
    ok('400 invalid car_type', r.status === 400);
  }

  // -------------------------------------------------------------------------
  // T4: client-update-car — ownership enforced
  // -------------------------------------------------------------------------
  console.log('\n# T4: client-update-car');
  {
    const r = await call('/api/client-update-car', {
      token: tokens.client,
      body: { car_id: test_car_id, car_model: 'Updated Test Car' },
    });
    ok('200 update own car',
       r.status === 200 && r.body?.data?.car?.car_model === 'Updated Test Car');
  }
  {
    // other client's token → 403 car_id_not_owned
    const r = await call('/api/client-update-car', {
      token: tokens.other,
      body: { car_id: test_car_id, car_model: 'Should Fail' },
    });
    ok('403 foreign car', r.status === 403 && r.body?.error === 'car_id_not_owned');
  }
  {
    const r = await call('/api/client-update-car', {
      token: tokens.client,
      body: { car_id: test_car_id },
    });
    ok('400 no_fields_to_update', r.status === 400);
  }
  {
    const r = await call('/api/client-update-car', {
      token: tokens.client,
      body: { car_id: 'not-a-uuid' },
    });
    ok('400 car_id_required_or_malformed', r.status === 400);
  }

  // -------------------------------------------------------------------------
  // T5: client-delete-car — soft-delete
  // -------------------------------------------------------------------------
  console.log('\n# T5: client-delete-car');
  {
    const r = await call('/api/client-delete-car', {
      token: tokens.client,
      body: { car_id: test_car_id },
    });
    ok('200 soft-delete own car', r.status === 200 && r.body?.data?.success === true);
    // Verify is_active is now false in DB
    const { data } = await admin.from('client_cars').select('is_active').eq('id', test_car_id).maybeSingle();
    ok('is_active = false in DB', data?.is_active === false);
  }
  {
    const r = await call('/api/client-delete-car', {
      token: tokens.other,
      body: { car_id: test_car_id },
    });
    ok('403 cannot delete others car (already soft-deleted; ownership still checked)', r.status === 403);
  }

  // -------------------------------------------------------------------------
  // T6: client-create-booking — sequential conflict regression
  // -------------------------------------------------------------------------
  console.log('\n# T6: client-create-booking (sequential conflict regression)');

  // Two ОЖИДАЕТ bookings, picked to have empty box+time slots we can fill.
  // Use a future date that's safe to write into.
  const FUTURE_DATE = '2099-01-15';
  const BOX = 3;
  const SLOT = '14:00';
  const SERVICE_UUID = '71000000-0000-0000-0000-000000000001';

  // Try to claim the slot for an existing client car. We use a test car first.
  {
    // First create a fresh car since previous was soft-deleted.
    const createRes = await call('/api/client-create-car', {
      token: tokens.client,
      body: { car_model: 'Test Slot Car', plate_number: TEST_PLATE_C, car_type: 'SEDAN' },
    });
    test_car_id = createRes.body?.data?.car?.id;
    trackCar(test_car_id);
    ok('helper: created fresh test car', typeof test_car_id === 'string',
       JSON.stringify(createRes.body).slice(0, 200));

    const r1 = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        car_model: 'Test Slot Car',
        plate_number: TEST_PLATE_C,
        car_type: 'SEDAN',
        services: [SERVICE_UUID],
        price: 500,
        payment_method: 'Наличный',
        booking_date: FUTURE_DATE,
        start_time: SLOT,
        box_number: BOX,
        client_car_id: test_car_id,
      },
    });
    ok('first booking → 200', r1.status === 200,
       JSON.stringify(r1.body).slice(0, 200));
    const booking_id = r1.body?.data?.booking?.id;

    // second call should hit overlap check on same box+time
    const r2 = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        car_model: 'Test Slot Car',
        plate_number: TEST_PLATE_C,
        car_type: 'SEDAN',
        services: [SERVICE_UUID],
        price: 500,
        payment_method: 'Наличный',
        booking_date: FUTURE_DATE,
        start_time: SLOT,
        box_number: BOX,
        client_car_id: test_car_id,
      },
    });
    ok('second sequential → 409 box_occupied',
       r2.status === 409 && r2.body?.error === 'box_occupied',
       JSON.stringify(r2.body).slice(0, 200));

    // Foreign client_car_id → 403
    const r3 = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        car_model: 'X',
        plate_number: 'А111АА77',
        car_type: 'SEDAN',
        services: [SERVICE_UUID],
        price: 500,
        payment_method: 'Наличный',
        booking_date: '2099-01-16',
        start_time: '15:00',
        box_number: 1,
        client_car_id: '00000000-0000-0000-0000-000000000999', // foreign id
      },
    });
    ok('foreign client_car_id → 403', r3.status === 403 && r3.body?.error === 'client_car_id_not_owned');

    // Cleanup: cancel and soft-delete test car
    const cancelRes = await call('/api/client-cancel-booking', {
      token: tokens.client,
      body: { booking_id },
    });
    ok('test booking cancel → 200', cancelRes.status === 200 && cancelRes.body?.data?.already_cancelled === false);
  }

  // -------------------------------------------------------------------------
  // T7: client-cancel-booking — direct RPC adapter tests
  // -------------------------------------------------------------------------
  console.log('\n# T7: client-cancel-booking');
  // Create a booking then flip its status to ГОТОВО so cancel must raise 409.
  {
    const createRes = await call('/api/client-create-car', {
      token: tokens.client,
      body: { car_model: 'T7 Car', plate_number: TEST_PLATE_C, car_type: 'SEDAN' },
    });
    test_car_id = createRes.body?.data?.car?.id;
    trackCar(test_car_id);

    const mk = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        car_model: 'T7 Car',
        plate_number: TEST_PLATE_C,
        car_type: 'SEDAN',
        services: [SERVICE_UUID],
        price: 100,
        payment_method: 'Наличный',
        booking_date: '2099-02-01',
        start_time: '14:00',
        box_number: 3,
        client_car_id: test_car_id,
      },
    });
    const booking_id = mk.body?.data?.booking?.id;
    ok('helper: created fresh booking for ГОТОВО test', typeof booking_id === 'string');
    // Manually flip status to ГОТОВО (simulates staff markAsReady).
    await admin.from('bookings').update({ status: 'ГОТОВО' }).eq('id', booking_id);

    // Cancel attempt should 409 with cannot_cancel + current_status.
    const r = await call('/api/client-cancel-booking', {
      token: tokens.client,
      body: { booking_id },
    });
    ok('cancel ГОТОВО → 409',
       r.status === 409 && r.body?.error === 'cannot_cancel' && r.body?.current_status === 'ГОТОВО',
       JSON.stringify(r.body).slice(0, 200));
  }
  {
    // random uuid
    const r = await call('/api/client-cancel-booking', {
      token: tokens.client,
      body: { booking_id: '00000000-0000-0000-0000-000000000999' },
    });
    ok('cancel foreign uuid → 404', r.status === 404);
  }
  {
    const r = await call('/api/client-cancel-booking', {
      token: tokens.client,
      body: { booking_id: 'not-a-uuid' },
    });
    ok('cancel malformed uuid → 400', r.status === 400);
  }

  // -------------------------------------------------------------------------
  // T8: client-create-booking validation errors
  // -------------------------------------------------------------------------
  console.log('\n# T8: client-create-booking validation');
  {
    const r = await call('/api/client-create-booking', {
      token: tokens.client,
      body: { /* empty */ },
    });
    ok('empty body → 400', r.status === 400);
  }
  {
    const r = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        car_model: 'X',
        plate_number: 'Т888ТТ888',
        car_type: 'SEDAN',
        services: [SERVICE_UUID],
        price: 500,
        payment_method: 'Наличный',
        booking_date: 'not-a-date',
        start_time: '14:00',
        box_number: 3,
        client_car_id: test_car_id,
      },
    });
    ok('bad date → 400', r.status === 400);
  }
  {
    const r = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        car_model: 'X',
        plate_number: 'Т888ТТ888',
        car_type: 'SEDAN',
        services: ['not-a-uuid'],
        price: 500,
        payment_method: 'Наличный',
        booking_date: '2099-01-17',
        start_time: '14:00',
        box_number: 3,
        client_car_id: test_car_id,
      },
    });
    ok('bad service uuid → 400', r.status === 400);
  }

  // ---- setup / teardown helpers ----
async function setup() {
  // Tests rely on existing linked clients in the demo DB; nothing to do here.
}
async function teardownCars(carIds) {
  for (const id of carIds) {
    await admin.from('client_cars').update({ is_active: false }).eq('id', id);
  }
}
async function teardownBooking(bookingId) {
  if (!bookingId) return;
  // Best-effort: cancel any active booking, soft-delete cleanup cars.
  await admin.rpc('cancel_own_booking', {
    p_booking_id: bookingId,
    p_profile_id: TEST_PROFILE,
  }).catch(() => {});
}
const createdCarIds = [];
const createdBookingIds = [];
process.on('exit', async () => {
  for (const id of createdCarIds) {
    await admin.from('client_cars').update({ is_active: false }).eq('id', id).catch(() => {});
  }
});

  console.log('\n========================================');
  console.log(`Pass: ${PASS}  Fail: ${FAIL}`);
  console.log('========================================');
  process.exit(FAIL === 0 ? 0 : 1);
})().catch(err => {
  console.error('test crashed:', err);
  process.exit(2);
});
