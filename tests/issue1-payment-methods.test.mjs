// Issue 1 unit test (minimal, no deps).
// Scope: api/_lib/validation.ts → PAYMENT_METHODS accepts 'Яндекс' AND keeps 'СБП'.
// Replicates isPaymentMethod and readPaymentMethod inline because the file uses
// TS-only constructor parameter properties which Node 24 cannot strip-import.
// PAYMENT_METHODS is extracted from the source file (single source of truth) so
// the test reflects what is actually committed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const SRC = '/Users/dmitriy/Downloads/demo-car-wash/api/_lib/validation.ts';

// Read PAYMENT_METHODS literal from source — do not hardcode expected values.
const src = fs.readFileSync(SRC, 'utf8');
const m = src.match(/export const PAYMENT_METHODS = (\[[\s\S]*?\]) as const/);
assert.ok(m, 'PAYMENT_METHODS literal not found in ' + SRC);
const PAYMENT_METHODS = eval(m[1]);

// Replicas (api/_lib/validation.ts:62-64 and :170-179)
const isPaymentMethod = (s) => typeof s === 'string' && PAYMENT_METHODS.includes(s);
function readPaymentMethod(body, field) {
  const v = body[field];
  if (!isPaymentMethod(v)) {
    const err = new Error(`${field}_invalid`);
    err.tag = 'ValidationError';
    err.code = `${field}_invalid`;
    throw err;
  }
  return v;
}

test('PAYMENT_METHODS contains all required values', () => {
  for (const v of ['Наличный', 'Безналичный', 'Перевод', 'СБП', 'Ведомость', 'Яндекс', 'QR-code']) {
    assert.ok(PAYMENT_METHODS.includes(v), `missing ${v}; got ${JSON.stringify(PAYMENT_METHODS)}`);
  }
});

test('isPaymentMethod("Яндекс") is true (Issue 1 root fix)', () => {
  assert.equal(isPaymentMethod('Яндекс'), true);
});

test('isPaymentMethod("СБП") still true (no regression)', () => {
  assert.equal(isPaymentMethod('СБП'), true);
});

test('readPaymentMethod accepts every value in PAYMENT_METHODS', () => {
  for (const v of PAYMENT_METHODS) {
    assert.equal(readPaymentMethod({ payment_method: v }, 'payment_method'), v);
  }
});

test('readPaymentMethod rejects unknown values with payment_method_invalid', () => {
  for (const v of ['Bitcoin', 'Я', 'ЯНДЕКС', '', 'cash', 'наличные']) {
    assert.throws(
      () => readPaymentMethod({ payment_method: v }, 'payment_method'),
      (err) => err.code === 'payment_method_invalid',
      `expected throw for ${JSON.stringify(v)}`,
    );
  }
});

test('readPaymentMethod rejects non-string and missing field', () => {
  for (const v of [null, undefined, 123, {}, [], true]) {
    assert.throws(
      () => readPaymentMethod({ payment_method: v }, 'payment_method'),
      (err) => err.code === 'payment_method_invalid',
      `expected throw for ${JSON.stringify(v)}`,
    );
  }
  assert.throws(
    () => readPaymentMethod({}, 'payment_method'),
    (err) => err.code === 'payment_method_invalid',
    'expected throw for missing field',
  );
});

test('TIRE_PAYMENT_METHODS (api/staff.ts:209) already includes Яндекс', () => {
  const staffSrc = fs.readFileSync('/Users/dmitriy/Downloads/demo-car-wash/api/staff.ts', 'utf8');
  const tm = staffSrc.match(/const TIRE_PAYMENT_METHODS = (\[[^\]]+\]) as const/);
  assert.ok(tm, 'TIRE_PAYMENT_METHODS literal not found');
  const TIRE = eval(tm[1]);
  assert.ok(TIRE.includes('Яндекс'), `TIRE_PAYMENT_METHODS missing Яндекс: ${JSON.stringify(TIRE)}`);
});