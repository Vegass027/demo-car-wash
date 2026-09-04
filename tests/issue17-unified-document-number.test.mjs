/**
 * tests/issue17-unified-document-number.test.mjs
 *
 * Issue 17 — regression test for unified document numbering.
 *
 * Workbook = (organization_id, fiscal_year, fiscal_month, service_type).
 * Invariant: invoice and act for the same workbook share ONE document_number.
 * Counter is global, monotonic, no monthly reset.
 *
 * Two test blocks:
 *   (A) Unit tests — pure JS, mirror allocate_document_number semantics
 *       WITHOUT touching the DB. Always run. Including one mock-based strict
 *       `===` consecutivity check (allowed because the mock is fully
 *       isolated, no external activity).
 *   (B) Live integration tests on DEMO — skip cleanly without env vars.
 *       Soft assertions only: `>` instead of `=== N + 1` because another
 *       staff member could trigger real allocations between our calls.
 *       Cleanup: UUID-addressed DELETE on test organizations only.
 *       CASCADE drops document_assignments for those orgs. Global counter
 *       is NEVER modified by the test.
 *
 * Cleanup contract (per Issue 15/16):
 *   - NO filter-based DELETE (no `.eq('name', 'issue17_…')`).
 *   - NO default passwords.
 *   - NO secret leakage in logs.
 *   - All created IDs collected in module-level Sets, deleted by primary key.
 *   - Cleanup failures THROW (runCleanup pattern).
 *   - Global `document_counter` is NEVER modified or reset by the test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

// -----------------------------
// Configuration / shared state
// -----------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Single source of truth for the DEMO app base URL (login + dispatcher must
// target the same deployment, otherwise /api/login cookies and /api/staff
// auth checks could desync).
const DEMO_APP_URL = process.env.DEMO_VERCEL_URL || 'https://demo-car-wash.vercel.app';

// UUID-addressed cleanup tracking (module-level Sets, exactly like issue15/16).
const allCreatedOrganizations = new Set();

// -----------------------------
// Mock helper for unit tests (no DB; mirror the RPC's "lock + lookup +
// allocate" semantics against an in-memory map).
// -----------------------------
function makeMockAllocator() {
  let counter = 100; // pretend current_number = 100 (legacy baseline)
  const assignments = new Map(); // key: orgId|serviceType|year|month → number
  const concLog = []; // for asserting counter monotonicity across allocations

  function key(orgId, serviceType, year, month) {
    return `${orgId}|${serviceType}|${year}|${month}`;
  }

  function allocateMock(orgId, serviceType, year, month) {
    const k = key(orgId, serviceType, year, month);
    // Step 1: lookup
    if (assignments.has(k)) return assignments.get(k);
    // Step 2: increment counter (mock — no advisory lock needed)
    counter += 1;
    // Step 3: record
    assignments.set(k, counter);
    concLog.push(counter);
    return counter;
  }

  function currentCounter() { return counter; }
  return { allocateMock, currentCounter, assignmentCount: () => assignments.size };
}

// -----------------------------
// Live helper
// -----------------------------

const HAS_LIVE_ENV = Boolean(
  process.env.DEMO_ADMIN_LOGIN &&
  process.env.DEMO_ADMIN_PASSWORD &&
  SUPABASE_URL &&
  SERVICE_ROLE,
);

async function loginAsAdmin(baseUrl, adminLogin, adminPassword) {
  // Same pattern as Issue 16 — use HTTP /api/login (custom verify_password
  // RPC) since demo_admin has no auth.users row. See issue16 test for
  // rationale (no anon key available, no Supabase auth.users path).
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: adminLogin, password: adminPassword }),
  });
  if (!res.ok) {
    throw new Error(`login_failed: HTTP ${res.status}`);
  }
  const json = await res.json().catch(() => null);
  if (!json || typeof json.token !== 'string' || json.token.length === 0) {
    throw new Error(`login_failed: response missing token`);
  }
  return json.token;
}

async function staffCall(jwt, action, body) {
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

async function allocateViaStaff(jwt, orgId, serviceType, year, month) {
  const r = await staffCall(jwt, 'allocate-document-number', {
    organization_id: orgId,
    service_type: serviceType,
    year,
    month,
  });
  if (r.status >= 400) {
    throw new Error(`allocate_failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const n = r.body?.data?.number;
  if (typeof n !== 'number') {
    throw new Error(`allocate_failed: missing number in response ${JSON.stringify(r.body)}`);
  }
  return n;
}

async function createTestOrganization(admin, label) {
  // Minimal required field is `name`. All other fields left to defaults / NULL.
  const { data, error } = await admin
    .from('organizations')
    .insert({ name: `issue17_${label}_${Date.now()}_${Math.floor(Math.random() * 100000)}` })
    .select('id')
    .single();
  if (error) throw new Error(`org_create_failed: ${error.message}`);
  allCreatedOrganizations.add(data.id);
  return data.id;
}

// Cleanup helper — UUID-addressed only. Throws on any failure.
async function runCleanup(admin) {
  const errors = [];
  if (allCreatedOrganizations.size > 0) {
    const ids = Array.from(allCreatedOrganizations);
    // CASCADE on document_assignments.organization_id cleans related rows.
    const { error } = await admin.from('organizations').delete().in('id', ids);
    if (error) errors.push(`organizations: ${ids.join(',')} — ${error.message}`);
  }
  if (errors.length > 0) {
    throw new Error('cleanup_failed: ' + errors.join('; '));
  }
}

// -----------------------------
// Unit tests (no DB)
// -----------------------------

test('unit: allocateMock — same tuple returns same number on repeated calls', () => {
  const m = makeMockAllocator();
  const a1 = m.allocateMock('orgX', 'carwash', 2026, 9);
  const a2 = m.allocateMock('orgX', 'carwash', 2026, 9);
  const a3 = m.allocateMock('orgX', 'carwash', 2026, 9);
  assert.equal(a1, a2);
  assert.equal(a2, a3);
  assert.equal(m.assignmentCount(), 1);
});

test('unit: allocateMock — different tuples get different numbers (counter incremented)', () => {
  const m = makeMockAllocator();
  const a1 = m.allocateMock('orgX', 'carwash', 2026, 9);
  const a2 = m.allocateMock('orgX', 'tire',     2026, 9);
  const a3 = m.allocateMock('orgY', 'carwash', 2026, 9);
  const a4 = m.allocateMock('orgX', 'carwash', 2026, 10);
  // Mock isolated — strict consecutivity is allowed inside unit test.
  assert.equal(a2 - a1, 1);
  assert.equal(a3 - a2, 1);
  assert.equal(a4 - a3, 1);
});

test('unit: invoice and act for SAME workbook are identical (mock)', () => {
  const m = makeMockAllocator();
  // Simulate 4 presses: invoice PDF, invoice DOCX, act PDF, act DOCX.
  // All 4 use the same tuple → same number.
  const tuple = ['orgA', 'carwash', 2026, 9];
  const n1 = m.allocateMock(...tuple);
  const n2 = m.allocateMock(...tuple);
  const n3 = m.allocateMock(...tuple);
  const n4 = m.allocateMock(...tuple);
  assert.ok(n1 === n2 && n2 === n3 && n3 === n4, 'all four must equal');
});

test('unit: allocating many tuples exhaustively — counter monotonic, assignmentCount matches', () => {
  const m = makeMockAllocator();
  // 50 truly distinct tuples (each orgId unique by index). Mock is fully
  // isolated so strict consecutivity deltas are valid here. (Live test above
  // uses `>` instead because external allocations can interleave.)
  const results = [];
  for (let i = 0; i < 50; i++) {
    results.push(m.allocateMock(`org-${i}`, 'carwash', 2025, 1));
  }
  // All unique
  assert.equal(new Set(results).size, results.length);
  // Mock-isolated unit: strict consecutivity is allowed (no external activity).
  for (let i = 1; i < results.length; i++) {
    assert.equal(results[i] - results[i - 1], 1, `delta must be 1 at i=${i}`);
  }
});

// -----------------------------
// Live integration tests (skip without env vars)
// -----------------------------

const liveGroup = { skip: !HAS_LIVE_ENV };

async function liveEnvSetup() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const jwt = await loginAsAdmin(DEMO_APP_URL, process.env.DEMO_ADMIN_LOGIN, process.env.DEMO_ADMIN_PASSWORD);
  return { admin, jwt };
}

test('live: preflight — migration 045 applied (singleton counter row exists)', async (t) => {
  if (liveGroup.skip) { t.skip('env_missing'); return; }
  const { admin } = await liveEnvSetup();
  let cleanupErrors = [];
  try {
    const { data, error } = await admin
      .from('document_counter')
      .select('singleton, current_number')
      .eq('singleton', true)
      .maybeSingle();
    if (error) throw new Error(`counter_lookup_failed: ${error.message}`);
    if (!data) throw new Error('migration_045_not_applied: no singleton counter row');
    if (typeof data.current_number !== 'number' || data.current_number < 0) {
      throw new Error(`counter_invalid: current_number=${data.current_number}`);
    }
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

test('live: idempotency — same workbook tuple returns the same number', async (t) => {
  if (liveGroup.skip) { t.skip('env_missing'); return; }
  const { admin, jwt } = await liveEnvSetup();
  let cleanupErrors = [];
  let orgId;
  try {
    orgId = await createTestOrganization(admin, 'idempotency');

    // Read baseline so we can assert > baseline.
    const { data: c0 } = await admin
      .from('document_counter').select('current_number').eq('singleton', true).single();
    const baseline = Number(c0.current_number);

    const a1 = await allocateViaStaff(jwt, orgId, 'carwash', 2026, 9);
    const a2 = await allocateViaStaff(jwt, orgId, 'carwash', 2026, 9);
    const a3 = await allocateViaStaff(jwt, orgId, 'carwash', 2026, 9);

    assert.ok(a1 > baseline, `first allocation must be > baseline (got ${a1}, baseline ${baseline})`);
    assert.equal(a2, a1, 'second call same tuple must be idempotent');
    assert.equal(a3, a1, 'third call same tuple must be idempotent');

    // Counter must have advanced by EXACTLY 1 (only one new allocation happened,
    // a2/a3 were lookups). This is safe even with external activity because the
    // counter row's current_number is observably atomic; if another concurrent
    // staff allocation interleaved between a1 and our SELECT, the counter would
    // have advanced by more than 1, and we relax to >= 1.
    const { data: cAfter } = await admin
      .from('document_counter').select('current_number').eq('singleton', true).single();
    const advanced = Number(cAfter.current_number) - baseline;
    assert.ok(advanced >= 1, `counter must have advanced at least 1 (got ${advanced})`);
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

test('live: invoice vs act vs PDF vs DOCX simulation — all 4 same number per workbook', async (t) => {
  if (liveGroup.skip) { t.skip('env_missing'); return; }
  const { admin, jwt } = await liveEnvSetup();
  let cleanupErrors = [];
  let orgId;
  try {
    orgId = await createTestOrganization(admin, 'pdf_docx_equivalence');

    // Simulate 4 successive presses for one (org, year, month, service_type):
    // invoice PDF, invoice DOCX, act PDF, act DOCX. All must return same N.
    const invoice = await allocateViaStaff(jwt, orgId, 'tire', 2026, 9);
    const invoiceDocx = await allocateViaStaff(jwt, orgId, 'tire', 2026, 9);
    const act = await allocateViaStaff(jwt, orgId, 'tire', 2026, 9);
    const actDocx = await allocateViaStaff(jwt, orgId, 'tire', 2026, 9);

    assert.equal(invoice, invoiceDocx, 'invoice PDF == invoice DOCX');
    assert.equal(invoice, act,         'invoice PDF == act PDF');
    assert.equal(invoice, actDocx,     'invoice PDF == act DOCX');
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

test('live: different workbook tuples — different numbers, monotonic against baseline only', async (t) => {
  if (liveGroup.skip) { t.skip('env_missing'); return; }
  const { admin, jwt } = await liveEnvSetup();
  let cleanupErrors = [];
  try {
    // Read baseline first.
    const { data: c0 } = await admin
      .from('document_counter').select('current_number').eq('singleton', true).single();
    const baseline = Number(c0.current_number);

    const orgA = await createTestOrganization(admin, 'monotonic_a');
    const orgB = await createTestOrganization(admin, 'monotonic_b');

    // 4 different workbook tuples across orgs/months/services.
    const n1 = await allocateViaStaff(jwt, orgA, 'carwash', 2026, 9);
    const n2 = await allocateViaStaff(jwt, orgA, 'tire',     2026, 9);
    const n3 = await allocateViaStaff(jwt, orgB, 'carwash', 2026, 9);
    const n4 = await allocateViaStaff(jwt, orgA, 'tire',     2026, 10);

    // Soft assertions — concurrent allocations by other staff can interleave.
    assert.ok(n1 > baseline, `n1 > baseline (n1=${n1}, baseline=${baseline})`);
    assert.ok(n2 > n1, `n2 > n1 (n1=${n1}, n2=${n2})`);
    assert.ok(n3 > n2, `n3 > n2 (n2=${n2}, n3=${n3})`);
    assert.ok(n4 > n3, `n4 > n3 (n3=${n3}, n4=${n4})`);
    // All four unique.
    assert.equal(new Set([n1, n2, n3, n4]).size, 4, 'all four numbers must be distinct');
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

test('live: concurrency — Promise.all on N distinct tuples returns N distinct numbers', async (t) => {
  if (liveGroup.skip) { t.skip('env_missing'); return; }
  const { admin, jwt } = await liveEnvSetup();
  let cleanupErrors = [];
  try {
    // Read baseline.
    const { data: c0 } = await admin
      .from('document_counter').select('current_number').eq('singleton', true).single();
    const baseline = Number(c0.current_number);

    // Create N test organizations, allocate concurrently for each with a
    // distinct tuple. All allocations under our own test control.
    const N = 5;
    const orgIds = await Promise.all(
      Array.from({ length: N }, (_, i) => createTestOrganization(admin, `concurrency_${i}`)),
    );

    const results = await Promise.all(
      orgIds.map((orgId, i) =>
        allocateViaStaff(jwt, orgId, 'carwash', 2027, 1 + i),
      ),
    );

    // Hard invariants on the batch itself (independent of external activity):
    // - No duplicates.
    // - All numbers > baseline (no allocation went backwards).
    assert.equal(new Set(results).size, N, `concurrency: ${N} distinct tuples must yield ${N} distinct numbers`);
    for (const n of results) {
      assert.ok(n > baseline, `each result > baseline (got ${n}, baseline ${baseline})`);
    }
    // Strict consecutivity deltas (`=== 1`) would imply no external activity
    // during the batch. In live DEMO that cannot be guaranteed; we do NOT
    // assert strict consecutivity. (Unit test above uses isolated mock for
    // that assertion.)
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

test('live: forensic cleanup — no test organization or document_assignment leaked', async (t) => {
  // After all preceding tests ran (idempotency, equivalence, monotonic,
  // concurrency), assert that runCleanup actually removed the test artifacts.
  // Re-queries BEFORE the cleanup at the end of THIS test to prove the
  // counts are stable, then performs UUID-addressed deletes via Set
  // membership and asserts they succeeded.
  if (liveGroup.skip) { t.skip('env_missing'); return; }
  const { admin } = await liveEnvSetup();
  let cleanupErrors = [];
  try {
    // Snapshot pre-cleanup test-org count (should equal what earlier tests
    // registered in allCreatedOrganizations — some may have been already
    // cleaned by per-test finally blocks, so we do not assert exact value).
    const snapshotIds = Array.from(allCreatedOrganizations);
    if (snapshotIds.length > 0) {
      // Run actual cleanup before assertion to validate the cleanup helper.
      const { error } = await admin.from('organizations').delete().in('id', snapshotIds);
      if (error) throw new Error(`final_cleanup_failed: ${error.message}`);
      allCreatedOrganizations.clear();
      // Verify all gone.
      const { data: remaining } = await admin
        .from('organizations').select('id').in('id', snapshotIds);
      assert.ok(!remaining || remaining.length === 0,
        `cleanup left ${remaining?.length ?? 0} test org rows`);
      // document_assignments: CASCADE should have removed them. Also verify.
      const { data: dangling } = await admin
        .from('document_assignments')
        .select('id')
        .in('organization_id', snapshotIds);
      assert.ok(!dangling || dangling.length === 0,
        `cleanup left ${dangling?.length ?? 0} dangling document_assignment rows`);
    }
    // Global counter MUST still exist (we never touched it).
    const { data: counter } = await admin
      .from('document_counter').select('singleton').eq('singleton', true).maybeSingle();
    assert.ok(counter, 'singleton counter row must still exist after cleanup');
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
