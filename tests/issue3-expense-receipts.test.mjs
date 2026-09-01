// tests/issue3-expense-receipts.test.mjs
// Slice #3f / Issue 3 — contract + behavior tests.
//
// Two blocks:
//   A. EXECUTABLE: real imports of pure helpers from api/_lib/expense-receipts.mjs
//   B. WIRING/STRUCTURE: regex on api/staff.ts + migration source
//
// No network, no DB, no env. node:test runner only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  EXPENSE_CATEGORIES,
  CATEGORIES_REQUIRING_COMMENT,
  RECEIPT_MIME_ALLOWED,
  RECEIPT_MAX_BYTES,
  RECEIPT_BASE64_MAX_CHARS,
  isExpenseCategory,
  isReceiptPath,
  sanitizeReceiptName,
  generateReceiptPath,
} from '../api/_lib/expense-receipts.mjs';

// =====================================================================
// A. EXECUTABLE — pure helper behavior
// =====================================================================

test('EXPENSE_CATEGORIES: exactly 5 values, matching DB enum', () => {
  assert.deepEqual(
    [...EXPENSE_CATEGORIES].sort(),
    ['other', 'repair', 'stationery', 'tea_coffee', 'utilities'],
  );
});

test('isExpenseCategory: valid categories accepted', () => {
  for (const c of EXPENSE_CATEGORIES) {
    assert.equal(isExpenseCategory(c), true, `expected ${c} accepted`);
  }
});

test('isExpenseCategory: invalid values rejected', () => {
  for (const bad of ['food', 'FOOD', '', null, undefined, 42, {}, [], 'repair ']) {
    assert.equal(isExpenseCategory(bad), false, `expected ${JSON.stringify(bad)} rejected`);
  }
});

test('CATEGORIES_REQUIRING_COMMENT: matches DB CHECK (3 categories)', () => {
  assert.deepEqual([...CATEGORIES_REQUIRING_COMMENT].sort(), ['other', 'repair', 'utilities']);
});

test('RECEIPT_MIME_ALLOWED: 4 values, jpeg+png+pdf', () => {
  assert.deepEqual([...RECEIPT_MIME_ALLOWED].sort(), [
    'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
  ]);
});

test('RECEIPT_MAX_BYTES: 3MB cap (down from prod 5MB)', () => {
  assert.equal(RECEIPT_MAX_BYTES, 3 * 1024 * 1024);
});

test('isReceiptPath: valid <uuid>/<file> accepted', () => {
  assert.equal(isReceiptPath('c0000000-0000-0000-0000-000000000008/1700000000_check.jpg'), true);
  assert.equal(isReceiptPath('C0000000-0000-0000-0000-000000000008/foo.png'), true); // case insensitive on UUID
  assert.equal(isReceiptPath('c0000000-0000-0000-0000-000000000008/a-b_c.d.e'), true);
});

test('isReceiptPath: rejects path traversal', () => {
  assert.equal(isReceiptPath('../etc/passwd'), false);
  assert.equal(isReceiptPath('foo/../bar'), false);
  assert.equal(isReceiptPath('..'), false);
  assert.equal(isReceiptPath('foo/../../etc/passwd'), false);
  assert.equal(isReceiptPath('/etc/passwd'), false);
});

test('isReceiptPath: rejects path without uuid prefix', () => {
  assert.equal(isReceiptPath('notauuid/file.jpg'), false);
  assert.equal(isReceiptPath('justafile.jpg'), false);
  assert.equal(isReceiptPath('foo/bar'), false);
});

test('isReceiptPath: rejects path > 512 chars', () => {
  const longPrefix = 'c0000000-0000-0000-0000-000000000008/';
  const longName = 'a'.repeat(513 - longPrefix.length + 1);
  assert.equal(isReceiptPath(longPrefix + longName), false);
  // Exactly at limit
  const exactName = 'a'.repeat(512 - longPrefix.length);
  assert.equal(isReceiptPath(longPrefix + exactName), true);
});

test('isReceiptPath: rejects non-string / empty', () => {
  assert.equal(isReceiptPath(''), false);
  assert.equal(isReceiptPath(null), false);
  assert.equal(isReceiptPath(undefined), false);
  assert.equal(isReceiptPath(42), false);
  assert.equal(isReceiptPath({}), false);
  assert.equal(isReceiptPath([]), false);
});

test('sanitizeReceiptName: strips slashes (anti-traversal)', () => {
  // split on [/\\] then pop → keeps last path component, then sanitizes.
  // For web uploads files won't have slashes, but traffic can include them
  // (e.g., XSS payloads with </script>). The pop + sanitize is safe either way.
  assert.equal(sanitizeReceiptName('../../evil<script>.jpg'), 'evil_script_.jpg');
  assert.equal(sanitizeReceiptName('..\\..\\windows\\system32.dll'), 'system32.dll');
  assert.equal(sanitizeReceiptName('a/b/c/d.txt'), 'd.txt');
});

test('sanitizeReceiptName: strips angle brackets + special chars', () => {
  // <script>alert(1)</script>.jpg — split on '/' keeps 'script>.jpg' (after pop),
  // then sanitize collapses '>' → '_' → 'script_.jpg'.
  assert.equal(sanitizeReceiptName('<script>alert(1)</script>.jpg'), 'script_.jpg');
  assert.equal(sanitizeReceiptName('my check (1).pdf'), 'my_check_1_.pdf');
  assert.equal(sanitizeReceiptName('check#1$2%3.png'), 'check_1_2_3.png');
});

test('sanitizeReceiptName: collapses repeated underscores', () => {
  assert.equal(sanitizeReceiptName('foo___bar.jpg'), 'foo_bar.jpg');
  // After collapse `___test___.jpg` → `_test_.jpg` → trim leading `___`
  // → `test_.jpg` (the `_` between `test` and `.jpg` is preserved —
  // the dot+extension is not an underscore, so trailing trim doesn't eat it).
  assert.equal(sanitizeReceiptName('___test___.jpg'), 'test_.jpg');
});

test('sanitizeReceiptName: caps at 80 chars and falls back to "file"', () => {
  const longName = 'a'.repeat(200) + '.jpg';
  const out = sanitizeReceiptName(longName);
  assert.ok(out.length <= 80, `expected ≤80 chars, got ${out.length}`);
  assert.equal(sanitizeReceiptName(''), 'file');
  assert.equal(sanitizeReceiptName(null), 'file');
  assert.equal(sanitizeReceiptName(undefined), 'file');
  assert.equal(sanitizeReceiptName('___'), 'file');
});

test('sanitizeReceiptName: preserves word chars + dot + dash', () => {
  assert.equal(sanitizeReceiptName('check_2024-08-31.jpg'), 'check_2024-08-31.jpg');
  assert.equal(sanitizeReceiptName('a.b.c.d.e.png'), 'a.b.c.d.e.png');
});

test('generateReceiptPath: server-side, format <uuid>/<ts>_<safe>', () => {
  const path = generateReceiptPath('c0000000-0000-0000-0000-000000000008', 'check.jpg');
  assert.match(path, /^c0000000-0000-0000-0000-000000000008\/\d+_check\.jpg$/);
});

test('generateReceiptPath: sanitizes malicious filename', () => {
  const path = generateReceiptPath('c0000000-0000-0000-0000-000000000008', '../../etc/passwd');
  // Must NOT contain '..' or '/etc/'
  assert.ok(!path.includes('..'), `path contains ..: ${path}`);
  assert.ok(!path.includes('/etc/'), `path contains /etc/: ${path}`);
  // Format: <uuid>/<ts>_<basename>; basename may be extensionless.
  assert.match(path, /^c0000000-0000-0000-0000-000000000008\/\d+_.+$/);
});

test('generateReceiptPath: result is valid receipt path (isReceiptPath returns true)', () => {
  const path = generateReceiptPath('c0000000-0000-0000-0000-000000000008', 'check.pdf');
  assert.equal(isReceiptPath(path), true, `generated path fails isReceiptPath: ${path}`);
});

// =====================================================================
// B. WIRING — migration + api/staff.ts + lib/api/expenses.ts (regex)
// =====================================================================

const MIGRATION = 'migrations/037_expense_receipts_bucket_and_policies.sql';
const STAFF = 'api/staff.ts';
const EXPENSES_LIB = 'lib/api/expenses.ts';
const VALIDATION = 'api/_lib/validation.ts';
const HELPERS = 'api/_lib/expense-receipts.mjs';

const migExists = existsSync(MIGRATION);
const staffExists = existsSync(STAFF);
const expLibExists = existsSync(EXPENSES_LIB);
const validationExists = existsSync(VALIDATION);
const helpersExists = existsSync(HELPERS);

const mig = migExists ? readFileSync(MIGRATION, 'utf8') : '';
const staff = staffExists ? readFileSync(STAFF, 'utf8') : '';
const expLib = expLibExists ? readFileSync(EXPENSES_LIB, 'utf8') : '';
const validation = validationExists ? readFileSync(VALIDATION, 'utf8') : '';

test('migration file exists', () => {
  assert.equal(migExists, true, `${MIGRATION} not found`);
});

test('expense-receipts.mjs exists', () => {
  assert.equal(helpersExists, true, `${HELPERS} not found`);
});

test('validation.ts re-exports from expense-receipts.mjs', () => {
  assert.match(validation, /from\s+['"]\.\/expense-receipts\.mjs['"]/);
  assert.match(validation, /export const EXPENSE_CATEGORIES/);
  assert.match(validation, /export const CATEGORIES_REQUIRING_COMMENT/);
  assert.match(validation, /export const RECEIPT_MIME_ALLOWED/);
  assert.match(validation, /export const RECEIPT_MAX_BYTES/);
  assert.match(validation, /export const RECEIPT_BASE64_MAX_CHARS/);
  assert.match(validation, /export const isExpenseCategory/);
  assert.match(validation, /export const isReceiptPath/);
  assert.match(validation, /export const sanitizeReceiptName/);
  assert.match(validation, /export const generateReceiptPath/);
  assert.match(validation, /function readExpenseCategory/);
  assert.match(validation, /type ExpenseCategory/);
});

test('migration: creates bucket with correct config', () => {
  assert.match(mig, /INSERT INTO storage\.buckets/);
  assert.match(mig, /id\s*=\s*'expense-receipts'/);
  // public column is followed by false value (with intervening VALUES rows).
  assert.match(mig, /public[\s\S]{0,200}VALUES[\s\S]{0,400}false/);
  assert.match(mig, /5242880/);
  assert.match(mig, /image\/jpeg/);
  assert.match(mig, /image\/png/);
  assert.match(mig, /application\/pdf/);
});

test('migration: idempotent (ON CONFLICT, DROP IF EXISTS)', () => {
  assert.match(mig, /ON CONFLICT \(id\) DO NOTHING/);
  const drops = (mig.match(/DROP POLICY IF EXISTS/g) ?? []).length;
  const creates = (mig.match(/CREATE POLICY/g) ?? []).length;
  assert.equal(drops, creates);
});

test('migration: storage policies staff-only (app_role gate)', () => {
  assert.match(mig, /staff_select_receipts/);
  assert.match(mig, /staff_insert_receipts/);
  assert.match(mig, /staff_delete_receipts/);
  assert.match(mig, /app_role.*IN.*admin.*owner/s);
  assert.match(mig, /bucket_id\s*=\s*'expense-receipts'/);
});

test('migration: NO public/anon policies', () => {
  assert.doesNotMatch(mig, /FOR ALL TO public/i);
  assert.doesNotMatch(mig, /TO public/i);
});

test('migration: NO USING(true) WITH CHECK(true)', () => {
  assert.doesNotMatch(mig, /USING\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(mig, /WITH CHECK\s*\(\s*true\s*\)/i);
});

test('migration: NO UPDATE policy (delete+upload pattern)', () => {
  assert.doesNotMatch(mig, /FOR UPDATE/);
});

test('migration: does NOT touch expenses table RLS/grants', () => {
  assert.doesNotMatch(mig, /ON\s+public\.expenses/i);
  // Strip SQL comments before checking for REVOKE/GRANT statements.
  // The migration's header comment mentions migration 021 REVOKE; that's
  // descriptive prose, not a statement. Real GRANT/REVOKE statements
  // start at line beginning.
  const sqlOnly = mig.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(sqlOnly, /\n\s*REVOKE\s/i);
  assert.doesNotMatch(sqlOnly, /\n\s*GRANT\s/i);
});

test('api/staff: all 6 actions in ALLOWED_ACTIONS', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  for (const a of ['create-expense', 'update-expense', 'delete-expense',
                   'upload-receipt', 'get-receipt-url', 'delete-receipt']) {
    assert.match(staff, new RegExp(`['"]${a}['"]`), `action ${a} missing from ALLOWED_ACTIONS`);
  }
  // delete-orphan-receipt is INTENTIONALLY NOT in ALLOWED_ACTIONS —
  // it was removed because its ownership check was insufficient.
  assert.doesNotMatch(staff, /['"]delete-orphan-receipt['"]/);
});

test('api/staff: switch routes all 6 actions to handlers', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  for (const a of ['create-expense', 'update-expense', 'delete-expense',
                   'upload-receipt', 'get-receipt-url', 'delete-receipt']) {
    const re = new RegExp(`case ['"]${a}['"]\\s*:\\s*result = await \\w+Action\\(guard\\.claims, body\\); break;`);
    assert.match(staff, re, `case ${a} missing from switch`);
  }
  assert.doesNotMatch(staff, /case ['"]delete-orphan-receipt['"]/);
});

test('api/staff: 6 handlers defined as async functions', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  for (const fn of ['createExpenseAction', 'updateExpenseAction', 'deleteExpenseAction',
                    'uploadReceiptAction', 'getReceiptUrlAction', 'deleteReceiptAction']) {
    assert.match(staff, new RegExp(`async function ${fn}\\(`));
  }
  // deleteOrphanReceiptAction must NOT exist (removed in this slice).
  assert.doesNotMatch(staff, /async function deleteOrphanReceiptAction\(/);
});

test('api/staff: handlers take (claims: StaffClaims, body: AnyObj)', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  for (const fn of ['createExpenseAction', 'updateExpenseAction', 'deleteExpenseAction',
                    'uploadReceiptAction', 'getReceiptUrlAction', 'deleteReceiptAction']) {
    const re = new RegExp(`async function ${fn}\\([^)]*StaffClaims[^)]*AnyObj`);
    assert.match(staff, re, `handler ${fn} signature mismatch`);
  }
});

test('api/staff: write actions use supabaseAdmin, not browser supabase', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  assert.match(staff, /createClient\([^)]*SUPABASE_SERVICE_ROLE_KEY/s);
  const expAdmin = (staff.match(/supabaseAdmin\s*\.\s*from\(['"]expenses['"]/g) ?? []).length;
  assert.ok(expAdmin >= 4, `expected ≥4 supabaseAdmin.from('expenses') calls, got ${expAdmin}`);
});

test('api/staff: storage uses supabaseAdmin.storage', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  // bucket is referenced as a constant RECEIPT_BUCKET in handlers; allow
  // either the constant or the literal string 'expense-receipts'.
  const m = /supabaseAdmin\s*\.\s*storage\s*\.\s*from\(\s*(?:RECEIPT_BUCKET|['"]expense-receipts['"])\s*\)/.test(staff);
  assert.equal(m, true, 'supabaseAdmin.storage.from(bucket) not found');
});

test('api/staff: signed URL TTL = 3600', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  // Allow either literal 3600 or the constant RECEIPT_SIGNED_TTL_SECONDS.
  const m = /createSignedUrl\([^)]+,\s*(?:RECEIPT_SIGNED_TTL_SECONDS|3600)\b/.test(staff);
  assert.equal(m, true, 'createSignedUrl(..., 3600) not found');
});

test('api/staff: get-receipt-url takes expense_id (not raw path)', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function getReceiptUrlAction[\s\S]*?^}/m);
  assert.ok(fn, 'getReceiptUrlAction not found');
  // Must read expense_id and select from expenses
  assert.match(fn[0], /readUuidRequired\(body,\s*['"]expense_id['"]\)/);
  assert.match(fn[0], /from\(['"]expenses['"]\)[\s\S]*?select\([^)]*receipt_url/s);
  // Must return 404 if expense not found
  assert.match(fn[0], /expense_not_found/);
  // Must return 400 if receipt_url is null
  assert.match(fn[0], /receipt_not_found/);
  // Must validate path via isReceiptPath before use
  assert.match(fn[0], /isReceiptPath\(receiptUrl\)/);
});

test('api/staff: get-receipt-url does NOT accept client-supplied path', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function getReceiptUrlAction[\s\S]*?^}/m);
  assert.ok(fn);
  // Body field name 'path' must NOT appear (must be expense_id instead)
  assert.doesNotMatch(fn[0], /body\.path|body\['path'\]|readString\(body,\s*['"]path['"]/);
});

test('api/staff: delete-receipt takes expense_id (not raw path)', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function deleteReceiptAction[\s\S]*?^}/m);
  assert.ok(fn, 'deleteReceiptAction not found');
  assert.match(fn[0], /readUuidRequired\(body,\s*['"]expense_id['"]\)/);
  assert.match(fn[0], /from\(['"]expenses['"]\)[\s\S]*?select\([^)]*receipt_url/s);
  assert.match(fn[0], /expense_not_found/);
  assert.match(fn[0], /receipt_not_found/);
  assert.match(fn[0], /isReceiptPath\(receiptUrl\)/);
});

test('api/staff: delete-receipt clears receipt_url on DB after successful storage remove', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function deleteReceiptAction[\s\S]*?^}/m);
  assert.ok(fn);
  // After storage.remove, must clear receipt_url in DB.
  assert.match(fn[0], /\.update\(\s*\{[^}]*receipt_url:\s*null[^}]*updated_by:\s*claims\.profile_id/s);
  // Distinct error code for DB update failure after successful storage remove.
  assert.match(fn[0], /receipt_detached_failed/);
});

test('api/staff: create-expense requires receipt_url to start with claims.profile_id/', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function createExpenseAction[\s\S]*?^}/m);
  assert.ok(fn);
  assert.match(fn[0], /p\.startsWith\(`\$\{claims\.profile_id\}\/`\)/);
  assert.match(fn[0], /receipt_url_not_owned/);
});

test('api/staff: update-expense requires receipt_url to start with claims.profile_id/', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function updateExpenseAction[\s\S]*?^}/m);
  assert.ok(fn);
  assert.match(fn[0], /p\.startsWith\(`\$\{claims\.profile_id\}\/`\)/);
  assert.match(fn[0], /receipt_url_not_owned/);
});

test('api/staff: NO delete-orphan-receipt action exists (Option B)', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  // The handler was removed because its ownership check was insufficient
  // (currentUrl !== expected_old_path does not prove expected_old_path
  // was ever attached to this expense). Option B: leave old object
  // orphaned in storage; safe cleanup requires attachment history model.
  assert.doesNotMatch(staff, /async function deleteOrphanReceiptAction/);
  assert.doesNotMatch(staff, /case ['"]delete-orphan-receipt['"]/);
  assert.doesNotMatch(staff, /expected_old_path/);
});

test('api/staff: delete-expense cleans up receipt (best-effort)', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function deleteExpenseAction[\s\S]*?^}/m);
  assert.ok(fn, 'deleteExpenseAction not found');
  const body = fn[0];
  assert.match(body, /select\([^)]*receipt_url/s, 'must SELECT receipt_url');
  assert.match(body, /supabaseAdmin\.storage[\s\S]*?\.remove\(\[receiptUrl\]\)/, 'must remove receipt object');
  assert.match(body, /\.from\(['"]expenses['"]\)\s*\.delete\(/, 'must delete DB row');
  assert.match(body, /receipt_deleted/, 'must return receipt_deleted flag');
  assert.match(body, /console\.warn/);
});

test('api/staff: delete-receipt action still exists for "delete receipt only" flow', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  assert.match(staff, /async function deleteReceiptAction\(/);
  assert.match(staff, /case 'delete-receipt':[\s\S]*?deleteReceiptAction/);
});

test('api/staff: path generation never trusts client', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const up = staff.match(/async function uploadReceiptAction[\s\S]*?^}/m);
  assert.ok(up);
  // Upload uses server-generated path from claims.profile_id
  assert.match(up[0], /generateReceiptPath\(claims\.profile_id/);
  // get/delete-receipt do NOT accept client path; they validate DB-stored receiptUrl
  // (which itself was server-generated at upload time). The handlers use
  // isReceiptPath(receiptUrl) as a corruption guard.
  assert.match(staff, /isReceiptPath\(receiptUrl\)/g);
});

test('api/staff: comment_required validation mirrors DB CHECK', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const ce = staff.match(/async function createExpenseAction[\s\S]*?^}/m);
  assert.ok(ce);
  assert.match(ce[0], /CATEGORIES_REQUIRING_COMMENT/);
  assert.match(ce[0], /comment_required/);
});

test('api/staff: 23514 check_violation surfaced as 400 (DB CHECK)', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  assert.match(staff, /error\.code\s*===\s*['"]23514['"]/);
});

test('api/staff: NO console.log, NO secrets in source', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  assert.doesNotMatch(staff, /console\.log/);
  assert.match(staff, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});

test('api/staff: NO direct anon/bucket-wide policies referenced', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  assert.doesNotMatch(staff, /FOR ALL TO public/);
});

test('lib/api/expenses: NO browser-direct writes to expenses', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  assert.doesNotMatch(expLib, /from\(['"]expenses['"]\)\s*\.\s*insert/);
  assert.doesNotMatch(expLib, /from\(['"]expenses['"]\)\s*\.\s*update/);
  assert.doesNotMatch(expLib, /from\(['"]expenses['"]\)\s*\.\s*delete/);
});

test('lib/api/expenses: NO browser-direct storage calls', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  // Strip JS/TS comments before checking (file may document the absence).
  const codeOnly = expLib
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))           // strip // comments
    .map(l => l.replace(/\/\*[\s\S]*?\*\//g, '')) // strip /* */ comments
    .join('\n');
  assert.doesNotMatch(codeOnly, /supabase\.storage/);
  assert.doesNotMatch(codeOnly, /\.storage\.from/);
});

test('lib/api/expenses: createExpense dispatches create-expense', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  assert.match(expLib, /dispatchStaff.*['"]create-expense['"]/);
});
test('lib/api/expenses: updateExpense dispatches update-expense', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  assert.match(expLib, /dispatchStaff.*['"]update-expense['"]/);
});
test('lib/api/expenses: deleteExpense dispatches delete-expense', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  assert.match(expLib, /dispatchStaff.*['"]delete-expense['"]/);
});
test('lib/api/expenses: uploadReceipt dispatches upload-receipt with base64', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  assert.match(expLib, /dispatchStaff.*['"]upload-receipt['"]/);
  assert.match(expLib, /readAsDataURL/);
  assert.match(expLib, /base64/);
});
test('lib/api/expenses: getReceiptUrl dispatches get-receipt-url with expense_id', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  assert.match(expLib, /dispatchStaff.*['"]get-receipt-url['"][\s\S]{0,200}expense_id/);
  // MUST NOT dispatch with raw 'path' field
  assert.doesNotMatch(expLib, /dispatchStaff[^)]*get-receipt-url[\s\S]{0,200}\bpath:\s*[^e]/);
});
test('lib/api/expenses: deleteReceipt dispatches delete-receipt with expense_id', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  assert.match(expLib, /dispatchStaff.*['"]delete-receipt['"][\s\S]{0,200}expense_id/);
  assert.doesNotMatch(expLib, /dispatchStaff[^)]*delete-receipt[\s\S]{0,200}\bpath:\s*[^e]/);
});

test('lib/api/expenses: NO deleteOrphanReceipt export (Option B)', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  assert.doesNotMatch(expLib, /export async function deleteOrphanReceipt/);
  assert.doesNotMatch(expLib, /['"]delete-orphan-receipt['"]/);
});

test('lib/api/expenses: public signatures preserved for SummaryPage.tsx', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  for (const fn of ['createExpense', 'updateExpense', 'deleteExpense',
                    'uploadReceipt', 'getReceiptUrl', 'deleteReceipt']) {
    assert.match(expLib, new RegExp(`export async function ${fn}\\(`));
  }
});

test('lib/api/expenses: no service_role / JWT secret references', () => {
  if (!expLib) { assert.fail('lib/api/expenses.ts not present'); return; }
  assert.doesNotMatch(expLib, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(expLib, /SUPABASE_JWT_SECRET/);
  assert.doesNotMatch(expLib, /process\.env\.SUPABASE_(SERVICE|JWT)/);
});

// =====================================================================
// C. SummaryPage contract — must pass expense.id, not raw receipt path
// =====================================================================

const SUMMARY_PAGE = 'components/admin/SummaryPage.tsx';
const summaryExists = existsSync(SUMMARY_PAGE);
const summary = summaryExists ? readFileSync(SUMMARY_PAGE, 'utf8') : '';

test('SummaryPage: passes expense.id to getReceiptUrl', () => {
  if (!summaryExists) { assert.fail(`${SUMMARY_PAGE} not present`); return; }
  // getReceiptUrl(expense.id) — for view-receipt action
  assert.match(summary, /getReceiptUrl\(\s*expense\.id\s*\)/);
  // Option B: NO deleteOrphanReceipt in SummaryPage
  assert.doesNotMatch(summary, /deleteOrphanReceipt/);
});

test('SummaryPage: does NOT call getReceiptUrl/deleteReceipt with raw receipt_url', () => {
  if (!summaryExists) { assert.fail(`${SUMMARY_PAGE} not present`); return; }
  // Old pattern was getReceiptUrl(expense.receipt_url) / deleteReceipt(expense.receipt_url)
  assert.doesNotMatch(summary, /getReceiptUrl\(\s*expense\.receipt_url\s*\)/);
  assert.doesNotMatch(summary, /deleteReceipt\(\s*expense\.receipt_url\s*\)/);
});

// Safe replace-flow tests (Option B: NO cleanup of old object)

test('SummaryPage: replace-flow uses uploadReceipt BEFORE updateExpense', () => {
  if (!summaryExists) { assert.fail(`${SUMMARY_PAGE} not present`); return; }
  // In handleSaveInlineEdit, the order must be:
  //   1. uploadReceipt(...)
  //   2. updateExpense(..., { receipt_url: newPath }, ...)
  // NO step 3 (no storage delete of old path).
  const block = summary.match(/handleSaveInlineEdit[\s\S]*?setInlineEditingExpense\(null\);/);
  assert.ok(block, 'handleSaveInlineEdit block not found');
  const idxUpload = block[0].search(/uploadReceipt\(/);
  const idxUpdate = block[0].search(/updateExpense\(/);
  assert.ok(idxUpload > 0, 'uploadReceipt not found in inline-edit block');
  assert.ok(idxUpdate > 0, 'updateExpense not found in inline-edit block');
  assert.ok(idxUpload < idxUpdate, 'upload must happen BEFORE update');
});

test('SummaryPage: replace-flow does NOT delete old receipt from storage', () => {
  if (!summaryExists) { assert.fail(`${SUMMARY_PAGE} not present`); return; }
  // In handleSaveInlineEdit: no deleteOrphanReceipt, no storage.remove, no
  // call that would remove the old path. Old object becomes orphan.
  const block = summary.match(/handleSaveInlineEdit[\s\S]*?setInlineEditingExpense\(null\);/);
  assert.ok(block);
  assert.doesNotMatch(block[0], /deleteOrphanReceipt/);
  assert.doesNotMatch(block[0], /\.storage\.(from|remove)/);
  assert.doesNotMatch(block[0], /deleteReceipt\(expenseId/);
  // Must contain explanatory comment
  assert.match(block[0], /Old receipt is intentionally retained/);
});

test('SummaryPage: handleDeleteExpense does NOT call deleteReceipt separately (delete-expense handles it)', () => {
  if (!summaryExists) { assert.fail(`${SUMMARY_PAGE} not present`); return; }
  const block = summary.match(/handleDeleteExpense\s*=[\s\S]*?\n\s*\};/);
  assert.ok(block, 'handleDeleteExpense block not found');
  assert.doesNotMatch(block[0], /deleteReceipt\(/);
  // Only deleteExpense is called.
  assert.match(block[0], /deleteExpense\(expenseId\)/);
});
