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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_HH_00_RE = /^([01]\d|2[0-3]):00$/;
const PLATE_RE = /^[А-ЯA-Z]\d{3}[А-ЯA-Z]{2}$/i;

export const CAR_TYPES = ['SEDAN', 'CROSSOVER', 'JEEP', 'LARGE_SUV', 'MINIVAN'] as const;
export type CarType = (typeof CAR_TYPES)[number];

export const PAYMENT_METHODS = [
  'Наличный', 'Безналичный', 'Перевод', 'СБП', 'Ведомость', 'QR-code',
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

export function readBoolean(body: Record<string, any>, field: string): boolean {
  const v = body[field];
  if (typeof v !== 'boolean') fail(`${field}_must_be_boolean`);
  return v;
}
