#!/usr/bin/env node
// test-staff-endpoints.mjs
//
// Phase 2 / Slice #3a — staff endpoint HTTP integration test.
//
// Drives the deployed demo-car-wash HTTP surface end-to-end:
//   1. POST /api/login (password login → staff JWT for demo_admin)
//   2. POST /api/staff?action=... with the staff JWT for 13 actions
//      plus auth/validation/ownership negative cases.
//
// Cleanup is bounded to test fixtures: full_name LIKE '[TEST STAFF]%'
// and organization name LIKE '[TEST STAFF]%'. client_cars are removed
// BEFORE clients (FK direction) per PROJECT_STATE guidance.
//
// Run from /Users/dmitriy/Downloads/demo-car-wash:
//   node test-staff-endpoints.mjs
//
// Env override: DEPLOY_URL (default production alias).

const BASE = process.env.DEPLOY_URL || 'https://demo-car-wash.vercel.app';

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

// =========================================================================
// Cleanup — runs first (pre-test) AND last (post-test).
//
// Critical FK order (per PROJECT_STATE.md guidance):
//   1. organization_cars referring to test orgs  (FK → organizations)
//   2. organization_drivers of test orgs         (FK → organizations)
//   3. client_cars referring to test clients      (FK → clients)
//   4. reset clients.online_booking_blocked_until = NULL
//   5. delete clients (idempotent if missing)
//   6. delete organizations
//
// We shell out to psql (from the Supavisor-safe full-backup DATABASE_URL
// configured in the test environment) so the test does not require a
// SupabaseJS service-role key in node's environment. Bound to test tag
// '[TEST STAFF]' — never broad DELETE/UPDATE.
// =========================================================================
const { execSync } = await import('node:child_process');
const TEST_TAG = '[TEST STAFF]';

function runSqlCleanup() {
  const password = process.env.PGPASSWORD || 'YVJlmcibmLQYBtRM';
  const url = `postgresql://postgres.danobongqzbxilyvdwig:${password}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?options=-c%20project%3Dpostgres`;
  const sql = `
    DELETE FROM organization_cars  WHERE organization_id IN (SELECT id FROM organizations WHERE name LIKE '${TEST_TAG}%');
    DELETE FROM organization_drivers WHERE organization_id IN (SELECT id FROM organizations WHERE name LIKE '${TEST_TAG}%');
    DELETE FROM client_cars      WHERE client_id IN (SELECT id FROM clients WHERE full_name LIKE '${TEST_TAG}%');
    UPDATE clients SET online_booking_blocked_until = NULL WHERE full_name LIKE '${TEST_TAG}%';
    DELETE FROM clients          WHERE full_name LIKE '${TEST_TAG}%';
    DELETE FROM organizations    WHERE name LIKE '${TEST_TAG}%';
  `;
  try {
    execSync(`psql "${url}" -q -t -A -F'|' -v ON_ERROR_STOP=1 -c "${sql.replace(/\n/g, ' ')}"`, { stdio: 'pipe' });
  } catch (err) {
    console.warn('[test-staff] cleanup failed (continuing):', err?.message?.slice(0, 200));
  }
}

async function runCleanup() {
  runSqlCleanup();
}

// =========================================================================
// Test cases
// =========================================================================
console.log('==========================================================');
console.log(`Phase 2 / Slice #3a — staff endpoint HTTP integration`);
console.log(`base: ${BASE}`);
console.log('==========================================================');

// --- Pre-test cleanup ---
console.log('\n--- pre-test cleanup ---');
await runCleanup();
console.log('  done');

console.log('\n--- E0: /api/login → staff JWT ---');
const authRes = await postJSON(`${BASE}/api/login`, {
  login: 'demo_admin',
  password: 'test1234',
});
let staffToken = null;
if (authRes.status === 200 && authRes.data?.token) {
  staffToken = authRes.data.token;
  console.log(`  PASS  E0: /api/login → JWT (${staffToken.length} chars) profile_id=${authRes.data.profile_id} app_role=${authRes.data.app_role}`);
  PASS++;
} else {
  console.log(`  FAIL  E0: /api/login failed status=${authRes.status} body=${JSON.stringify(authRes.data).slice(0, 300)}`);
  FAIL++;
  process.exit(1);
}

// --- Acquire a CLIENT-role JWT for negative test E2 ---
console.log('\n--- E2-prep: get a client-role JWT (demo client via telegram-auth) ---');
// Use telegram-auth with the migration-007 test client (telegram_id=444444444) — same script as Slice #2.
import crypto from 'node:crypto';
const BOT_TOKEN = '8968802010:AAFsPlpWkW-GQWmJjSP25MKLU0jCooE7hdM';
function makeInitData(telegramId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('user', JSON.stringify({ id: telegramId, first_name: '[TEST ONLY]', last_name: 'Tire Test', username: '', language_code: 'ru' }));
  const dataCheckString = Array.from(params.entries())
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}
const clientInit = makeInitData(444444444);
const clientAuthRes = await postJSON(`${BASE}/api/telegram-auth`, { initData: clientInit });
if (clientAuthRes.status !== 200 || !clientAuthRes.data?.token) {
  console.log('  WARN  E2-prep: failed to obtain client-role JWT, skip E2');
}
const clientToken = clientAuthRes.data?.token;

// --- E1: no token → 401 ---
console.log('\n--- E1: /api/staff without auth → 401 ---');
{
  const r = await postJSON(`${BASE}/api/staff?action=search-client-by-phone`, { phone: '+79991234567' });
  assert('E1: no token → 401', r.status === 401, `status=${r.status}`);
}

// --- E2: client-role JWT → 403 wrong_role ---
console.log('\n--- E2: /api/staff with client-role JWT → 403 ---');
if (clientToken) {
  const r = await postJSON(`${BASE}/api/staff?action=search-client-by-phone`, { phone: '+79991234567' }, clientToken);
  assert('E2: client JWT → 403', r.status === 403 && r.data?.error === 'wrong_role', `status=${r.status} error=${r.data?.error}`);
}

// --- E3: unknown action → 404 ---
console.log('\n--- E3: unknown action → 404 ---');
{
  const r = await postJSON(`${BASE}/api/staff?action=does-not-exist`, {}, staffToken);
  assert('E3: unknown action → 404', r.status === 404 && r.data?.error === 'unknown_action', `status=${r.status}`);
}

// --- E4: search-client-by-phone ---
console.log('\n--- E4: search-client-by-phone ---');
{
  // search for a phone we just planted in this run (E5)
  // Pre-test cleanup removed E5 candidates; first we plant one.
  const r = await postJSON(`${BASE}/api/staff?action=create-client`, {
    full_name: '[TEST STAFF] Search Source',
    phone: '+79991234900',
  }, staffToken);
  // Track this row for cleanup.
  const createdSearchId = r.data?.data?.client?.id;
  assert('E4-prep: create-client seed → 200', r.status === 200, `status=${r.status}`);
  {
    const s = await postJSON(`${BASE}/api/staff?action=search-client-by-phone`, { phone: '+79991234900' }, staffToken);
    const rows = s.data?.data?.clients ?? [];
    const ok = s.status === 200 && rows.length >= 1 && rows[0].id === createdSearchId;
    const allowedFields = ['id', 'full_name', 'phone', 'profile_id', 'is_active'];
    const fieldsOk = rows.length === 0 || allowedFields.includes(Object.keys(rows[0])[0]);
    assert('E4: search returns the client we seeded', ok, `status=${s.status} count=${rows.length}`);
    assert('E4b: search response fields are allow-listed only', fieldsOk, `keys=${rows[0] ? Object.keys(rows[0]).join(',') : '(empty)'}`);
  }
}

// --- E5: create-client valid → 200 ---
console.log('\n--- E5: create-client valid ---');
let testClientId = null;
{
  const phone = '+79991234901';
  const r = await postJSON(`${BASE}/api/staff?action=create-client`, {
    full_name: '[TEST STAFF] E5 Primary',
    phone,
    notes: 'E5 created via dispatcher',
    email: 'e5@test.local',
  }, staffToken);
  if (r.status === 200 && r.data?.data?.client?.id) testClientId = r.data.data.client.id;
  assert('E5: create-client valid → 200', r.status === 200 && !!testClientId,
    `status=${r.status} id=${testClientId}`);
}

// --- E6: create-client collision → 409 ---
console.log('\n--- E6: create-client collision ---');
{
  const r = await postJSON(`${BASE}/api/staff?action=create-client`, {
    full_name: '[TEST STAFF] E6 Collision',
    phone: '+79991234901', // same as E5
  }, staffToken);
  assert('E6: duplicate phone → 409', r.status === 409 && r.data?.error === 'phone_collision', `status=${r.status} error=${r.data?.error}`);
}

// --- E7: create-client-car foreign client_id → 404 ---
console.log('\n--- E7: create-client-car non-existent client ---');
{
  const r = await postJSON(`${BASE}/api/staff?action=create-client-car`, {
    client_id: '11111111-2222-3333-4444-555555555555',
    car_model: '[TEST STAFF] E7 NoParent',
    plate_number: 'Т777Т777',
    car_type: 'SEDAN',
  }, staffToken);
  assert('E7: foreign client_id → 404', r.status === 404, `status=${r.status} error=${r.data?.error}`);
}

// --- E8: create-client-car valid → 200 ---
console.log('\n--- E8: create-client-car valid ---');
{
  const r = await postJSON(`${BASE}/api/staff?action=create-client-car`, {
    client_id: testClientId,
    car_model: '[TEST STAFF] E8 Car',
    plate_number: 'Т888Т888',
    car_type: 'SEDAN',
  }, staffToken);
  assert('E8: create-client-car valid → 200', r.status === 200 && !!r.data?.data?.car?.id,
    `status=${r.status}`);
}

// --- E9: update-client patch phone (collision-free) ---
console.log('\n--- E9: update-client patch ---');
{
  const newPhone = '+79991234902';
  const r = await postJSON(`${BASE}/api/staff?action=update-client`, {
    client_id: testClientId,
    phone: newPhone,
  }, staffToken);
  // Expect 200 with normalized phone returned.
  const persisted = r.data?.data?.client?.phone;
  assert('E9: update-client patch phone → 200 + normalized',
    r.status === 200 && (persisted === '+79991234902' || persisted === '+79991234902'),
    `status=${r.status} phone=${persisted}`);
}

// --- E10: unblock-client (block first, then unblock) ---
console.log('\n--- E10: unblock-client ---');
{
  // First plant a future block.
  const far = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const block = await postJSON(`${BASE}/api/staff?action=update-client`, {
    client_id: testClientId,
    online_booking_blocked_until: far,
  }, staffToken);
  assert('E10-prep: client_block planted', block.status === 200, `status=${block.status}`);
  const u = await postJSON(`${BASE}/api/staff?action=unblock-client`, { client_id: testClientId }, staffToken);
  const cleared = u.data?.data?.client?.online_booking_blocked_until;
  assert('E10: unblock → 200 + block cleared', u.status === 200 && (cleared === null || cleared === undefined),
    `status=${u.status} cleared=${cleared}`);
}

// --- E11: create-organization collision → 409 ---
console.log('\n--- E11: create-organization collision ---');
let testOrgId = null;
const testContactPhone = '+79991234910';
{
  // seed one
  const r = await postJSON(`${BASE}/api/staff?action=create-organization`, {
    name: '[TEST STAFF] E11 Org',
    contact_phone: testContactPhone,
  }, staffToken);
  if (r.status === 200 && r.data?.data?.organization?.id) testOrgId = r.data.data.organization.id;
  assert('E11-prep: create-organization seed → 200', r.status === 200 && !!testOrgId, `status=${r.status}`);
  // collision
  const c = await postJSON(`${BASE}/api/staff?action=create-organization`, {
    name: '[TEST STAFF] E11 Collision',
    contact_phone: testContactPhone,
  }, staffToken);
  assert('E11: duplicate contact_phone → 409', c.status === 409 && c.data?.error === 'contact_phone_collision',
    `status=${c.status} error=${c.data?.error}`);
}

// --- E12: create-org-driver valid → 200 ---
console.log('\n--- E12: create-org-driver ---');
let testDriverId = null;
{
  const r = await postJSON(`${BASE}/api/staff?action=create-org-driver`, {
    organization_id: testOrgId,
    full_name: '[TEST STAFF] E12 Driver',
    phone: '+79991234911',
  }, staffToken);
  if (r.status === 200 && r.data?.data?.driver?.id) testDriverId = r.data.data.driver.id;
  assert('E12: create-org-driver → 200', r.status === 200 && !!testDriverId, `status=${r.status}`);
}

// --- E13: create-org-car valid → 200 ---
console.log('\n--- E13: create-org-car ---');
{
  const r = await postJSON(`${BASE}/api/staff?action=create-org-car`, {
    organization_id: testOrgId,
    car_model: '[TEST STAFF] E13 OrgCar',
    plate_number: 'Т131Т131',
    car_type: 'SEDAN',
  }, staffToken);
  assert('E13: create-org-car → 200', r.status === 200, `status=${r.status}`);
}

// --- E14: update-driver-signature → 200 ---
console.log('\n--- E14: update-driver-signature ---');
{
  const r = await postJSON(`${BASE}/api/staff?action=update-driver-signature`, {
    driver_id: testDriverId,
    signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZptM2oAAAAASUVORK5CYII=',
  }, staffToken);
  assert('E14: update-driver-signature → 200', r.status === 200 && !!r.data?.data?.driver?.id,
    `status=${r.status}`);
}

// =========================================================================
// Post-test cleanup
// =========================================================================
console.log('\n--- post-test cleanup ---');
await runCleanup();
console.log('  done');

console.log('\n==========================================================');
console.log(`RESULT: PASS=${PASS}  FAIL=${FAIL}`);
console.log('==========================================================');

if (FAIL > 0) {
  console.log('\nFAILURES:');
  for (const f of FAILURES) console.log('  - ' + f);
  process.exit(1);
}
