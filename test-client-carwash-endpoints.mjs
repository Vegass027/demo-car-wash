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
  // Cleanup temp org/driver used by 4-IDs ownership tests.
  try { await admin.from('organization_drivers').delete().eq('id', '00000000-0000-0000-0000-0000bbbb0001'); }
  catch (_) { /* best-effort */ }
  try { await admin.from('organizations').delete().eq('id', '00000000-0000-0000-0000-0000aaaa0001'); }
  catch (_) { /* best-effort */ }
  // Cleanup any orphan bookings created during failed test runs (future-dated
  // 2099-* reservations). Without this, re-running the matrix hits a
  // box_occupied collision with the previous run's orphan.
  try { await admin.from('bookings').delete().gte('booking_date', '2099-01-01'); }
  catch (_) { /* best-effort */ }
  try { await admin.from('closed_boxes').delete().gte('closed_date', '2099-01-01'); }
  catch (_) { /* best-effort */ }
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

    // ---- Box-closed check ----
    // Insert a closed_boxes row via admin for the test slot. Note: closed_boxes
    // has a FK on closed_by → profiles; we pass null (closed_by is nullable)
    // to avoid needing a real profile_id for audit.
    const { error: cbErr } = await admin.from('closed_boxes').insert({
      box_number: 1,
      closed_date: '2099-03-15',
      closed_at: new Date().toISOString(),
      closed_by: null,
      is_closed: true,
      open_hours: [],
    });
    if (cbErr) console.error('closed_boxes insert error:', cbErr.message);

    // Verify the insert persisted before testing the gate.
    const { data: cbCheck } = await admin.from('closed_boxes')
      .select('box_number, is_closed')
      .eq('closed_date', '2099-03-15').eq('box_number', 1).maybeSingle();
    ok('closed_boxes row inserted and visible',
       cbCheck?.is_closed === true,
       JSON.stringify(cbCheck));
    const rBoxClosed = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        car_model: 'X',
        plate_number: 'А222АА77',
        car_type: 'SEDAN',
        services: [SERVICE_UUID],
        price: 500,
        payment_method: 'Наличный',
        booking_date: '2099-03-15',
        start_time: '14:00',
        box_number: 1,
        client_car_id: '00000000-0000-0000-0000-00000000eeee', // foreign; will 403 before reaching box check
      },
    });
    // Expect 403 foreign_car_id_not_owned (foreign car blocks test before box check).
    // To actually test box_closed we need a real client_car_id. Use TEST_PLATE_C below.
    ok('foreign client_car_id (setup) → 403', rBoxClosed.status === 403);

    // Real client_car_id with that closed box → box_closed
    const rBoxClosed2 = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        car_model: 'X',
        plate_number: TEST_PLATE_C,
        car_type: 'SEDAN',
        services: [SERVICE_UUID],
        price: 500,
        payment_method: 'Наличный',
        booking_date: '2099-03-15',
        start_time: '14:00',
        box_number: 1,
        client_car_id: test_car_id,
      },
    });
    ok('box_closed → 409',
       rBoxClosed2.status === 409 && rBoxClosed2.body?.error === 'box_closed',
       JSON.stringify(rBoxClosed2.body).slice(0, 200));

    // Cleanup the closed_boxes row.
    await admin.from('closed_boxes').delete().eq('closed_date', '2099-03-15').eq('box_number', 1);

    // ---- All 4 ownership IDs (full coverage) ----
    // client_car_id: already covered above (foreign client_car_id → 403).

    // Set up temp organization + driver so car_id & driver_id ownership tests
    // have a valid organization_id to pair with.
    const tmpOrgId = '00000000-0000-0000-0000-0000aaaa0001';
    const tmpDriverId = '00000000-0000-0000-0000-0000bbbb0001';
    // Fetch our test client's phone to use in temp driver.
    const { data: ph } = await admin.from('clients').select('phone').eq('id', TEST_CLIENT_ID).maybeSingle();
    const ourPhone = ph?.phone ?? null;

    if (ourPhone) {
      // Insert temp org (idempotent via ON CONFLICT — but no UNIQUE on id; use upsert by id)
      const { error: orgErr } = await admin.from('organizations').upsert({
        id: tmpOrgId, name: '__test_org__slice1', is_active: true,
      }, { onConflict: 'id' });
      if (orgErr) console.error('tmpOrg upsert:', orgErr.message);
      // Insert temp driver with phone matching our test client's phone.
      // (organization_drivers.full_name is NOT NULL, must supply a placeholder.)
      const { error: drvErr } = await admin.from('organization_drivers').upsert({
        id: tmpDriverId, full_name: '__test_driver__slice1',
        phone: ourPhone, organization_id: tmpOrgId, is_active: true,
      }, { onConflict: 'id' });
      if (drvErr) console.error('tmpDrv upsert:', drvErr.message);

      // organization_id foreign (alone) → 403
      const rForeignOrg = await call('/api/client-create-booking', {
        token: tokens.client,
        body: {
          car_model: 'X', plate_number: 'А444АА77', car_type: 'SEDAN',
          services: [SERVICE_UUID], price: 500, payment_method: 'Наличный',
          booking_date: '2099-04-10', start_time: '10:00', box_number: 1,
          organization_id: '00000000-0000-0000-0000-000000000fff',
        },
      });
      ok('foreign organization_id → 403',
         rForeignOrg.status === 403 && rForeignOrg.body?.error === 'organization_id_not_owned');

      // driver_id foreign (with valid organization_id) → 403
      const rForeignDriver = await call('/api/client-create-booking', {
        token: tokens.client,
        body: {
          car_model: 'X', plate_number: 'А555АА77', car_type: 'SEDAN',
          services: [SERVICE_UUID], price: 500, payment_method: 'Наличный',
          booking_date: '2099-04-11', start_time: '10:00', box_number: 1,
          organization_id: tmpOrgId,
          driver_id: '00000000-0000-0000-0000-000000000eee',
        },
      });
      ok('foreign driver_id → 403',
         rForeignDriver.status === 403 && rForeignDriver.body?.error === 'driver_id_not_owned');

      // car_id foreign (with valid org + valid driver) → 403
      const rForeignCar = await call('/api/client-create-booking', {
        token: tokens.client,
        body: {
          car_model: 'X', plate_number: 'А666АА77', car_type: 'SEDAN',
          services: [SERVICE_UUID], price: 500, payment_method: 'Наличный',
          booking_date: '2099-04-12', start_time: '10:00', box_number: 1,
          organization_id: tmpOrgId,
          driver_id: tmpDriverId,
          car_id: '00000000-0000-0000-0000-000000000aaa',
        },
      });
      ok('foreign car_id → 403',
         rForeignCar.status === 403 && rForeignCar.body?.error === 'car_id_not_owned');
    } else {
      console.warn('  [SKIP] organization_id/driver_id/car_id ownership tests — no phone on test client');
    }

    // Cleanup: cancel and soft-delete test car
    const cancelRes = await call('/api/client-cancel-booking', {
      token: tokens.client,
      body: { booking_id },
    });
    ok('test booking cancel → 200', cancelRes.status === 200 && cancelRes.body?.data?.already_cancelled === false);

    // Idempotency at HTTP layer (separate from RPC smoke test T10-T11).
    // Second call must return 200 + already_cancelled=true, NOT 409 mapping.
    const cancelRes2 = await call('/api/client-cancel-booking', {
      token: tokens.client,
      body: { booking_id },
    });
    ok('idempotent cancel via HTTP → 200 already_cancelled',
       cancelRes2.status === 200 &&
       cancelRes2.body?.data?.already_cancelled === true,
       JSON.stringify(cancelRes2.body).slice(0, 200));
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
  //
  // All cases here use a VALID plate (TEST_PLATE_C, 6-char Russian format) so
  // the request actually reaches the field under test instead of being
  // short-circuited by plate regex.
  // Assertions include the specific error code (not just 400) so a regression
  // in date/services validators will turn the test red, not silent-green.
  // -------------------------------------------------------------------------
  console.log('\n# T8: client-create-booking validation');
  {
    // Empty body — endpoint reads car_model first → 'car_model_required'.
    const r = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {},
    });
    ok('empty body → 400 car_model_required',
       r.status === 400 && r.body?.error === 'car_model_required',
       JSON.stringify(r.body).slice(0, 200));
  }
  {
    // Missing car_model — explicit field missing rather than empty string.
    const r = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        plate_number: TEST_PLATE_C,
        car_type: 'SEDAN',
        services: [SERVICE_UUID],
        price: 500,
        payment_method: 'Наличный',
        booking_date: '2099-05-01',
        start_time: '14:00',
        box_number: 3,
        client_car_id: test_car_id,
      },
    });
    ok('missing car_model → 400 car_model_required',
       r.status === 400 && r.body?.error === 'car_model_required',
       JSON.stringify(r.body).slice(0, 200));
  }
  {
    // Bad booking_date — validator should reach date and fail with
    // 'booking_date_bad_format' (NOT plate regex, NOT car_model etc).
    const r = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        car_model: 'X',
        plate_number: TEST_PLATE_C,            // valid 6-char plate
        car_type: 'SEDAN',
        services: [SERVICE_UUID],               // valid service UUID
        price: 500,
        payment_method: 'Наличный',
        booking_date: 'not-a-date',            // <-- the field under test
        start_time: '14:00',
        box_number: 3,
        client_car_id: test_car_id,
      },
    });
    ok('bad booking_date → 400 booking_date_bad_format',
       r.status === 400 && r.body?.error === 'booking_date_bad_format',
       JSON.stringify(r.body).slice(0, 200));
  }
  {
    // Bad service UUID — validator should reach services and fail with
    // 'services_item_not_uuid'.
    const r = await call('/api/client-create-booking', {
      token: tokens.client,
      body: {
        car_model: 'X',
        plate_number: TEST_PLATE_C,
        car_type: 'SEDAN',
        services: ['not-a-uuid'],               // <-- the field under test
        price: 500,
        payment_method: 'Наличный',
        booking_date: '2099-05-02',             // valid date so it reaches services
        start_time: '14:00',
        box_number: 3,
        client_car_id: test_car_id,
      },
    });
    ok('bad services item → 400 services_item_not_uuid',
       r.status === 400 && r.body?.error === 'services_item_not_uuid',
       JSON.stringify(r.body).slice(0, 200));
  }

  await teardown();

  console.log('\n========================================');
  console.log(`Pass: ${PASS}  Fail: ${FAIL}`);
  console.log('========================================');
  process.exit(FAIL === 0 ? 0 : 1);
})().catch(err => {
  console.error('test crashed:', err);
  process.exit(2);
});
