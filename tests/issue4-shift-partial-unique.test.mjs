// Issue: migration 036 — partial UNIQUE INDEX on work_shifts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

const SRC = '/Users/dmitriy/Downloads/demo-car-wash/migrations/036_partial_unique_work_shifts_open_per_day.sql';
const src = fs.readFileSync(SRC, 'utf8');

test('Migration 036 drops old strict idx_work_shifts_unique', () => {
  assert.match(src, /DROP INDEX IF EXISTS public\.idx_work_shifts_unique/);
});

test('Migration 036 creates partial UNIQUE INDEX idx_work_shifts_open_per_day', () => {
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS idx_work_shifts_open_per_day/);
});

test('Partial index has WHERE status = \'working\' clause', () => {
  assert.match(src, /WHERE status = \'working\'/);
});

test('Migration 036 only touches work_shifts indexes — no RLS / grants / Storage changes', () => {
  const stripped = src
    .replace(/^\s*--.*$/gm, '')
    .replace(/\n\s*\n/g, '\n');
  assert.doesNotMatch(stripped, /CREATE POLICY/i);
  assert.doesNotMatch(stripped, /GRANT\s+/i, 'should not add new grants');
  assert.doesNotMatch(stripped, /REVOKE\s+/im, 'should not modify grants');
  assert.doesNotMatch(stripped, /ALTER TABLE/i, 'should not alter work_shifts table structure');
  assert.doesNotMatch(stripped, /storage\./i);
  assert.doesNotMatch(stripped, /tire_bookings/i);
  assert.doesNotMatch(stripped, /bookings/i);
});

test('Migration 036 has DEMO-only marker in comment', () => {
  assert.match(src, /DEMO-only/i);
  assert.match(src, /PROD.*(not|untouched)/i);
});

test('Migration 036 has comment explaining why partial (multiple finished rows allowed)', () => {
  assert.match(src, /audit history|preserving/i);
});