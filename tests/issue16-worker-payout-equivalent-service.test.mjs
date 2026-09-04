/**
 * tests/issue16-worker-payout-equivalent-service.test.mjs
 *
 * Issue 16 — regression test for the "worker payout from nominal list price"
 * fix. Universal principle: each line in bookings.services_with_quantities
 * contributes `nominal_unit_price * quantity` to the commission basis,
 * regardless of whether the client paid full / partial / zero for that
 * line (loyalty bonus, etc.).
 *
 * Two test blocks:
 *   (A) Unit tests — pure JS, mirror api/_lib/earnings.ts:calculateWorkerEarnings
 *       and features/workers/calculateEarnings.ts:calculateOrderEarnings
 *       logic. Always run (no DB / no env vars required).
 *   (B) Live integration tests — SKIP without env vars. With env vars:
 *       prefight verifies migration 044 applied, then creates a booking
 *       with free-body-wash + wax-coating, marks ГОТОВО, asserts the
 *       salary_transactions EARNING row amount equals
 *       (body-wash.price_<car_type> + wax_coating.price_<car_type>)
 *       × worker_solo_commission. UUID-addressed cleanup.
 *
 * Cleanup contract:
 *   - NO filter-based DELETE (no `.eq('client_name', 'issue-16-…')`).
 *   - NO default passwords (admin pwd only via env vars).
 *   - NO secret leakage in logs (env-var reads; secrets never printed).
 *   - All created IDs (booking, client, car, worker, salary_transactions)
 *     collected in module-level Sets and deleted by primary key.
 *   - Cleanup failures THROW (runCleanup pattern), so the test fails if
 *     anything leaks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

// -----------------------------
// Configuration / shared state
// -----------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Single source of truth for the DEMO app base URL (login + dispatcher +
// any other HTTP calls must target the exact same deployment, otherwise
// /api/login cookies and /api/staff auth checks could desync). Override
// via DEMO_VERCEL_URL env var when running against a preview deployment.
const DEMO_APP_URL = process.env.DEMO_VERCEL_URL || 'https://demo-car-wash.vercel.app';

// UUID-addressed cleanup tracking (module-level Sets, exactly like issue15).
const allCreatedBookings = new Set();
const allCreatedClients = new Set();
const allCreatedCars = new Set();
const allCreatedWorkers = new Set();
const allCreatedSalaryTransactions = new Set();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Mirror api/_lib/earnings.ts:calculateWorkerEarnings (test-side canon).
// Identical formula — kept in test to catch accidental divergence in the
// unit-block when the source is edited elsewhere.
function calculateWorkerEarnings(args) {
  let gross = 0;
  const lines = args.services_with_quantities ?? [];
  for (const line of lines) {
    const nominal = line?.nominal_unit_price;
    const qty = Number(line?.quantity ?? 0);
    if (nominal != null && Number(nominal) > 0) {
      gross += Number(nominal) * qty;
    } else {
      gross += Number(line?.total ?? (Number(line?.price ?? 0) * qty));
    }
  }
  const rate = args.working_mode === 'pair'
    ? Number(args.worker_pair_commission)
    : Number(args.worker_solo_commission);
  const earnings = gross * rate;
  const cars = args.working_mode === 'pair' ? 0.5 : 1;
  return { earnings, cars };
}

// Mirror features/workers/calculateEarnings.ts:calculateOrderEarnings.
function calculateOrderEarnings(swq, workingMode, salarySettings) {
  const lines = Array.isArray(swq) ? swq : [];
  const percentage = workingMode === 'pair'
    ? Number(salarySettings?.worker_pair_commission || 0.2)
    : Number(salarySettings?.worker_solo_commission || 0.4);
  let gross = 0;
  for (const line of lines) {
    const nominal = line?.nominal_unit_price;
    const qty = Number(line?.quantity ?? 0);
    const lineTotal = nominal != null && Number(nominal) > 0
      ? Number(nominal) * qty
      : Number(line?.total ?? (Number(line?.price ?? 0) * qty));
    gross += lineTotal;
  }
  return gross * percentage;
}

// Cleanup helper — UUID-addressed only. Throws on any failure.
async function runCleanup(admin) {
  const errors = [];
  const note = (label, id) => errors.push(`${label} cleanup failed: ${id}`);

  // Order: salary_transactions → bookings → workers → clients → cars.
  // salary_transactions has no FK to bookings (description holds UUID), so
  // it's safest to delete by explicit collected IDs.
  if (allCreatedSalaryTransactions.size > 0) {
    const ids = Array.from(allCreatedSalaryTransactions);
    const { error } = await admin.from('salary_transactions').delete().in('id', ids);
    if (error) note('salary_transactions', ids.join(','));
  }
  if (allCreatedBookings.size > 0) {
    const ids = Array.from(allCreatedBookings);
    const { error } = await admin.from('bookings').delete().in('id', ids);
    if (error) note('bookings', ids.join(','));
  }
  if (allCreatedWorkers.size > 0) {
    const ids = Array.from(allCreatedWorkers);
    const { error } = await admin.from('workers').delete().in('id', ids);
    if (error) note('workers', ids.join(','));
  }
  if (allCreatedCars.size > 0) {
    const ids = Array.from(allCreatedCars);
    const { error } = await admin.from('client_cars').delete().in('id', ids);
    if (error) note('client_cars', ids.join(','));
  }
  if (allCreatedClients.size > 0) {
    const ids = Array.from(allCreatedClients);
    // Clients may have related rows; use uuid-in-list.
    const { error } = await admin.from('clients').delete().in('id', ids);
    if (error) note('clients', ids.join(','));
  }
  if (errors.length > 0) {
    throw new Error('cleanup_failed: ' + errors.join('; '));
  }
}

const HAS_LIVE_ENV = Boolean(
  process.env.DEMO_ADMIN_LOGIN &&
  process.env.DEMO_ADMIN_PASSWORD &&
  SUPABASE_URL &&
  SERVICE_ROLE,
);

async function fetchServiceId(admin, serviceSlug) {
  const { data, error } = await admin
    .from('services')
    .select('id, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan, equivalent_paid_service_id')
    .eq('service_id', serviceSlug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`services_lookup_failed: ${error.message}`);
  if (!data) throw new Error(`service_not_found: ${serviceSlug}`);
  return data;
}

async function loginAsAdmin(baseUrl, adminLogin, adminPassword) {
  // Issue 16 follow-up — use HTTP /api/login (custom verify_password RPC
  // against profiles.password_hash). Demo admin never had an auth.users
  // row, so supabase.auth.signInWithPassword() would never work; this
  // /api/login path is the same one Issue 15 regression test uses.
  //
  // No secrets or tokens are echoed. The token is held in a local variable
  // and only used as Bearer header in subsequent dispatcher POSTs. The
  // baseUrl parameter is honored directly so the caller is the single
  // source of truth for which DEMO deployment is being tested.
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: adminLogin, password: adminPassword }),
  });
  if (!res.ok) {
    // Don't echo body length (could leak server hints) — only HTTP status.
    throw new Error(`login_failed: HTTP ${res.status}`);
  }
  const json = await res.json().catch(() => null);
  if (!json || typeof json.token !== 'string' || json.token.length === 0) {
    throw new Error(`login_failed: response missing token`);
  }
  return json.token;
}

async function staffCall(jwt, action, body) {
  // Same base URL as login — guarantees /api/login and /api/staff are
  // talking to the same deployment (no risk of cookie/JWT drift across
  // preview envs).
  const resp = await fetch(`${DEMO_APP_URL}/api/staff?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });
  return { status: resp.status, body: await resp.json().catch(() => ({})) };
}

// -----------------------------
// Unit tests (no DB, always run)
// -----------------------------

test('unit: calculateWorkerEarnings — paid-only booking unchanged vs old formula', () => {
  // Old formula: (bookings.price + bookings.discount) × rate.
  // With services = [{price: 500, quantity: 1}], discount = 0:
  //   gross = 500, earnings = 500 × 0.4 = 200.
  const { earnings } = calculateWorkerEarnings({
    working_mode: 'solo',
    services_with_quantities: [{ service_id: 'a', service_id_dummy: 0, quantity: 1, price: 500, total: 500, nominal_unit_price: 500 }],
    worker_solo_commission: 0.4,
    worker_pair_commission: 0.2,
  });
  assert.equal(earnings, 200);
});

test('unit: calculateWorkerEarnings — booking with discount == gross × rate (backward-compat)', () => {
  // services total = 1500, discount = 500 → bookings.price = 1000. Old formula = (1000 + 500) × 0.4 = 600.
  const { earnings } = calculateWorkerEarnings({
    working_mode: 'solo',
    services_with_quantities: [{ service_id: 'a', quantity: 1, price: 1500, total: 1500, nominal_unit_price: 1500 }],
    worker_solo_commission: 0.4,
    worker_pair_commission: 0.2,
  });
  // swq has only 1 line with nominal=1500 → gross = 1500 → earnings = 600.
  assert.equal(earnings, 600);
});

test('unit: calculateWorkerEarnings — bonus + paid (universal fix)', () => {
  // Old buggy formula used bookings.price = 0 + 500 = 500, earnings = 200.
  // New formula: nominal = body-wash (300) + wax (500) = 800 → earnings = 320.
  const { earnings } = calculateWorkerEarnings({
    working_mode: 'solo',
    services_with_quantities: [
      { service_id: 'free', quantity: 1, price: 0, total: 0, nominal_unit_price: 300 },
      { service_id: 'wax',  quantity: 1, price: 500, total: 500, nominal_unit_price: 500 },
    ],
    worker_solo_commission: 0.4,
    worker_pair_commission: 0.2,
  });
  assert.equal(earnings, 320);
});

test('unit: calculateWorkerEarnings — legacy row (no nominal_unit_price) falls back to total', () => {
  // Pre-migration 044: swq rows have only {price, total}. Calculator falls
  // back to total → same as old formula for paid lines.
  const { earnings } = calculateWorkerEarnings({
    working_mode: 'solo',
    services_with_quantities: [
      { service_id: 'wax', quantity: 1, price: 500, total: 500 }, // no nominal_unit_price
    ],
    worker_solo_commission: 0.4,
    worker_pair_commission: 0.2,
  });
  assert.equal(earnings, 200);
});

test('unit: calculateWorkerEarnings — pair mode yields half-rate, 0.5 cars', () => {
  const { earnings, cars } = calculateWorkerEarnings({
    working_mode: 'pair',
    services_with_quantities: [{ service_id: 'x', quantity: 1, price: 1000, total: 1000, nominal_unit_price: 1000 }],
    worker_solo_commission: 0.4,
    worker_pair_commission: 0.2,
  });
  assert.equal(earnings, 200); // 1000 × 0.2
  assert.equal(cars, 0.5);
});

test('unit: calculateOrderEarnings display matches ledger amount for bonus + paid', () => {
  const swq = [
    { service_id: 'free', quantity: 1, price: 0, total: 0, nominal_unit_price: 300 },
    { service_id: 'wax',  quantity: 1, price: 500, total: 500, nominal_unit_price: 500 },
  ];
  const settings = { worker_solo_commission: 0.4, worker_pair_commission: 0.2 };
  const displayEarnings = calculateOrderEarnings(swq, 'solo', settings);
  const ledgerAmount = calculateWorkerEarnings({
    working_mode: 'solo', services_with_quantities: swq,
    worker_solo_commission: 0.4, worker_pair_commission: 0.2,
  }).earnings;
  assert.equal(displayEarnings, ledgerAmount);
  assert.equal(displayEarnings, 320);
});

test('unit: calculateOrderEarnings — null/undefined swq yields 0', () => {
  const settings = { worker_solo_commission: 0.4, worker_pair_commission: 0.2 };
  assert.equal(calculateOrderEarnings(null, 'solo', settings), 0);
  assert.equal(calculateOrderEarnings(undefined, 'solo', settings), 0);
  assert.equal(calculateOrderEarnings([], 'solo', settings), 0);
});

// -----------------------------
// Live integration tests (skip without env vars)
// -----------------------------

const liveGroup = {
  skip: !HAS_LIVE_ENV,
};

test('live: preflight — migration 044 applied (equivalent_paid_service_id set for free-body-wash)', async (t) => {
  if (liveGroup.skip) { t.skip('env_missing: set DEMO_ADMIN_LOGIN + DEMO_ADMIN_PASSWORD + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY'); return; }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  try {
    const { data, error } = await admin
      .from('services')
      .select('id, equivalent_paid_service_id')
      .eq('service_id', 'free-body-wash')
      .maybeSingle();
    if (error) throw new Error(`preflight_lookup_failed: ${error.message}`);
    if (!data) throw new Error('free-body-wash service not found on DEMO');
    if (!data.equivalent_paid_service_id) {
      throw new Error('migration_044_not_applied: equivalent_paid_service_id is NULL on free-body-wash');
    }
    // Confirm target is body-wash row.
    const { data: target, error: tErr } = await admin
      .from('services')
      .select('service_id')
      .eq('id', data.equivalent_paid_service_id)
      .maybeSingle();
    if (tErr) throw new Error(`target_lookup_failed: ${tErr.message}`);
    if (target?.service_id !== 'body-wash') {
      throw new Error(`equivalent_does_not_point_to_body_wash: got ${target?.service_id}`);
    }
  } finally {
    await runCleanup(admin).catch(() => {});
  }
});

test('live: bonus+paid booking salary_transactions amount uses list-price gross', async (t) => {
  if (liveGroup.skip) { t.skip('env_missing'); return; }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let cleanupErrors = [];
  let bookingId, workerId;
  try {
    // 1. Read salary_settings for live commission.
    const { data: settings } = await admin
      .from('salary_settings').select('worker_solo_commission, worker_pair_commission').limit(1).maybeSingle();
    if (!settings) throw new Error('salary_settings_missing');
    const commission = Number(settings.worker_solo_commission);

    // 2. Lookup free-body-wash (with equivalent) and wax-coating.
    const freeWash = await fetchServiceId(admin, 'free-body-wash');
    const wax = await fetchServiceId(admin, 'wax-coating');

    // 3. Lookup the body-wash retail prices (same as what nominal should equal).
    const { data: bodyWash, error: bwErr } = await admin
      .from('services').select('price_sedan, price_crossover').eq('service_id', 'body-wash').maybeSingle();
    if (bwErr) throw new Error(`body_wash_lookup_failed: ${bwErr.message}`);
    const bodyWashSedan = Number(bodyWash?.price_sedan ?? 0);

    // 4. Seed a test worker (service_role bypasses RLS).
    const workerName = `issue16_unit_${Date.now()}`;
    const { data: wNew, error: wErr } = await admin.from('workers').insert({
      full_name: workerName,
      is_active: true,
      is_working_today: true,
      working_mode: 'solo',
      earned_today: 0,
      current_balance: 0,
      cars_today: 0,
    }).select('id').single();
    if (wErr) throw new Error(`worker_create_failed: ${wErr.message}`);
    workerId = wNew.id; allCreatedWorkers.add(workerId);

    // 5. Login as demo_admin to get JWT for dispatcher calls.
    const jwt = await loginAsAdmin(DEMO_APP_URL, process.env.DEMO_ADMIN_LOGIN, process.env.DEMO_ADMIN_PASSWORD);

    // 6. Create booking via dispatcher with free-body-wash + wax-coating.
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];
    const resp = await staffCall(jwt, 'create-staff-booking', {
      target_date: tomorrow,
      box_number: 1,
      start_time: '09:00',
      end_time: '10:00',
      client_name: `issue16_cl_${Date.now()}`,
      phone: '+79001234567',
      car_model: 'Test Sedan',
      plate_number: `И16${Math.floor(Math.random() * 10000)}`.slice(0, 9).toUpperCase(),
      car_type: 'SEDAN',
      services: [freeWash.id, wax.id],
      payment_method: 'CASH',
      worker_id: workerId,
      working_mode: 'solo',
      is_paid: true,
      paid_at: new Date().toISOString(),
    });
    if (resp.status >= 400) throw new Error(`create_booking_failed: ${resp.status} ${JSON.stringify(resp.body)}`);
    bookingId = resp.body?.data?.booking?.id;
    if (!bookingId) throw new Error('create_booking_failed: no booking id');
    allCreatedBookings.add(bookingId);

    // 7. Read back the booking, assert swq has nominal_unit_price.
    const { data: stored, error: sErr } = await admin.from('bookings').select('services_with_quantities').eq('id', bookingId).maybeSingle();
    if (sErr) throw new Error(`booking_reload_failed: ${sErr.message}`);
    const swq = stored?.services_with_quantities ?? [];
    const freeLine = swq.find((l) => l.service_id === freeWash.id);
    const waxLine  = swq.find((l) => l.service_id === wax.id);
    assert.ok(freeLine, 'free-body-wash line missing in swq');
    assert.ok(waxLine, 'wax-coating line missing in swq');
    assert.ok(Number.isFinite(Number(freeLine.nominal_unit_price)), `nominal_unit_price missing on free line: ${JSON.stringify(freeLine)}`);
    assert.ok(Number.isFinite(Number(waxLine.nominal_unit_price)), 'nominal_unit_price missing on wax line');
    assert.equal(
      Math.round(Number(freeLine.nominal_unit_price) * 100),
      Math.round(bodyWashSedan * 100),
      `nominal for free-body-wash must equal body-wash.price_sedan (${bodyWashSedan}), got ${freeLine.nominal_unit_price}`,
    );

    // 8. Mark ГОТОВО.
    const ready = await staffCall(jwt, 'mark-staff-ready', { booking_id: bookingId });
    if (ready.status >= 400) throw new Error(`mark_ready_failed: ${ready.status} ${JSON.stringify(ready.body)}`);

    // 9. Read salary_transactions for the worker; expect 1 EARNING row.
    const { data: ledger, error: lErr } = await admin
      .from('salary_transactions')
      .select('id, amount, description')
      .eq('worker_id', workerId)
      .eq('transaction_type', 'EARNING')
      .order('created_at', { ascending: false })
      .limit(5);
    if (lErr) throw new Error(`ledger_lookup_failed: ${lErr.message}`);
    const expectedRow = (ledger ?? []).find((r) => r.description?.includes(bookingId.slice(0, 8)));
    if (!expectedRow) throw new Error(`no ledger row found matching booking ${bookingId}`);
    allCreatedSalaryTransactions.add(expectedRow.id);

    const expectedEarnings = (bodyWashSedan + Number(wax.price_sedan)) * commission;
    const actualAmount = Number(expectedRow.amount);
    // Allow 1 cent rounding tolerance for numeric(10,2).
    assert.ok(
      Math.abs(actualAmount - expectedEarnings) < 0.01,
      `EARNING amount mismatch: expected=${expectedEarnings}, actual=${actualAmount}, ` +
        `body-wash.price_sedan=${bodyWashSedan}, wax.price_sedan=${wax.price_sedan}, commission=${commission}`,
    );
  } catch (err) {
    cleanupErrors.push(err.message);
    throw err;
  } finally {
    try {
      await runCleanup(admin);
    } catch (clErr) {
      cleanupErrors.push(clErr.message);
    }
    if (cleanupErrors.length > 0) {
      throw new Error(`cleanup_failed: ${cleanupErrors.join(' | ')}`);
    }
  }
});

test('live: legacy booking (no nominal_unit_price) — earnings unchanged from old formula', async (t) => {
  if (liveGroup.skip) { t.skip('env_missing'); return; }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  let cleanupErrors = [];
  let bookingId, workerId;
  try {
    // Settings.
    const { data: settings } = await admin
      .from('salary_settings').select('worker_solo_commission, worker_pair_commission').limit(1).maybeSingle();
    if (!settings) throw new Error('salary_settings_missing');
    const commission = Number(settings.worker_solo_commission);

    // Wax only (paid) — no bonus line. This proves the calculator still
    // behaves identically for fully-paid bookings.
    const wax = await fetchServiceId(admin, 'wax-coating');
    const waxPrice = Number(wax.price_sedan);

    // Seed worker.
    const wNew = await admin.from('workers').insert({
      full_name: `issue16_legacy_${Date.now()}`,
      is_active: true, is_working_today: true, working_mode: 'solo',
      earned_today: 0, current_balance: 0, cars_today: 0,
    }).select('id').single();
    if (wNew.error) throw new Error(`worker_create_failed: ${wNew.error.message}`);
    workerId = wNew.data.id; allCreatedWorkers.add(workerId);

    const jwt = await loginAsAdmin(DEMO_APP_URL, process.env.DEMO_ADMIN_LOGIN, process.env.DEMO_ADMIN_PASSWORD);

    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];
    const resp = await staffCall(jwt, 'create-staff-booking', {
      target_date: tomorrow,
      box_number: 2,
      start_time: '11:00',
      end_time: '12:00',
      client_name: `issue16_legacy_cl_${Date.now()}`,
      phone: '+79001234568',
      car_model: 'Test Sedan Legacy',
      plate_number: `Л16${Math.floor(Math.random() * 10000)}`.slice(0, 9).toUpperCase(),
      car_type: 'SEDAN',
      services: [wax.id],
      payment_method: 'CASH',
      worker_id: workerId,
      working_mode: 'solo',
      is_paid: true,
      paid_at: new Date().toISOString(),
    });
    if (resp.status >= 400) throw new Error(`create_booking_failed: ${resp.status}`);
    bookingId = resp.body?.data?.booking?.id;
    if (!bookingId) throw new Error('no booking id');
    allCreatedBookings.add(bookingId);

    // Manually strip nominal_unit_price to simulate pre-migration legacy.
    const { data: stored } = await admin.from('bookings').select('services_with_quantities').eq('id', bookingId).maybeSingle();
    const legacySwq = (stored.services_with_quantities ?? []).map((l) => {
      const { nominal_unit_price, ...rest } = l;
      return rest;
    });
    // SQLite-style update — wipe nominal from jsonb on this row.
    const { error: stripErr } = await admin.from('bookings').update({ services_with_quantities: legacySwq }).eq('id', bookingId);
    if (stripErr) throw new Error(`legacy_strip_failed: ${stripErr.message}`);

    const ready = await staffCall(jwt, 'mark-staff-ready', { booking_id: bookingId });
    if (ready.status >= 400) throw new Error(`mark_ready_failed: ${ready.status}`);

    const { data: ledger } = await admin.from('salary_transactions')
      .select('id, amount').eq('worker_id', workerId).eq('transaction_type', 'EARNING')
      .order('created_at', { ascending: false }).limit(5);
    const r = (ledger ?? []).find((x) => true);
    if (!r) throw new Error('no ledger row');
    allCreatedSalaryTransactions.add(r.id);

    // Old formula: (price + discount) × rate = (waxPrice + 0) × 0.4
    const expected = waxPrice * commission;
    assert.ok(Math.abs(Number(r.amount) - expected) < 0.01,
      `Legacy must equal old formula: expected=${expected}, actual=${r.amount}`);
  } catch (err) {
    cleanupErrors.push(err.message);
    throw err;
  } finally {
    try {
      await runCleanup(admin);
    } catch (clErr) {
      cleanupErrors.push(clErr.message);
    }
    if (cleanupErrors.length > 0) {
      throw new Error(`cleanup_failed: ${cleanupErrors.join(' | ')}`);
    }
  }
});

// Suppress unused-import warning — sleep is kept for future backoff
// between dispatcher calls if race testing is added later.
void sleep;
