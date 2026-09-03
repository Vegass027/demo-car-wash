// tests/issue11-console-warnings.test.mjs
// Issue 11 — clean up two console warnings that fire during normal use
// but do not break anything:
//   1. 406 Not Acceptable on /rest/v1/inventory_arrivals?operation_id=eq...
//      (.single() returns PGRST116 on 0 rows; switch to .maybeSingle()).
//   2. "DialogContent requires a DialogTitle" from Radix UI — fired when
//      InventoryHistoryModal's photo-viewer modal opens.
//
// Three blocks:
//   A. WIRING — regex on lib/api/inventory.ts confirming maybeSingle usage
//      and removal of the PGRST116 catch.
//   B. WIRING — regex on InventoryHistoryModal.tsx confirming the photo-viewer
//      modal now has a DialogPrimitive.Title sibling to DialogPrimitive.Content.
//   C. REGRESSION — guard that no other DialogPrimitive.Content exists in
//      components/ without a sibling DialogPrimitive.Title in the same
//      modal scope. (Pre-fix had 0 such cases; this guard pins it at 0.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const INV     = '/Users/dmitriy/Downloads/demo-car-wash/lib/api/inventory.ts';
const HIST    = '/Users/dmitriy/Downloads/demo-car-wash/components/inventory/InventoryHistoryModal.tsx';

let invSrc = '';
try { invSrc = readFileSync(INV, 'utf8'); } catch { /* skip */ }
let histSrc = '';
try { histSrc = readFileSync(HIST, 'utf8'); } catch { /* skip */ }

// =====================================================================
// A. WIRING — maybeSingle replacement
// =====================================================================

test('A: lib/api/inventory.ts uses maybeSingle() for idempotency check', () => {
  if (!invSrc) { assert.fail('inventory.ts source missing'); return; }
  // recordInventoryArrival body — find the idempotency-check block.
  const idx = invSrc.indexOf('export async function recordInventoryArrival');
  assert.ok(idx > 0, 'recordInventoryArrival not found');
  const window = invSrc.slice(idx, idx + 4000);
  // Must use .maybeSingle()
  assert.match(window, /\.maybeSingle\(\)/, 'must call .maybeSingle() for idempotency check');
  // Must NOT use .single() in this window (would cause 406)
  // Allow .single() in OTHER windows (other functions in this file may use it).
  const singleHits = (window.match(/\.single\(\)/g) || []).length;
  assert.equal(singleHits, 0, 'must not use .single() in recordInventoryArrival body');
});

test('A: idempotency block no longer relies on PGRST116 catch', () => {
  if (!invSrc) { assert.fail('inventory.ts source missing'); return; }
  const idx = invSrc.indexOf('export async function recordInventoryArrival');
  const window = invSrc.slice(idx, idx + 4000);
  // Old code had try/catch around .single() catching PGRST116.
  // New code uses maybeSingle() — no PGRST116 path needed.
  assert.doesNotMatch(window, /PGRST116/, 'PGRST116 catch should be removed after switching to maybeSingle');
});

// =====================================================================
// B. WIRING — photo-viewer DialogPrimitive.Title
// =====================================================================

test('B: photo-viewer modal in InventoryHistoryModal has DialogPrimitive.Title', () => {
  if (!histSrc) { assert.fail('InventoryHistoryModal source missing'); return; }
  // Photo-viewer is the second DialogPrimitive.Content scope (line 176-212 area).
  // Find the second opening <DialogPrimitive.Content ...> and the closing
  // </DialogPrimitive.Content> that follows. The inner scope must contain
  // a <DialogPrimitive.Title ...> element.
  const openings = [];
  const openRe = /<DialogPrimitive\.Content\b/g;
  let m;
  while ((m = openRe.exec(histSrc)) !== null) openings.push(m.index);
  assert.ok(openings.length >= 2, 'expected ≥2 DialogPrimitive.Content openings');
  const secondOpen = openings[1];
  // Find next </DialogPrimitive.Content> after secondOpen
  const closeIdx = histSrc.indexOf('</DialogPrimitive.Content>', secondOpen);
  assert.ok(closeIdx > secondOpen, 'expected closing tag after second Content');
  const scope = histSrc.slice(secondOpen, closeIdx);
  assert.match(scope, /<DialogPrimitive\.Title\b[^>]*>/,
    'photo-viewer modal must have <DialogPrimitive.Title> for screen-reader accessibility');
});

test('B: photo-viewer title is sr-only (visual layout unchanged)', () => {
  if (!histSrc) { assert.fail('InventoryHistoryModal source missing'); return; }
  const openings = [];
  const openRe = /<DialogPrimitive\.Content\b/g;
  let m;
  while ((m = openRe.exec(histSrc)) !== null) openings.push(m.index);
  const secondOpen = openings[1];
  const closeIdx = histSrc.indexOf('</DialogPrimitive.Content>', secondOpen);
  const scope = histSrc.slice(secondOpen, closeIdx);
  // The Title element must have sr-only class so it doesn't break layout
  // (the photo viewer has no visible heading).
  const titleMatch = scope.match(/<DialogPrimitive\.Title\b[^>]*>/);
  assert.ok(titleMatch, 'title element not found');
  assert.match(titleMatch[0], /className=["'][^"']*\bsr-only\b/,
    'photo-viewer title must be sr-only to preserve layout (no visible heading needed)');
});

// =====================================================================
// C. REGRESSION — sweep raw DialogPrimitive.Content usages
// =====================================================================

import { execSync } from 'node:child_process';

test('C: no other DialogPrimitive.Content in components/ lacks a sibling DialogPrimitive.Title', () => {
  // Use grep to enumerate every raw DialogPrimitive.Content scope.
  // We require that inside every such scope (between matching <DialogPrimitive.Content ...>
  // and the next </DialogPrimitive.Content>) there is at least one
  // <DialogPrimitive.Title> OR <DialogTitle> element.
  // Excludes the wrapper file components/ui/dialog.tsx itself (it defines
  // DialogPrimitive.Content but doesn't render it as a modal).
  const filesRaw = execSync(
    "grep -rlE 'DialogPrimitive\\.Content' components/ --include='*.tsx' || true",
    { cwd: '/Users/dmitriy/Downloads/demo-car-wash', encoding: 'utf8' }
  ).trim();
  if (!filesRaw) { assert.fail('no files use raw DialogPrimitive.Content — nothing to verify'); return; }
  const files = filesRaw.split('\n').filter(f => f && !f.endsWith('ui/dialog.tsx'));
  const offenders = [];
  for (const f of files) {
    const src = readFileSync('/Users/dmitriy/Downloads/demo-car-wash/' + f, 'utf8');
    // For every opening <DialogPrimitive.Content ...>, check the next closing
    // </DialogPrimitive.Content> for at least one title.
    const openRe = /<DialogPrimitive\.Content\b/g;
    let m;
    while ((m = openRe.exec(src)) !== null) {
      const closeIdx = src.indexOf('</DialogPrimitive.Content>', m.index);
      if (closeIdx < 0) continue;
      const scope = src.slice(m.index, closeIdx);
      const hasTitle = /<DialogPrimitive\.Title\b|<DialogTitle\b/.test(scope);
      if (!hasTitle) {
        offenders.push(`${f} (offset ${m.index})`);
      }
    }
  }
  assert.equal(offenders.length, 0,
    `DialogPrimitive.Content without sibling title:\n  ${offenders.join('\n  ')}`);
});
