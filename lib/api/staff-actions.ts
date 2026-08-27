import type { Booking } from './bookings';
import type { TireBooking } from './tire-bookings';

type BookingResponse<T> = { data?: { booking?: T; idempotent?: boolean } };

async function dispatchStaffCall<T>(
  action: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`/api/staff?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
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

function stripServerDerivedBookingFields(input: WizardBookingShape): Record<string, unknown> {
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
  // tire-only: end_time is GENERATED.
  delete out.end_time;
  return out;
}

export async function createStaffBooking(
  input: Omit<Booking, 'id' | 'created_at' | 'updated_at'>,
): Promise<Booking> {
  const body = stripServerDerivedBookingFields(input as WizardBookingShape);
  const res = await dispatchStaffCall<BookingResponse<Booking>>('create-staff-booking', body);
  return unwrapBooking(res);
}

export async function createStaffTireBooking(
  input: Omit<TireBooking,
    'id' | 'created_at' | 'updated_at' | 'status' |
    'total_price' | 'booking_source' | 'services'  // services: input is string[] (IDs), not TireServiceItem[]
  > & {
    status?: string;
    services: string[];
  },
): Promise<TireBooking> {
  const body = stripServerDerivedBookingFields(input as unknown as WizardBookingShape);
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
  opts?: { antifreeze_intents?: string[]; allow_override?: boolean },
): Promise<Booking> {
  const body: Record<string, unknown> = {
    booking_id: bookingId,
    service_ids: serviceIds,
    antifreeze_intents: opts?.antifreeze_intents ?? [],
    allow_override: !!opts?.allow_override,
  };
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
