#!/bin/bash
# test-slice2-tire-concurrent-cancel.sh
#
# Phase 2 / Slice #2 — concurrent cancel RPC race test.
# 8× parallel cancel_own_tire_booking on the SAME tire_booking_id
#   → expect: exactly 1 booking_cancellations row + 1 success,
#     7 idempotent responses (already_cancelled=true).
# This verifies FOR UPDATE row-lock in cancel_own_tire_booking +
# UNIQUE INDEX on booking_cancellations(tire_booking_id) from migration 006
# together serialise the race correctly.
#
# SCOPE ISOLATION: bounded to migration 007 test client + 2099-* date.
#
# Run from /Users/dmitriy/Downloads/demo-car-wash:
#   bash test-slice2-tire-concurrent-cancel.sh

set -uo pipefail

PASSWORD="${PGPASSWORD:-YVJlmcibmLQYBtRM}"
URL="postgresql://postgres.danobongqzbxilyvdwig:${PASSWORD}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?options=-c%20project%3Dpostgres"

TIRE_TEST_PROFILE_ID='de8998b6-0725-46de-89e5-a89061daa2b5'
TIRE_TEST_CLIENT_ID='2c89868f-e85b-44cb-825b-896c3f77c474'
TEST_DATE='2099-02-01'

cleanup() {
  psql -q -t -A "$URL" >/dev/null 2>&1 <<SQL
DELETE FROM public.booking_cancellations
  WHERE client_id = '$TIRE_TEST_CLIENT_ID';
DELETE FROM public.tire_bookings
  WHERE client_id = '$TIRE_TEST_CLIENT_ID';
UPDATE public.clients
  SET online_booking_blocked_until = NULL
  WHERE id = '$TIRE_TEST_CLIENT_ID';
SQL
}

echo ""
echo "=========================================================="
echo "Phase 2 / Slice #2 — concurrent tire cancel race"
echo "=========================================================="

cleanup

# Setup: insert a single test booking in ОЖИДАЕТ.
BID=$(psql -q -t -A "$URL" <<SQL | tr -d ' '
INSERT INTO public.tire_bookings (
  id, client_id, client_name, phone, car_model, plate_number,
  booking_date, start_time, estimated_duration, services, total_price,
  status, is_paid, booking_source, created_by_profile_id
)
SELECT
  gen_random_uuid(),
  '$TIRE_TEST_CLIENT_ID',
  '[TEST ONLY] Tire Test Client',
  '+79991234501',
  'Race Test Car',
  'Т777Т777',
  '$TEST_DATE'::date,
  '09:00:00'::time, 60, '[]'::jsonb, 1000,
  'ОЖИДАЕТ', false, 'online', '$TIRE_TEST_PROFILE_ID'
RETURNING id;
SQL
)
echo "  [setup] tire_booking_id=$BID"

# Launch 8 concurrent cancel RPCs as service_role.
TASK_DIR=$(mktemp -d)
echo "  [fire 8x parallel cancel RPCs] task dir: $TASK_DIR"
for i in 1 2 3 4 5 6 7 8; do
  (
    psql -q -t -A "$URL" > "$TASK_DIR/out_$i.txt" 2>&1 <<SQL
SET ROLE service_role;
SELECT public.cancel_own_tire_booking('$BID'::uuid, '$TIRE_TEST_PROFILE_ID'::uuid, 'race-$i');
RESET ROLE;
SQL
  ) &
done
wait

echo "  [all RPCs returned]"
echo ""

# Aggregate: count distinct outcomes.
# Use grep -c with || true and per-file sum to avoid bash arithmetic noise
# from grep returning exit 1 when nothing matches.
PASS_COUNT=0
IDEMPOTENT_COUNT=0
ERROR_COUNT=0
for f in "$TASK_DIR"/out_*.txt; do
  pc=$(grep -c '"already_cancelled": false' "$f" 2>/dev/null || true)
  ic=$(grep -c '"already_cancelled": true'  "$f" 2>/dev/null || true)
  ec=$(grep -c 'ERROR:'                     "$f" 2>/dev/null || true)
  PASS_COUNT=$((PASS_COUNT + ${pc:-0}))
  IDEMPOTENT_COUNT=$((IDEMPOTENT_COUNT + ${ic:-0}))
  ERROR_COUNT=$((ERROR_COUNT + ${ec:-0}))
done

echo "  cancel_own_tire_booking(outcome) summary:"
echo "    new cancel (already_cancelled=false): $PASS_COUNT"
echo "    idempotent (already_cancelled=true):   $IDEMPOTENT_COUNT"
echo "    errors (unexpected):                   $ERROR_COUNT"

# DB-level: cancellation row count for this booking must be exactly 1.
CANCEL_ROWS=$(psql -q -t -A "$URL" -c "
  SELECT count(*) FROM public.booking_cancellations
  WHERE tire_booking_id = '$BID';")
echo ""
echo "  booking_cancellations rows for $BID: $CANCEL_ROWS  (expect: 1)"
echo ""

# Verify: tire_bookings.status = ОТМЕНЕНО
FINAL_STATUS=$(psql -q -t -A "$URL" -c "
  SELECT status FROM public.tire_bookings WHERE id = '$BID';")
echo "  tire_bookings.status: $FINAL_STATUS  (expect: ОТМЕНЕНО)"
echo ""

# Assertions
TOTAL=$((PASS_COUNT + IDEMPOTENT_COUNT + ERROR_COUNT))
if [ "$TOTAL" -ne 8 ]; then
  echo "  FAIL: total RPC responses ($TOTAL) != 8"
  rm -rf "$TASK_DIR"; cleanup
  exit 1
fi

if [ "$ERROR_COUNT" -ne 0 ]; then
  echo "  FAIL: $ERROR_COUNT RPC errors observed (race not properly handled)"
  echo "  Sample output:"
  head -2 "$TASK_DIR"/out_*.txt
  rm -rf "$TASK_DIR"; cleanup
  exit 1
fi

if [ "$PASS_COUNT" -ne 1 ]; then
  echo "  FAIL: expected exactly 1 'new cancel', got $PASS_COUNT"
  rm -rf "$TASK_DIR"; cleanup
  exit 1
fi

if [ "$IDEMPOTENT_COUNT" -ne 7 ]; then
  echo "  FAIL: expected exactly 7 idempotent, got $IDEMPOTENT_COUNT"
  rm -rf "$TASK_DIR"; cleanup
  exit 1
fi

if [ "$CANCEL_ROWS" -ne 1 ]; then
  echo "  FAIL: expected exactly 1 cancellation row in booking_cancellations, got $CANCEL_ROWS"
  echo "       UNIQUE INDEX on (tire_booking_id) may have failed"
  rm -rf "$TASK_DIR"; cleanup
  exit 1
fi

if [ "$FINAL_STATUS" != "ОТМЕНЕНО" ]; then
  echo "  FAIL: expected final status='ОТМЕНЕНО', got '$FINAL_STATUS'"
  rm -rf "$TASK_DIR"; cleanup
  exit 1
fi

echo "=========================================================="
echo "RESULT: PASS — 8 concurrent → 1 row + 1 success + 7 idempotent + 0 errors"
echo "=========================================================="

rm -rf "$TASK_DIR"
cleanup
