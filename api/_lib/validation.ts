/**
 * /api/_lib/validation.ts — server-only runtime validators.
 *
 * No zod, no shared/, no client-bundle exposure. Each helper returns either a
 * typed value or throws a `ValidationError`. Endpoints wrap calls in a single
 * try/catch and map ValidationError to HTTP 400.
 *
 * Class-based Result pattern (rather than `{ err: string }` tagged unions)
 * for clean TypeScript narrowing via instanceof.
 */

// =====================================================================
// Slice #3f (Issue 3 expense receipts) — pure helpers re-exported from
// ./expense-receipts.mjs. The .mjs file is the single source of truth so
// that node:test .mjs suites can import these helpers directly without a
// TS loader. This file adds only the TS types + ValidationError wrappers.
// =====================================================================
import {
  EXPENSE_CATEGORIES as _EXPENSE_CATEGORIES,
  CATEGORIES_REQUIRING_COMMENT as _CATEGORIES_REQUIRING_COMMENT,
  RECEIPT_MIME_ALLOWED as _RECEIPT_MIME_ALLOWED,
  RECEIPT_MAX_BYTES as _RECEIPT_MAX_BYTES,
  RECEIPT_BASE64_MAX_CHARS as _RECEIPT_BASE64_MAX_CHARS,
  isExpenseCategory as _isExpenseCategory,
  isReceiptPath as _isReceiptPath,
  sanitizeReceiptName as _sanitizeReceiptName,
  generateReceiptPath as _generateReceiptPath,
} from './expense-receipts.mjs';

// Issue 9 — server-side inventory photo upload via dispatcher.
// Pure helpers re-exported from ./inventory-photos.mjs, same pattern as
// expense-receipts above. The .mjs file is the single source of truth.
//
// Rationale: storage RLS gate `(auth.jwt() ->> 'app_role') IN ('admin',
// 'owner')` cannot match our custom staff JWT (api/login.ts:signJwt) —
// Supabase Auth does not surface our claims via auth.jwt() context.
// Browser-direct supabase.storage.from('inventory-photos').upload() is
// therefore blocked by RLS even with valid staff credentials. Server-side
// upload through service_role bypasses RLS, identical to Issue 3.
import {
  PHOTO_MIME_ALLOWED as _PHOTO_MIME_ALLOWED,
  PHOTO_MAX_BYTES as _PHOTO_MAX_BYTES,
  PHOTO_BASE64_MAX_CHARS as _PHOTO_BASE64_MAX_CHARS,
  PHOTO_MAX_FILES as _PHOTO_MAX_FILES,
  PHOTO_SIGNED_URL_TTL_SECONDS as _PHOTO_SIGNED_URL_TTL_SECONDS,
  generateInventoryPhotoPath as _generateInventoryPhotoPath,
  inferExtension as _inferExtension,
  isValidMime as _isValidMime,
  isInventoryPhotoPath as _isInventoryPhotoPath,
} from './inventory-photos.mjs';

export const EXPENSE_CATEGORIES = _EXPENSE_CATEGORIES;
export const CATEGORIES_REQUIRING_COMMENT = _CATEGORIES_REQUIRING_COMMENT;
export const RECEIPT_MIME_ALLOWED = _RECEIPT_MIME_ALLOWED;
export const RECEIPT_MAX_BYTES = _RECEIPT_MAX_BYTES;
export const RECEIPT_BASE64_MAX_CHARS = _RECEIPT_BASE64_MAX_CHARS;
export const isExpenseCategory = _isExpenseCategory;
export const isReceiptPath = _isReceiptPath;
export const sanitizeReceiptName = _sanitizeReceiptName;
export const generateReceiptPath = _generateReceiptPath;

export const PHOTO_MIME_ALLOWED = _PHOTO_MIME_ALLOWED;
export const PHOTO_MAX_BYTES = _PHOTO_MAX_BYTES;
export const PHOTO_BASE64_MAX_CHARS = _PHOTO_BASE64_MAX_CHARS;
export const PHOTO_MAX_FILES = _PHOTO_MAX_FILES;
export const PHOTO_SIGNED_URL_TTL_SECONDS = _PHOTO_SIGNED_URL_TTL_SECONDS;
export const generateInventoryPhotoPath = _generateInventoryPhotoPath;
export const inferExtension = _inferExtension;
export const isValidMime = _isValidMime;
export const isInventoryPhotoPath = _isInventoryPhotoPath;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// TS wrapper that throws ValidationError (instead of plain Error from .mjs).
// The underlying whitelist logic is in isExpenseCategory (testable separately).
export function readExpenseCategory(body: Record<string, any>, field: string): ExpenseCategory {
  const v = body[field];
  if (!_isExpenseCategory(v)) throw new ValidationError(`${field}_invalid`);
  return v as ExpenseCategory;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_HH_00_RE = /^([01]\d|2[0-3]):00$/;
const PLATE_RE = /^[А-ЯA-Z]\d{3}[А-ЯA-Z]{2}$/i;

export const CAR_TYPES = ['SEDAN', 'CROSSOVER', 'JEEP', 'LARGE_SUV', 'MINIVAN'] as const;
export type CarType = (typeof CAR_TYPES)[number];

export const PAYMENT_METHODS = [
  'Наличный',
  'Безналичный',
  'Перевод',
  'СБП',
  'Ведомость',
  'Яндекс',
  'QR-code',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Single error class for all validation failures. Endpoints catch this and
 * map to HTTP 400. Tag is for log filtering.
 */
export class ValidationError extends Error {
  readonly tag = 'ValidationError' as const;
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ValidationError';
  }
}

function fail(code: string): never {
  throw new ValidationError(code);
}

// ----- atomic type guards -----

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}
export function isISODate(s: unknown): s is string {
  return typeof s === 'string' && ISO_DATE_RE.test(s);
}
export function isTimeHHMM(s: unknown): s is string {
  return typeof s === 'string' && TIME_HHMM_RE.test(s);
}
export function isHourSlot(s: unknown): s is string {
  return typeof s === 'string' && TIME_HH_00_RE.test(s);
}
export function isPlateNumber(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 6 && PLATE_RE.test(s);
}
export function isCarType(s: unknown): s is CarType {
  return typeof s === 'string' && (CAR_TYPES as readonly string[]).includes(s);
}
export function isPaymentMethod(s: unknown): s is PaymentMethod {
  return typeof s === 'string' && (PAYMENT_METHODS as readonly string[]).includes(s);
}

// ----- body readers (return typed value or throw ValidationError) -----

/** Parses JSON body. Throws on bad JSON, missing body, or non-object. */
export function readBody(req: any): Record<string, any> {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, any>;
      fail('body_must_be_object');
    } catch {
      fail('invalid_json');
    }
  }
  fail('body_must_be_object');
}

/**
 * Wraps a body reader block in try/catch around ValidationError.
 * Returns either the validated value (cast) or sends HTTP 400 via res.
 *
 * Usage:
 *   const date = validate(res, () => readISODate(body, 'date'));
 *
 * On success: returns the validated value with its proper type.
 * On failure: calls res.status(400).json({ error: err.code }) and returns
 *   the sentinel `END_RESPONSE`.
 */
export const END_RESPONSE = Symbol('END_RESPONSE');

export function validate<T>(res: any, fn: () => T): T | typeof END_RESPONSE {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.code });
      return END_RESPONSE;
    }
    throw err; // unexpected error → bubble to outer catch if any
  }
}

export function readString(
  body: Record<string, any>,
  field: string,
  opts: { max: number; required?: boolean } = { max: 200 },
): string | null {
  const v = body[field];
  if (v == null) {
    if (opts.required === false) return null;
    fail(`${field}_required`);
  }
  if (typeof v !== 'string') fail(`${field}_must_be_string`);
  const s = v as string;
  if (s.length > opts.max) fail(`${field}_too_long`);
  return s;
}

export function readNumberInRange(
  body: Record<string, any>,
  field: string,
  min: number,
  max: number,
  required = true,
): number | null {
  const v = body[field];
  if (v == null) {
    if (!required) return null;
    fail(`${field}_required`);
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${field}_must_be_number`);
  if ((v as number) < min || (v as number) > max) fail(`${field}_out_of_range`);
  return v as number;
}

export function readUuidOpt(body: Record<string, any>, field: string): string | null {
  const v = body[field];
  if (v == null) return null;
  if (!isUuid(v)) fail(`${field}_must_be_uuid`);
  return v;
}

export function readUuidRequired(body: Record<string, any>, field: string): string {
  const r = readUuidOpt(body, field);
  if (r == null) fail(`${field}_required`);
  return r as string;
}

export function readPlateNumber(body: Record<string, any>, field: string): string {
  const raw = readString(body, field, { max: 12 });
  if (raw == null) fail(`${field}_required`);
  const trimmed = (raw as string).trim().toUpperCase();
  if (!isPlateNumber(trimmed)) fail(`${field}_bad_format`);
  return trimmed;
}

export function readCarType(body: Record<string, any>, field: string): CarType {
  const v = body[field];
  if (!isCarType(v)) fail(`${field}_invalid`);
  return v as CarType;
}

export function readPaymentMethod(body: Record<string, any>, field: string): PaymentMethod {
  const v = body[field];
  if (!isPaymentMethod(v)) fail(`${field}_invalid`);
  return v as PaymentMethod;
}

export function readISODate(body: Record<string, any>, field: string): string {
  const v = body[field];
  if (!isISODate(v)) fail(`${field}_bad_format`);
  return v as string;
}

export function readTimeHHMM(body: Record<string, any>, field: string): string {
  const v = body[field];
  if (!isTimeHHMM(v)) fail(`${field}_bad_format`);
  return v as string;
}

export function readServicesArray(
  body: Record<string, any>,
  field: string,
  opts: { min?: number; max?: number } = {},
): string[] {
  const v = body[field];
  if (!Array.isArray(v)) fail(`${field}_must_be_array`);
  const min = opts.min ?? 1;
  const max = opts.max ?? 50;
  if ((v as unknown[]).length < min || (v as unknown[]).length > max)
    fail(`${field}_bad_length`);
  const out: string[] = [];
  for (const item of v as unknown[]) {
    if (!isUuid(item)) fail(`${field}_item_not_uuid`);
    out.push(item as string);
  }
  return out;
}

// Tire service items are JSONB objects stored in tire_bookings.services.
// Schema: { service_id: uuid, name: string, quantity: int, price: int,
//            total: int, customPrice?: int, comment?: string }
// Returns the validated array (NOT mutated). Throws ValidationError on
// shape violation.
export interface TireServiceItem {
  service_id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  customPrice?: number;
  comment?: string;
}

const MAX_TIRE_SERVICES = 50;

export function readTireServicesArray(
  body: Record<string, any>,
  field: string,
  opts: { min?: number; max?: number } = {},
): TireServiceItem[] {
  const v = body[field];
  if (!Array.isArray(v)) fail(`${field}_must_be_array`);
  const min = opts.min ?? 1;
  const max = opts.max ?? MAX_TIRE_SERVICES;
  if (v.length < min || v.length > max) fail(`${field}_bad_length`);

  const out: TireServiceItem[] = [];
  for (let i = 0; i < v.length; i++) {
    const item = v[i];
    if (typeof item !== 'object' || item === null) fail(`${field}_${i}_not_object`);
    const sid = item.service_id;
    if (typeof sid !== 'string' || !isUuid(sid)) fail(`${field}_${i}_service_id_not_uuid`);
    const name = item.name;
    if (typeof name !== 'string' || name.length === 0 || name.length > 200) {
      fail(`${field}_${i}_name_invalid`);
    }
    const quantity = item.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      fail(`${field}_${i}_quantity_invalid`);
    }
    const price = item.price;
    if (!Number.isInteger(price) || price < 0 || price > 1_000_000) {
      fail(`${field}_${i}_price_invalid`);
    }
    const total = item.total;
    if (!Number.isInteger(total) || total < 0 || total > 10_000_000) {
      fail(`${field}_${i}_total_invalid`);
    }
    out.push({
      service_id: sid,
      name,
      quantity,
      price,
      total,
      customPrice: item.customPrice,
      comment: item.comment,
    });
  }
  return out;
}

export function readBoolean(body: Record<string, any>, field: string): boolean {
  const v = body[field];
  if (typeof v !== 'boolean') fail(`${field}_must_be_boolean`);
  return v;
}
