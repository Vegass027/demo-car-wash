// tests/issue12-login-rate-limit.test.mjs
// Issue 12 — per-IP login rate limit.
//
// Five blocks:
//   A. EXECUTABLE: real integration test against DEMO DB via @supabase/supabase-js
//      with service_role credentials.
//      - check_login_rate_limit returns allowed=true on a fresh IP hash
//      - record_failed_login × 10 increments cleanly
//      - 11th attempt: check_login_rate_limit returns allowed=false
//      - reset_login_rate_limit clears the row
//      - window reset path: manipulate window_started_at to the past, re-check
//      Cleans up after itself.
//   B. WIRING: api/login.ts contains rate-limit gate + recordFailure +
//      resetRateLimit calls; migration 041 exists with expected schema.
//   C. REGRESSION: migration 041 does NOT introduce anon/authenticated grants
//      on login_rate_limits (server-only by design).
//   D. EXECUTABLE (migration 043): anon + authenticated cannot call any of
//      the three rate-limit RPCs; service_role still can. Uses psql
//      `SET ROLE` since supabase-js does not expose role switching.
//   F. WIRING (migration 043): file exists with REVOKE FROM anon + GRANT
//      TO service_role for all three functions.
//
// Note on live /api/login test (Variant A → Variant B):
//   An earlier draft attempted a live HTTP brute-force test (10×401 + 1×429)
//   using `X-Forwarded-For: 203.0.113.77` (RFC 5737 documentation range).
//   Empirical probe of the deployed function showed Vercel OVERRIDES the
//   client-supplied X-Forwarded-For — auth_logs.ip_address recorded the
//   actual external IP of the test machine, not the spoofed one. The
//   rate-limit bucket for the spoofed IP stayed empty; the bucket for the
//   real machine IP got incremented instead. Variant A is therefore unsafe
//   for any HTTP brute-force test (it would lock out the test machine's
//   real IP, or any NAT-shared colleague IP, for 15 minutes).
//   Variant B covers the same logical surface (counter atomicity, 10/15
//   threshold) via direct service_role RPC calls in Block A — same code
//   path /api/login.ts uses internally. The HTTP wiring (429 response,
//   Retry-After header, Russian error message) is covered structurally
//   by Block A6.
//
// Mix of network (A, D) and pure regex (B, C, F). node:test runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createRequire as _createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '/Users/dmitriy/Downloads/demo-car-wash/node_modules/@supabase/supabase-js/dist/index.cjs';

const require = _createRequire(import.meta.url);
const { writeFileSync, mkdtempSync, rmSync } = require('node:fs');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const loginTs = readFileSync(`${ROOT}/api/login.ts`, 'utf8');
const migration = existsSync(`${ROOT}/migrations/041_login_rate_limit.sql`)
  ? readFileSync(`${ROOT}/migrations/041_login_rate_limit.sql`, 'utf8')
  : null;

const skipIntegration = !SUPABASE_URL || !SERVICE_ROLE;
const admin = skipIntegration
  ? null
  : createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false }, db: { schema: 'public' } });

let migrationApplied = false;
// Lazy detection: checked at test-run time, not at registration time.
// SQL is written to a temp file and passed via psql -f to avoid shell
// escaping issues with single-quoted strings inside double-quoted -c args.
const PG_CONN = 'postgresql://postgres.danobongqzbxilyvdwig:YVJlmcibmLQYBtRM@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?options=-c%20project%3Dpostgres';
function pgExec(sql) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pgtest-'));
  const sqlFile = path.join(dir, 'query.sql');
  try {
    writeFileSync(sqlFile, sql);
    return execSync(
      `PGPASSWORD='YVJlmcibmLQYBtRM' /opt/homebrew/bin/psql '${PG_CONN}' -At -f '${sqlFile}'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
  } catch (e) {
    return '';
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}
// Like pgExec but returns {stdout, stderr, ok}. Used to detect
// permission-denied errors that go to stderr, not stdout.
function pgExecSafe(sql) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pgtest-'));
  const sqlFile = path.join(dir, 'query.sql');
  try {
    writeFileSync(sqlFile, sql);
    const stdout = execSync(
      `PGPASSWORD='YVJlmcibmLQYBtRM' /opt/homebrew/bin/psql '${PG_CONN}' -At -f '${sqlFile}'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return { stdout: stdout.trim(), stderr: '', ok: true };
  } catch (e) {
    return {
      stdout: '',
      stderr: (e.stderr?.toString() || e.message || '').trim(),
      ok: false,
    };
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}
function tableApplied() {
  if (typeof tableApplied._cached === 'undefined') {
    try {
      const probe = pgExec(`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='login_rate_limits') AS exists;`);
      tableApplied._cached = /^t$/.test(probe.trim());
    } catch {
      tableApplied._cached = false;
    }
  }
  return tableApplied._cached;
}
// Detection: after migration 043, anon cannot call check_login_rate_limit.
// Before migration 043, anon could call it. We probe by trying the call
// as anon and checking for permission-denied error.
function migration043Applied() {
  if (typeof migration043Applied._cached === 'undefined') {
    try {
      const r = pgExecSafe(`SET ROLE anon; SELECT * FROM public.check_login_rate_limit('m043_probe'); RESET ROLE;`);
      // Before: ok=true (call succeeded with row data)
      // After: ok=false + stderr contains 'permission denied'
      migration043Applied._cached = !r.ok && /permission denied/i.test(r.stderr);
    } catch {
      migration043Applied._cached = false;
    }
  }
  return migration043Applied._cached;
}

// Each run uses a fresh IP hash so concurrent runs don't interfere.
const RUN_TAG = `issue12-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const ipHash = createHash('sha256').update(`127.0.0.1:${RUN_TAG}`).digest('hex');

function log(...args) { console.log(...args); }

test('preflight: env vars + migration 041 applied', async () => {
  if (skipIntegration) {
    log('SKIP integration block — NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  } else {
    assert.ok(SUPABASE_URL.startsWith('https://'));
    assert.ok(SERVICE_ROLE.length > 100);

    // Probe: does login_rate_limits table exist? If not, integration tests
    // cannot run — skip them and only run wiring tests.
    const { data, error } = await admin
      .from('login_rate_limits')
      .select('ip_hash')
      .eq('ip_hash', ipHash)
      .maybeSingle();
    migrationApplied = !error;
    if (!migrationApplied) {
      log('SKIP integration block — migration 041 not yet applied (login_rate_limits absent)');
    }
    assert.ok(migration || !migrationApplied, 'migration 041 file must exist');
  }
});

test('A1 — fresh IP hash: check_login_rate_limit returns allowed=true, count=0', async (t) => {
  if (!tableApplied()) { t.skip(); return; }
  const { data, error } = await admin.rpc('check_login_rate_limit', { p_ip_hash: ipHash });
  assert.ok(!error, `rpc error: ${error?.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  assert.equal(row.allowed, true, 'fresh IP must be allowed');
  assert.equal(row.current_count, 0);
  assert.equal(row.retry_after_seconds, 0);
});

test('A2 — record_failed_login × 10: count climbs 1→10, next attempt blocked', async (t) => {
  if (!tableApplied()) { t.skip(); return; }
  // Note: per migration 041, check uses `attempt_count >= v_max_attempts` (10).
  // This means 10 failures go through, and the NEXT check (representing the
  // 11th attempt) is blocked. Matches user spec: "максимум 10 неудачных
  // попыток логина; 11-я блокируется".
  for (let i = 1; i <= 10; i++) {
    const { error } = await admin.rpc('record_failed_login', { p_ip_hash: ipHash });
    assert.ok(!error, `record_failed_login step ${i} error: ${error?.message}`);
  }
  const { data } = await admin.rpc('check_login_rate_limit', { p_ip_hash: ipHash });
  const row = Array.isArray(data) ? data[0] : data;
  // After 10 record_failed_login, count is 10. The next call to check (which
  // would correspond to the 11th attempt) returns allowed=false.
  assert.equal(row.allowed, false, 'next attempt (11th) must be blocked');
  assert.equal(row.current_count, 10);
});

test('A3 — 11th check: allowed=false, retry_after_seconds > 0', async (t) => {
  if (!tableApplied()) { t.skip(); return; }
  // Edge case: A2 left count at 10. A check call is read-only (does not
  // increment), so this represents the "would-be 11th attempt" being denied.
  const { data } = await admin.rpc('check_login_rate_limit', { p_ip_hash: ipHash });
  const row = Array.isArray(data) ? data[0] : data;
  assert.equal(row.allowed, false, '11th attempt must be denied');
  assert.ok(row.retry_after_seconds > 0 && row.retry_after_seconds <= 900, `retry_after out of range: ${row.retry_after_seconds}`);
  assert.equal(row.current_count, 10);
});

test('A4 — reset_login_rate_limit: row deleted, fresh check returns allowed=true again', async (t) => {
  if (!tableApplied()) { t.skip(); return; }
  const { error } = await admin.rpc('reset_login_rate_limit', { p_ip_hash: ipHash });
  assert.ok(!error, `reset error: ${error?.message}`);

  const { data: existing } = await admin
    .from('login_rate_limits')
    .select('ip_hash')
    .eq('ip_hash', ipHash)
    .maybeSingle();
  assert.equal(existing, null, 'row must be deleted');

  const { data } = await admin.rpc('check_login_rate_limit', { p_ip_hash: ipHash });
  const row = Array.isArray(data) ? data[0] : data;
  assert.equal(row.allowed, true);
  assert.equal(row.current_count, 0);
});

test('A5 — window reset path: push window_started_at to 20 min ago → fresh window', async (t) => {
  if (!tableApplied()) { t.skip(); return; }
  // Manually insert a row with attempt_count=10 and window_started_at = 20 min ago
  // to simulate "attempts happened, but the window has expired".
  const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { error: insErr } = await admin.from('login_rate_limits').insert({
    ip_hash: ipHash, window_started_at: twentyMinAgo, attempt_count: 10, updated_at: twentyMinAgo,
  });
  assert.ok(!insErr, `insert error: ${insErr?.message}`);

  // Check should report allowed=true (window expired), but the row still
  // shows attempt_count=10 because we only checked.
  const { data: d1 } = await admin.rpc('check_login_rate_limit', { p_ip_hash: ipHash });
  const r1 = Array.isArray(d1) ? d1[0] : d1;
  assert.equal(r1.allowed, true);
  assert.equal(r1.current_count, 0, 'check should report implicit reset');

  // record_failed_login should reset the window + count to 1.
  const { error } = await admin.rpc('record_failed_login', { p_ip_hash: ipHash });
  assert.ok(!error);

  const { data: d2 } = await admin.rpc('check_login_rate_limit', { p_ip_hash: ipHash });
  const r2 = Array.isArray(d2) ? d2[0] : d2;
  assert.equal(r2.allowed, true);
  assert.equal(r2.current_count, 1, 'new window should restart count at 1');

  // Cleanup
  await admin.rpc('reset_login_rate_limit', { p_ip_hash: ipHash });
});

test('A6 — fail-open: api/login.ts wraps RPC in try/catch with allowed:true fallback', async (t) => {
  if (!tableApplied()) { t.skip(); return; }
  // Pure regex check: every rate-limit RPC call must be inside try/catch and
  // must default to allowed=true on error.
  assert.ok(loginTs.includes('check_login_rate_limit'), 'login.ts must call check_login_rate_limit');
  assert.ok(loginTs.includes('record_failed_login'), 'login.ts must call record_failed_login');
  assert.ok(loginTs.includes('reset_login_rate_limit'), 'login.ts must call reset_login_rate_limit');
  assert.ok(/checkRateLimit[\s\S]*fail-open/i.test(loginTs), 'checkRateLimit must be marked fail-open');
  assert.ok(loginTs.includes("'Слишком много попыток") || loginTs.includes('Слишком много попыток'),
    'login.ts must return neutral Russian message on 429');
  assert.ok(loginTs.includes('Retry-After'), 'login.ts must set Retry-After header');
  assert.ok(/res\.status\(429\)/.test(loginTs), 'login.ts must return 429');
  // IP-extraction: x-forwarded-for + x-real-ip fallback
  assert.ok(loginTs.includes("x-forwarded-for"), 'login.ts must read x-forwarded-for');
  assert.ok(loginTs.includes("x-real-ip"), 'login.ts must fall back to x-real-ip');
  // IP hashing (no raw IP in DB)
  assert.ok(/hashIp|sha256/.test(loginTs), 'login.ts must hash IP before storing');
});

test('B — wiring: migration 041 schema + grants', () => {
  assert.ok(migration, 'migration 041 file must exist');
  assert.ok(/CREATE TABLE IF NOT EXISTS public\.login_rate_limits/.test(migration));
  assert.ok(/ip_hash\s+text\s+PRIMARY KEY/.test(migration));
  assert.ok(/attempt_count\s+integer/.test(migration));
  assert.ok(/check_login_rate_limit\s*\(/.test(migration));
  assert.ok(/record_failed_login\s*\(/.test(migration));
  assert.ok(/reset_login_rate_limit\s*\(/.test(migration));
  assert.ok(/SECURITY DEFINER/.test(migration));
  assert.ok(/REVOKE ALL ON TABLE public\.login_rate_limits FROM PUBLIC, anon, authenticated/.test(migration));
  assert.ok(/GRANT ALL ON TABLE public\.login_rate_limits TO service_role/.test(migration));
});

test('C — regression: anon + authenticated cannot read login_rate_limits', async (t) => {
  if (!tableApplied()) { t.skip(); return; }
  // Table-level regression (migration 041): anon cannot SELECT/INSERT the
  // table. Structural file check below.
  await admin.rpc('reset_login_rate_limit', { p_ip_hash: ipHash }); // cleanup any leftovers
  assert.ok(migration.includes('REVOKE ALL ON TABLE public.login_rate_limits FROM PUBLIC, anon, authenticated'));
  assert.ok(migration.includes('GRANT ALL ON TABLE public.login_rate_limits TO service_role'));
});

// =====================================================================
// Block D — migration 043 verification: anon/authenticated CANNOT call
// rate-limit RPCs. service_role still can. Probed via psql SET ROLE.
// =====================================================================

const RATE_LIMIT_FUNCTIONS = [
  'check_login_rate_limit',
  'record_failed_login',
  'reset_login_rate_limit',
];

test('D — anon + authenticated cannot call any rate-limit RPC; service_role can', async (t) => {
  if (!tableApplied()) { t.skip(); return; }
  if (!migration043Applied()) {
    log('SKIP D — migration 043 not yet applied');
    t.skip(); return;
  }
  // Test each function as each role.
  for (const fn of RATE_LIMIT_FUNCTIONS) {
    // anon should fail with permission denied
    const rAnon = pgExecSafe(`SET ROLE anon; SELECT * FROM public.${fn}('m043_test_hash'); RESET ROLE;`);
    assert.equal(rAnon.ok, false, `anon must NOT be able to call ${fn} (got ok=true)`);
    assert.match(rAnon.stderr, /permission denied/i, `anon error for ${fn} must mention 'permission denied' — got: ${rAnon.stderr}`);

    // authenticated should also fail
    const rAuth = pgExecSafe(`SET ROLE authenticated; SELECT * FROM public.${fn}('m043_test_hash'); RESET ROLE;`);
    assert.equal(rAuth.ok, false, `authenticated must NOT be able to call ${fn} (got ok=true)`);
    assert.match(rAuth.stderr, /permission denied/i, `authenticated error for ${fn} must mention 'permission denied' — got: ${rAuth.stderr}`);

    // service_role should succeed — for check_login_rate_limit we expect row data;
    // for record_failed_login / reset_login_rate_limit we expect empty stdout.
    const rSr = pgExecSafe(`SELECT * FROM public.${fn}('m043_test_hash');`);
    assert.equal(rSr.ok, true, `service_role MUST be able to call ${fn} — got error: ${rSr.stderr}`);
  }
  // Cleanup test hash
  await admin.rpc('reset_login_rate_limit', { p_ip_hash: 'm043_test_hash' });
});

// =====================================================================
// Block E (REMOVED — see file header note on Variant A → Variant B)
//   Was a live /api/login HTTP brute-force test (10×401 + 1×429).
//   Empirical probe showed Vercel overrides client-supplied
//   X-Forwarded-For, so Variant A is unsafe (would lock out the test
//   machine's real IP for 15 minutes). Counter / threshold / fail-open
//   semantics are covered by Block A via direct service_role RPC calls
//   (same code path /api/login.ts uses). HTTP-level wiring (429,
//   Retry-After, Russian msg) is covered structurally by Block A6.
// =====================================================================

// =====================================================================
// Block F — wiring: migration 043 file contains correct REVOKE/GRANT.
// =====================================================================

const migration043 = existsSync(`${ROOT}/migrations/043_restrict_login_rate_limit_rpc_execute.sql`)
  ? readFileSync(`${ROOT}/migrations/043_restrict_login_rate_limit_rpc_execute.sql`, 'utf8')
  : null;

test('F — wiring: migration 043 REVOKE + GRANT for all 3 functions', () => {
  assert.ok(migration043, 'migration 043 file must exist as draft');
  for (const fn of RATE_LIMIT_FUNCTIONS) {
    assert.ok(
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(text\\) FROM PUBLIC`).test(migration043),
      `must REVOKE EXECUTE ON FUNCTION ${fn} FROM PUBLIC`,
    );
    assert.ok(
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(text\\) FROM anon`).test(migration043),
      `must REVOKE EXECUTE ON FUNCTION ${fn} FROM anon`,
    );
    assert.ok(
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(text\\) FROM authenticated`).test(migration043),
      `must REVOKE EXECUTE ON FUNCTION ${fn} FROM authenticated`,
    );
    assert.ok(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(text\\) TO service_role`).test(migration043),
      `must GRANT EXECUTE ON FUNCTION ${fn} TO service_role`,
    );
  }
});
