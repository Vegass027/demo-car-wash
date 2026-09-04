/**
 * api/_lib/booking-services.ts
 *
 * Phase 2 / Slice #3b — services catalog domain.
 *
 * Server-side authoritative recompute of booking.services +
 * booking.services_with_quantities + final_price for the carwash flow.
 * Browser payload is treated as INTENT only: client supplies service
 * identifiers (UUID or text slug) and optional antifreeze overrides;
 * the server reads prices from the services table and refuses to accept
 * price/total values from the body.
 *
 * Companion file (separate domain — salary):
 *   api/_lib/earnings.ts
 *
 * NOT a Vercel serverless function — api/_lib/ is importable helpers,
 * only api/*.ts files count toward the 12-function Hobby ceiling.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CarType } from './validation.js';
import { ValidationError } from './validation.js';

export interface BookingServiceIntent {
  service_id: string;            // text slug ('antifreeze-org' / 'antifreeze-umc') or UUID
  quantity?: number;
  custom_price?: number;
}

export interface ServicesPatchResult {
  services: string[];            // array of services.id (UUID), authoritative
  services_with_quantities: Array<{
    service_id: string;          // services.id (UUID)
    quantity: number;
    price: number;
    total: number;
    /**
     * Issue 16 — list-priced unit price for the worker's commission basis.
     * Equals the equivalent_paid_service's price_<car_type> when set,
     * otherwise this row's own price_<car_type>. Always present for new
     * bookings (migration 044). Legacy bookings may omit it; the earnings
     * calculator falls back to `total` in that case.
     */
    nominal_unit_price: number;
  }>;
  final_price: number;
  discount: number;
}

const ANTIFREEZE_SLUGS = new Set(['antifreeze-org', 'antifreeze-umc']);

function isAntifreeze(slug: string): boolean {
  return ANTIFREEZE_SLUGS.has(slug);
}

function getServicePriceForCarType(
  service: {
    price_sedan: number;
    price_crossover: number;
    price_jeep: number;
    price_large_suv: number;
    price_minivan: number;
  },
  car_type: CarType
): number {
  switch (car_type) {
    case 'CROSSOVER': return Number(service.price_crossover);
    case 'JEEP':      return Number(service.price_jeep);
    case 'LARGE_SUV': return Number(service.price_large_suv);
    case 'MINIVAN':   return Number(service.price_minivan);
    case 'SEDAN':
    default:          return Number(service.price_sedan);
  }
}

interface ResolvedService {
  id: string;
  service_id: string;
  name: string;
  price_sedan: number;
  price_crossover: number;
  price_jeep: number;
  price_large_suv: number;
  price_minivan: number;
  allow_multiple: boolean;
  is_active: boolean;
}

/**
 * Resolve each intent to an active services row.
 * Throws 400 ValidationError on unknown service_id or disallowed override.
 *
 * Input args:
 *   services              — input identifiers (UUIDs OR text slugs)
 *   car_type              — authoritative; server reads prices for this class
 *   antifreeze_intents    — only honored when allow_override=true; only
 *                           accepted for antifreeze-org / antifreeze-umc slugs
 *   allow_override        — explicit opt-in to honor antifreeze_intents
 *   discount              — passed through (caller may compute elsewhere)
 *
 * Returns: ServicesPatchResult with services (UUIDs), services_with_quantities
 * (server-priced rows), final_price, discount.
 */
export async function recomputeBookingServices(
  supabase: SupabaseClient,
  args: {
    services: string[];
    car_type: CarType;
    antifreeze_intents?: BookingServiceIntent[];
    allow_override: boolean;
    discount?: number;
  }
): Promise<ServicesPatchResult> {
  const { services, car_type, antifreeze_intents, allow_override, discount } = args;

  if (!Array.isArray(services) || services.length === 0) {
    throw new ValidationError('services_required');
  }

  // Strip duplicates while preserving order.
  const seen = new Set<string>();
  const uniqueIds: string[] = [];
  for (const s of services) {
    if (typeof s !== 'string' || !s.trim()) {
      throw new ValidationError('service_id_invalid');
    }
    const k = s.trim();
    if (!seen.has(k)) {
      seen.add(k);
      uniqueIds.push(k);
    }
  }

  // Pull antifreeze_intents: validate against allowlist + override flag.
  const intentMap = new Map<string, BookingServiceIntent>();
  if (antifreeze_intents && antifreeze_intents.length > 0) {
    if (!allow_override) {
      throw new ValidationError('antifreeze_intents_not_allowed');
    }
    for (const intent of antifreeze_intents) {
      if (!intent || typeof intent.service_id !== 'string' || !intent.service_id.trim()) {
        throw new ValidationError('antifreeze_intent_invalid');
      }
      const slug = intent.service_id.trim();
      if (!isAntifreeze(slug)) {
        throw new ValidationError('antifreeze_intent_not_in_allowlist');
      }
      if (intentMap.has(slug)) {
        throw new ValidationError('antifreeze_intent_duplicate');
      }
      intentMap.set(slug, intent);
    }
  }

  // Resolve service rows by both UUID and slug in one round-trip.
  // Supabase .or() expects CSV without surrounding quotes — the underlying
  // PostgREST .in filter adds them. Use .in() directly instead, twice.
  const { data: rowsByUuid, error: err1 } = await supabase
    .from('services')
    .select('id, service_id, name, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan, allow_multiple, is_active')
    .in('id', uniqueIds)
    .eq('is_active', true);
  if (err1) {
    throw new Error(`services_query_failed: ${err1.message}`);
  }
  const { data: rowsBySlug, error: err2 } = await supabase
    .from('services')
    .select('id, service_id, name, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan, allow_multiple, is_active')
    .in('service_id', uniqueIds)
    .eq('is_active', true);
  if (err2) {
    throw new Error(`services_query_failed: ${err2.message}`);
  }
  const rows = [...(rowsByUuid ?? []), ...(rowsBySlug ?? [])];

  const byId = new Map<string, ResolvedService>();
  const bySlug = new Map<string, ResolvedService>();
  for (const r of (rows ?? []) as ResolvedService[]) {
    byId.set(r.id, r);
    bySlug.set(r.service_id, r);
  }

  // Build resolved services_with_quantities + final price.
  const resolvedServices: string[] = [];
  const sq: ServicesPatchResult['services_with_quantities'] = [];
  let totalPrice = 0;

  for (const input of uniqueIds) {
    const row = byId.get(input) ?? bySlug.get(input);
    if (!row) {
      throw new ValidationError(`unknown_service_id_${input}`);
    }
    resolvedServices.push(row.id);

    const intent = intentMap.get(row.service_id);
    const isAfz = isAntifreeze(row.service_id);

    let quantity = 1;
    let unitPrice: number;
    let overrideApplied = false;

    if (isAfz) {
      // antifreeze: price independent of car_type (use price_sedan baseline).
      unitPrice = Number(row.price_sedan);
      if (intent && typeof intent.quantity === 'number' && intent.quantity > 0) {
        quantity = Math.floor(intent.quantity);
        if (!row.allow_multiple && quantity > 1) {
          throw new ValidationError(`antifreeze_quantity_not_allowed_${row.service_id}`);
        }
      } else {
        quantity = 1;
      }
      if (intent && typeof intent.custom_price === 'number' && intent.custom_price >= 0) {
        unitPrice = Number(intent.custom_price);
        overrideApplied = true;
      }
    } else {
      // Non-antifreeze: price per car_type. No override path — only antifreeze.
      unitPrice = getServicePriceForCarType(row, car_type);
      if (intent) {
        // intent was supplied for non-antifreeze — illegal.
        throw new ValidationError(`antifreeze_intent_not_in_allowlist`);
      }
    }

    if (quantity < 1) {
      throw new ValidationError('service_quantity_invalid');
    }

    const total = unitPrice * quantity;
    sq.push({
      service_id: row.id,
      quantity,
      price: unitPrice,
      total,
      // nominal_unit_price is set in a second pass after this loop ends
      // (see batchResolveNominalUnitPrices below) to avoid per-line N+1.
      nominal_unit_price: 0,
    });
    totalPrice += total;

    // Defensive: antifreeze intent consumed (cleared to allow duplicate in
    // different positions to be detected).
    if (intent && overrideApplied === false && isAfz) {
      intentMap.delete(row.service_id);
    }
  }

  const finalDiscount = Math.max(0, Number(discount ?? 0));
  const finalPrice = Math.max(0, totalPrice - finalDiscount);

  // Issue 16 — batch-resolve nominal unit prices (one read for all swq
  // rows + at most one small follow-up for equivalent_paid_service_id rows
  // not already present in the first batch).
  const nominalBySvcId = await batchResolveNominalUnitPrices(
    supabase,
    resolvedServices,
    car_type,
  );

  const sqWithNominal: ServicesPatchResult['services_with_quantities'] = sq.map((line) => ({
    ...line,
    nominal_unit_price: nominalBySvcId.get(line.service_id) ?? 0,
  }));

  return {
    services: resolvedServices,
    services_with_quantities: sqWithNominal,
    final_price: finalPrice,
    discount: finalDiscount,
  };
}

/**
 * Issue 16 — batch-resolve nominal unit prices for a list of service UUIDs.
 *
 * Returns Map<service_id, nominal_unit_price>. For each service, nominal
 * unit price equals:
 *   - referenced service's price_<car_type> if equivalent_paid_service_id
 *     is set and points to a different row (e.g. free-body-wash → body-wash);
 *   - this service's own price_<car_type> otherwise (default for all paid
 *     services; behavior unchanged).
 *
 * Two queries worst-case: one for the input set, one for any equivalent IDs
 * not already returned in the first batch (typically 0 for paid services).
 */
async function batchResolveNominalUnitPrices(
  supabase: SupabaseClient,
  serviceIds: string[],
  car_type: CarType,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (serviceIds.length === 0) return out;

  const { data: rows, error } = await supabase
    .from('services')
    .select(
      'id, equivalent_paid_service_id, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan',
    )
    .in('id', serviceIds);
  if (error) throw new Error(`nominal_price_batch_lookup_failed: ${error.message}`);
  if (!rows || rows.length === 0) return out;

  const byId = new Map<string, any>();
  for (const r of rows as any[]) byId.set(r.id, r);

  // Follow-up only for equivalent IDs not already in the first batch.
  const eqIds = Array.from(
    new Set(
      (rows as any[])
        .map((r) => r.equivalent_paid_service_id)
        .filter((id: unknown): id is string => typeof id === 'string' && !!id && !byId.has(id)),
    ),
  );
  if (eqIds.length > 0) {
    const { data: eqRows, error: eqErr } = await supabase
      .from('services')
      .select(
        'id, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan',
      )
      .in('id', eqIds);
    if (eqErr) throw new Error(`equivalent_price_batch_lookup_failed: ${eqErr.message}`);
    for (const r of (eqRows ?? []) as any[]) byId.set(r.id, r);
  }

  for (const r of (rows as any[]) ?? []) {
    const eqId: string | null = r.equivalent_paid_service_id;
    const srcRow = eqId && eqId !== r.id && byId.has(eqId) ? byId.get(eqId) : r;
    out.set(r.id, getServicePriceForCarType(srcRow, car_type));
  }
  return out;
}
