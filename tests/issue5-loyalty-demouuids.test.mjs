// tests/issue5-loyalty-demouuids.test.mjs
// Slice #3h / Issue 5 — atomic contract + behavior tests.
//
// Three blocks:
//   A. EXECUTABLE: real integration test against DEMO DB via @supabase/supabase-js
//      with service_role credentials. Creates a fresh test client + 11 test
//      bookings, walks each through UPDATE status='ГОТОВО', verifies:
//        - loyalty_carwash_progress increments correctly
//        - free_wash_pending flips to TRUE on the 10th qualifying booking
//        - free-body-wash service is findable by service_id slug
//        - the bonus block selection (simulated by services.find) yields
//          the new DEMO UUID after migration 039
//      Cleans up after itself.
//   B. WIRING/STRUCTURE: regex on OnlineBookingWizard.tsx + migration 039.
//   C. REGRESSION: shared/config/loyalty unchanged; no FREE_BODY_WASH_SERVICE_ID
//      lookup in UI code.
//
// Mix of network (block A) and pure regex (blocks B/C). node:test runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '/Users/dmitriy/Downloads/demo-car-wash/node_modules/@supabase/supabase-js/dist/index.cjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const wizard = existsSync(`${ROOT}/components/client/OnlineBookingWizard.tsx`)
  ? readFileSync(`${ROOT}/components/client/OnlineBookingWizard.tsx`, 'utf8')
  : null;
const migration = existsSync(`${ROOT}/migrations/039_loyalty_demouuids.sql`)
  ? readFileSync(`${ROOT}/migrations/039_loyalty_demouuids.sql`, 'utf8')
  : null;
const loyaltyConfig = existsSync(`${ROOT}/shared/config/loyalty.ts`)
  ? readFileSync(`${ROOT}/shared/config/loyalty.ts`, 'utf8')
  : null;
const serviceCategories = existsSync(`${ROOT}/lib/config/serviceCategories.ts`)
  ? readFileSync(`${ROOT}/lib/config/serviceCategories.ts`, 'utf8')
  : null;

const skipIntegration = !SUPABASE_URL || !SERVICE_ROLE;
const admin = skipIntegration
  ? null
  : createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false }, db: { schema: 'public' } });

// Unique marker so re-runs don't conflict with leftover data.
const RUN_TAG = `issue5-smoke-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const TEST_PHONE = `+79${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`;
let createdProfileId = null;
let createdClientId = null;
const createdBookingIds = [];
let createdLoyaltyRowExists = false;

// Preflight: integration tests only run AFTER migration 039 has been applied
// to the target env. The pre-migration state lacks free-body-wash service.
let migrationApplied = false;

function log(...args) { console.log(...args); }

test('preflight: required env vars present + migration 039 applied', async () => {
  if (skipIntegration) {
    log('SKIP integration block — NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  } else {
    assert.ok(SUPABASE_URL.startsWith('https://'));
    assert.ok(SERVICE_ROLE.length > 100);

    // Probe: does free-body-wash service exist? If not, integration tests
    // cannot run — skip them and only run wiring/regression tests.
    const { data: probe } = await admin
      .from('services')
      .select('id')
      .eq('service_id', 'free-body-wash')
      .maybeSingle();
    migrationApplied = !!probe;
    if (!migrationApplied) {
      log('SKIP integration block — migration 039 not yet applied (free-body-wash absent)');
    }
  }
});

// =====================================================================
// A. INTEGRATION (only runs if env vars present + DEMO reachable)
// =====================================================================

test('integration: setup — create test profile + client on DEMO', async (t) => {
  if (skipIntegration || !migrationApplied) { t.skip(); return; }

  // Create profile (id must be supplied explicitly — schema has no default).
  const newProfileId = randomUUID();
  const { data: profile, error: profileErr } = await admin.from('profiles').insert({
    id: newProfileId,
    role: 'client',
    phone: TEST_PHONE,
    full_name: `Issue5 Smoke ${RUN_TAG}`,
  }).select('id').single();
  if (profileErr || !profile) { assert.fail('profile create failed: ' + profileErr?.message); return; }
  createdProfileId = profile.id;

  // Create client row linked to that profile
  const { data: clientRow, error: clientErr } = await admin.from('clients').insert({
    profile_id: createdProfileId,
    phone: TEST_PHONE,
    full_name: `Issue5 Smoke ${RUN_TAG}`,
  }).select('id').single();
  if (clientErr || !clientRow) { assert.fail('client create failed: ' + clientErr?.message); return; }
  createdClientId = clientRow.id;
  assert.ok(createdProfileId && createdClientId, 'profile+client created');
});

test('integration: free-body-wash service is findable by service_id slug (post-migration)', async (t) => {
  if (skipIntegration || !migrationApplied) { t.skip(); return; }

  // Read services list (RLS service_role bypasses; what UI does on browser).
  const { data: services, error } = await admin.from('services').select('id, service_id, name, is_visible_in_online_booking');
  if (error) { assert.fail('services fetch failed: ' + error.message); return; }

  const freeWash = services.find(s => s.service_id === 'free-body-wash');
  assert.ok(freeWash, 'free-body-wash service must exist on DEMO');
  assert.equal(freeWash.is_visible_in_online_booking, true, 'is_visible_in_online_booking mirrors PROD');
  assert.match(freeWash.name, /Бонусная мойка/);
});

test('integration: 11 eligible bookings → free_wash_pending=true at 10th', async (t) => {
  if (skipIntegration || !migrationApplied) { t.skip(); return; }
  if (!createdClientId) { t.skip(); return; }

  // Eligible service combo per trigger: body-wash (71000000-...-0001) + salon-vacuum (71000000-...-0007).
  const bodyWash = '71000000-0000-0000-0000-000000000001';
  const salonVacuum = '71000000-0000-0000-0000-000000000007';
  // Pass as a JS array, not a JSON-stringified string — supabase-js serializes
  // arrays correctly to JSONB; the stringified form can be ambiguous to
  // PostgREST for jsonb columns.
  const servicesArr = [bodyWash, salonVacuum];

  // DEMO bookings table has no `box_id` — it has nullable `box_number` (int).
  // The loyalty trigger doesn't depend on box fields, so we omit them.
  // Required NOT NULL fields per schema: client_name, car_model, plate_number,
  // car_type, services, price, status, booking_date. We supply minimal stubs.
  for (let i = 0; i < 11; i++) {
    const bookingDate = `2026-09-${String(i + 1).padStart(2, '0')}`;
    const { data: booking, error: insertErr } = await admin.from('bookings').insert({
      client_id: createdClientId,
      is_org: false,
      booking_source: 'online',
      status: 'ОЖИДАЕТ',
      services: servicesArr,
      booking_date: bookingDate,
      // stubs for NOT NULL fields unrelated to loyalty logic
      client_name: `Smoke ${RUN_TAG} ${i}`,
      car_model: 'x',
      plate_number: 'A000AA000',
      car_type: 'SEDAN',
      price: 0,
      created_by_profile_id: createdProfileId,
    }).select('id').single();
    if (insertErr || !booking) { assert.fail(`booking ${i+1} create failed: ` + insertErr?.message); return; }
    createdBookingIds.push(booking.id);

    // Flip status to ГОТОВО → loyalty trigger fires (AFTER UPDATE OF status).
    // Verify the status change actually took effect before continuing.
    const { data: after, error: updErr } = await admin.from('bookings')
      .update({ status: 'ГОТОВО' })
      .eq('id', booking.id)
      .select('id, status').single();
    if (updErr) { assert.fail(`booking ${i+1} update failed: ` + updErr.message); return; }
    if (!after || after.status !== 'ГОТОВО') {
      assert.fail(`booking ${i+1} status not flipped to ГОТОВО — got: ` + JSON.stringify(after));
      return;
    }
  }
  createdLoyaltyRowExists = true;

  // Read loyalty_carwash_progress for this client
  const { data: loyalty, error: lErr } = await admin.from('loyalty_carwash_progress')
    .select('total_washes_with_body, free_wash_pending, last_booking_id')
    .eq('client_id', createdClientId)
    .maybeSingle();
  if (lErr) { assert.fail('loyalty read failed: ' + lErr.message); return; }
  assert.ok(loyalty, 'loyalty row should exist after at least 1 booking');
  // Trigger logic: increments until total reaches 10, then sets free_wash_pending=true
  // and STOPS incrementing while pending=true (waits for client to actually use
  // the bonus wash). So after 11 updates the counter stays at 10, not 11.
  assert.equal(Number(loyalty.total_washes_with_body), 10,
    'total = 10 after 11 updates — trigger stops incrementing once free_wash_pending=true');
  assert.equal(loyalty.free_wash_pending, true,
    'free_wash_pending=true: triggered at total=10');
});

test('integration: cleanup — delete test bookings, client, profile, loyalty row', async (t) => {
  if (skipIntegration) { t.skip(); return; }
  if (!createdProfileId) { t.skip(); return; }

  // Cleanup order matters because of FKs:
  //   loyalty_carwash_progress.last_booking_id → bookings.id
  //   bookings.client_id → clients.id
  //   bookings.created_by_profile_id → profiles.id
  //   clients.profile_id → profiles.id
  // Delete loyalty FIRST (it can reference bookings).
  if (createdClientId) {
    const { error } = await admin.from('loyalty_carwash_progress').delete().eq('client_id', createdClientId);
    if (error) log('cleanup warning (loyalty):', error.message);
  }
  if (createdBookingIds.length > 0) {
    const { error } = await admin.from('bookings').delete().in('id', createdBookingIds);
    if (error) log('cleanup warning (bookings):', error.message);
  }
  if (createdClientId) {
    const { error } = await admin.from('clients').delete().eq('id', createdClientId);
    if (error) log('cleanup warning (client):', error.message);
  }
  const { error } = await admin.from('profiles').delete().eq('id', createdProfileId);
  if (error) log('cleanup warning (profile):', error.message);

  assert.ok(true, 'cleanup attempted');
});

// =====================================================================
// B. WIRING — OnlineBookingWizard.tsx + migration 039
// =====================================================================

test('wizard: bonus block now uses service_id-based lookup (no UUID)', () => {
  if (!wizard) { assert.fail('OnlineBookingWizard.tsx missing'); return; }
  assert.match(wizard, /services\.find\(s\s*=>\s*s\.service_id\s*===\s*['"]free-body-wash['"]\)/);
  // Old UUID-based lookup MUST be gone.
  assert.doesNotMatch(wizard, /services\.find\(s\s*=>\s*s\.id\s*===\s*LOYALTY_CONFIG\.FREE_BODY_WASH_SERVICE_ID/);
});

test('wizard: no longer imports LOYALTY_CONFIG (unused import removed)', () => {
  if (!wizard) { assert.fail('OnlineBookingWizard.tsx missing'); return; }
  // After the fix, LOYALTY_CONFIG is unused → import line removed.
  assert.doesNotMatch(wizard, /from\s+['"]\.\.\/\.\.\/shared\/config\/loyalty['"]/);
  assert.doesNotMatch(wizard, /\bLOYALTY_CONFIG\b/);
});

test('wizard: bonus conditional gate (hasFreeWash + personal) intact', () => {
  if (!wizard) { assert.fail('OnlineBookingWizard.tsx missing'); return; }
  assert.match(wizard, /hasFreeWash\s*&&\s*selectedCarType\s*===\s*['"]personal['"]/);
  assert.match(wizard, /if\s*\(\s*!freeWashService\s*\)\s*return\s+null/);
});

test('wizard: ordinary services list still excludes bonus via isBonusService (service_id slug)', () => {
  if (!wizard) { assert.fail('OnlineBookingWizard.tsx missing'); return; }
  assert.match(wizard, /!isBonusService\(svc\.service_id\)/);
});

test('migration 039: INSERT 1 row for free-body-wash with generated UUID', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  assert.match(migration, /INSERT INTO services[\s\S]+free-body-wash/);
  // The new UUID is inlined (not relying on RETURNING).
  assert.match(migration, /1b3953ef-e9a9-4307-8d09-508dded4ffea/);
  // is_visible_in_online_booking = true (mirrors PROD value).
  assert.match(migration, /is_visible_in_online_booking[\s\S]+true/);
});

test('migration 039: CREATE OR REPLACE FUNCTION update_loyalty_progress with DEMO UUIDs', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.update_loyalty_progress/);
  // 5 existing DEMO service UUIDs must be present in the function body.
  for (const u of [
    '71000000-0000-0000-0000-000000000001', // body-wash
    '71000000-0000-0000-0000-000000000002', // full-wash
    '71000000-0000-0000-0000-000000000007', // salon-vacuum
    'c093cace-b02a-434e-b0ed-d708f52c4f25', // salon-dry-clean
    '9e800ff9-b1ea-471d-b036-16dab5e69869', // full-dry-clean
  ]) {
    assert.match(migration, new RegExp(u.replace(/-/g, '-')));
  }
  // New bonus UUID.
  assert.match(migration, /1b3953ef-e9a9-4307-8d09-508dded4ffea/);
});

test('migration 039: trigger is NOT recreated (relies on auto-rebind)', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  // Must NOT contain DROP TRIGGER or CREATE TRIGGER.
  assert.doesNotMatch(migration, /DROP TRIGGER/);
  assert.doesNotMatch(migration, /CREATE TRIGGER\s+\w+/);
});

test('migration 039: NO changes to RLS/grants/policies', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  assert.doesNotMatch(migration, /DROP POLICY/i);
  assert.doesNotMatch(migration, /ALTER TABLE[\s\S]+ROW LEVEL SECURITY/i);
  assert.doesNotMatch(migration, /GRANT\s+\w+\s+ON\s+TABLE/i);
  assert.doesNotMatch(migration, /REVOKE\s+\w+\s+ON\s+TABLE/i);
});

// =====================================================================
// C. REGRESSION — PROD semantics untouched
// =====================================================================

test('regression: shared/config/loyalty.ts is unchanged', () => {
  if (!loyaltyConfig) { assert.fail('loyalty config missing'); return; }
  // Must still contain PROD UUIDs (these are PROD semantics, unchanged).
  assert.match(loyaltyConfig, /FREE_BODY_WASH_SERVICE_ID:\s*['"]666ca9df-/);
  assert.match(loyaltyConfig, /FULL_WASH_SERVICE_ID:\s*['"]18049fac-/);
});

test('regression: isBonusService() still keyed by service_id slug', () => {
  if (!serviceCategories) { assert.fail('serviceCategories.ts missing'); return; }
  assert.match(serviceCategories, /isBonusService[\s\S]+serviceId\s*===\s*['"]free-body-wash['"]/);
});
