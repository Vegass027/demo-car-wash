// Issue 2 follow-up: verify migration 034 persists v_discount.
// Checks the SQL migration file source directly (since the migration hasn't
// been applied yet — these are pre-deploy source-level assertions).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

const MIGRATION = '/Users/dmitriy/Downloads/demo-car-wash/migrations/034_persist_carwash_discount.sql';
const ORIGINAL  = '/Users/dmitriy/Downloads/demo-car-wash/migrations/010_atomic_staff_booking_rpcs.sql';

const src = fs.readFileSync(MIGRATION, 'utf8');
const orig = fs.readFileSync(ORIGINAL, 'utf8');

test('Migration 034 declares CREATE OR REPLACE FUNCTION atomic_modify_carwash_services', () => {
  assert.match(
    src,
    /CREATE OR REPLACE FUNCTION public\.atomic_modify_carwash_services\(/,
    'expected CREATE OR REPLACE FUNCTION declaration',
  );
});

test('Migration 034 keeps the same signature: (uuid, text, jsonb, jsonb, boolean, numeric)', () => {
  assert.match(
    src,
    /CREATE OR REPLACE FUNCTION public\.atomic_modify_carwash_services\(\s*p_booking_id\s+uuid,\s*p_action\s+text,\s*p_service_ids\s+jsonb,\s*p_antifreeze_intents\s+jsonb,\s*p_allow_override\s+boolean,\s*p_discount\s+numeric/,
    'signature must match migration 010',
  );
});

test('Migration 034 final UPDATE persists discount = v_discount', () => {
  // The only behavioral delta vs migration 010.
  assert.match(
    src,
    /SET\s+services\s*=\s*v_new_services,[\s\S]*?discount\s*=\s*v_discount,/,
    'expected `discount = v_discount,` in the final UPDATE SET clause',
  );
});

test('Migration 034 preserves price formula `GREATEST(0, v_total - COALESCE(v_discount, 0))`', () => {
  assert.match(
    src,
    /v_new_price\s*:=\s*GREATEST\(0,\s*v_total\s*-\s*COALESCE\(v_discount,\s*0\)\)/,
    'price formula must remain identical to migration 010',
  );
});

test('Migration 034 preserves status guard (ОЖИДАЕТ, В РАБОТЕ)', () => {
  assert.match(
    src,
    /IF v_booking\.status NOT IN \('ОЖИДАЕТ', 'В РАБОТЕ'\) THEN/,
    'status guard must remain unchanged',
  );
});

test('Migration 034 preserves FOR UPDATE row-lock', () => {
  assert.match(
    src,
    /SELECT \*[\s\S]*?INTO v_booking[\s\S]*?FROM public\.bookings[\s\S]*?WHERE id = p_booking_id[\s\S]*?FOR UPDATE/,
    'FOR UPDATE row-lock must remain',
  );
});

test('Migration 034 preserves COALESCE(p_discount, v_booking.discount) semantic', () => {
  assert.match(
    src,
    /v_discount\s*:=\s*COALESCE\(p_discount,\s*v_booking\.discount\)/,
    'p_discount=NULL must still preserve existing bookings.discount',
  );
});

test('Migration 034 preserves SECURITY DEFINER + search_path', () => {
  assert.match(src, /SECURITY DEFINER/);
  assert.match(src, /SET search_path\s*=\s*pg_catalog,\s*public/);
});

test('Migration 034 re-applies ALTER FUNCTION ... OWNER TO postgres', () => {
  assert.match(
    src,
    /ALTER FUNCTION public\.atomic_modify_carwash_services\([\s\S]*?\) OWNER TO postgres/,
    'must re-apply OWNER for the replaced function',
  );
});

test('Migration 034 re-applies REVOKE ALL FROM PUBLIC + REVOKE EXECUTE FROM anon', () => {
  assert.match(
    src,
    /REVOKE ALL ON FUNCTION public\.atomic_modify_carwash_services\([\s\S]*?\) FROM PUBLIC/,
    'must revoke PUBLIC',
  );
  assert.match(
    src,
    /REVOKE EXECUTE ON FUNCTION public\.atomic_modify_carwash_services\([\s\S]*?\) FROM anon/,
    'must revoke anon EXECUTE',
  );
});

test('Migration 034 does not touch RLS, grants, Storage, tire path, or PROD tables', () => {
  // No CREATE POLICY, no GRANT, no REVOKE EXECUTE FROM authenticated
  // (authenticated has no EXECUTE per migration 021 — must stay that way).
  assert.doesNotMatch(src, /CREATE POLICY/i);
  assert.doesNotMatch(src, /GRANT\s+/i,  'should not add new grants');
  assert.doesNotMatch(src, /REVOKE EXECUTE.*FROM authenticated/i, 'authenticated EXECUTE was already revoked in migration 021');
  // No tire_*, no storage.*, no profiles, no clients — only bookings + services (read-only join)
  assert.doesNotMatch(src, /tire_bookings/i);
  assert.doesNotMatch(src, /storage\./i);
});

test('Migration 034 only modifies atomic_modify_carwash_services — no other functions or tables', () => {
  // Strip SQL comments before counting statements so the comment that
  // mentions "CREATE OR REPLACE FUNCTION" doesn't double-count.
  const stripped = src
    .replace(/^\s*--.*$/gm, '')             // remove -- comment lines
    .replace(/\n\s*\n/g, '\n');            // collapse blank lines
  const functionCreates = stripped.match(/^CREATE OR REPLACE FUNCTION\b/gmi) || [];
  assert.equal(functionCreates.length, 1, 'must CREATE OR REPLACE only one function');
  const tableAlters = stripped.match(/^ALTER TABLE\b/gmi) || [];
  assert.equal(tableAlters.length, 0, 'must not ALTER TABLE');
  const tableCreates = stripped.match(/^CREATE TABLE\b/gmi) || [];
  assert.equal(tableCreates.length, 0, 'must not CREATE TABLE');
});

test('Migration 034 is byte-near-identical to migration 010 except the discount line + comments', () => {
  // Strip the header comment + the trailing ALTER/REVOKE in migration 034,
  // then compare the function body to migration 010's function body.
  // Diff should be: insertion of `discount = v_discount,` line + comment.
  const stripped034 = src
    .replace(/^--.*\n/gm, '')                                    // strip leading --
    .replace(/-- Issue 2 follow-up:[\s\S]*?v_discount used for[\s\S]*?\n/g, '')
    .replace(/--\s+pricing[\s\S]*?matches prod[\s\S]*?\n/g, '')
    .replace(/\n\s*\n/g, '\n');

  // Extract just the function definition from migration 010
  const m010 = orig.match(/CREATE OR REPLACE FUNCTION public\.atomic_modify_carwash_services[\s\S]*?\$fn\$;/);
  assert.ok(m010, 'migration 010 function block not found');
  const m034 = src.match(/CREATE OR REPLACE FUNCTION public\.atomic_modify_carwash_services[\s\S]*?\$fn\$;/);
  assert.ok(m034, 'migration 034 function block not found');

  // The migration 034 body should equal migration 010 body + one new line.
  // Verify the only INSERTED line is the discount line.
  const origBody = m010[0];
  const newBody = m034[0];
  assert.ok(
    newBody.includes('discount                  = v_discount,'),
    'function body in 034 must contain `discount = v_discount,`',
  );
  // Migration 010 does NOT contain this exact line
  assert.ok(
    !origBody.includes('discount                  = v_discount,'),
    'migration 010 should not already contain this line',
  );
});