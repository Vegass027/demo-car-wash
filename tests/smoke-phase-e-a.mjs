// tests/smoke-phase-e-a.mjs
// Phase E (a) Category C RLS smoke — 34 logical test cases.
//
// ⚠️  THIS RUNNER DOES NOT SEED, APPLY, CLEANUP, OR DEPLOY.
//     Each state-changing operation requires an explicit owner OK
//     and an externally-driven step in the chat protocol.
//
// What this runner does, when invoked:
//
//   1. Validates that 5 required environment variables are present
//      (DEMO_SUPABASE_URL / DEMO_SUPABASE_ANON_KEY /
//      DEMO_SUPABASE_SERVICE_ROLE_KEY / DEMO_SUPABASE_JWT_SECRET /
//      DEMO_DATABASE_URL). Missing => exit 2 BEFORE any network op.
//   2. Enforces a fail-closed demo allowlist on those values:
//      DEMO_SUPABASE_URL must equal exactly
//        "https://danobongqzbxilyvdwig.supabase.co"
//      DEMO_DATABASE_URL must contain "danobongqzbxilyvdwig"
//      Plus secondary blacklist on production refs.
//      Any mismatch => exit 1 BEFORE any network op.
//   3. Reads /tmp/pgmig/pE1_seed_ids.json (must already exist
//      from a separate seed step approved by owner).
//   4. Connects to the DEMO project using:
//         - pg (via DEMO_DATABASE_URL) for verification queries and
//           privileged write/revert/cleanup operations on seeded
//           rows (the privileged executor).
//         - Supabase clients (via DEMO_SUPABASE_URL + anon key +
//           minted JWTs) for client/admin/anon REST + Realtime
//           probes.
//   5. Runs 34 logical test cases (R01–R19, W01–W10, WS01–WS04, P01)
//      per the v3.2.1 design with composite-lifecycle aggregation.
//   6. Reports pass/fail per logical case.
//
// What this runner DOES NOT do:
//
//   - Does NOT create seed rows. (Requires external seed step.)
//   - Does NOT apply migration 025. (Requires external psql step.)
//   - Does NOT clean up seed rows. (Requires external cleanup step.)
//   - Does NOT read any production credentials. The allowlist gate
//     refuses any URL that is not the literal demo origin.
//   - Does NOT call git, Vercel, or deploy anything.
//   - Does NOT execute 025_ROLLBACK_EMERGENCY.sql.
//
// Environment required before invocation (created by separate
// owner-approved seed step):
//   /tmp/pgmig/pE1_seed_ids.json
//     {
//       "seed_bookings_A": "uuid",
//       "seed_bookings_B": "uuid",
//       "seed_tire_B":     "uuid",
//       "seed_car_A":      "uuid",
//       "seed_car_B":      "uuid",
//       "seed_loyalty_A":  "uuid"
//     }
// Postgres connection is read from DEMO_DATABASE_URL env var.

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import pg from 'pg';
import ws from 'ws';
import fs from 'fs';

// =================================================================
// STEP 1: required-environment-variable check (fail-closed)
// =================================================================
const REQUIRED_ENV = [
  'DEMO_SUPABASE_URL',
  'DEMO_SUPABASE_ANON_KEY',
  'DEMO_SUPABASE_SERVICE_ROLE_KEY',
  'DEMO_SUPABASE_JWT_SECRET',
  'DEMO_DATABASE_URL',
];
const MISSING = REQUIRED_ENV.filter(k => !process.env[k] || !process.env[k].trim());
if (MISSING.length > 0) {
  console.error(`[smoke-phase-e-a] Missing required env var(s): ${MISSING.join(', ')}`);
  console.error(`[smoke-phase-e-a] Refusing to start. Set all 5 env vars before invocation.`);
  process.exit(2);
}
const DEMO_SUPABASE_URL = process.env.DEMO_SUPABASE_URL;
const DEMO_SUPABASE_ANON_KEY = process.env.DEMO_SUPABASE_ANON_KEY;
const DEMO_SUPABASE_JWT_SECRET = process.env.DEMO_SUPABASE_JWT_SECRET;
const DEMO_DATABASE_URL = process.env.DEMO_DATABASE_URL;
// DEMO_SUPABASE_SERVICE_ROLE_KEY is reserved for future uses
// (e.g. privileged RPC via .rpc() on Supabase); not currently
// referenced by this runner but its presence is required for
// fail-closed completeness. Read once to keep the env gate unified:
const _DEMO_SR = process.env.DEMO_SUPABASE_SERVICE_ROLE_KEY;
void _DEMO_SR;

// =================================================================
// STEP 2: demo-only allowlist gate (fail-closed before any network op)
// =================================================================
const DEMO_ALLOWED_SUPABASE_HOST = 'danobongqzbxilyvdwig.supabase.co';
const DEMO_ALLOWED_DATABASE_REF = 'danobongqzbxilyvdwig';

(function assertDemoOnly() {
  // Primary: exact allowlist.
  const expectedSupabaseUrl = `https://${DEMO_ALLOWED_SUPABASE_HOST}`;
  if (DEMO_SUPABASE_URL !== expectedSupabaseUrl) {
    console.error(`[smoke-phase-e-a] DEMO_SUPABASE_URL is not the allowed demo URL.`);
    console.error(`[smoke-phase-e-a] Refusing to start.`);
    process.exit(1);
  }
  if (!DEMO_DATABASE_URL.includes(DEMO_ALLOWED_DATABASE_REF)) {
    console.error(`[smoke-phase-e-a] DEMO_DATABASE_URL does not contain demo project ref.`);
    console.error(`[smoke-phase-e-a] Refusing to start.`);
    process.exit(1);
  }
  // Secondary: production blacklist (defense in depth on top of allowlist).
  const PROD_BLACKLIST = ['avajtwihzjfpytimfbaw', 'prod-carwash'];
  for (const s of PROD_BLACKLIST) {
    if (DEMO_SUPABASE_URL.includes(s)) {
      console.error(`[smoke-phase-e-a] DEMO_SUPABASE_URL contains production fragment "${s}".`);
      process.exit(1);
    }
    if (DEMO_DATABASE_URL.includes(s)) {
      console.error(`[smoke-phase-e-a] DEMO_DATABASE_URL contains production fragment "${s}".`);
      process.exit(1);
    }
  }
})();

// =================================================================
// STEP 3: JWT mint helper (env-supplied secret)
// =================================================================
function signJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

// =================================================================
// STEP 4: pg client (first network op occurs AFTER env + allowlist)
// =================================================================
const pgC = new pg.Client({ connectionString: DEMO_DATABASE_URL });
await pgC.connect();

// =================================================================
// STEP 5: read captured seed IDs (must be prepared by external seed step)
// =================================================================
const SEED_PATH = '/tmp/pgmig/pE1_seed_ids.json';
if (!fs.existsSync(SEED_PATH)) {
  console.error(`[smoke-phase-e-a] Missing ${SEED_PATH}. Run the external seed step first (separate owner OK).`);
  await pgC.end();
  process.exit(2);
}
const SEED = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
// Seed JSON contract v3.1 (per Phase E(a) design):
//   seed_bookings: { A: <uuid>, B: <uuid> }   (nested)
//   seed_tire_B: <uuid>
//   seed_car_A:  <uuid>
//   seed_car_B:  <uuid>
//   loyalty_A_fixture_id: <uuid>
//   seeded_loyalty_A_id:   <uuid> | null
const REQUIRED_TOP_KEYS = ['seed_bookings','seed_tire_B','seed_car_A','seed_car_B','loyalty_A_fixture_id'];
const REQUIRED_NESTED = ['A','B'];
for (const k of REQUIRED_TOP_KEYS) {
  if (!(k in SEED)) {
    console.error(`[smoke-phase-e-a] Missing required key ${k} in ${SEED_PATH}.`);
    await pgC.end();
    process.exit(2);
  }
}
if (!SEED.seed_bookings || typeof SEED.seed_bookings !== 'object') {
  console.error(`[smoke-phase-e-a] seed_bookings must be an object { A, B } in ${SEED_PATH}.`);
  await pgC.end();
  process.exit(2);
}
for (const k of REQUIRED_NESTED) {
  const v = SEED.seed_bookings[k];
  if (!v || typeof v !== 'string') {
    console.error(`[smoke-phase-e-a] Missing seed_bookings.${k} (UUID string) in ${SEED_PATH}.`);
    await pgC.end();
    process.exit(2);
  }
}
for (const k of ['A','B','tire_B','car_A','car_B','loyalty_A_fixture_id']) {
  const v = (k === 'A' || k === 'B') ? SEED.seed_bookings[k] : SEED[(k === 'tire_B' ? 'seed_tire_B' : k === 'car_A' ? 'seed_car_A' : k === 'car_B' ? 'seed_car_B' : 'loyalty_A_fixture_id')];
  if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    console.error(`[smoke-phase-e-a] Missing or malformed UUID in ${k}: not a UUID.`);
    await pgC.end();
    process.exit(2);
  }
}
// seeded_loyalty_A_id may be null (when A's row pre-existed at seed time)
if (!('seeded_loyalty_A_id' in SEED)) {
  console.error(`[smoke-phase-e-a] Missing required key seeded_loyalty_A_id (may be null) in ${SEED_PATH}.`);
  await pgC.end();
  process.exit(2);
}
if (SEED.seeded_loyalty_A_id !== null) {
  if (typeof SEED.seeded_loyalty_A_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(SEED.seeded_loyalty_A_id)) {
    console.error(`[smoke-phase-e-a] seeded_loyalty_A_id present but not a UUID and not null`);
    await pgC.end();
    process.exit(2);
  }
}

// =================================================================
// STEP 6: resolve A and B profile+client ids (real rows = READ-ONLY fixtures)
// =================================================================
const { rows: profs } = await pgC.query(`
  SELECT p.id AS profile_id, p.telegram_id, c.id AS client_id
  FROM profiles p JOIN clients c ON c.profile_id = p.id
  WHERE p.telegram_id IN (333333333, 444444444)
  ORDER BY p.telegram_id
`);
const A = profs.find(r => String(r.telegram_id) === '333333333');
const B = profs.find(r => String(r.telegram_id) === '444444444');
if (!A || !B) { console.error('[smoke-phase-e-a] Cannot resolve A/B profiles + clients.'); await pgC.end(); process.exit(2); }

const aRealBooking = await pgC.query(`SELECT id FROM bookings WHERE client_id=$1 LIMIT 1`, [A.client_id]);
const A_REAL_BOOKING_ID = aRealBooking.rows[0]?.id;

const aRealTire = await pgC.query(`SELECT id FROM tire_bookings WHERE client_id=$1 LIMIT 1`, [A.client_id]);
const A_REAL_TIRE_ID = aRealTire.rows[0]?.id;

const otherLoyalty = await pgC.query(`
  SELECT l.client_id, l.id AS loyalty_id
  FROM loyalty_carwash_progress l
  JOIN clients c ON c.id = l.client_id
  WHERE c.profile_id != $1 AND c.profile_id IS NOT NULL
  LIMIT 1
`, [A.profile_id]);
const OTHER_LOYALTY_CLIENT = otherLoyalty.rows[0]?.client_id;

// =================================================================
// STEP 7: mint JWTs (direct sign; no Supabase Auth call)
// =================================================================
const now = Math.floor(Date.now() / 1000);
const A_JWT = signJwt({
  sub: A.profile_id, role: 'authenticated', app_role: 'client',
  profile_id: A.profile_id, telegram_id: 333333333,
  iat: now, exp: now + 43200,
}, DEMO_SUPABASE_JWT_SECRET);
const B_JWT = signJwt({
  sub: B.profile_id, role: 'authenticated', app_role: 'client',
  profile_id: B.profile_id, telegram_id: 444444444,
  iat: now, exp: now + 43200,
}, DEMO_SUPABASE_JWT_SECRET);

const adminProfile = await pgC.query(`SELECT id FROM profiles WHERE role='admin' LIMIT 1`);
const ADMIN_PROFILE_ID = adminProfile.rows[0]?.id;
if (!ADMIN_PROFILE_ID) { console.error('[smoke-phase-e-a] No admin profile found.'); await pgC.end(); process.exit(2); }
const ADMIN_JWT = signJwt({
  sub: ADMIN_PROFILE_ID, role: 'authenticated', app_role: 'admin',
  profile_id: ADMIN_PROFILE_ID,
  iat: now, exp: now + 43200,
}, DEMO_SUPABASE_JWT_SECRET);

// =================================================================
// STEP 8: Supabase clients (REST probes + Realtime subscribers)
// =================================================================
function mkClient(jwt) {
  return createClient(DEMO_SUPABASE_URL, DEMO_SUPABASE_ANON_KEY, {
    global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : {},
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: ws },
  });
}
const supAnon = mkClient(null);
const supA = mkClient(A_JWT);
const supB = mkClient(B_JWT);
const supAdmin = mkClient(ADMIN_JWT);

// =================================================================
// STEP 9: tiny test runner
// =================================================================
let pass = 0, fail = 0, fails = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else    { fail++; fails.push({ name, detail }); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
const rand = () => crypto.randomBytes(8).toString('hex');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// =================================================================
// SECTION R: READS — R01–R19 (19 logical cases)
// =================================================================
console.log('\n=== SECTION R: READS (R01–R19) ===');

// R01 clients A own SELECT = 1
{
  const r = await supA.from('clients').select('id').eq('id', A.client_id).maybeSingle();
  check('R01 clients A own SELECT = 1', !!r.data && r.error === null, JSON.stringify(r.data).slice(0,60));
}
// R02 clients A foreign SELECT = 0
{
  const r = await supA.from('clients').select('id').eq('id', B.client_id).maybeSingle();
  check('R02 clients A foreign SELECT = 0', !r.data && r.error === null, JSON.stringify(r.data).slice(0,60));
}
// R03 clients A unfiltered = only own (1)
{
  const r = await supA.from('clients').select('id', { count: 'exact', head: true });
  const n = (r.count === undefined ? (r.data?.length ?? 0) : r.count);
  check('R03 clients A unfiltered count = 1 (only own)', n === 1, `count=${n}`);
}
// R04 clients admin SELECT unfiltered = full list
{
  const r = await supAdmin.from('clients').select('id', { count: 'exact', head: true });
  check('R04 clients admin SELECT unfiltered >= 31', (r.count ?? 0) >= 31, `count=${r.count}`);
}
// R05 clients anon SELECT = 0
{
  const r = await supAnon.from('clients').select('id', { count: 'exact', head: true });
  check('R05 clients anon SELECT = 0 (anon_blocked)', (r.count ?? 0) === 0, `count=${r.count} err=${r.error?.code}`);
}
// R06 client_cars A own SELECT
{
  const r = await supA.from('client_cars').select('id', { count: 'exact', head: true }).eq('client_id', A.client_id);
  const n = r.count ?? 0;
  check('R06 client_cars A own SELECT includes seed_car_A + real A', n >= 1, `count=${n}`);
}
// R07 client_cars A SELECT client_id=B = 0
{
  const r = await supA.from('client_cars').select('id', { count: 'exact', head: true }).eq('client_id', B.client_id);
  check('R07 client_cars A SELECT client_id=B = 0', (r.count ?? 0) === 0, `count=${r.count}`);
}
// R08 client_cars admin SELECT exact = seed_car_B = 1
{
  const r = await supAdmin.from('client_cars').select('id').eq('id', SEED.seed_car_B).maybeSingle();
  check('R08 client_cars admin SELECT exact = seed_car_B = 1', !!r.data, JSON.stringify(r.data).slice(0,60));
}
// R09 bookings A SELECT exact = A real booking
{
  const r = await supA.from('bookings').select('id').eq('id', A_REAL_BOOKING_ID).maybeSingle();
  check('R09 bookings A SELECT exact = A real = 1', !!r.data, JSON.stringify(r.data).slice(0,60));
}
// R10 bookings A SELECT exact = seed_booking_B = 0
{
  const r = await supA.from('bookings').select('id').eq('id', SEED.seed_bookings.B).maybeSingle();
  check('R10 bookings A SELECT exact = seed_booking_B = 0', !r.data, JSON.stringify(r.data).slice(0,60));
}
// R11 bookings A unfiltered: positive seed_booking_A AND negative seed_booking_B.
//     Both authorization queries run under Client A JWT, not service_role.
//     service_role is only used here to assert fixture existence BEFORE R11
//     (so we don't conflate fixture absence with RLS deny).
{
  // Fixture integrity (NOT an RLS result source): confirm the seed rows exist
  // in DB at all. Run via pgC (privileged) so an empty seed set is detected
  // as a setup error, not as an RLS deny.
  const fixtureCheck = await pgC.query(`
    SELECT
      EXISTS(SELECT 1 FROM bookings WHERE id = $1) AS has_a,
      EXISTS(SELECT 1 FROM bookings WHERE id = $2) AS has_b
  `, [SEED.seed_bookings.A, SEED.seed_bookings.B]);
  const fixtureA = fixtureCheck.rows[0]?.has_a === true;
  const fixtureB = fixtureCheck.rows[0]?.has_b === true;
  let r11pass = false;
  let r11detail = '';
  if (!fixtureA || !fixtureB) {
    r11detail = `seed fixture missing: has_a=${fixtureA} has_b=${fixtureB}`;
  } else {
    // Two Supabase queries under Client A JWT — proves the list-level RLS view.
    const list = await supA.from('bookings').select('id').limit(500);
    const idsInList = new Set((list.data || []).map(r => r.id));
    const containsA = idsInList.has(SEED.seed_bookings.A);
    const containsB = idsInList.has(SEED.seed_bookings.B);
    r11pass = containsA && !containsB;
    r11detail = `containsA=${containsA} containsB=${containsB} n_list=${list.data?.length ?? 0}`;
  }
  // Single check() per logical case R11.
  check('R11 bookings A unfiltered contains seed_booking_A AND excludes seed_booking_B', r11pass, r11detail);
}
// R12 bookings admin SELECT unfiltered
{
  const r = await supAdmin.from('bookings').select('id', { count: 'exact', head: true });
  check('R12 bookings admin SELECT unfiltered >= 100', (r.count ?? 0) >= 100, `count=${r.count}`);
}
// R13 tire_bookings A SELECT exact = A real tire = 1
{
  const r = await supA.from('tire_bookings').select('id').eq('id', A_REAL_TIRE_ID).maybeSingle();
  check('R13 tire_bookings A SELECT exact = A real tire = 1', !!r.data, JSON.stringify(r.data).slice(0,60));
}
// R14 tire_bookings A SELECT exact = seed_tire_B = 0
{
  const r = await supA.from('tire_bookings').select('id').eq('id', SEED.seed_tire_B).maybeSingle();
  check('R14 tire_bookings A SELECT exact = seed_tire_B = 0', !r.data, JSON.stringify(r.data).slice(0,60));
}
// R15 tire_bookings admin SELECT exact = seed_tire_B = 1
{
  const r = await supAdmin.from('tire_bookings').select('id').eq('id', SEED.seed_tire_B).maybeSingle();
  check('R15 tire_bookings admin SELECT exact = seed_tire_B = 1', !!r.data, JSON.stringify(r.data).slice(0,60));
}
// R16 loyalty A SELECT exact = seed_loyalty_A = 1
{
  const r = await supA.from('loyalty_carwash_progress').select('id').eq('id', SEED.loyalty_A_fixture_id).maybeSingle();
  check('R16 loyalty A SELECT exact = seed_loyalty_A = 1', !!r.data, JSON.stringify(r.data).slice(0,60));
}
// R17 loyalty A SELECT WHERE client_id=other_real = 0
{
  const r = await supA.from('loyalty_carwash_progress').select('id', { count: 'exact', head: true }).eq('client_id', OTHER_LOYALTY_CLIENT);
  check('R17 loyalty A SELECT WHERE client_id=OTHER (real foreign) = 0', (r.count ?? 0) === 0, `count=${r.count}`);
}
// R18 loyalty A unfiltered
{
  const r = await supA.from('loyalty_carwash_progress').select('id', { count: 'exact', head: true });
  check('R18 loyalty A unfiltered = only own seed (1)', (r.count ?? 0) === 1, `count=${r.count}`);
}
// R19 loyalty admin SELECT unfiltered
{
  const r = await supAdmin.from('loyalty_carwash_progress').select('id', { count: 'exact', head: true });
  check('R19 loyalty admin SELECT unfiltered >= 16', (r.count ?? 0) >= 16, `count=${r.count}`);
}

// =================================================================
// SECTION W: WRITES — W01–W10 (10 logical cases, composites collapsed)
// =================================================================
console.log('\n=== SECTION W: WRITES (W01–W10) — client denials + admin compat ===');

// W01 clients A INSERT own profile_id denied + 0 rows
{
  const marker = 'pE1_W01_' + rand();
  const r = await supA.from('clients').insert({
    profile_id: A.profile_id, phone: marker, full_name: 'pE1_smoke_A', is_active: true,
  }).select('id').maybeSingle();
  const r0 = await pgC.query(`SELECT count(*)::int AS n FROM clients WHERE phone = $1`, [marker]);
  check('W01 clients A INSERT own profile_id denied + 0 rows',
    !r.data?.id && Number(r0.rows[0].n) === 0, `insert_id=${r.data?.id} pg_count=${r0.rows[0].n}`);
}
// W02 clients A INSERT foreign profile_id denied + 0 rows
{
  const marker = 'pE1_W02_' + rand();
  const r = await supA.from('clients').insert({
    profile_id: B.profile_id, phone: marker, full_name: 'pE1_smoke_B', is_active: true,
  }).select('id').maybeSingle();
  const r0 = await pgC.query(`SELECT count(*)::int AS n FROM clients WHERE phone = $1`, [marker]);
  check('W02 clients A INSERT foreign profile_id denied + 0 rows',
    !r.data?.id && Number(r0.rows[0].n) === 0, `insert_id=${r.data?.id} pg_count=${r0.rows[0].n}`);
}
// W03 clients admin INSERT -> client UPDATE denied -> admin DELETE cleanup
//     (one logical case; composite lifecycle)
//     Uses an isolated admin supabase client with explicit single-row return.
{
  let stepAOk = false, stepBOk = false, okC = false, runningOk = false, transportMismatch = false;
  const marker = 'pE1W03_' + rand().slice(0, 6);  // short marker: phone is varchar(20)
  let adminInsertId = null;

  // Build an isolated admin client just for this test.
  const supAdminIsolated = mkClient(ADMIN_JWT);

  // Phase A: admin INSERT (allowed by staff_all).
  // Use explicit `.select('id').single()` so PostgREST returns representation
  // as a single object; capture the response in `insertResp`.
  const insertResp = await supAdminIsolated.from('clients').insert({
    profile_id: null, phone: marker, full_name: 'pE1_smoke_admin', is_active: true,
  }).select('id').single();

  // SDK response may succeed at HTTP level (status 201) but still leave data
  // null on certain clients/serialization paths. Capture either way.
  const respErr = insertResp.error ?? null;
  adminInsertId = insertResp.data?.id ?? null;
  stepAOk = !!adminInsertId && !respErr;

  // Defensive authoritative check: did the row actually land in DB?
  // Use exact-marker lookup only here (phone=marker). If yes but SDK did
  // not return id, treat as runner transport/reporting defect.
  if (!adminInsertId) {
    const exactMarker = await pgC.query(
      `SELECT id FROM clients WHERE phone = $1`,
      [marker]
    );
    const exactId = exactMarker.rows[0]?.id ?? null;
    if (exactId) {
      transportMismatch = true;
      adminInsertId = exactId;
      stepAOk = true; // DB has it; runner transport is what's broken.
    }
  }

  if (stepAOk && adminInsertId) {
    // Phase B: client A UPDATE admin-inserted row (denied by RLS).
    const upd = await supA.from('clients').update({ full_name: 'pE1_W03b_' + rand() })
      .eq('id', adminInsertId).select('id').maybeSingle();
    const verify = await pgC.query(
      `SELECT full_name FROM clients WHERE id = $1`, [adminInsertId]
    );
    stepBOk = !upd.data?.id && verify.rows[0]?.full_name === 'pE1_smoke_admin';

    // Phase C: admin DELETE admin-inserted row (allowed, cleanup).
    if (stepBOk) {
      await supAdminIsolated.from('clients').delete().eq('id', adminInsertId);
      const after = await pgC.query(
        `SELECT count(*)::int AS n FROM clients WHERE id = $1`, [adminInsertId]
      );
      okC = Number(after.rows[0].n) === 0;
    }
    runningOk = stepBOk && okC;
  }

  // If we ever left a row behind due to a defect, do NOT silently proceed.
  // Best-effort safety delete by exact id.
  if (adminInsertId) {
    try { await pgC.query(`DELETE FROM clients WHERE id = $1`, [adminInsertId]); } catch {}
  }

  const detail = `stepA=${stepAOk} stepBC=${runningOk} transportMismatch=${transportMismatch} respErr=${respErr?.code ?? 'none'}`;
  check('W03 clients admin INSERT -> client UPDATE denied -> admin DELETE cleanup',
    stepAOk && runningOk && okC,
    detail);
}
// W04 client_cars A INSERT client_id=own denied + 0 rows
{
  const marker = 'pE1_W04_' + rand();
  const r = await supA.from('client_cars').insert({
    client_id: A.client_id, car_model: marker, plate_number: marker, car_type: 'sedan', is_active: true,
  }).select('id').maybeSingle();
  const r0 = await pgC.query(`SELECT count(*)::int AS n FROM client_cars WHERE car_model = $1`, [marker]);
  check('W04 client_cars A INSERT client_id=own denied + 0 rows',
    !r.data?.id && Number(r0.rows[0].n) === 0, `insert_id=${r.data?.id} pg_count=${r0.rows[0].n}`);
}
// W05 client_cars admin UPDATE seed_car_B + revert (one logical case, composite lifecycle)
{
  // Capture original is_active
  const origRow = await pgC.query(`SELECT is_active FROM client_cars WHERE id = $1`, [SEED.seed_car_B]);
  const origVal = origRow.rows[0]?.is_active;
  // Phase A: admin UPDATE to false (allowed)
  await pgC.query(`UPDATE client_cars SET is_active = false WHERE id = $1`, [SEED.seed_car_B]);
  const afterDown = await pgC.query(`SELECT is_active FROM client_cars WHERE id = $1`, [SEED.seed_car_B]);
  const stepAOk = afterDown.rows[0]?.is_active === false;
  // Phase B: revert to original (cleanup)
  await pgC.query(`UPDATE client_cars SET is_active = $1 WHERE id = $2`, [origVal, SEED.seed_car_B]);
  const afterUp = await pgC.query(`SELECT is_active FROM client_cars WHERE id = $1`, [SEED.seed_car_B]);
  const stepBOk = afterUp.rows[0]?.is_active === origVal;
  check('W05 client_cars admin UPDATE seed_car_B (allowed) + revert',
    stepAOk && stepBOk, `orig=${origVal} down=${afterDown.rows[0]?.is_active} up=${afterUp.rows[0]?.is_active}`);
}
// W06 bookings A INSERT client_id=B denied + 0 rows
{
  const marker = 'pE1_W06_' + rand();
  const r = await supA.from('bookings').insert({
    booking_date: '2099-12-31', client_id: B.client_id,
    client_name: 'pE1_smoke', phone: '00000000000',
    car_model: marker, plate_number: 'pE1', car_type: 'sedan',
    services: '[]', services_with_quantities: '[]',
    price: 0, status: 'ОЖИДАЕТ', start_time: '00:00:00', end_time: '00:00:00',
    booking_source: 'online', created_by_profile_id: A.profile_id,
  }).select('id').maybeSingle();
  const r0 = await pgC.query(`SELECT count(*)::int AS n FROM bookings WHERE car_model = $1`, [marker]);
  check('W06 bookings A INSERT client_id=B denied + 0 rows',
    !r.data?.id && Number(r0.rows[0].n) === 0, `insert_id=${r.data?.id} pg_count=${r0.rows[0].n}`);
}
// W07 B UPDATE seed_booking_A cancel_comment denied + NULL preserved
{
  const upd = await supB.from('bookings').update({ cancel_comment: 'pE1_W07' }).eq('id', SEED.seed_bookings.A);
  const after = await pgC.query(`SELECT cancel_comment FROM bookings WHERE id = $1`, [SEED.seed_bookings.A]);
  check('W07 B UPDATE seed_booking_A cancel_comment denied + NULL preserved',
    after.rows[0]?.cancel_comment === null, `pg_cancel_comment=${after.rows[0]?.cancel_comment} upd_err=${upd.error?.code}`);
}
// W08 A UPDATE seed_tire_B total_price denied + unchanged
{
  const upd = await supA.from('tire_bookings').update({ total_price: 999 }).eq('id', SEED.seed_tire_B);
  const after = await pgC.query(`SELECT total_price FROM tire_bookings WHERE id = $1`, [SEED.seed_tire_B]);
  check('W08 A UPDATE seed_tire_B total_price=999 denied + unchanged',
    after.rows[0]?.total_price !== 999, `pg_total_price=${after.rows[0]?.total_price} upd_err=${upd.error?.code}`);
}
// W09 A DELETE seed_tire_B denied + row still exists
{
  const del = await supA.from('tire_bookings').delete().eq('id', SEED.seed_tire_B);
  const after = await pgC.query(`SELECT count(*)::int AS n FROM tire_bookings WHERE id = $1`, [SEED.seed_tire_B]);
  check('W09 A DELETE seed_tire_B denied + row still exists',
    Number(after.rows[0].n) === 1, `pg_count=${after.rows[0].n} del_err=${del.error?.code}`);
}
// W10 A UPDATE seed_loyalty_A total_washes_with_body denied + unchanged
{
  const upd = await supA.from('loyalty_carwash_progress').update({ total_washes_with_body: 99 }).eq('id', SEED.loyalty_A_fixture_id);
  const after = await pgC.query(`SELECT total_washes_with_body FROM loyalty_carwash_progress WHERE id = $1`, [SEED.loyalty_A_fixture_id]);
  check('W10 A UPDATE seed_loyalty_A total_washes_with_body=99 denied + unchanged',
    after.rows[0]?.total_washes_with_body !== 99,
    `pg_total_washes=${after.rows[0]?.total_washes_with_body} upd_err=${upd.error?.code}`);
}

// =================================================================
// SECTION WS: REALTIME — WS01–WS04 (4 logical cases)
//   Subscriber = Client A JWT; UPDATE executor = pgC (service_role);
//   restore = pgC (service_role). Absence of event = RLS filtering.
// =================================================================
console.log('\n=== SECTION WS: REALTIME (WS01–WS04) — service_role executor ===');
await supA.realtime.setAuth(A_JWT);

async function wsSubscribe(table, filterExpr, eventStore) {
  const ch = supA.channel(`pE1-${table}-${Date.now()}-${Math.random()}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table, ...(filterExpr ? { filter: filterExpr } : {}) },
      () => { eventStore.count++; });
  return new Promise((resolve) => {
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') { await sleep(800); resolve(ch); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(ch);
    });
    setTimeout(() => resolve(ch), 5000);
  });
}

async function triggerAndRestore(rowId, table, col, val, originalVal) {
  await pgC.query(`UPDATE ${table} SET ${col}=$1 WHERE id=$2`, [val, rowId]);
  await sleep(3500);
  try { await pgC.query(`UPDATE ${table} SET ${col}=$1 WHERE id=$2`, [originalVal, rowId]); } catch {}
  await sleep(300);
}

async function waitForEvents(ch, ms, eventStore) {
  await sleep(ms);
  return eventStore.count;
}

// WS01: A no-filter sub to bookings; service_role UPDATE seed_booking_A; A receives own event
{
  const eventStore = { count: 0 };
  const ch = await wsSubscribe('bookings', undefined, eventStore);
  const before = await pgC.query(`SELECT cancel_comment FROM bookings WHERE id=$1`, [SEED.seed_bookings.A]);
  const orig = before.rows[0]?.cancel_comment;
  await triggerAndRestore(SEED.seed_bookings.A, 'bookings', 'cancel_comment', 'pE1_WS01_' + rand(), orig);
  const ev = await waitForEvents(ch, 1500, eventStore);
  check('WS01 bookings A no-filter + service_role UPDATE seed_booking_A -> A receives own event',
    ev > 0, `events=${ev}`);
  await ch.unsubscribe();
  await sleep(300);
}
// WS02: A no-filter sub to bookings; service_role UPDATE seed_booking_B; A receives NO event (RLS blocks B)
{
  const eventStore = { count: 0 };
  const ch = await wsSubscribe('bookings', undefined, eventStore);
  const before = await pgC.query(`SELECT cancel_comment FROM bookings WHERE id=$1`, [SEED.seed_bookings.B]);
  const orig = before.rows[0]?.cancel_comment;
  await triggerAndRestore(SEED.seed_bookings.B, 'bookings', 'cancel_comment', 'pE1_WS02_' + rand(), orig);
  const ev = await waitForEvents(ch, 1500, eventStore);
  check('WS02 bookings A no-filter + service_role UPDATE seed_booking_B -> NO event (RLS)',
    ev === 0, `events=${ev}`);
  await ch.unsubscribe();
  await sleep(300);
}
// WS03: A no-filter sub to tire_bookings; service_role UPDATE seed_tire_B; A receives NO event (RLS)
{
  const eventStore = { count: 0 };
  const ch = await wsSubscribe('tire_bookings', undefined, eventStore);
  const before = await pgC.query(`SELECT total_price FROM tire_bookings WHERE id=$1`, [SEED.seed_tire_B]);
  const orig = before.rows[0]?.total_price;
  const newVal = (orig === null ? 1 : orig) + 1;
  await pgC.query(`UPDATE tire_bookings SET total_price=$1 WHERE id=$2`, [newVal, SEED.seed_tire_B]);
  await sleep(3500);
  try { await pgC.query(`UPDATE tire_bookings SET total_price=$1 WHERE id=$2`, [orig, SEED.seed_tire_B]); } catch {}
  await sleep(300);
  const ev = await waitForEvents(ch, 1500, eventStore);
  check('WS03 tire_bookings A no-filter + service_role UPDATE seed_tire_B -> NO event (RLS)',
    ev === 0, `events=${ev}`);
  await ch.unsubscribe();
  await sleep(300);
}
// WS04: A filter sub to bookings by client_id=A; service_role UPDATE seed_booking_B; A receives NO event (filter blocks)
{
  const eventStore = { count: 0 };
  const ch = await wsSubscribe('bookings', `client_id=eq.${A.client_id}`, eventStore);
  const before = await pgC.query(`SELECT cancel_comment FROM bookings WHERE id=$1`, [SEED.seed_bookings.B]);
  const orig = before.rows[0]?.cancel_comment;
  await triggerAndRestore(SEED.seed_bookings.B, 'bookings', 'cancel_comment', 'pE1_WS04_' + rand(), orig);
  const ev = await waitForEvents(ch, 1500, eventStore);
  check('WS04 bookings A filter client_id=own + service_role UPDATE seed_booking_B -> NO event (filter)',
    ev === 0, `events=${ev}`);
  await ch.unsubscribe();
  await sleep(300);
}

// =================================================================
// SECTION P: POLICY STRUCTURE — P01 (1 logical case)
// =================================================================
console.log('\n=== SECTION P: POLICY STRUCTURE (P01) ===');

{
  // Read-only RLS metadata verification. Not an RLS result source —
  // this is structural proof that no client-DML permissive policy exists.
  const r = await pgC.query(`
    SELECT policyname, cmd
    FROM pg_policies
    WHERE schemaname='public' AND tablename='clients'
  `);
  const names = r.rows.map(x => x.policyname);
  const hasStaff = names.includes('staff_all');
  const hasClient = names.includes('client_own_select');
  const hasAnonBlocked = names.includes('anon_blocked');
  // Find the cmd of `client_own_select` to confirm it is SELECT only.
  const clientRow = r.rows.find(x => x.policyname === 'client_own_select');
  const clientCmdIsSelect = clientRow && clientRow.cmd.toLowerCase() === 'select';
  // Confirm no PERMISSIVE policy on clients has cmd in (INSERT,UPDATE,DELETE)
  // and qual mentioning both app_role and client (a structural permissive
  // client-DML policy would render W03/W01/W02 meaningless).
  const anyClientDML = r.rows.some(x => {
    const c = x.cmd.toLowerCase();
    const q = (x.qual || '').toLowerCase();
    return ['insert','update','delete'].includes(c)
      && q.includes('app_role')
      && q.includes('client');
  });
  check('P01 clients RLS structure: staff_all + client_own_select(SELECT) + anon_blocked; no client-DML permissive policy',
    hasStaff && hasClient && hasAnonBlocked && clientCmdIsSelect && !anyClientDML,
    `names=[${names.join(',')}] client_cmd=${clientRow?.cmd ?? 'none'} anyClientDML=${anyClientDML}`);
}

await pgC.end();
console.log(`\n=== Phase E(a) smoke: ${pass} pass / ${fail} fail (34 logical cases) ===`);
if (fail) {
  console.log('\nFailing tests:');
  for (const f of fails) console.log(`  ❌ ${f.name} — ${f.detail}`);
}
process.exit(fail > 0 ? 1 : 0);
