/**
 * api/_lib/earnings.ts
 *
 * Phase 2 / Slice #3b — salary domain.
 *
 * Two-step earnings pipeline (preserves current App.tsx behavior, OD#10a):
 *   1) server-side calculate earnings via pure calculators;
 *   2) supabaseAdmin.rpc(add_worker_earnings / add_tire_worker_earnings) →
 *      FOR-UPDATE-locks the worker row, dedupes by completed_bookings array,
 *      and UPDATEs workers.earned_today / cars_today / completed_bookings.
 *      (It does NOT INSERT into salary_transactions — confirmed via pg_proc
 *      schema dump.)
 *   3) ONLY when step 2 reports success=true, append exactly one
 *      salary_transactions row through the SAME supabaseAdmin client.
 *
 * The legacy non-atomic pipeline (RPC success + ledger insert failure) is
 * preserved as-is. OD#10a scopes it out of #3b.
 *
 * Does NOT import browser/anon lib/api/* modules. VITE_* envs and the anon
 * `supabase` client are not present in this helper.
 *
 * Companion file (separate domain — services catalog):
 *   api/_lib/booking-services.ts
 *
 * NOT a Vercel serverless function — api/_lib/ is importable helpers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ValidationError } from './validation.js';

interface TireServiceItemForEarnings {
  service_id: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  customPrice?: number;
  comment?: string;
}

export interface WorkerEarningsArgs {
  working_mode: 'solo' | 'pair';
  booking_price: number;
  booking_discount: number;
  worker_solo_commission: number;
  worker_pair_commission: number;
}

export function calculateWorkerEarnings(args: WorkerEarningsArgs): {
  earnings: number;
  cars: number;
} {
  // Worker earns commission over (price + discount) — i.e. gross.
  // Mirrors lib/api/workers.ts:590.
  const priceForSalary = Number(args.booking_price) + (Number(args.booking_discount) || 0);
  const rate = args.working_mode === 'pair'
    ? Number(args.worker_pair_commission)
    : Number(args.worker_solo_commission);
  const earnings = priceForSalary * rate;
  const cars = args.working_mode === 'pair' ? 0.5 : 1;
  return { earnings, cars };
}

export interface TireEarningsArgs {
  total_price: number;
  services: TireServiceItemForEarnings[];
  tire_worker_commission: number;
  storage_fee: number;        // from settings.tire_worker_storage_fee, default 300
}

// Storage service slugs match shared/config/worker.ts
const STORAGE_SERVICE_NAMES = new Set([
  'Хранение резины (сезон)',
  'Хранение резины (месяц)',
  'Хранение',
]);

export function calculateTireEarnings(args: TireEarningsArgs): {
  earnings: number;
} {
  const hasStorage = (args.services ?? []).some((s) =>
    STORAGE_SERVICE_NAMES.has(s.name as any)
  );

  if (hasStorage) {
    const regularServicesTotal = (args.services ?? [])
      .filter((s) => !STORAGE_SERVICE_NAMES.has(s.name as any))
      .reduce((sum, s) => sum + Number(s.total || 0), 0);
    const regularEarnings = regularServicesTotal * Number(args.tire_worker_commission);
    const storageEarnings = Number(args.storage_fee) || 300;
    return { earnings: regularEarnings + storageEarnings };
  }

  return { earnings: Number(args.total_price) * Number(args.tire_worker_commission) };
}

export interface AddWorkerEarningsArgs {
  worker_id: string;
  worker_name: string;
  booking_id: string;
  earnings: number;
  cars: number;
}

export interface AddEarningsResult {
  rpc_success: boolean;
  rpc_message: string;
  ledger_inserted: boolean;
}

/**
 * Step 2 + 3 of the two-step pipeline for carwash:
 *   supabaseAdmin.rpc('add_worker_earnings', ...)  →  INSERT salary_transactions
 *
 * Compensating context (OD#10a):
 *   When the RPC succeeds but ledger INSERT fails, we return
 *   { rpc_success: true, rpc_message, ledger_inserted: false } and log
 *   the full server-side error with { booking_id, worker_id }. We do NOT
 *   attempt application-level rollback of worker counters.
 */
export async function addWorkerEarningAndLedger(
  supabase: SupabaseClient,
  args: AddWorkerEarningsArgs
): Promise<AddEarningsResult> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'add_worker_earnings',
    {
      p_worker_id: args.worker_id,
      p_booking_id: args.booking_id,
      p_earnings: args.earnings,
      p_cars: args.cars,
    }
  );

  if (rpcError) {
    console.error('[earnings:add-worker] rpc failed', {
      booking_id: args.booking_id,
      worker_id: args.worker_id,
      error: rpcError,
    });
    throw new Error(`add_worker_earnings_failed: ${rpcError.message}`);
  }

  const payload = rpcData as { success?: boolean; message?: string; worker?: any } | null;
  if (!payload || payload.success !== true) {
    // Idempotent: already added; do NOT insert a second ledger row.
    return {
      rpc_success: false,
      rpc_message: payload?.message ?? 'already_added',
      ledger_inserted: false,
    };
  }

  // Step 3: insert exactly one ledger row.
  const description = `Заказ #${args.booking_id.slice(0, 8)} (${args.cars === 1 ? 'solo' : 'pair'})`;
  const balanceAfter = Number(payload.worker?.earned_today ?? 0);

  const { error: ledgerError } = await supabase
    .from('salary_transactions')
    .insert({
      worker_type: 'worker',
      worker_id: args.worker_id,
      worker_name: args.worker_name,
      transaction_type: 'EARNING',
      amount: args.earnings,
      balance_after: balanceAfter,
      description,
    });

  if (ledgerError) {
    console.error('[earnings:add-worker] ledger insert failed AFTER rpc success', {
      booking_id: args.booking_id,
      worker_id: args.worker_id,
      worker_name: args.worker_name,
      amount: args.earnings,
      balance_after: balanceAfter,
      error: ledgerError,
    });
    return {
      rpc_success: true,
      rpc_message: 'rpc_inserted_but_ledger_failed',
      ledger_inserted: false,
    };
  }

  return { rpc_success: true, rpc_message: 'ok', ledger_inserted: true };
}

export interface AddTireWorkerEarningsArgs {
  worker_id: string;
  worker_name: string;
  booking_id: string;
  total_price: number;
  services: TireServiceItemForEarnings[];
}

export async function addTireWorkerEarningAndLedger(
  supabase: SupabaseClient,
  args: AddTireWorkerEarningsArgs
): Promise<AddEarningsResult> {
  // Need salary_settings.tire_worker_commission + storage_fee for calculator.
  // Caller is expected to have already selected them; we re-fetch defensively.
  const { data: settings, error: settingsErr } = await supabase
    .from('salary_settings')
    .select('tire_worker_commission, tire_worker_storage_fee')
    .limit(1)
    .maybeSingle();

  if (settingsErr) {
    throw new Error(`salary_settings_query_failed: ${settingsErr.message}`);
  }
  if (!settings) {
    throw new Error('salary_settings_missing');
  }

  const { earnings } = calculateTireEarnings({
    total_price: args.total_price,
    services: args.services,
    tire_worker_commission: Number(settings.tire_worker_commission),
    storage_fee: Number(settings.tire_worker_storage_fee ?? 300),
  });

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'add_tire_worker_earnings',
    {
      p_worker_id: args.worker_id,
      p_booking_id: args.booking_id,
      p_earnings: earnings,
    }
  );

  if (rpcError) {
    console.error('[earnings:add-tire-worker] rpc failed', {
      booking_id: args.booking_id,
      worker_id: args.worker_id,
      error: rpcError,
    });
    throw new Error(`add_tire_worker_earnings_failed: ${rpcError.message}`);
  }

  const payload = rpcData as { success?: boolean; message?: string; worker?: any } | null;
  if (!payload || payload.success !== true) {
    return {
      rpc_success: false,
      rpc_message: payload?.message ?? 'already_added',
      ledger_inserted: false,
    };
  }

  const description = `Шиномонтаж #${args.booking_id.slice(0, 8)}`;
  const balanceAfter = Number(payload.worker?.earned_today ?? 0);

  const { error: ledgerError } = await supabase
    .from('salary_transactions')
    .insert({
      worker_type: 'tire_worker',
      worker_id: args.worker_id,
      worker_name: args.worker_name,
      transaction_type: 'EARNING',
      amount: earnings,
      balance_after: balanceAfter,
      description,
    });

  if (ledgerError) {
    console.error('[earnings:add-tire-worker] ledger insert failed AFTER rpc success', {
      booking_id: args.booking_id,
      worker_id: args.worker_id,
      worker_name: args.worker_name,
      amount: earnings,
      balance_after: balanceAfter,
      error: ledgerError,
    });
    return {
      rpc_success: true,
      rpc_message: 'rpc_inserted_but_ledger_failed',
      ledger_inserted: false,
    };
  }

  return { rpc_success: true, rpc_message: 'ok', ledger_inserted: true };
}
