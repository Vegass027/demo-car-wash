import type { Booking } from './bookings';
import type { TireBooking, TireServiceItem } from './tire-bookings';
import type { Worker } from './workers';
import type { TireWorker } from './tire-workers';
import { getSessionToken } from '../_supabase-wrapper';

type BookingResponse<T> = { data?: { booking?: T; idempotent?: boolean } };

async function dispatchStaffCall<T>(
  action: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  // Phase A Slice #3e critical fix: inject Bearer token from
  // module-level currentToken (set by setSessionToken on login).
  // Without this, /api/staff returns 401 missing_authorization
  // for every browser-side dispatcher call (anon-key raw fetch
  // never had a session token). After Slice #3d migrations closed
  // anon grants on staff-only tables, this surfaces as a hard 401
  // on the very first call after login (e.g. ClientDatabaseAccordion
  // useEffect→listClientsWithCarsAction on mount).
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`/api/staff?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json?.error as string) || `staff_${action}_failed`;
    throw new Error(`${err} (HTTP ${res.status})`);
  }
  return json as T;
}

function unwrapBooking<T>(res: BookingResponse<T>): T {
  if (!res?.data?.booking) {
    throw new Error('staff_no_booking_in_response');
  }
  return res.data.booking;
}

// =========================================================================
// create-staff-booking / create-staff-tire-booking
// =========================================================================
// Wizard's mapWizardDataToBooking fills server-derived fields (price,
// services_with_quantities, booking_source, etc.) that the staff API
// explicitly rejects. Strip them before sending.

type WizardBookingShape = {
  id?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  price?: unknown;
  services_with_quantities?: unknown;
  booking_source?: unknown;
  signature_obtained?: unknown;
  created_by_profile_id?: unknown;
  status?: unknown;
  paid_at?: unknown;
  worker_name?: unknown;
  worker_name_2?: unknown;
  org_name?: unknown;
  signature_data?: unknown;
  completed_at?: unknown;
  end_time?: unknown;  // tire-bookings has GENERATED end_time
};

// Carwash variant: keep end_time (regular column, NOT GENERATED).
// mapWizardDataToBooking always supplies a valid end_time
// (start+30min for quick bookings, start+1h for regular).
// Dispatcher trusts client-supplied end_time for staff path.
function stripServerDerivedBookingFieldsCarwash(input: WizardBookingShape): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  // Server recomputes these — must NEVER come from the browser.
  delete out.id;
  delete out.created_at;
  delete out.updated_at;
  delete out.price;
  delete out.services_with_quantities;
  delete out.booking_source;
  delete out.signature_obtained;
  delete out.created_by_profile_id;
  delete out.status;
  delete out.paid_at;
  delete out.worker_name;
  delete out.worker_name_2;
  delete out.org_name;
  delete out.signature_data;
  delete out.completed_at;
  // NOTE: end_time is preserved for carwash (regular column).
  // mapWizardDataToBooking always sets it correctly (start+30m quick, start+1h regular).
  // Dispatcher (api/staff.ts:createStaffBookingAction line 964) requires it.
  return out;
}

// Tire variant: strip end_time (tire_bookings.end_time is GENERATED ALWAYS AS).
function stripServerDerivedBookingFieldsTire(input: WizardBookingShape): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  // Server recomputes these — must NEVER come from the browser.
  delete out.id;
  delete out.created_at;
  delete out.updated_at;
  delete out.price;
  delete out.services_with_quantities;
  delete out.booking_source;
  delete out.signature_obtained;
  delete out.created_by_profile_id;
  delete out.status;
  delete out.paid_at;
  delete out.worker_name;
  delete out.worker_name_2;
  delete out.org_name;
  delete out.signature_data;
  delete out.completed_at;
  // tire-only: end_time is GENERATED ALWAYS AS — strip it.
  delete out.end_time;
  return out;
}

export async function createStaffBooking(
  input: Omit<Booking, 'id' | 'created_at' | 'updated_at'>,
): Promise<Booking> {
  const body = stripServerDerivedBookingFieldsCarwash(input as WizardBookingShape);
  const res = await dispatchStaffCall<BookingResponse<Booking>>('create-staff-booking', body);
  return unwrapBooking(res);
}

export async function createStaffTireBooking(
  input: Omit<TireBooking,
    'id' | 'created_at' | 'updated_at' | 'status' |
    'total_price' | 'booking_source'
  > & {
    status?: string;
    // ✅ Hotfix D v2: services is full TireServiceItem[] (5+ fields),
    // not string[]. Matches prod App.tsx:1602-1608 behavior — wizard
    // already has service_id/name/quantity/price/total/comment.
    services: TireServiceItem[];
  },
): Promise<TireBooking> {
  const body = stripServerDerivedBookingFieldsTire(input as unknown as WizardBookingShape);
  const res = await dispatchStaffCall<BookingResponse<TireBooking>>('create-staff-tire-booking', body);
  return unwrapBooking(res);
}

// =========================================================================
// update-staff-booking / update-staff-tire-booking (patch fields, no status)
// =========================================================================
export async function updateStaffBooking(
  bookingId: string,
  patch: Partial<Pick<Booking,
    'client_name' | 'phone' | 'car_model' | 'plate_number' | 'car_type' |
    'booking_date' | 'start_time' | 'end_time' | 'box_number' |
    'payment_method' | 'discount' | 'is_org'
  >>,
): Promise<Booking> {
  const res = await dispatchStaffCall<BookingResponse<Booking>>(
    'update-staff-booking',
    { booking_id: bookingId, ...patch },
  );
  return unwrapBooking(res);
}

export async function updateStaffTireBooking(
  tireBookingId: string,
  patch: Partial<Pick<TireBooking,
    'client_name' | 'phone' | 'car_model' | 'plate_number' |
    'booking_date' | 'start_time' | 'estimated_duration' |
    'payment_method' | 'is_org'
  >>,
): Promise<TireBooking> {
  const res = await dispatchStaffCall<BookingResponse<TireBooking>>(
    'update-staff-tire-booking',
    { tire_booking_id: tireBookingId, ...patch },
  );
  return unwrapBooking(res);
}

// =========================================================================
// add / remove services (atomic RPC; price recomputed server-side)
// =========================================================================
export async function addStaffServices(
  bookingId: string,
  serviceIds: string[],
  opts?: { antifreeze_intents?: string[]; allow_override?: boolean; discount?: number },
): Promise<Booking> {
  const body: Record<string, unknown> = {
    booking_id: bookingId,
    service_ids: serviceIds,
    antifreeze_intents: opts?.antifreeze_intents ?? [],
    allow_override: !!opts?.allow_override,
  };
  // Only include `discount` when the caller passed it in opts.
  // Matches prod semantics: UI path always passes a number (default 0),
  // which is sent as a real `0` and overwrites existing discount.
  // Callers that omit `discount` leave it absent, and the dispatcher's
  // p_discount=null preserves the existing discount via RPC COALESCE.
  if (opts && 'discount' in opts && opts.discount !== undefined) {
    body.discount = opts.discount;
  }
  const res = await dispatchStaffCall<BookingResponse<Booking>>('add-staff-services', body);
  return unwrapBooking(res);
}

export async function removeStaffService(
  bookingId: string,
  serviceId: string,
): Promise<Booking> {
  const res = await dispatchStaffCall<BookingResponse<Booking>>('remove-staff-services', {
    booking_id: bookingId,
    service_id: serviceId,
  });
  return unwrapBooking(res);
}

export async function addStaffTireServices(
  tireBookingId: string,
  serviceIds: string[],
): Promise<TireBooking> {
  const res = await dispatchStaffCall<BookingResponse<TireBooking>>('add-staff-tire-services', {
    tire_booking_id: tireBookingId,
    services: serviceIds,
  });
  return unwrapBooking(res);
}

export async function removeStaffTireService(
  tireBookingId: string,
  serviceId: string,
): Promise<TireBooking> {
  const res = await dispatchStaffCall<BookingResponse<TireBooking>>('remove-staff-tire-services', {
    tire_booking_id: tireBookingId,
    service_id: serviceId,
  });
  return unwrapBooking(res);
}

// =========================================================================
// assign / unassign worker (carwash); tire has its own action
// =========================================================================
export async function assignStaffWorker(
  bookingId: string,
  workerId: string,
  workingMode: 'solo' | 'pair',
  partnerId?: string,
): Promise<Booking> {
  const body: Record<string, unknown> = {
    booking_id: bookingId,
    worker_id: workerId,
    working_mode: workingMode,
  };
  if (workingMode === 'pair' && partnerId) body.partner_id = partnerId;
  const res = await dispatchStaffCall<BookingResponse<Booking>>('assign-staff-worker', body);
  return unwrapBooking(res);
}

export async function unassignStaffWorker(bookingId: string): Promise<Booking> {
  const res = await dispatchStaffCall<BookingResponse<Booking>>('unassign-staff-worker', {
    booking_id: bookingId,
  });
  return unwrapBooking(res);
}

export async function assignStaffTireTechnician(
  tireBookingId: string,
  workerId: string,
): Promise<TireBooking> {
  const res = await dispatchStaffCall<BookingResponse<TireBooking>>(
    'assign-staff-tire-technician',
    { tire_booking_id: tireBookingId, worker_id: workerId },
  );
  return unwrapBooking(res);
}

// =========================================================================
// state-machine transitions (carwash + tire)
// =========================================================================
export async function startStaffWork(bookingId: string): Promise<Booking> {
  const res = await dispatchStaffCall<BookingResponse<Booking>>('start-staff-work', {
    booking_id: bookingId,
  });
  return unwrapBooking(res);
}

export async function startStaffTireWork(tireBookingId: string): Promise<TireBooking> {
  const res = await dispatchStaffCall<BookingResponse<TireBooking>>('start-staff-tire-work', {
    tire_booking_id: tireBookingId,
  });
  return unwrapBooking(res);
}

export async function markStaffPaid(bookingId: string): Promise<Booking> {
  const res = await dispatchStaffCall<BookingResponse<Booking>>('mark-staff-paid', {
    booking_id: bookingId,
  });
  return unwrapBooking(res);
}

export async function markStaffTirePaid(tireBookingId: string): Promise<TireBooking> {
  const res = await dispatchStaffCall<BookingResponse<TireBooking>>('mark-staff-tire-paid', {
    tire_booking_id: tireBookingId,
  });
  return unwrapBooking(res);
}

export async function markStaffReady(bookingId: string): Promise<Booking> {
  const res = await dispatchStaffCall<BookingResponse<Booking>>('mark-staff-ready', {
    booking_id: bookingId,
  });
  return unwrapBooking(res);
}

export async function markStaffTireReady(tireBookingId: string): Promise<TireBooking> {
  const res = await dispatchStaffCall<BookingResponse<TireBooking>>('mark-staff-tire-ready', {
    tire_booking_id: tireBookingId,
  });
  return unwrapBooking(res);
}

// =========================================================================
// payment method + cancel
// =========================================================================
export async function updateStaffPaymentMethod(
  bookingId: string,
  paymentMethod: 'Наличный' | 'Безналичный' | 'Перевод',
): Promise<Booking> {
  const res = await dispatchStaffCall<BookingResponse<Booking>>('update-staff-payment-method', {
    booking_id: bookingId,
    payment_method: paymentMethod,
  });
  return unwrapBooking(res);
}

export async function updateStaffTirePaymentMethod(
  tireBookingId: string,
  paymentMethod: string,
): Promise<TireBooking> {
  const res = await dispatchStaffCall<BookingResponse<TireBooking>>(
    'update-staff-tire-payment-method',
    { tire_booking_id: tireBookingId, payment_method: paymentMethod },
  );
  return unwrapBooking(res);
}

export async function staffCancelBooking(
  bookingId: string,
  cancelComment?: string,
): Promise<Booking> {
  const body: Record<string, unknown> = { booking_id: bookingId };
  if (cancelComment !== undefined) body.cancel_comment = cancelComment;
  const res = await dispatchStaffCall<BookingResponse<Booking>>('staff-cancel-booking', body);
  return unwrapBooking(res);
}

export async function staffCancelTireBooking(
  tireBookingId: string,
  cancelReason?: string,
): Promise<TireBooking> {
  const body: Record<string, unknown> = { tire_booking_id: tireBookingId };
  if (cancelReason !== undefined) body.cancel_reason = cancelReason;
  const res = await dispatchStaffCall<BookingResponse<TireBooking>>('staff-cancel-tire-booking', body);
  return unwrapBooking(res);
}

// =========================================================================
// Slice #3c — Category A writes (15 actions)
// =========================================================================
//
// All actions are JWT-protected (admin OR owner role for the 4
// admin-or-owner actions, owner-only for the 11 owner-only actions).
// Server enforces role check + data validation; browser sends only
// the fields documented in the wrapper signatures.

// ---- admins CRUD (owner-only: create-admin, update-admin, delete-admin)

export interface AdminCreateInput {
  full_name: string;
  phone?: string | null;
  card_number?: string | null;
  payment_phone?: string | null;
  fixed_salary?: number | null;
}
export interface Admin {
  id: string;
  full_name: string;
  phone: string | null;
  card_number: string | null;
  payment_phone: string | null;
  fixed_salary: number | null;
  is_active: boolean;
  earned_today: number;
  current_balance: number;
  days_worked_this_month: number;
  is_advance_taken: boolean;
  is_working_today: boolean;
  base_rate_taken_today: boolean;
  last_shift_date: string | null;
  payment_comment: string | null;
  salary_comment: string | null;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function createStaffAdmin(input: AdminCreateInput): Promise<Admin> {
  const res = await dispatchStaffCall<{ data?: { admin: Admin }; error?: string }>(
    'create-admin',
    input as unknown as Record<string, unknown>,
  );
  if (!res?.data?.admin) throw new Error('staff_create_admin_no_admin_in_response');
  return res.data.admin;
}

export async function updateStaffAdmin(
  adminId: string,
  patch: Partial<Omit<Admin, 'id' | 'profile_id' | 'created_at' | 'updated_at'>>,
): Promise<Admin> {
  const res = await dispatchStaffCall<{ data?: { admin: Admin }; error?: string }>(
    'update-admin',
    { admin_id: adminId, ...patch },
  );
  if (!res?.data?.admin) throw new Error('staff_update_admin_no_admin_in_response');
  return res.data.admin;
}

export async function deleteStaffAdmin(adminId: string): Promise<void> {
  await dispatchStaffCall<{ data?: { success: boolean }; error?: string }>(
    'delete-admin',
    { admin_id: adminId },
  );
}

// ---- start-admin-shift (admin-or-owner)
// Replaces direct supabase.rpc('start_admin_shift') frontend call.
// INVOKER RPC runs as caller; after migration 017 REVOKE, caller
// (anon/authenticated) loses direct UPDATE on admins table. This
// dispatcher proxy uses supabaseAdmin (service_role) so the RPC works.

export async function startStaffAdminShift(adminId: string): Promise<Admin> {
  const res = await dispatchStaffCall<{ data?: { admin: Admin }; error?: string }>(
    'start-admin-shift',
    { admin_id: adminId },
  );
  if (!res?.data?.admin) throw new Error('staff_start_admin_shift_no_admin_in_response');
  return res.data.admin;
}

// ---- admin-give-advance / admin-payout-salary / admin-transfer-balance
// (all owner-only)

export async function adminGiveAdvance(adminId: string, amount: number): Promise<Admin> {
  const res = await dispatchStaffCall<{ data?: { admin: Admin }; error?: string }>(
    'admin-give-advance',
    { admin_id: adminId, amount },
  );
  if (!res?.data?.admin) throw new Error('staff_admin_give_advance_no_admin_in_response');
  return res.data.admin;
}

export async function adminPayoutSalary(adminId: string, amount: number): Promise<Admin> {
  const res = await dispatchStaffCall<{ data?: { admin: Admin }; error?: string }>(
    'admin-payout-salary',
    { admin_id: adminId, amount },
  );
  if (!res?.data?.admin) throw new Error('staff_admin_payout_salary_no_admin_in_response');
  return res.data.admin;
}

export async function adminTransferBalance(adminId: string): Promise<Admin> {
  const res = await dispatchStaffCall<{ data?: { admin: Admin }; error?: string }>(
    'admin-transfer-balance',
    { admin_id: adminId },
  );
  if (!res?.data?.admin) throw new Error('staff_admin_transfer_balance_no_admin_in_response');
  return res.data.admin;
}

// ---- salary_transactions writes (4 actions)

export type WorkerType = 'worker' | 'tire_worker' | 'admin';
export type TransactionType = 'EARNING' | 'PAYOUT' | 'ADVANCE' | 'TRANSFER' | 'STORAGE_FEE';

export interface SalaryTransaction {
  id: string;
  worker_type: WorkerType;
  worker_id: string;
  worker_name: string | null;
  amount: number;
  balance_after: number | null;
  transaction_type: TransactionType;
  description: string | null;
  notes: string | null;
  created_at: string;
  booking_id: string | null;
  shift_id: string | null;
}

export interface CreateTransactionInput {
  worker_type: WorkerType;
  worker_id: string;
  worker_name: string;
  amount: number;
  balance_after?: number | null;
  description?: string | null;
  notes?: string | null;
}

export async function createStaffEarningTransaction(input: CreateTransactionInput): Promise<SalaryTransaction> {
  const res = await dispatchStaffCall<{ data?: { transaction: SalaryTransaction }; error?: string }>(
    'create-earning-transaction',
    input as unknown as Record<string, unknown>,
  );
  if (!res?.data?.transaction) throw new Error('staff_create_earning_transaction_no_transaction');
  return res.data.transaction;
}

export async function createStaffAdvanceTransaction(input: CreateTransactionInput): Promise<SalaryTransaction> {
  const res = await dispatchStaffCall<{ data?: { transaction: SalaryTransaction }; error?: string }>(
    'create-advance-transaction',
    input as unknown as Record<string, unknown>,
  );
  if (!res?.data?.transaction) throw new Error('staff_create_advance_transaction_no_transaction');
  return res.data.transaction;
}

export async function createStaffPayoutTransaction(input: CreateTransactionInput): Promise<SalaryTransaction> {
  const res = await dispatchStaffCall<{ data?: { transaction: SalaryTransaction }; error?: string }>(
    'create-payout-transaction',
    input as unknown as Record<string, unknown>,
  );
  if (!res?.data?.transaction) throw new Error('staff_create_payout_transaction_no_transaction');
  return res.data.transaction;
}

export async function createStaffTransferTransaction(input: CreateTransactionInput): Promise<SalaryTransaction> {
  const res = await dispatchStaffCall<{ data?: { transaction: SalaryTransaction }; error?: string }>(
    'create-transfer-transaction',
    input as unknown as Record<string, unknown>,
  );
  if (!res?.data?.transaction) throw new Error('staff_create_transfer_transaction_no_transaction');
  return res.data.transaction;
}

export async function deleteStaffSalaryTransaction(transactionId: string): Promise<void> {
  await dispatchStaffCall<{ data?: { success: boolean }; error?: string }>(
    'delete-salary-transaction',
    { transaction_id: transactionId },
  );
}

// ---- salary_settings + company_settings (3 actions, all owner-only)

export interface SalarySettings {
  id: string;
  worker_solo_base: number;
  worker_solo_commission: number;
  worker_pair_base: number;
  worker_pair_commission: number;
  tire_worker_commission: number;
  admin_fixed_salary: number;
  tire_worker_storage_fee: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateSalarySettingsInput {
  worker_solo_base?: number;
  worker_solo_commission?: number;
  worker_pair_base?: number;
  worker_pair_commission?: number;
  tire_worker_commission?: number;
  admin_fixed_salary?: number;
  tire_worker_storage_fee?: number;
}

export async function updateStaffSalarySettings(
  patch: UpdateSalarySettingsInput,
): Promise<SalarySettings> {
  const res = await dispatchStaffCall<{ data?: { settings: SalarySettings }; error?: string }>(
    'update-salary-settings',
    patch as unknown as Record<string, unknown>,
  );
  if (!res?.data?.settings) throw new Error('staff_update_salary_settings_no_settings');
  return res.data.settings;
}

export interface CompanySettings {
  id: string;
  legal_form: string;
  full_legal_name: string;
  short_name: string | null;
  inn: string;
  kpp: string | null;
  ogrn: string;
  legal_address: string;
  actual_address: string | null;
  bank_name: string;
  bik: string;
  correspondent_account: string;
  payment_account: string;
  director_name: string;
  director_position: string | null;
  accountant_name: string | null;
  is_vat_payer: boolean;
  phone: string | null;
  email: string | null;
  website: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCompanySettingsInput {
  legal_form: string;
  full_legal_name: string;
  inn: string;
  ogrn: string;
  legal_address: string;
  bank_name: string;
  bik: string;
  correspondent_account: string;
  payment_account: string;
  director_name: string;
  short_name?: string;
  kpp?: string;
  actual_address?: string;
  director_position?: string;
  accountant_name?: string;
  is_vat_payer?: boolean;
  phone?: string;
  email?: string;
  website?: string;
  is_active?: boolean;
}

export interface UpdateCompanySettingsInput {
  settings_id: string;
  legal_form?: string;
  full_legal_name?: string;
  short_name?: string | null;
  inn?: string;
  kpp?: string | null;
  ogrn?: string;
  legal_address?: string;
  actual_address?: string | null;
  bank_name?: string;
  bik?: string;
  correspondent_account?: string;
  payment_account?: string;
  director_name?: string;
  director_position?: string | null;
  accountant_name?: string | null;
  is_vat_payer?: boolean;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  is_active?: boolean;
}

export async function createStaffCompanySettings(
  input: CreateCompanySettingsInput,
): Promise<CompanySettings> {
  const res = await dispatchStaffCall<{ data?: { settings: CompanySettings }; error?: string }>(
    'create-company-settings',
    input as unknown as Record<string, unknown>,
  );
  if (!res?.data?.settings) throw new Error('staff_create_company_settings_no_settings');
  return res.data.settings;
}

export async function updateStaffCompanySettings(
  patch: UpdateCompanySettingsInput,
): Promise<CompanySettings> {
  const res = await dispatchStaffCall<{ data?: { settings: CompanySettings }; error?: string }>(
    'update-company-settings',
    patch as unknown as Record<string, unknown>,
  );
  if (!res?.data?.settings) throw new Error('staff_update_company_settings_no_settings');
  return res.data.settings;
}

// =========================================================================
// Phase 2.1a — staff self-service password change
// =========================================================================
//
// Server-stamps p_user_id from claims.profile_id (admin/owner changes
// THEIR OWN password only). For admin-to-admin or owner-to-admin password
// reset, a separate admin action is required (out of scope for Phase 2.1a).
//
// Throws on:
//   • 'field_not_allowed_p_user_id' (HTTP 400) — caller tried to specify user_id
//   • 'password_required' (HTTP 400) — old or new missing
//   • 'password_same_as_old' (HTTP 400) — server-side same-as-old check
//   • 'invalid_credentials' (HTTP 400) — RPC returned false (wrong old or no profile)
//   • 'change_password_failed' (HTTP 500) — RPC transport error
//   • generic 500/404 dispatcher errors
//
// Returns void on success.
export async function changeStaffPassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  await dispatchStaffCall<{ data?: { success: boolean }; error?: string }>(
    'change-password',
    {
      p_old_password: oldPassword,
      p_new_password: newPassword,
    },
  );
}

// =========================================================================
// Slice #3d Step 0 — staff-direct RPC dispatcher proxies (9 wrappers).
//
// Each wrapper delegates to a JWT-protected /api/staff action. Browser
// can no longer reach the underlying RPCs directly; the REVOKE migration
// (021) lands AFTER this slice is deployed.
// =========================================================================

// === start-worker-shift ===
// Server-stamps p_today and p_salary (worker_solo_base) from salary_settings.
export async function startStaffWorkerShift(workerId: string): Promise<Worker> {
  const res = await dispatchStaffCall<{
    data?: { worker: Worker };
    error?: string;
  }>('start-worker-shift', { worker_id: workerId });
  if (!res.data?.worker) throw new Error('staff_no_worker_in_response');
  return res.data.worker;
}

// === update-worker (admin/owner) ===
//
// Migration 026 — whitelisted generic update via `update_worker` RPC.
// Allowed fields (matches RPC whitelist):
//   full_name, phone, card_number, payment_phone, payment_comment,
//   salary_comment, is_active, working_mode (only when waiting),
//   partner_id (only when locked, set-only).
// Salary/status fields are intentionally not in the type — callers
// must use specialized RPCs (start_worker_shift, select_worker_mode_*,
// changeWorkerMode — commits 6-8).
export async function updateStaffWorker(
  workerId: string,
  updates: Partial<Pick<Worker,
    // Metadata (Commit 1)
    'full_name' | 'phone' | 'card_number' | 'payment_phone'
    | 'payment_comment' | 'salary_comment' | 'is_active'
    | 'working_mode' | 'partner_id'
    // Hotfix A — salary/booking fields (passthrough)
    | 'status' | 'current_booking_id' | 'current_balance'
    | 'earned_today' | 'is_advance_taken' | 'completed_bookings'
  >>
): Promise<Worker> {
  const res = await dispatchStaffCall<{
    data?: { worker: Worker };
    error?: string;
  }>('update-worker', {
    worker_id: workerId,
    ...updates,
  });
  if (!res?.data?.worker) throw new Error('staff_update_worker_no_worker_in_response');
  return res.data.worker;
}

// === update-tire-worker (Hotfix B — migration 029b) ===
//
// Whitelisted generic update for tire_worker. Mirrors updateStaffWorker pattern.
// Restores tire_worker UI flows broken by Commit 1.
export async function updateStaffTireWorker(
  workerId: string,
  updates: Partial<Pick<TireWorker,
    // Metadata (7)
    'full_name' | 'phone' | 'card_number' | 'payment_phone'
    | 'payment_comment' | 'salary_comment' | 'is_active'
    // Hotfix B — 7 salary/booking fields
    | 'status' | 'current_booking_id' | 'current_balance'
    | 'earned_today' | 'is_advance_taken' | 'cars_today'
    | 'completed_bookings'
  >>
): Promise<TireWorker> {
  const res = await dispatchStaffCall<{
    data?: { worker: TireWorker };
    error?: string;
  }>('update-tire-worker', {
    worker_id: workerId,
    ...updates,
  });
  if (!res?.data?.worker) throw new Error('staff_update_tire_worker_no_worker_in_response');
  return res.data.worker;
}

// === create-worker (Hotfix C — migration 029c) ===
//
// RPC INSERT worker. Required: full_name. All other fields use defaults/null.
export async function createStaffWorker(
  input: Pick<Worker, 'full_name'> & Partial<Omit<Worker, 'id'|'full_name'|'created_at'|'updated_at'>>
): Promise<Worker> {
  const res = await dispatchStaffCall<{
    data?: { worker: Worker };
    error?: string;
  }>('create-worker', input as unknown as Record<string, unknown>);
  if (!res?.data?.worker) throw new Error('staff_create_worker_no_worker_in_response');
  return res.data.worker;
}

// === delete-worker (Hotfix C — migration 029c) ===
//
// RPC DELETE worker. FK violations surface naturally (NO ACTION).
// Pre-existing gap #2: bookings.worker_id has no FK → silent orphans on
// DELETE worker with active bookings (same behavior as prod pre-lockdown).
export async function deleteStaffWorker(workerId: string): Promise<void> {
  await dispatchStaffCall<{ data?: { success: boolean } }>(
    'delete-worker',
    { worker_id: workerId },
  );
}

// === create-tire-worker (Hotfix C — migration 029c) ===
export async function createStaffTireWorker(
  input: Pick<TireWorker, 'full_name'> & Partial<Omit<TireWorker, 'id'|'full_name'|'created_at'|'updated_at'>>
): Promise<TireWorker> {
  const res = await dispatchStaffCall<{
    data?: { worker: TireWorker };
    error?: string;
  }>('create-tire-worker', input as unknown as Record<string, unknown>);
  if (!res?.data?.worker) throw new Error('staff_create_tire_worker_no_worker_in_response');
  return res.data.worker;
}

// === delete-tire-worker (Hotfix C — migration 029c) ===
export async function deleteStaffTireWorker(workerId: string): Promise<void> {
  await dispatchStaffCall<{ data?: { success: boolean } }>(
    'delete-tire-worker',
    { worker_id: workerId },
  );
}

// === stop-worker-shift (Commit 8 — migration 031) ===
//
// 1:1 mirror prod lib/api/workers.ts:224 + features/workers/calculateEarnings.ts:194-211.
// Pure passthrough — no idempotency guard, no work_shifts close.
export async function stopStaffWorkerShift(workerId: string): Promise<Worker> {
  const res = await dispatchStaffCall<{
    data?: { worker: Worker };
    error?: string;
  }>('stop-worker-shift', { worker_id: workerId });
  if (!res?.data?.worker) throw new Error('staff_stop_worker_shift_no_worker_in_response');
  return res.data.worker;
}

// === select-worker-mode-solo (admin/owner) ===
//
// Migration 027 — atomic RPC for solo mode + base_rate accrual.
// 1:1 port of lib/api/workers.ts:549-637 selectWorkerModeSolo.
export async function selectStaffWorkerModeSolo(workerId: string): Promise<Worker> {
  const res = await dispatchStaffCall<{
    data?: { worker: Worker };
    error?: string;
  }>('select-worker-mode-solo', { worker_id: workerId });
  if (!res?.data?.worker) throw new Error('staff_select_solo_no_worker_in_response');
  return res.data.worker;
}

// === select-worker-pair-mode (admin/owner) ===
//
// Migration 027 — atomic RPC for pair mode + base_rate accrual.
// 1:1 port of lib/api/workers.ts:647-807 selectWorkerPairMode.
export async function selectStaffWorkerPairMode(workerId1: string, workerId2: string): Promise<Worker[]> {
  const res = await dispatchStaffCall<{
    data?: { workers: Worker[] };
    error?: string;
  }>('select-worker-pair-mode', { worker_id1: workerId1, worker_id2: workerId2 });
  if (!res?.data?.workers) throw new Error('staff_select_pair_no_workers_in_response');
  return res.data.workers;
}

// === change-worker-mode (admin/owner) ===
//
// Migration 027 — atomic RPC for solo↔pair mode switch without base_rate re-accrual.
// 1:1 port of lib/api/workers.ts:817-891+ changeWorkerMode.
export async function changeStaffWorkerMode(
  workerId: string,
  newMode: 'solo' | 'pair',
  newPartnerId?: string | null
): Promise<Worker> {
  const res = await dispatchStaffCall<{
    data?: { worker: Worker };
    error?: string;
  }>('change-worker-mode', {
    worker_id: workerId,
    new_mode: newMode,
    new_partner_id: newPartnerId ?? null,
  });
  if (!res?.data?.worker) throw new Error('staff_change_mode_no_worker_in_response');
  return res.data.worker;
}

// === start-tire-worker-shift ===
//
// Migration 019a updated the RPC body (carwash-only `base_rate_taken_today`
// removed). Response shape now enriched by the dispatcher with work_shift_id.
export interface StartTireWorkerShiftResult {
  worker: TireWorker;
  work_shift_id: string | null;
  idempotent: boolean;
}

export async function startStaffTireWorkerShift(workerId: string): Promise<StartTireWorkerShiftResult> {
  const res = await dispatchStaffCall<{
    data?: StartTireWorkerShiftResult;
    error?: string;
  }>('start-tire-worker-shift', { worker_id: workerId });
  if (!res.data) throw new Error('staff_no_response');
  return res.data;
}

// === stop-tire-worker-shift (admin/owner) ===
//
// Migration 019a NEW RPC. Atomic OFF: is_working_today=false, last_shift_date
// PRESERVED, active work_shift row closed with finished_at=NOW().
export interface StopTireWorkerShiftResult {
  worker: TireWorker;
  work_shift_id: string | null;
  finished_at: string | null;
  idempotent: boolean;
}

export async function stopStaffTireWorkerShift(workerId: string): Promise<StopTireWorkerShiftResult> {
  const res = await dispatchStaffCall<{
    data?: StopTireWorkerShiftResult;
    error?: string;
  }>('stop-tire-worker-shift', { worker_id: workerId });
  if (!res.data) throw new Error('staff_no_response');
  return res.data;
}

// === add-tire-worker-earnings — SECURITY CRITICAL ===
// Body: ONLY {booking_id}. Server reads tire_bookings + salary_settings
// + tire_workers and uses addTireWorkerEarningAndLedger to compute earnings.
export interface AddTireWorkerEarningsResult {
  success: boolean;
  idempotent: boolean;
  rpc_message?: string;
  ledger_inserted?: boolean;
}

export async function addStaffTireWorkerEarnings(
  bookingId: string
): Promise<AddTireWorkerEarningsResult> {
  const res = await dispatchStaffCall<{
    data?: AddTireWorkerEarningsResult;
    error?: string;
  }>('add-tire-worker-earnings', { booking_id: bookingId });
  if (!res.data) throw new Error('staff_no_response');
  return res.data;
}

// === inventory-usage ===
// Server-stamps p_created_by from claims.profile_id.
export async function deductFromInventoryViaStaff(
  itemId: string,
  quantity: number,
  notes: string | null
): Promise<unknown> {
  const res = await dispatchStaffCall<{
    data?: { result: unknown };
    error?: string;
  }>('inventory-usage', { item_id: itemId, quantity, notes });
  if (!res.data) throw new Error('staff_no_response');
  return res.data.result;
}

// === inventory-restock ===
export async function restockInventoryViaStaff(
  itemId: string,
  quantity: number,
  notes: string | null
): Promise<unknown> {
  const res = await dispatchStaffCall<{
    data?: { result: unknown };
    error?: string;
  }>('inventory-restock', { item_id: itemId, quantity, notes });
  if (!res.data) throw new Error('staff_no_response');
  return res.data.result;
}

// === add-inventory-category ===
export async function addInventoryCategoryViaStaff(
  name: string,
  unit: string
): Promise<unknown> {
  const res = await dispatchStaffCall<{
    data?: { result: unknown };
    error?: string;
  }>('add-inventory-category', { name, unit });
  if (!res.data) throw new Error('staff_no_response');
  return res.data.result;
}

// === delete-inventory-category ===
export async function deleteInventoryCategoryViaStaff(
  categoryId: string
): Promise<unknown> {
  const res = await dispatchStaffCall<{
    data?: { result: unknown };
    error?: string;
  }>('delete-inventory-category', { category_id: categoryId });
  if (!res.data) throw new Error('staff_no_response');
  return res.data.result;
}

// === inventory-arrival ===
// Storage photo upload stays browser-direct (Phase 1.8 OUT OF SCOPE).
// Pass photos as URL array metadata only.
export async function recordInventoryArrivalViaStaff(params: {
  itemId: string;
  quantity: number;
  totalPrice: number;
  deliveryDate: string;
  photos: string[] | null;
  notes: string | null;
  operationId: string;
}): Promise<{ arrival: unknown; idempotent?: boolean }> {
  const res = await dispatchStaffCall<{
    data?: { arrival: unknown; idempotent?: boolean };
    error?: string;
  }>('inventory-arrival', {
    item_id: params.itemId,
    quantity: params.quantity,
    total_price: params.totalPrice,
    delivery_date: params.deliveryDate,
    photos: params.photos,
    notes: params.notes,
    operation_id: params.operationId,
  });
  if (!res.data) throw new Error('staff_no_response');
  return res.data;
}

// === get-next-document-number ===
export async function getNextDocumentNumberViaStaff(
  documentType: 'invoice' | 'act',
  month: number,
  year: number
): Promise<number> {
  const res = await dispatchStaffCall<{
    data?: { number: number };
    error?: string;
  }>('get-next-document-number', {
    document_type: documentType,
    month,
    year,
  });
  if (res.data?.number === undefined || res.data?.number === null) {
    throw new Error('staff_no_number_in_response');
  }
  return res.data.number;
}

// =========================================================================
// Phase A Slice #3e — admin-side Category C client/car reads
// =========================================================================
// Replaces anon-side lib/api/clients.ts browser reads in App.tsx,
// ClientDatabaseAccordion.tsx, BookingWizard.tsx, TireBookingWizard.tsx.
// All calls go through api/staff dispatcher with service_role bypass —
// no Category C anon-key reads on demo (and same hardening will be
// brought to prod after 7-day demo stability).

import type { Client, ClientCar } from './clients';

// === list-clients ===
// Replaces getClients() in App.tsx (3 callsites).
export async function listClientsAction(): Promise<Client[]> {
  const res = await dispatchStaffCall<{
    data?: { clients: Client[] };
    error?: string;
  }>('list-clients', {});
  return res.data?.clients || [];
}

// === list-clients-with-cars ===
// Replaces getClientsWithCars() in ClientDatabaseAccordion.tsx (1 callsite).
export interface ClientWithCars {
  client: Client;
  cars: ClientCar[];
}
export async function listClientsWithCarsAction(): Promise<ClientWithCars[]> {
  const res = await dispatchStaffCall<{
    data?: { clientsWithCars: ClientWithCars[] };
    error?: string;
  }>('list-clients-with-cars', {});
  return res.data?.clientsWithCars || [];
}

// === get-client-cars-by-client-id ===
// Replaces getClientCars(clientId) in BookingWizard.tsx (3 callsites)
// and TireBookingWizard.tsx (3 callsites). Admin path — any client's cars.
export async function getClientCarsByClientIdAction(clientId: string): Promise<ClientCar[]> {
  const res = await dispatchStaffCall<{
    data?: { cars: ClientCar[] };
    error?: string;
  }>('get-client-cars-by-client-id', { client_id: clientId });
  return res.data?.cars || [];
}

// === toggle-box (Phase A follow-up) ===
// Replaces lib/api/boxes.ts:toggleBoxWithReset() anon-side admin operation.
// Closes Slice #3d migration 019 anon INSERT/UPDATE/DELETE grant revoke gap.
export interface ClosedBox {
  id: string;
  box_number: number;
  closed_date: string;
  is_closed: boolean;
  open_hours: number[] | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}
export interface ToggleBoxResult {
  closedBox: ClosedBox;
  toggled: boolean;
}
export async function toggleBoxActionDispatcher(
  boxNumber: number,
  closedDate: string,
  profileId: string,
): Promise<ToggleBoxResult> {
  const res = await dispatchStaffCall<{
    data?: ToggleBoxResult;
    error?: string;
  }>('toggle-box', {
    box_number: boxNumber,
    closed_date: closedDate,
    profile_id: profileId,
  });
  if (!res.data) throw new Error('toggle-box: no data in response');
  return res.data;
}

// === open-box-for-hour / close-box-for-hour (Phase A follow-up) ===
// Replaces lib/api/boxes.ts:openBoxForHour / closeBoxForHour anon-side
// admin per-hour operations. Closes DayTimeline 42501 anon grant gap.
export interface OpenCloseBoxForHourResult {
  closedBox: ClosedBox;
  hour_opened?: number;
  hour_closed?: number;
}
export async function openBoxForHourActionDispatcher(
  boxNumber: number,
  closedDate: string,
  hour: number,
  profileId: string,
): Promise<OpenCloseBoxForHourResult> {
  const res = await dispatchStaffCall<{
    data?: OpenCloseBoxForHourResult;
    error?: string;
  }>('open-box-for-hour', {
    box_number: boxNumber,
    closed_date: closedDate,
    hour,
    profile_id: profileId,
  });
  if (!res.data) throw new Error('open-box-for-hour: no data in response');
  return res.data;
}
export async function closeBoxForHourActionDispatcher(
  boxNumber: number,
  closedDate: string,
  hour: number,
  profileId: string,
): Promise<OpenCloseBoxForHourResult> {
  const res = await dispatchStaffCall<{
    data?: OpenCloseBoxForHourResult;
    error?: string;
  }>('close-box-for-hour', {
    box_number: boxNumber,
    closed_date: closedDate,
    hour,
    profile_id: profileId,
  });
  if (!res.data) throw new Error('close-box-for-hour: no data in response');
  return res.data;
}
