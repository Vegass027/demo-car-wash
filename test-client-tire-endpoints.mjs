#!/usr/bin/env node
// test-client-tire-endpoints.mjs
//
// Phase 2 / Slice #2 — tire endpoint HTTP integration test.
//
// Drives the deployed demo-car-wash HTTP surface end-to-end:
//   1. POST /api/telegram-auth (HMAC-SHA256 signed initData for
//      telegram_id=444444444 = migration-007 test client)
//      → returns client JWT
//   2. With JWT: POST /api/client?action={...} for the 3 tire actions
//      plus auth/validation/ownership negative cases.
//
// Uses migration-007 test client (PROFILE_ID / CLIENT_ID hardcoded).
// Test data lives on 2099-* dates — bound to test client only.

import crypto from 'node:crypto';

const BASE = process.env.DEPLOY_URL || 'https://demo-car-wash.vercel.app';
const BOT_TOKEN = '8968802010:AAFsPlpWkW-GQWmJjSP25MKLU0jCooE7hdM';

const TIRE_TEST_PROFILE_ID = 'de8998b6-0725-46de-89e5-a89061daa2b5';
const TIRE_TEST_CLIENT_ID  = '2c89868f-e85b-44cb-825b-896c3f77c474';
const TEST_DATE = '2099-03-01';

// === HMAC for /api/telegram-auth ===
function makeInitData(telegramId, firstName = '[TEST ONLY]', lastName = 'Tire Test') {
  const user = JSON.stringify({
    id: Number(telegramId),
    first_name: firstName,
    last_name: lastName,
    username: '',
    language_code: 'ru',
  });
  const auth_date = Math.floor(Date.now() / 1000);

  // Order MUST be alphabetical by key. Telegram sorts lexicographically.
  const params = new URLSearchParams();
  params.set('auth_date', String(auth_date));
  params.set('user', user);

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

// === HTTP helpers ===
async function postJSON(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  return { status: res.status, data };
}

let PASS = 0;
let FAIL = 0;
const FAILURES = [];

function assert(name, cond, detail) {
  if (cond) {
    PASS++;
    console.log(`  PASS  ${name}`);
  } else {
    FAIL++;
    FAILURES.push(name + (detail ? `: ${detail}` : ''));
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ============================================================================
console.log('==========================================================');
console.log(`Phase 2 / Slice #2 — tire endpoint HTTP integration`);
console.log(`base: ${BASE}`);
console.log('==========================================================');

// --- E0: log in as Tire Test Client and obtain JWT ---
console.log('\n--- E0: telegram-auth (HMAC) — Tire Test Client ---');
const initData = makeInitData(444444444);
const authRes = await postJSON(`${BASE}/api/telegram-auth`, { initData });
let token = null;
if (authRes.status === 200 && authRes.data?.token) {
  token = authRes.data.token;
  console.log(`  PASS  E0: telegram-auth → JWT (${token.length} chars) profile_id=${authRes.data.profile_id} app_role=${authRes.data.app_role}`);
  PASS++;
} else {
  console.log(`  FAIL  E0: telegram-auth failed status=${authRes.status} body=${JSON.stringify(authRes.data).slice(0, 200)}`);
  FAIL++;
  process.exit(1); // can't proceed without JWT
}

// --- E1: GET /api/tire-bookings with auth → 200, empty on TEST_DATE ---
console.log('\n--- E1: get-tire-bookings ---');
{
  const r = await postJSON(`${BASE}/api/client?action=get-tire-bookings`, { date: TEST_DATE }, token);
  const isOk = r.status === 200 && Array.isArray(r.data?.data?.bookings) && r.data.data.bookings.length === 0;
  assert('E1: get-tire-bookings on TEST_DATE returns 0 own bookings', isOk,
    `status=${r.status} count=${r.data?.data?.bookings?.length} body=${JSON.stringify(r.data).slice(0, 200)}`);
}

// --- E2: POST /api/client without Authorization → 401 ---
console.log('\n--- E2: dispatcher without auth → 401 ---');
{
  const r = await postJSON(`${BASE}/api/client?action=get-tire-bookings`, { date: TEST_DATE });
  assert('E2: no token → 401', r.status === 401, `status=${r.status}`);
}

// --- E3: POST /api/client with unknown action → 404 ---
console.log('\n--- E3: dispatcher with unknown action → 404 ---');
{
  const r = await postJSON(`${BASE}/api/client?action=does-not-exist`, {}, token);
  assert('E3: unknown action → 404', r.status === 404, `status=${r.status} body=${JSON.stringify(r.data).slice(0, 200)}`);
}

// --- E4: create-tire-booking without required fields → 400 ---
console.log('\n--- E4: create-tire-booking validation ---');
{
  const r = await postJSON(`${BASE}/api/client?action=create-tire-booking`, {}, token);
  assert('E4: missing body → 400', r.status === 400, `status=${r.status} error=${r.data?.error}`);
}

// --- E5: create-tire-booking with foreign client_car_id → 403 ---
console.log('\n--- E5: ownership — foreign client_car_id → 403 ---');
{
  // We don't even need a known foreign car id; any random UUID will be:
  //   INSERT? -> SELECT clients WHERE profile_id=jwt.profile_id  -> OK
  //   -> SELECT client_cars WHERE id=$1 AND client_id=$own       -> MISS
  //   -> 403 client_car_id_not_owned
  const r = await postJSON(`${BASE}/api/client?action=create-tire-booking`, {
    car_model: 'Foreign Car',
    plate_number: 'Т999Т999',
    services: [{ service_id: '00000000-0000-0000-0000-000000000001', name: 'Test', quantity: 1, price: 100, total: 100 }],
    total_price: 100,
    payment_method: 'Наличный',
    booking_date: TEST_DATE,
    start_time: '10:00',
    estimated_duration: 60,
    client_car_id: '11111111-2222-3333-4444-555555555555', // not ours
  }, token);
  assert('E5: foreign client_car_id → 403', r.status === 403 && r.data?.error === 'client_car_id_not_owned',
    `status=${r.status} error=${r.data?.error}`);
}

// --- E6: create-tire-booking valid → 200 ---
console.log('\n--- E6: create-tire-booking valid → 200 ---');
let createdId = null;
{
  const r = await postJSON(`${BASE}/api/client?action=create-tire-booking`, {
    car_model: 'Slice2 Test Car',
    plate_number: 'Т100Т100',
    services: [{ service_id: '00000000-0000-0000-0000-000000000001', name: 'Test', quantity: 1, price: 100, total: 100 }],
    total_price: 100,
    payment_method: 'Наличный',
    booking_date: TEST_DATE,
    start_time: '11:30',
    estimated_duration: 60,
  }, token);
  const ok = r.status === 200 && r.data?.data?.booking?.id;
  if (ok) createdId = r.data.data.booking.id;
  assert('E6: create-tire-booking valid → 200', ok,
    `status=${r.status} booking_id=${createdId} body=${JSON.stringify(r.data).slice(0, 200)}`);
}

// --- E7: get-tire-bookings on TEST_DATE now returns 1 own booking ---
console.log('\n--- E7: get-tire-bookings sees own newly-created booking ---');
{
  const r = await postJSON(`${BASE}/api/client?action=get-tire-bookings`, { date: TEST_DATE }, token);
  const bookings = r.data?.data?.bookings ?? [];
  const isOk = r.status === 200 && bookings.length === 1 && bookings[0].id === createdId;
  assert('E7: get-tire-bookings returns the booking we created', isOk,
    `status=${r.status} count=${bookings.length} ids=${bookings.map(b => b.id).join(',')}`);
}

// --- E8: create-tire-booking overlapping slot → 409 ---
console.log('\n--- E8: overlap detected → 409 ---');
{
  const r = await postJSON(`${BASE}/api/client?action=create-tire-booking`, {
    car_model: 'Slice2 Test Car 2',
    plate_number: 'Т101Т101',
    services: [{ service_id: '00000000-0000-0000-0000-000000000001', name: 'Test', quantity: 1, price: 100, total: 100 }],
    total_price: 100,
    payment_method: 'Наличный',
    booking_date: TEST_DATE,
    start_time: '11:30',  // exact same start_time + 60min → overlaps 11:30-12:30
    estimated_duration: 60,
  }, token);
  assert('E8: overlap → 409 slot_occupied', r.status === 409 && r.data?.error === 'slot_occupied',
    `status=${r.status} error=${r.data?.error}`);
}

// --- E9: cancel-tire-booking own booking → 200 ---
console.log('\n--- E9: cancel-tire-booking own booking → 200 ---');
{
  const r = await postJSON(`${BASE}/api/client?action=cancel-tire-booking`, {
    tire_booking_id: createdId,
    reason: 'phase-2-slice-2-e2e',
  }, token);
  const ok = r.status === 200 && r.data?.data?.already_cancelled === false && r.data?.data?.booking?.status === 'ОТМЕНЕНО';
  assert('E9: cancel own → 200 already_cancelled=false', ok,
    `status=${r.status} body=${JSON.stringify(r.data).slice(0, 200)}`);
}

// --- E10: cancel-tire-booking same booking → already_cancelled=true ---
console.log('\n--- E10: cancel-tire-booking same booking → already_cancelled=true ---');
{
  const r = await postJSON(`${BASE}/api/client?action=cancel-tire-booking`, {
    tire_booking_id: createdId,
  }, token);
  const ok = r.status === 200 && r.data?.data?.already_cancelled === true;
  assert('E10: cancel same → already_cancelled=true', ok,
    `status=${r.status} body=${JSON.stringify(r.data).slice(0, 200)}`);
}

// --- E11: cancel-tire-booking foreign booking → 404 ---
console.log('\n--- E11: cancel-tire-booking foreign booking → 404 ---');
{
  const r = await postJSON(`${BASE}/api/client?action=cancel-tire-booking`, {
    tire_booking_id: '00000000-0000-0000-0000-000000000000',
  }, token);
  assert('E11: cancel foreign → 404', r.status === 404 && r.data?.error === 'tire_booking_not_found_or_not_owned',
    `status=${r.status} error=${r.data?.error}`);
}

// --- E12: validation: cancel-tire-booking missing tire_booking_id → 400 ---
console.log('\n--- E12: validation ---');
{
  const r = await postJSON(`${BASE}/api/client?action=cancel-tire-booking`, {}, token);
  assert('E12: missing tire_booking_id → 400', r.status === 400,
    `status=${r.status} error=${r.data?.error}`);
}

// --- Cleanup: delete the test booking via service_role (cannot use anon dispatcher) ---
// The dispatcher has no delete-tire-booking action. Direct DSN-based deletion is
// intentional: client never needs to hard-delete; cancellation is the only deletion
// path exposed via API.
console.log(`\n(booking ${createdId} now has status='ОТМЕНЕНО'; cleanup script in PROJECT_STATE.md §5.7 handles it on next test session)`);

// ============================================================================
console.log('\n==========================================================');
console.log(`RESULT: PASS=${PASS}  FAIL=${FAIL}`);
console.log('==========================================================');

if (FAIL > 0) {
  console.log('\nFAILURES:');
  for (const f of FAILURES) console.log('  - ' + f);
  process.exit(1);
}
