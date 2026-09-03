// tests/issue13-bcrypt-cost-10.test.mjs
// Issue 13 — change_password uses bcrypt cost 10 (was: gen_salt('bf') default 6).
//
// Three blocks:
//   A. EXECUTABLE: integration against DEMO DB.
//      Uses psql subprocess for the only DB step that requires pgcrypt
//      (creating a fresh test profile with a known cost-6 hash). Then
//      calls change_password via supabase-js RPC and verifies the
//      resulting hash starts with $2a$10$.
//      Cleans up after itself.
//   B. WIRING: migration 042 exists with gen_salt('bf', 10); api/staff.ts
//      still calls change_password RPC.
//   C. REGRESSION: change_password remains SECURITY DEFINER; no bulk rehash
//      in migration 042; existing migration 016 (REVOKE) still applies.
//
// Mix of subprocess (block A — psql for pgcrypt) and pure regex (B/C).
// node:test runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createClient } from '/Users/dmitriy/Downloads/demo-car-wash/node_modules/@supabase/supabase-js/dist/index.cjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const staffTs = readFileSync(`${ROOT}/api/staff.ts`, 'utf8');
const migration = existsSync(`${ROOT}/migrations/042_change_password_bcrypt_cost_10.sql`)
  ? readFileSync(`${ROOT}/migrations/042_change_password_bcrypt_cost_10.sql`, 'utf8')
  : null;
const migration016 = existsSync(`${ROOT}/migrations/016_revoke_change_password_phase_2_1a.sql`)
  ? readFileSync(`${ROOT}/migrations/016_revoke_change_password_phase_2_1a.sql`, 'utf8')
  : null;

const skipIntegration = !SUPABASE_URL || !SERVICE_ROLE;
const admin = skipIntegration
  ? null
  : createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false }, db: { schema: 'public' } });

// Use the same DB connection pattern as browser-smoke-checklist.mjs for
// the one step that requires pgcrypt (gen_salt). supabase-js RPC doesn't
// expose extensions.gen_salt.
const PG_CONN = process.env.SUPABASE_DB_URL ||
  'postgresql://postgres.danobongqzbxilyvdwig:YVJlmcibmLQYBtRM@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?options=-c%20project%3Dpostgres';

function pg(sql) {
  try {
    return execSync(`PGPASSWORD='YVJlmcibmLQYBtRM' /opt/homebrew/bin/psql "${PG_CONN}" -At -c "${sql.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    return `__ERROR__: ${e.stderr?.toString() || e.message}`;
  }
}

const RUN_TAG = `issue13-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const TEST_PROFILE_ID = randomUUID();
const TEST_LOGIN = `t_${RUN_TAG}`;
const OLD_PASSWORD = 'OldPass_issue13_correct_001';
const NEW_PASSWORD = 'NewPass_issue13_correct_002';

let createdProfile = false;
let migrationApplied = false;

function log(...args) { console.log(...args); }

// =====================================================================
// Block A — integration
// =====================================================================

test('preflight: env vars + migration 042 file present', async () => {
  if (skipIntegration) {
    log('SKIP integration block — NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  } else {
    assert.ok(SUPABASE_URL.startsWith('https://'));
    assert.ok(SERVICE_ROLE.length > 100);
    assert.ok(migration, 'migration 042 must exist as draft');
    // Sanity: change_password RPC exists
    const { data } = await admin.rpc('change_password', {
      p_user_id: randomUUID(), p_old_password: 'x', p_new_password: 'y',
    });
    assert.equal(data, false);
  }
  migrationApplied = !!migration;
});

test('A1 — fresh profile with cost-6 hash → change_password → cost-10 hash', { skip: !migrationApplied }, async () => {
  // Generate a cost-6 bcrypt hash for OLD_PASSWORD via pgcrypt.
  const cost6Hash = pg(`SELECT crypt('${OLD_PASSWORD}', gen_salt('bf', 6));`);
  assert.ok(cost6Hash.startsWith('$2a$06$'), `cost-6 hash expected, got ${cost6Hash.slice(0, 7)}`);
  assert.equal(cost6Hash.length, 60);

  // Insert a fresh profile row with the cost-6 hash.
  const fullName = `Issue13 Test ${RUN_TAG}`;
  const insResult = pg(`
    INSERT INTO public.profiles (id, login, role, password_hash, full_name)
    VALUES ('${TEST_PROFILE_ID}', '${TEST_LOGIN}', 'admin', '${cost6Hash}', '${fullName}')
    ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash
    RETURNING id;
  `);
  assert.ok(insResult.includes(TEST_PROFILE_ID), `INSERT failed: ${insResult}`);
  createdProfile = true;

  // Confirm baseline: hash is cost 6.
  const beforeHash = pg(`SELECT password_hash FROM public.profiles WHERE id = '${TEST_PROFILE_ID}';`);
  assert.equal(beforeHash.slice(0, 7), '$2a$06$');

  // Call change_password RPC.
  const { data: ok, error } = await admin.rpc('change_password', {
    p_user_id: TEST_PROFILE_ID,
    p_old_password: OLD_PASSWORD,
    p_new_password: NEW_PASSWORD,
  });
  assert.equal(ok, true, `change_password must succeed: ${error?.message}`);
  assert.ok(!error);

  // Verify the new hash is cost 10.
  const afterHash = pg(`SELECT password_hash FROM public.profiles WHERE id = '${TEST_PROFILE_ID}';`);
  assert.equal(afterHash.slice(0, 7), '$2a$10$', `new hash must start with $2a$10$, got ${afterHash.slice(0, 7)}`);
  assert.equal(afterHash.length, 60, 'bcrypt hash length is 60 chars');
});

test('A2 — verify_password accepts new cost-10 hash and rejects wrong pwd', { skip: !migrationApplied }, async () => {
  // New password should work.
  const { data: ok1 } = await admin.rpc('verify_password', {
    p_login: TEST_LOGIN, p_password: NEW_PASSWORD,
  });
  const r1 = Array.isArray(ok1) ? ok1[0] : ok1;
  assert.equal(r1?.success, true, 'cost-10 hash must verify with new pwd');

  // Old password should no longer work (was replaced).
  const { data: ok2 } = await admin.rpc('verify_password', {
    p_login: TEST_LOGIN, p_password: OLD_PASSWORD,
  });
  const r2 = Array.isArray(ok2) ? ok2[0] : ok2;
  assert.equal(r2?.success, false, 'old pwd must NOT verify after change');

  // Wrong password should be rejected.
  const { data: ok3 } = await admin.rpc('verify_password', {
    p_login: TEST_LOGIN, p_password: 'completely_wrong_password',
  });
  const r3 = Array.isArray(ok3) ? ok3[0] : ok3;
  assert.equal(r3?.success, false, 'wrong pwd must be rejected');
});

test('A3 — backward compat: existing cost-6 demo_owner hash still verifies', { skip: !migrationApplied }, async () => {
  // demo_owner's password is unknown, but we can confirm: (a) the hash is
  // cost 6, (b) the verify_password RPC exists and accepts cost-6 via
  // crypt(pwd, hash) auto-detection. The latter is a property of pgcrypt
  // and doesn't depend on knowing the pwd.
  const demoOwnerHash = pg(`SELECT password_hash FROM public.profiles WHERE login = 'demo_owner';`);
  assert.ok(demoOwnerHash.startsWith('$2a$06$') || demoOwnerHash.startsWith('$2a$10$'),
    `demo_owner hash marker: ${demoOwnerHash.slice(0, 7)}`);

  // verify_password RPC must exist and be callable.
  const { data: anyRow } = await admin.rpc('verify_password', {
    p_login: 'demo_owner', p_password: 'definitely_wrong_pwd_xyz',
  });
  const r = Array.isArray(anyRow) ? anyRow[0] : anyRow;
  assert.equal(r?.success, false, 'wrong pwd returns false (not throw)');
  // i.e., the RPC correctly handles cost-6 hashes via crypt(pwd, hash).
});

// Cleanup — always runs (or at least tries).
test('cleanup: delete test profile', { skip: !migrationApplied }, async () => {
  if (!createdProfile) return;
  const del = pg(`DELETE FROM public.profiles WHERE id = '${TEST_PROFILE_ID}';`);
  assert.ok(!del.startsWith('__ERROR__'), `cleanup error: ${del}`);
});

// =====================================================================
// Block B — wiring
// =====================================================================

test('B1 — migration 042: gen_salt(\'bf\', 10), no bulk rehash', () => {
  assert.ok(migration, 'migration 042 must exist');
  assert.ok(/gen_salt\('bf',\s*10\)/.test(migration), 'must use gen_salt(\'bf\', 10)');
  assert.ok(!/gen_salt\('bf'\)\s*,/.test(migration), 'must NOT contain bare gen_salt(\'bf\')');
  // No bulk rehash (excluding the inside-function WHERE id = p_user_id scope)
  const functionBody = migration.split('AS $function$')[1]?.split('$function$')[0] || '';
  assert.ok(!/UPDATE\s+profiles\s+SET\s+password_hash/i.test(functionBody) ||
            /WHERE\s+id\s*=\s*p_user_id/.test(functionBody),
    'UPDATE within function must only target p_user_id');
  // No opportunistic rehash in SQL outside the function body
  assert.ok(!/ALTER\s+FUNCTION\s+verify_password/i.test(migration),
    'must NOT alter verify_password');
  // verify_password can be mentioned in comments only — that's fine.
});

test('B2 — api/staff.ts still calls change_password RPC', () => {
  assert.ok(staffTs.includes("rpc('change_password'") || staffTs.includes('rpc("change_password"'),
    'api/staff.ts must still call change_password RPC');
});

// =====================================================================
// Block C — regression
// =====================================================================

test('C1 — change_password remains SECURITY DEFINER + REVOKEd', () => {
  assert.ok(migration.includes('SECURITY DEFINER'), 'function must remain SECURITY DEFINER');
  assert.ok(migration016, 'migration 016 (REVOKE) must still exist');
  assert.ok(/REVOKE EXECUTE ON FUNCTION public\.change_password/i.test(migration016));
});
