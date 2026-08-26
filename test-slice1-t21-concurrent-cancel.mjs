// /test-slice1-t21-concurrent-cancel.mjs
//
// T21: 8 truly concurrent Promise.all() calls to cancel_own_booking on the SAME
// booking_id. Validates that:
//   - FOR UPDATE serializes the calls so they don't double-cancel.
//   - At most ONE row inserted into booking_cancellations.
//   - All callers get a 200 response with one of:
//       already_cancelled=true (idempotent return)
//       already_cancelled=false with new cancellation event
//   - No 23505 / no duplicate-key errors leak through.

import { createClient } from '@supabase/supabase-js';

const PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!PROJECT_URL || !SERVICE_KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const admin = createClient(PROJECT_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// All picks belong to profile b33e4171-7ba4-44b3-bf7a-babe766cb338
// We need a freshly ОЖИДАЕТ booking that this profile owns.
// Strategy: pick the SAME booking id, fire 8 concurrent cancel_own_booking calls.
const CLIENT_ID = 'f2799b3d-37aa-4976-a23a-df5cba10e463';
const PROFILE_ID = 'b33e4171-7ba4-44b3-bf7a-babe766cb338';

// Find one ОЖИДАЕТ booking
const { data: bookings, error: bErr } = await admin
  .from('bookings')
  .select('id')
  .eq('client_id', CLIENT_ID)
  .eq('status', 'ОЖИДАЕТ')
  .limit(1);

if (bErr || !bookings?.length) {
  console.error('No ОЖИДАЕТ booking found for this client', bErr);
  process.exit(2);
}
const BOOKING_ID = bookings[0].id;
console.log('[setup] booking_id =', BOOKING_ID);

// Snapshot baseline
const { count: baseline_cancellations } = await admin
  .from('booking_cancellations')
  .select('*', { count: 'exact', head: true })
  .eq('booking_id', BOOKING_ID);
console.log('[setup] baseline cancellation events:', baseline_cancellations || 0);

// Fire 8 true parallel RPC calls
const N = 8;
const t0 = Date.now();
const results = await Promise.all(
  Array.from({ length: N }, (_, i) =>
    admin.rpc('cancel_own_booking', {
      p_booking_id: BOOKING_ID,
      p_profile_id: PROFILE_ID,
    })
  )
);
const elapsed = Date.now() - t0;

// Categorize results
let successCount = 0;
let errorCount = 0;
const errorSamples = [];
let firstCallers = 0;
let idempotent = 0;

for (const [i, r] of results.entries()) {
  if (r.error) {
    errorCount++;
    if (errorSamples.length < 3) errorSamples.push({ i, code: r.error.code, message: r.error.message });
  } else {
    successCount++;
    const d = r.data;
    if (d && d.already_cancelled === true) idempotent++;
    else if (d && d.already_cancelled === false) firstCallers++;
  }
}

console.log('[result] elapsed_ms =', elapsed);
console.log('[result] success=' + successCount + ' errors=' + errorCount);
console.log('[result] firstCallers=' + firstCallers + ' idempotent=' + idempotent);
console.log('[result] error samples:', errorSamples);

// Verify DB state after rollback-safe test
// (We don't roll back: cancel_own_booking succeeded. Count bookings_cancellations events.)
const { count: after_cancellations } = await admin
  .from('booking_cancellations')
  .select('*', { count: 'exact', head: true })
  .eq('booking_id', BOOKING_ID);
console.log('[verify] cancellation events after:', after_cancellations || 0);

// Verify booking status is ОТМЕНЕНО
const { data: booking, error: bErr2 } = await admin
  .from('bookings')
  .select('status, cancel_comment, updated_at')
  .eq('id', BOOKING_ID)
  .single();
console.log('[verify] booking:', booking, 'err=', bErr2?.message || null);

// Cleanup: restore booking + delete cancellation row so the test is repeatable
const { error: updErr } = await admin
  .from('bookings')
  .update({ status: 'ОЖИДАЕТ', cancel_comment: null })
  .eq('id', BOOKING_ID);
console.log('[cleanup] reset status to ОЖИДАЕТ:', updErr?.message || 'ok');

// Delete the cancellation row(s) added by this test
// Use service_role so RLS doesn't block; via raw SQL via rpc('exec') is unavailable — use supabase-js
const { data: cancellations } = await admin
  .from('booking_cancellations')
  .select('id')
  .eq('booking_id', BOOKING_ID);
if (cancellations?.length) {
  for (const c of cancellations) {
    await admin.from('booking_cancellations').delete().eq('id', c.id);
  }
}
console.log('[cleanup] deleted cancellation rows:', cancellations?.length || 0);

// Final assertions
const pass =
  errorCount === 0 &&
  successCount === N &&
  firstCallers === 1 &&                  // exactly ONE first call
  idempotent === N - 1 &&                // exactly N-1 idempotent returns
  (after_cancellations || 0) === 1;      // exactly ONE inserted row

console.log('');
console.log('============================================');
console.log(pass ? 'T21 PASS' : 'T21 FAIL');
console.log('============================================');

process.exit(pass ? 0 : 1);
