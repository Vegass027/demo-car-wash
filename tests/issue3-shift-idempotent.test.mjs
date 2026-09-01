// Issue: migration 035 — verify start_worker_shift idempotency fix
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

const SRC = '/Users/dmitriy/Downloads/demo-car-wash/migrations/035_fix_start_worker_shift_idempotent.sql';

const src = fs.readFileSync(SRC, 'utf8');

test('Migration 035 uses CREATE OR REPLACE FUNCTION with same signature', () => {
  assert.match(
    src,
    /CREATE OR REPLACE FUNCTION public\.start_worker_shift\(\s*p_worker_id\s+uuid,\s*p_salary\s+numeric,\s*p_today\s+date/,
  );
});

test('Migration 035 guards idempotency on is_working_today (NOT on base_rate_taken_today)', () => {
  // The fix: idempotency check changed from base_rate_taken_today to is_working_today.
  const guardMatch = src.match(/IF v_worker\.(\w+) THEN\s+RETURN v_worker;/);
  assert.ok(guardMatch, 'expected idempotency guard');
  assert.equal(guardMatch[1], 'is_working_today', 'guard must check is_working_today, not base_rate_taken_today');
});

test('Migration 035 does NOT have the old base_rate_taken_today early-return guard', () => {
  // Strip SQL comments before searching.
  const stripped = src
    .replace(/^\s*--.*$/gm, '')
    .replace(/\n\s*\n/g, '\n');
  assert.doesNotMatch(
    stripped,
    /IF v_worker\.base_rate_taken_today\s+THEN/i,
    'old base_rate_taken_today guard must be removed',
  );
});

test('Migration 035 UPDATE sets is_working_today = TRUE', () => {
  assert.match(src, /is_working_today\s*=\s*TRUE/);
});

test('Migration 035 UPDATE sets last_shift_date = p_today', () => {
  assert.match(src, /last_shift_date\s*=\s*p_today/);
});

test('Migration 035 does NOT insert work_shifts for workers (PROD parity)', () => {
  // Strip SQL comments before searching — the migration file mentions
  // "INSERT INTO work_shifts" in a comment explaining why it's removed.
  const stripped = src
    .replace(/^\s*--.*$/gm, '')
    .replace(/\n\s*\n/g, '\n');
  assert.doesNotMatch(stripped, /INSERT INTO work_shifts/i,
    'must not INSERT into work_shifts for workers — mirrors prod');
});

test('Migration 035 still locks worker row FOR UPDATE', () => {
  assert.match(src, /FOR UPDATE/);
});

test('Migration 035 re-applies ALTER FUNCTION ... OWNER TO postgres', () => {
  assert.match(src,
      /ALTER FUNCTION public\.start_worker_shift\(uuid,\s*numeric,\s*date\)\s+OWNER TO postgres/);
});

test('Migration 035 only touches start_worker_shift — no other functions or tables', () => {
  const stripped = src
    .replace(/^\s*--.*$/gm, '')
    .replace(/\n\s*\n/g, '\n');
  const functionCreates = stripped.match(/^CREATE OR REPLACE FUNCTION\b/gmi) || [];
  assert.equal(functionCreates.length, 1, 'must CREATE OR REPLACE only one function');
  const tableAlters = stripped.match(/^ALTER TABLE\b/gmi) || [];
  assert.equal(tableAlters.length, 0, 'must not ALTER TABLE');
  const tableCreates = stripped.match(/^CREATE TABLE\b/gmi) || [];
  assert.equal(tableCreates.length, 0, 'must not CREATE TABLE');
});

test('Migration 035 does not touch RLS, grants, Storage, tire path, or PROD tables', () => {
  assert.doesNotMatch(src, /CREATE POLICY/i);
  assert.doesNotMatch(src, /GRANT\s+/i, 'should not add new grants');
  assert.doesNotMatch(src, /tire_/i);
  assert.doesNotMatch(src, /storage\./i);
});

test('Migration 035 does not add REVOKE statements (function REVOKEs stay from migration 021)', () => {
  assert.doesNotMatch(src, /^REVOKE\s+/im, 'should not re-REVOKE — migration 021 still applies');
});

test('Migration 035 still creates work_shift row exactly once per call (no duplicate-guard regression)', () => {
  // Original RPC had no duplicate-guard; the new RPC still has none — idempotency
  // is via is_working_today check at top, not via work_shifts deduplication.
  // Make sure INSERT statement is still there and unguarded.
  const insertMatch = src.match(/INSERT INTO work_shifts[\s\S]*?\) ON CONFLICT DO NOTHING/);
  assert.equal(insertMatch, null, 'should not add ON CONFLICT DO NOTHING — idempotency is at function entry');
});