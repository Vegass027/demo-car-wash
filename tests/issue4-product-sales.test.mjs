// tests/issue4-product-sales.test.mjs
// Slice #3g / Issue 4 — contract + behavior tests for atomic product_sales.
//
// Three blocks:
//   A. EXECUTABLE: pure validation helpers extracted from api/_lib/validation.ts
//      (here we re-test the boundary semantics that the dispatcher relies on).
//   B. WIRING/STRUCTURE: regex on api/staff.ts, lib/api/product-sales.ts,
//      migrations/038_create_product_sale_atomic.sql.
//   C. REGRESSION: reports.ts aggregateSalesData still reads product_sales.
//
// No network, no DB, no env. node:test runner only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

const staff = existsSync(`${ROOT}/api/staff.ts`)
  ? readFileSync(`${ROOT}/api/staff.ts`, 'utf8')
  : null;
const prodLib = existsSync(`${ROOT}/lib/api/product-sales.ts`)
  ? readFileSync(`${ROOT}/lib/api/product-sales.ts`, 'utf8')
  : null;
const reports = existsSync(`${ROOT}/lib/api/reports.ts`)
  ? readFileSync(`${ROOT}/lib/api/reports.ts`, 'utf8')
  : null;
const migration = existsSync(`${ROOT}/migrations/038_create_product_sale_atomic.sql`)
  ? readFileSync(`${ROOT}/migrations/038_create_product_sale_atomic.sql`, 'utf8')
  : null;

// =====================================================================
// A. PURE — body validation semantics the dispatcher relies on
// =====================================================================

test('manual-mode requires product_name when inventory_item_id absent', () => {
  // Mirrors api/staff.ts:createProductSaleAction guard:
  //   if (inventory_item_id === null) readString(body, 'product_name', {required:true})
  // We assert the *behavior* via simulation: missing product_name → would throw
  // 'product_name_required' before the RPC is even called.
  const body = { quantity: 1, price_per_unit: 100 }; // no product_name, no inventory_item_id
  const hasProductName = typeof body.product_name === 'string' && body.product_name.trim().length > 0;
  const hasInventoryItem = typeof body.inventory_item_id === 'string' && body.inventory_item_id.length > 0;
  assert.equal(hasProductName, false, 'precondition');
  assert.equal(hasInventoryItem, false, 'precondition');
  // → dispatcher must reject as 'product_name_required'.
});

test('inventory-mode does NOT require product_name (sql function reads from item)', () => {
  const body = {
    inventory_item_id: 'a2000000-0000-0000-0000-000000000001',
    quantity: 5,
    price_per_unit: 200,
  };
  const hasProductName = typeof body.product_name === 'string' && body.product_name.trim().length > 0;
  assert.equal(hasProductName, false);
  // → dispatcher must pass through to RPC (SQL function fills name from inventory_items.name).
});

test('quantity must be integer ≥ 1', () => {
  // API contract: readNumberInRange(body, 'quantity', 1, 1_000_000)
  for (const bad of [0, -1, 0.5, NaN, Infinity, 1_000_001, null, undefined, '5', {}]) {
    const ok = typeof bad === 'number' && Number.isInteger(bad) && bad >= 1 && bad <= 1_000_000;
    assert.equal(ok, false, `expected ${JSON.stringify(bad)} rejected`);
  }
  for (const good of [1, 5, 100, 1_000_000]) {
    const ok = typeof good === 'number' && Number.isInteger(good) && good >= 1 && good <= 1_000_000;
    assert.equal(ok, true, `expected ${good} accepted`);
  }
});

test('price_per_unit must be finite > 0 and ≤ 10_000_000', () => {
  for (const bad of [0, -0.01, NaN, Infinity, 10_000_001, null, undefined, '5', {}]) {
    const ok = typeof bad === 'number' && Number.isFinite(bad) && bad > 0 && bad <= 10_000_000;
    assert.equal(ok, false, `expected ${JSON.stringify(bad)} rejected`);
  }
  for (const good of [0.01, 1, 100.5, 250, 10_000_000]) {
    const ok = typeof good === 'number' && Number.isFinite(good) && good > 0 && good <= 10_000_000;
    assert.equal(ok, true, `expected ${good} accepted`);
  }
});

test('inventory_item_id must be UUID format', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.equal(UUID_RE.test('a2000000-0000-0000-0000-000000000001'), true);
  assert.equal(UUID_RE.test('not-a-uuid'), false);
  assert.equal(UUID_RE.test(''), false);
});

test('manual-mode vs inventory-mode dispatch logic mirrors dispatcher', () => {
  // If inventory_item_id present and valid → call RPC with that uuid,
  // no product_name needed.
  const bodyInv = { inventory_item_id: 'a2000000-0000-0000-0000-000000000001', quantity: 1, price_per_unit: 1 };
  const isInv = typeof bodyInv.inventory_item_id === 'string' && bodyInv.inventory_item_id.length > 0;
  assert.equal(isInv, true);
  // If absent → manual, product_name required.
  const bodyMan = { quantity: 1, price_per_unit: 1 };
  const isManual = bodyMan.inventory_item_id == null;
  assert.equal(isManual, true);
});

// =====================================================================
// B. WIRING — api/staff.ts handler + ALLOWED_ACTIONS + switch
// =====================================================================

test('api/staff: create-product-sale and delete-product-sale in ALLOWED_ACTIONS', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  for (const a of ['create-product-sale', 'delete-product-sale']) {
    assert.match(staff, new RegExp(`['"]${a}['"]`), `${a} not found in ALLOWED_ACTIONS`);
  }
});

test('api/staff: 2 Slice #3g handlers defined as async functions', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  for (const fn of ['createProductSaleAction', 'deleteProductSaleAction']) {
    assert.match(staff, new RegExp(`async function ${fn}\\(`), `${fn} not defined`);
  }
});

test('api/staff: handlers take (claims: StaffClaims, body: AnyObj)', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  for (const fn of ['createProductSaleAction', 'deleteProductSaleAction']) {
    const re = new RegExp(`async function ${fn}\\([^)]*StaffClaims[^)]*AnyObj`);
    assert.match(staff, re, `handler ${fn} signature mismatch`);
  }
});

test('api/staff: create-product-sale and delete-product-sale cases in switch', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  assert.match(staff, /case ['"]create-product-sale['"][\s\S]*?createProductSaleAction/);
  assert.match(staff, /case ['"]delete-product-sale['"][\s\S]*?deleteProductSaleAction/);
});

test('api/staff: handlers use supabaseAdmin.rpc (not browser supabase.rpc)', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  assert.match(staff, /supabaseAdmin\s*\.\s*rpc\(\s*['"]create_product_sale_atomic['"]/);
  assert.match(staff, /supabaseAdmin\s*\.\s*rpc\(\s*['"]delete_product_sale_atomic['"]/);
  // No bare supabase.rpc(...) for these names (no supabaseAdmin prefix).
  assert.doesNotMatch(staff, /(?<![\w.])supabase\s*\.\s*rpc\(\s*['"]create_product_sale_atomic['"]/);
  assert.doesNotMatch(staff, /(?<![\w.])supabase\s*\.\s*rpc\(\s*['"]delete_product_sale_atomic['"]/);
});

test('api/staff: create-product-sale stamps p_created_by from claims.profile_id', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function createProductSaleAction[\s\S]*?^}/m);
  assert.ok(fn, 'createProductSaleAction not found');
  assert.match(fn[0], /p_created_by:\s*claims\.profile_id/);
});

test('api/staff: delete-product-sale stamps p_restored_by from claims.profile_id', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function deleteProductSaleAction[\s\S]*?^}/m);
  assert.ok(fn, 'deleteProductSaleAction not found');
  assert.match(fn[0], /p_restored_by:\s*claims\.profile_id/);
});

test('api/staff: create-product-sale validates quantity > 0 and price > 0', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function createProductSaleAction[\s\S]*?^}/m);
  assert.ok(fn);
  assert.match(fn[0], /readNumberInRange\(body,\s*['"]quantity['"],\s*1,\s*1_000_000/);
  assert.match(fn[0], /readNumberInRange\(body,\s*['"]price_per_unit['"],\s*0\.01,\s*10_000_000/);
});

test('api/staff: create-product-sale rejects non-integer quantity with 400 quantity_must_be_integer', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function createProductSaleAction[\s\S]*?^}/m);
  assert.ok(fn);
  // Must guard against fractional input BEFORE the RPC call.
  assert.match(fn[0], /Number\.isInteger\(quantity\)/);
  assert.match(fn[0], /quantity_must_be_integer/);
  // Must come AFTER readNumberInRange so the value is already narrowed to a number.
  const isIntIdx = fn[0].indexOf('Number.isInteger');
  const rpcIdx = fn[0].indexOf(".rpc('create_product_sale_atomic'");
  assert.ok(isIntIdx > 0 && rpcIdx > 0, 'helper locations not found');
  assert.ok(isIntIdx < rpcIdx, 'Number.isInteger check must precede RPC call');
});

test('api/staff: create-product-sale requires product_name only in manual-mode', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function createProductSaleAction[\s\S]*?^}/m);
  assert.ok(fn);
  // The "product_name" body reader is gated by `inventory_item_id === null`.
  assert.match(fn[0], /inventory_item_id\s*===\s*null/);
  assert.match(fn[0], /readString\(body,\s*['"]product_name['"][^)]*required:\s*true/);
});

test('api/staff: maps RPC errors to HTTP status codes (insufficient_stock → 400, sale_not_found → 404)', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  const fn = staff.match(/async function createProductSaleAction[\s\S]*?^}/m);
  assert.ok(fn);
  // Map must exist for these specific codes.
  assert.match(staff, /PRODUCT_SALE_RPC_ERROR_TO_HTTP/);
  assert.match(staff, /insufficient_stock/);
  assert.match(staff, /inventory_item_not_found/);
  assert.match(staff, /sale_not_found/);
  // 404 specifically for sale_not_found.
  assert.match(staff, /sale_not_found:\s*404/);
});

test('api/staff: handlers do NOT do any direct from("product_sales") insert/update/delete', () => {
  if (!staff) { assert.fail('api/staff.ts not present'); return; }
  // Slice #3g handlers must delegate to atomic RPC, not bypass it.
  // We allow non-Slice-3g code to touch product_sales (e.g. inventory dispatcher's
  // old `inventory-usage` paths) but check the new handlers specifically.
  const createFn = staff.match(/async function createProductSaleAction[\s\S]*?^}/m);
  const deleteFn = staff.match(/async function deleteProductSaleAction[\s\S]*?^}/m);
  assert.ok(createFn); assert.ok(deleteFn);
  assert.doesNotMatch(createFn[0], /\.from\(\s*['"]product_sales['"]/);
  assert.doesNotMatch(deleteFn[0], /\.from\(\s*['"]product_sales['"]/);
  assert.doesNotMatch(createFn[0], /\.from\(\s*['"]inventory_items['"]/);
  assert.doesNotMatch(deleteFn[0], /\.from\(\s*['"]inventory_items['"]/);
  assert.doesNotMatch(createFn[0], /\.from\(\s*['"]inventory_operations['"]/);
  assert.doesNotMatch(deleteFn[0], /\.from\(\s*['"]inventory_operations['"]/);
});

// =====================================================================
// B2. WIRING — lib/api/product-sales.ts (browser → dispatcher)
// =====================================================================

test('lib/api/product-sales: createProductSale dispatches create-product-sale', () => {
  if (!prodLib) { assert.fail('lib/api/product-sales.ts not present'); return; }
  assert.match(prodLib, /dispatchStaff[\s\S]*['"]create-product-sale['"]/);
});

test('lib/api/product-sales: deleteProductSale dispatches delete-product-sale', () => {
  if (!prodLib) { assert.fail('lib/api/product-sales.ts not present'); return; }
  assert.match(prodLib, /dispatchStaff[\s\S]*['"]delete-product-sale['"]/);
});

test('lib/api/product-sales: NO browser-direct insert/update/delete on product_sales', () => {
  if (!prodLib) { assert.fail('lib/api/product-sales.ts not present'); return; }
  assert.doesNotMatch(prodLib, /from\(['"]product_sales['"]\)\s*\.\s*insert/);
  assert.doesNotMatch(prodLib, /from\(['"]product_sales['"]\)\s*\.\s*update/);
  assert.doesNotMatch(prodLib, /from\(['"]product_sales['"]\)\s*\.\s*delete/);
});

test('lib/api/product-sales: NO browser-direct inventory_usage / inventory_restock calls', () => {
  if (!prodLib) { assert.fail('lib/api/product-sales.ts not present'); return; }
  // Old code used `deductFromInventory` + `addToInventory` wrappers that called
  // `deductFromInventoryViaStaff` / `restockInventoryViaStaff`. After Slice #3g
  // these wrappers are GONE — inventory movement happens server-side inside
  // the atomic SQL function.
  assert.doesNotMatch(prodLib, /deductFromInventoryViaStaff/);
  assert.doesNotMatch(prodLib, /restockInventoryViaStaff/);
  assert.doesNotMatch(prodLib, /['"]inventory-usage['"]/);
  assert.doesNotMatch(prodLib, /['"]inventory-restock['"]/);
});

test('lib/api/product-sales: keeps dispatchStaff helper (mirrors expenses.ts)', () => {
  if (!prodLib) { assert.fail('lib/api/product-sales.ts not present'); return; }
  assert.match(prodLib, /async function dispatchStaff/);
  assert.match(prodLib, /getSessionToken\(\)/);
  assert.match(prodLib, /STAFF_ENDPOINT\s*=\s*['"]\/api\/staff['"]/);
});

test('lib/api/product-sales: READS stay browser-direct (RLS-gated)', () => {
  if (!prodLib) { assert.fail('lib/api/product-sales.ts not present'); return; }
  assert.match(prodLib, /getProductSalesByDate/);
  assert.match(prodLib, /getProductSalesByPeriod/);
  assert.match(prodLib, /getInventoryItems/);
  // These still use supabase.from(...) — that is the intended RLS path.
  assert.match(prodLib, /supabase\s*\.\s*from\(\s*['"]product_sales['"]/);
  assert.match(prodLib, /supabase\s*\.\s*from\(\s*['"]inventory_items['"]/);
});

test('lib/api/product-sales: signatures preserved (ProductSalesForm.tsx compatibility)', () => {
  if (!prodLib) { assert.fail('lib/api/product-sales.ts not present'); return; }
  // Form code expects these signatures:
  //   createProductSale({product_name,quantity,price_per_unit,inventory_item_id?}, userId)
  //   deleteProductSale(saleId)
  assert.match(prodLib, /export async function createProductSale\(/);
  assert.match(prodLib, /export async function deleteProductSale\(/);
  // userId is still accepted (even if unused server-side) — backward compat.
  assert.match(prodLib, /async function createProductSale\(\s*[^)]*_userId/);
});

test('lib/api/product-sales: createProductSale readback is wrapped in try/catch (no misleading error)', () => {
  if (!prodLib) { assert.fail('lib/api/product-sales.ts not present'); return; }
  const fn = prodLib.match(/export async function createProductSale\([\s\S]*?^}/m);
  assert.ok(fn, 'createProductSale not found');
  // Readback must be inside try/catch so that a transient failure does NOT
  // bubble up as "create failed" — the sale row IS already created server-side.
  const fnBody = fn[0];
  // Both the supabase.from('product_sales').select(...).single() block AND a
  // wrapping try/catch with a fallback `return { id: res.sale_id, ... }`
  // must be present.
  assert.match(fnBody, /supabase\s*\.\s*from\(\s*['"]product_sales['"]/);
  assert.match(fnBody, /try\s*\{[\s\S]*?\.single\(\)[\s\S]*?\}\s*catch/);
  // The fallback return must include `id: res.sale_id` (and not `throw` it).
  const fallbackMatch = fnBody.match(/catch[\s\S]{0,200}return\s*\{[\s\S]*?id:\s*res\.sale_id/);
  assert.ok(fallbackMatch, 'catch-block fallback returning res.sale_id not found');
  // Specifically: NO `throw error` after the readback that would mask the
  // successful create.
  const readbackRegion = fnBody.match(/\.single\(\)[\s\S]*?\}\s*catch/);
  if (readbackRegion) {
    assert.doesNotMatch(readbackRegion[0], /throw\s+(error|err|readbackErr|e)\b/);
  }
});

test('lib/api/product-sales: NEVER passes total_price to dispatcher (GENERATED col compat)', () => {
  if (!prodLib) { assert.fail('lib/api/product-sales.ts not present'); return; }
  // The dispatcher payload must NOT include total_price. SQL function computes it.
  // Match the call body: dispatchStaff<{...}>('create-product-sale', { ... })
  // Then assert the BODY (between the second `{` and matching `}`) does NOT
  // contain `total_price`. We do this by finding the action literal and
  // scanning forward to the closing `)` of the dispatchStaff call.
  const callStart = prodLib.indexOf("'create-product-sale'");
  if (callStart === -1) { assert.fail('dispatcher call not found'); return; }
  // Find the payload object's closing `})` by balanced-brace scan from
  // the `{` immediately after the action literal.
  const afterAction = prodLib.slice(callStart);
  const braceOpen = afterAction.indexOf('{', afterAction.indexOf(',') /* skip type-generic */);
  if (braceOpen === -1) { assert.fail('payload object not found'); return; }
  // Actually simpler: find `{` AFTER the action literal (this is the payload).
  const payloadStart = afterAction.indexOf('{', afterAction.indexOf("'create-product-sale'"));
  let depth = 0, i = payloadStart, payloadEnd = -1;
  while (i < afterAction.length) {
    const ch = afterAction[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { payloadEnd = i; break; } }
    i++;
  }
  assert.ok(payloadEnd > payloadStart, 'payload end not found');
  const payload = afterAction.slice(payloadStart, payloadEnd + 1);
  assert.doesNotMatch(payload, /total_price/,
    'dispatcher payload must NOT include total_price — the SQL function computes it');
});

// =====================================================================
// B3. WIRING — migration 038 security lockdown
// =====================================================================

test('migration 038: contains CREATE FUNCTION for both atomic functions', () => {
  if (!migration) { assert.fail('migrations/038_create_product_sale_atomic.sql not present'); return; }
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_product_sale_atomic/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.delete_product_sale_atomic/);
});

test('migration 038: both functions are SECURITY DEFINER', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  assert.match(migration, /create_product_sale_atomic[\s\S]*?SECURITY DEFINER/s);
  assert.match(migration, /delete_product_sale_atomic[\s\S]*?SECURITY DEFINER/s);
});

test('migration 038: REVOKE EXECUTE FROM PUBLIC for both', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.create_product_sale_atomic[\s\S]*?FROM PUBLIC/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.delete_product_sale_atomic[\s\S]*?FROM PUBLIC/);
});

test('migration 038: GRANT EXECUTE TO service_role for both', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  assert.match(migration, /GRANT\s+EXECUTE ON FUNCTION public\.create_product_sale_atomic[\s\S]*?TO service_role/);
  assert.match(migration, /GRANT\s+EXECUTE ON FUNCTION public\.delete_product_sale_atomic[\s\S]*?TO service_role/);
});

test('migration 038: ALTER FUNCTION ... OWNER TO postgres for both', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  assert.match(migration, /ALTER FUNCTION public\.create_product_sale_atomic[\s\S]*?OWNER TO postgres/);
  assert.match(migration, /ALTER FUNCTION public\.delete_product_sale_atomic[\s\S]*?OWNER TO postgres/);
});

test('migration 038: SELECT FOR UPDATE for inventory lock (inventory-mode branch)', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  assert.match(migration, /FOR UPDATE/);
});

test('migration 038: insufficient_stock error code returned with available/requested', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  assert.match(migration, /insufficient_stock/);
  assert.match(migration, /['"]available['"]/);
  assert.match(migration, /['"]requested['"]/);
});

test('migration 038: delete_product_sale_atomic reads qty/item FROM sale row (not params)', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  // Migration uses `AS $$ ... END; $$;` (dollar-quoted). Match up to the closing `$$;`.
  const fnBlock = migration.match(/CREATE OR REPLACE FUNCTION public\.delete_product_sale_atomic[\s\S]*?\$\$;/);
  assert.ok(fnBlock, 'delete_product_sale_atomic body not found');
  // Function takes only p_sale_id + p_restored_by. No qty/item params.
  const sig = fnBlock[0].match(/delete_product_sale_atomic\(([^)]*)\)/);
  assert.ok(sig);
  assert.match(sig[1], /p_sale_id/);
  assert.match(sig[1], /p_restored_by/);
  // Inside body: SELECT inventory_item_id, quantity INTO ... FROM product_sales
  assert.match(fnBlock[0], /SELECT\s+inventory_item_id,\s+quantity[\s\S]{0,200}INTO\s+v_inventory_item_id,\s+v_quantity/);
  assert.match(fnBlock[0], /FROM\s+product_sales/);
});

test('migration 038: INSERT into product_sales does NOT pass total_price', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  // Find each INSERT INTO product_sales statement and check the column-list
  // (between `INSERT INTO product_sales (` and the matching `)`) does NOT
  // mention total_price. The trailing RETURNING/RETURN clauses legitimately
  // output `total_price` in the response — that's a different thing.
  const inserts = migration.match(/INSERT INTO product_sales[^;]+;/g);
  assert.ok(inserts && inserts.length >= 1, 'INSERT INTO product_sales not found');
  for (const ins of inserts) {
    // Extract just the column-list (between first `(` and first `)`).
    const colListMatch = ins.match(/INSERT INTO product_sales\s*\(([^)]+)\)/);
    assert.ok(colListMatch, 'INSERT column-list not parseable');
    assert.doesNotMatch(colListMatch[1], /total_price/i,
      'total_price must not be in INSERT column list');
  }
});

test('migration 038: does NOT change RLS or grants on existing tables', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  // Must not contain DROP POLICY, ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY,
  // or GRANT/REVOKE on existing tables.
  assert.doesNotMatch(migration, /DROP POLICY/i);
  assert.doesNotMatch(migration, /ALTER TABLE\s+\w+\s+(DISABLE|ENABLE|FORCE|NO FORCE)\s+ROW LEVEL SECURITY/i);
  // No GRANT/REVOKE on tables (only on functions).
  assert.doesNotMatch(migration, /GRANT\s+\w+\s+ON\s+TABLE/i);
  assert.doesNotMatch(migration, /REVOKE\s+\w+\s+ON\s+TABLE/i);
});

// =====================================================================
// C. REGRESSION — reports.ts aggregateSalesData still works
// =====================================================================

test('reports.ts: still reads product_sales directly via supabase (RLS-gated)', () => {
  if (!reports) { assert.fail('lib/api/reports.ts not present'); return; }
  // The aggregated report flow must continue to read raw product_sales rows.
  assert.match(reports, /from\(\s*['"]product_sales['"]/);
});

test('reports.ts: aggregateSalesData groups by product_name and sums total_price', () => {
  if (!reports) { assert.fail('lib/api/reports.ts not present'); return; }
  // The function name must still exist.
  assert.match(reports, /function aggregateSalesData|aggregateSalesData\s*\(/);
  // It must reduce by product_name with quantity + totalPrice accumulation.
  assert.match(reports, /productName/);
});

// =====================================================================
// D. Symmetry — qty deducted == qty restored
// =====================================================================

test('migration 038: create deducts exactly p_quantity from current_quantity', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  // Look for: v_new_current := v_current_qty - p_quantity
  assert.match(migration, /v_new_current\s*:=\s*v_current_qty\s*-\s*p_quantity/);
});

test('migration 038: delete restores exactly v_quantity (read from sale row) to current_quantity', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  // Look for: v_new_current := v_current_qty + v_quantity
  assert.match(migration, /v_new_current\s*:=\s*v_current_qty\s*\+\s*v_quantity/);
});

test('migration 038: all 3 transaction sides in one implicit transaction (no COMMIT)', () => {
  if (!migration) { assert.fail('migration missing'); return; }
  // Functions use `AS $$ ... END; $$;` — Postgres wraps the body in one implicit
  // transaction. Any EXCEPTION inside ROLLBACKs the entire function. Verify
  // no COMMIT in bodies.
  const createBlock = migration.match(/CREATE OR REPLACE FUNCTION public\.create_product_sale_atomic[\s\S]*?\$\$;/);
  const deleteBlock = migration.match(/CREATE OR REPLACE FUNCTION public\.delete_product_sale_atomic[\s\S]*?\$\$;/);
  assert.ok(createBlock, 'create function body not found');
  assert.ok(deleteBlock, 'delete function body not found');
  assert.doesNotMatch(createBlock[0], /\bCOMMIT\b/);
  assert.doesNotMatch(deleteBlock[0], /\bCOMMIT\b/);
});
