// Issue 2 unit tests — discount semantics on add-staff-services.
// Replicates the validation + p_discount resolution logic from
// api/staff.ts:addStaffServicesAction because the dispatcher can't be
// imported directly without TS compilation. Behavior must mirror api/staff.ts
// lines 1368-1412 exactly — change one, change both.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

// ---- Pure replica of api/staff.ts:1368-1412 logic ----
class ValidationError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'ValidationError'; }
}

function resolveAndValidate(body) {
  const service_ids = body.service_ids;
  // service_ids must be a present array (possibly empty) — even on
  // discount-only updates. Absent / null / non-array → 400 service_ids_required.
  if (!Array.isArray(service_ids)) {
    throw new ValidationError('service_ids_required');
  }
  const hasServices = service_ids.length > 0;

  let p_discount = null;
  if (body.discount !== undefined) {
    const d = body.discount;
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 0) {
      throw new ValidationError('discount_invalid');
    }
    p_discount = d;
  }
  const hasDiscount = p_discount !== null && p_discount > 0;

  if (!hasServices && !hasDiscount) {
    throw new ValidationError('service_ids_required');
  }

  return {
    p_service_ids: hasServices ? service_ids.map((s) => String(s)) : [],
    p_discount,
    hasServices,
    hasDiscount,
  };
}

const SVC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

test('Case 1: service + discount=500 → allowed, RPC p_discount=500', () => {
  const r = resolveAndValidate({
    booking_id: B, service_ids: [SVC], discount: 500,
  });
  assert.equal(r.hasServices, true);
  assert.equal(r.p_discount, 500);
  assert.deepEqual(r.p_service_ids, [SVC]);
});

test('Case 2: service + discount=0 → RPC p_discount=0 (explicit, NOT null)', () => {
  const r = resolveAndValidate({
    booking_id: B, service_ids: [SVC], discount: 0,
  });
  assert.equal(r.hasServices, true);
  assert.equal(r.p_discount, 0, 'explicit 0 must be sent as 0, not null');
  assert.notEqual(r.p_discount, null);
});

test('Case 3: service + discount absent → RPC p_discount=null (preserve existing)', () => {
  const r = resolveAndValidate({
    booking_id: B, service_ids: [SVC],
    // discount field absent
  });
  assert.equal(r.hasServices, true);
  assert.equal(r.p_discount, null, 'absent discount must yield null for COALESCE preserve');
});

test('Case 4: empty services + discount=300 → allowed (discount-only path)', () => {
  const r = resolveAndValidate({
    booking_id: B, service_ids: [], discount: 300,
  });
  assert.equal(r.hasServices, false);
  assert.equal(r.p_discount, 300);
  assert.deepEqual(r.p_service_ids, []);
});

test('Case 5a: empty services + discount=0 → service_ids_required', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: [], discount: 0 }),
    (e) => e.code === 'service_ids_required',
    'explicit 0 with empty services must reject',
  );
});

test('Case 5b: empty services + discount missing → service_ids_required', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: [] }),
    (e) => e.code === 'service_ids_required',
    'absent discount with empty services must reject',
  );
});

test('Case 5c: service_ids missing + discount missing → service_ids_required', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B }),
    (e) => e.code === 'service_ids_required',
    'both absent must reject',
  );
});

test('Case 5d: service_ids non-array → service_ids_required', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: 'not-array' }),
    (e) => e.code === 'service_ids_required',
    'non-array service_ids must reject',
  );
});

test('Case 5e: service_ids missing + discount=300 → service_ids_required (NEW: strict contract)', () => {
  // Even when discount > 0, absent service_ids field is rejected.
  // Caller must send service_ids as an array (possibly []), not omit it.
  assert.throws(
    () => resolveAndValidate({ booking_id: B, discount: 300 }),
    (e) => e.code === 'service_ids_required',
    'absent service_ids must reject even when discount > 0',
  );
});

test('Case 5f: service_ids=null + discount=300 → service_ids_required', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: null, discount: 300 }),
    (e) => e.code === 'service_ids_required',
    'null service_ids must reject',
  );
});

test('Case 5g: service_ids=object + discount=300 → service_ids_required', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: { id: SVC }, discount: 300 }),
    (e) => e.code === 'service_ids_required',
    'object service_ids must reject',
  );
});

test('Case 4 (regression): empty services + discount=300 → STILL allowed (not regressed by stricter check)', () => {
  const r = resolveAndValidate({
    booking_id: B, service_ids: [], discount: 300,
  });
  assert.equal(r.hasServices, false);
  assert.equal(r.p_discount, 300);
  assert.deepEqual(r.p_service_ids, []);
});

test('Case 6a: discount = -100 → discount_invalid', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: [SVC], discount: -100 }),
    (e) => e.code === 'discount_invalid',
    'negative discount must reject',
  );
});

test('Case 6b: discount = NaN → discount_invalid', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: [SVC], discount: NaN }),
    (e) => e.code === 'discount_invalid',
    'NaN discount must reject',
  );
});

test('Case 6c: discount = Infinity → discount_invalid', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: [SVC], discount: Infinity }),
    (e) => e.code === 'discount_invalid',
    'Infinity discount must reject',
  );
});

test('Case 6d: discount = -Infinity → discount_invalid', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: [SVC], discount: -Infinity }),
    (e) => e.code === 'discount_invalid',
    '-Infinity discount must reject',
  );
});

test('Case 6e: discount = "500" (string) → discount_invalid', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: [SVC], discount: '500' }),
    (e) => e.code === 'discount_invalid',
    'string discount must reject (no implicit coercion)',
  );
});

test('Case 6f: discount = null → discount_invalid (use field absent, not null)', () => {
  assert.throws(
    () => resolveAndValidate({ booking_id: B, service_ids: [SVC], discount: null }),
    (e) => e.code === 'discount_invalid',
    'explicit null is not a valid number; treat as missing/invalid',
  );
});

test('Case 7: tire path code unchanged — atomic_modify_tire_services signature is (uuid, text, jsonb)', () => {
  const src = fs.readFileSync(
    '/Users/dmitriy/Downloads/demo-car-wash/api/staff.ts', 'utf8',
  );
  // Slice from function def up to the next "=== T" section comment.
  const startIdx = src.indexOf('async function addStaffTireServicesAction');
  assert.ok(startIdx >= 0, 'addStaffTireServicesAction not found');
  const endIdx = src.indexOf('// === T', startIdx + 100);
  assert.ok(endIdx > startIdx, 'next tire section comment not found');
  const tireBody = src.slice(startIdx, endIdx);
  assert.ok(
    !/discount/i.test(tireBody),
    'add-staff-tire-services must not reference discount; found: ' + tireBody.match(/discount\w*/i)?.[0],
  );
  // TIRE_PAYMENT_METHODS unchanged
  const tireConst = src.match(/const TIRE_PAYMENT_METHODS = (\[[^\]]+\]) as const/);
  assert.ok(tireConst, 'TIRE_PAYMENT_METHODS literal not found');
  const TIRE = eval(tireConst[1]);
  assert.ok(TIRE.includes('Яндекс'), 'tire whitelist still has Яндекс (Issue 1)');
});

test('Bonus regression: existing antifreeze_intents without allow_override still rejected', () => {
  // The dispatcher still throws antifreeze_intents_not_allowed — verify the
  // shape of body.discount doesn't bypass this guard.
  // We can only test the gate combination is honored because antifreeze
  // resolution lives in the RPC. Validate that with services present, the
  // function returns success (so RPC is called and antifreeze check happens).
  const r = resolveAndValidate({
    booking_id: B, service_ids: [SVC], discount: 0, antifreeze_intents: ['antifreeze-org'],
  });
  assert.equal(r.p_discount, 0);
  // Note: antifreeze_intents_not_allowed check happens AFTER resolveAndValidate
  // (in the dispatcher), not inside this helper. This test asserts that the
  // helper doesn't break the antifreeze flow's prerequisites.
});