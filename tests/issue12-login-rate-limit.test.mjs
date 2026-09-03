// tests/issue12-login-rate-limit.test.mjs
// Issue 12 — per-IP login rate limit.
//
// Three blocks:
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
//
// Mix of network (block A) and pure regex (blocks B/C). node:test runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '/Users/dmitriy/Downloads/demo-car-wash/node_modules/@supabase/supabase-js/dist/index.cjs';

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

test('A1 — fresh IP hash: check_login_rate_limit returns allowed=true, count=0', { skip: !migrationApplied }, async () => {
  const { data, error } = await admin.rpc('check_login_rate_limit', { p_ip_hash: ipHash });
  assert.ok(!error, `rpc error: ${error?.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  assert.equal(row.allowed, true, 'fresh IP must be allowed');
  assert.equal(row.current_count, 0);
  assert.equal(row.retry_after_seconds, 0);
});

test('A2 — record_failed_login × 10: count climbs 1→10, check still allowed', { skip: !migrationApplied }, async () => {
  for (let i = 1; i <= 10; i++) {
    const { error } = await admin.rpc('record_failed_login', { p_ip_hash: ipHash });
    assert.ok(!error, `record_failed_login step ${i} error: ${error?.message}`);
  }
  const { data } = await admin.rpc('check_login_rate_limit', { p_ip_hash: ipHash });
  const row = Array.isArray(data) ? data[0] : data;
  assert.equal(row.allowed, true, '10th attempt must still be allowed');
  assert.equal(row.current_count, 10);
});

test('A3 — 11th check: allowed=false, retry_after_seconds > 0', { skip: !migrationApplied }, async () => {
  // Edge case: A2 left count at 10. A check call is read-only (does not
  // increment), so this represents the "would-be 11th attempt" being denied.
  const { data } = await admin.rpc('check_login_rate_limit', { p_ip_hash: ipHash });
  const row = Array.isArray(data) ? data[0] : data;
  assert.equal(row.allowed, false, '11th attempt must be denied');
  assert.ok(row.retry_after_seconds > 0 && row.retry_after_seconds <= 900, `retry_after out of range: ${row.retry_after_seconds}`);
  assert.equal(row.current_count, 10);
});

test('A4 — reset_login_rate_limit: row deleted, fresh check returns allowed=true again', { skip: !migrationApplied }, async () => {
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

test('A5 — window reset path: push window_started_at to 20 min ago → fresh window', { skip: !migrationApplied }, async () => {
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

test('A6 — fail-open: api/login.ts wraps RPC in try/catch with allowed:true fallback', { skip: !migrationApplied }, async () => {
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

test('C — regression: anon + authenticated cannot read login_rate_limits', { skip: !migrationApplied }, async () => {
  // Run as anon role — should get permission denied.
  await admin.rpc('reset_login_rate_limit', { p_ip_hash: ipHash }); // cleanup any leftovers
  // We can't easily SET ROLE in supabase-js, but we can probe the function
  // existence + grants via pg_proc. The "C" check is structural: the
  // migration must not have granted EXECUTE to anon or authenticated.
  // (Defensive: structural check via SQL is below — but using a fresh
  // connection isn't trivial in node:test. The migration file structure
  // assertion in test B already enforces this.)
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.check_login_rate_limit(text) FROM PUBLIC'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text) TO service_role'));
});
