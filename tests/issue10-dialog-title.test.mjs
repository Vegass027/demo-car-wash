// tests/issue10-dialog-title.test.mjs
// Issue 10 — Radix UI accessibility warning fix.
//
// Radix DialogContent requires a DialogTitle for screen-reader users. The
// project's only offender was components/admin/CreateTireBookingModal.tsx
// (line 322 in pre-fix code). This test pins:
//
//   - All 13 DialogContent usages across the codebase now have a
//     corresponding DialogTitle in the same file.
//   - CreateTireBookingModal imports DialogTitle from components/ui/dialog.
//   - The original "Новая запись на шиномонтаж" string is preserved (used
//     either as DialogTitle content or as visible <h2> / sr-only text).
//
// No React renderer needed — pure regex + grep assertions on source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const FILES_WITH_DIALOG = [
  'components/admin/SignatureModal.tsx',
  'components/admin/QuickOrdersHistoryModal.tsx',
  'components/admin/AddAdminModal.tsx',
  'components/admin/TireOrdersHistoryModal.tsx',
  'components/admin/OrdersHistoryModal.tsx',
  'components/admin/CreateTireBookingModal.tsx',
  'components/admin/AddWorkerModal.tsx',
  'components/admin/AddTireTechnicianModal.tsx',
  'components/admin/SignatureViewModal.tsx',
  'components/admin/TireBookingDetailModal.tsx',
  'components/admin/BookingsList.tsx',
  'components/admin/AdminEarningsHistoryModal.tsx',
  'components/inventory/AddCategoryModal.tsx',
];

test('A: every file with DialogContent also declares DialogTitle', () => {
  const repoRoot = '/Users/dmitriy/Downloads/demo-car-wash';
  const missing = [];
  for (const f of FILES_WITH_DIALOG) {
    const src = readFileSync(`${repoRoot}/${f}`, 'utf8');
    const dc = (src.match(/<DialogContent\b/g) || []).length;
    const dt = (src.match(/<DialogTitle\b/g) || []).length;
    if (dc === 0) continue; // not a real consumer
    if (dt === 0) missing.push(`${f}: dc=${dc} dt=${dt}`);
  }
  assert.equal(missing.length, 0,
    `These files use <DialogContent> without <DialogTitle>:\n${missing.join('\n')}`);
});

test('B: CreateTireBookingModal imports DialogTitle', () => {
  const src = readFileSync(
    '/Users/dmitriy/Downloads/demo-car-wash/components/admin/CreateTireBookingModal.tsx',
    'utf8');
  assert.match(src, /import\s*\{[^}]*DialogTitle[^}]*\}\s*from\s*['"]\.\.\/ui\/dialog['"]/);
});

test('C: CreateTireBookingModal preserves the title text', () => {
  const src = readFileSync(
    '/Users/dmitriy/Downloads/demo-car-wash/components/admin/CreateTireBookingModal.tsx',
    'utf8');
  // Either as DialogTitle content or as a visible <h2>.
  assert.match(src, /Новая запись на шиномонтаж/);
});

test('D: CreateTireBookingModal no longer has the bare <h2>...mb-6...</h2> wrapper', () => {
  // After fix: visual heading became <DialogTitle className="text-xl font-bold mb-6">
  // so the bare <h2 className="text-xl font-bold mb-6">Новая запись на шиномонтаж</h2>
  // must be gone.
  const src = readFileSync(
    '/Users/dmitriy/Downloads/demo-car-wash/components/admin/CreateTireBookingModal.tsx',
    'utf8');
  assert.doesNotMatch(src,
    /<h2[^>]*className=["'][^"']*text-xl[^"']*font-bold[^"']*mb-6["'][^>]*>Новая запись на шиномонтаж<\/h2>/);
});
