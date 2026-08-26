#!/bin/bash
# test-slice2-tire-rpcs.sh
#
# Phase 2 / Slice #2 — tire RPC smoke tests.
# Tests migration 004 (public slots RPC) + migration 005 (cancel RPC)
# + migration 006 (UNIQUE INDEX race guard).
#
# SCOPE ISOLATION: all tests use the dedicated Tire Test Client from
# migration 007 (profile_id = de8998b6-... / client_id = 2c89868f-.../
# telegram_id = 444444444). Cleanup is bounded to that client + 2099-*
# test-fixture dates only. Never DELETEs broadly across cancellations
# or UPDATEs blocks for any other client.
#
# REQUIRES:
#   * 004 / 005 / 006 / 007 migrations already applied.
#
# Run from /Users/dmitriy/Downloads/demo-car-wash:
#   bash test-slice2-tire-rpcs.sh

set -uo pipefail

# Supavisor pooler requires tenant identifier (`?options=project=postgres`).
# psql with -c doesn't honour PGPASSWORD env reliably, so URL embeds password.
PASSWORD="${PGPASSWORD:-YVJlmcibmLQYBtRM}"
URL="postgresql://postgres.danobongqzbxilyvdwig:${PASSWORD}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?options=-c%20project%3Dpostgres"

# Test client (migration 007) — hardcoded UUIDs.
TIRE_TEST_PROFILE_ID='de8998b6-0725-46de-89e5-a89061daa2b5'
TIRE_TEST_CLIENT_ID='2c89868f-e85b-44cb-825b-896c3f77c474'
TEST_DATE='2099-01-15'

# --- counters ---
PASS=0
FAIL=0
declare -a FAILURES

# --- helpers ---

# run_query <name> <expected_substring> <sql>
# Asserts that running the SQL via heredoc yields output containing
# the expected substring.
run_query() {
  local name="$1" expected="$2"; shift 2
  local actual
  actual="$(echo "$*" | psql -q -t -A "$URL" 2>/dev/null)"
  local rc=$?
  if [ $rc -ne 0 ]; then
    FAIL=$((FAIL+1))
    FAILURES+=("$name: psql exit=$rc")
    echo "  FAIL  $name (psql error)"
    return
  fi
  if echo "$actual" | grep -qF "$expected"; then
    PASS=$((PASS+1))
    echo "  PASS  $name"
  else
    FAIL=$((FAIL+1))
    FAILURES+=("$name: expected substring '$expected', got: $actual")
    echo "  FAIL  $name"
    echo "        expected → *${expected}*"
    echo "        actual   → ${actual}"
  fi
}

# run_expect_error <name> <expected_substring> <sql>
# Asserts that running the SQL via stdin results in an error containing
# the expected substring. ON_ERROR_STOP removed so the error is captured.
run_expect_error() {
  local name="$1" expected="$2"; shift 2
  local actual
  actual="$(echo "$*" | psql -q -A "$URL" 2>&1 1>/dev/null)"
  local rc=$?
  local combined
  combined="$(echo "$*" | psql -A "$URL" 2>&1)"
  if echo "$combined" | grep -qF "$expected"; then
    PASS=$((PASS+1))
    echo "  PASS  $name"
  else
    FAIL=$((FAIL+1))
    FAILURES+=("$name: expected substring '$expected', got: $combined")
    echo "  FAIL  $name"
  fi
}

cleanup() {
  psql -q -t -A "$URL" >/dev/null 2>&1 <<SQL
-- Bound cleanup: this test client + 2099-* test fixtures only.
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
echo "Phase 2 / Slice #2 — tire RPC smoke tests"
echo "=========================================================="
echo "[test client] profile=$TIRE_TEST_PROFILE_ID  client=$TIRE_TEST_CLIENT_ID"
echo ""

echo "--- pre-test cleanup ---"
cleanup
echo "  done"
echo ""

# ===========================================================================
# --- 004: get_public_tire_booking_slots ---
# ===========================================================================
echo "--- migration 004 (public RPC) ---"

run_query "T1: anon get_public_tire_booking_slots returns 0 rows on TEST_DATE" \
    "0" \
    "SET ROLE anon; SELECT count(*) FROM public.get_public_tire_booking_slots('$TEST_DATE'); RESET ROLE;"

# T2: verify that ONLY metadata columns exist on the RETURNS TABLE shape.
#     We test this by inspecting the function's pg_proc.proargnames — without
#     running it (which would be empty for a fresh-test date).
run_query "T2: function return cols contain id, booking_date, start_time, end_time, status (excluding p_target_date IN)" \
    "id,booking_date,start_time,end_time,status" \
    "SELECT string_agg(name, ',' ORDER BY rn) AS cols FROM (
       WITH par AS (
         SELECT unnest(proargnames) AS name, generate_series(1, 100) AS rn
         FROM pg_proc WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
           AND proname='get_public_tire_booking_slots'
       )
       SELECT name, rn FROM par WHERE rn > 1
     ) sub;"

run_query "T3: function arg names do NOT contain client_name / phone / car_model / plate_number / signature_data" \
    "not_in_args" \
    "SELECT CASE
       WHEN NOT EXISTS (
         SELECT 1 FROM pg_proc
         WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
           AND proname='get_public_tire_booking_slots'
           AND proargnames::text ~ 'client_name|phone|car_model|plate_number|signature_data|services'
       ) THEN 'not_in_args' ELSE 'leaked' END;"

run_query "T4: anon call works on real data date 2026-08-27 (4 rows expected)" \
    "4" \
    "SET ROLE anon; SELECT count(*) FROM public.get_public_tire_booking_slots('2026-08-27'); RESET ROLE;"

echo ""
echo "--- pre-T5 setup: insert test bookings ---"
psql -q -t -A "$URL" >/dev/null 2>&1 <<SQL
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
  'Test Slot Car',
  'Т001Т001',
  '$TEST_DATE'::date,
  '10:00:00'::time, 60, '[]'::jsonb, 1000,
  'ОЖИДАЕТ', false, 'online', '$TIRE_TEST_PROFILE_ID'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tire_bookings
  WHERE client_id='$TIRE_TEST_CLIENT_ID'
    AND booking_date='$TEST_DATE'::date
    AND start_time='10:00:00'::time
);
SQL
B1=$(psql -q -t -A "$URL" -c "SELECT id FROM public.tire_bookings WHERE client_id='$TIRE_TEST_CLIENT_ID' AND booking_date='$TEST_DATE'::date AND start_time='10:00:00'::time LIMIT 1")
echo "  [setup] B1=$B1"

# ===========================================================================
# --- 005/006: cancel + UNIQUE INDEX ---
# ===========================================================================
echo ""
echo "--- migration 005 (cancel RPC) + 006 (UNIQUE INDEX) ---"

# T5: cancel_own_tire_booking with non-existent tire_booking_id → NOT_FOUND_OR_NOT_OWNED.
run_expect_error "T5: cancel_own_tire_booking(fake_uuid) → NOT_FOUND_OR_NOT_OWNED" \
    "NOT_FOUND_OR_NOT_OWNED" \
    "SET ROLE service_role;
     SELECT public.cancel_own_tire_booking(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '$TIRE_TEST_PROFILE_ID'::uuid,
       't5-test'
     );
     RESET ROLE;"

# T6: cancel own booking → already_cancelled=false, status changes to ОТМЕНЕНО.
run_query "T6: cancel own booking B1 → already_cancelled=false" \
    "\"already_cancelled\": false" \
    "SET ROLE service_role;
     SELECT public.cancel_own_tire_booking(
       '$B1'::uuid,
       '$TIRE_TEST_PROFILE_ID'::uuid,
       't6-test'
     );
     RESET ROLE;"

# T7: double-cancel on B1 → already_cancelled=true (idempotency primary path).
run_query "T7: double-cancel B1 → already_cancelled=true" \
    "\"already_cancelled\": true" \
    "SET ROLE service_role;
     SELECT public.cancel_own_tire_booking(
       '$B1'::uuid,
       '$TIRE_TEST_PROFILE_ID'::uuid,
       't7-test'
     );
     RESET ROLE;"

# T8: anon cancel → permission denied.
run_expect_error "T8: anon cancel_own_tire_booking → permission denied" \
    "permission denied" \
    "SET ROLE anon;
     SELECT public.cancel_own_tire_booking(
       '$B1'::uuid,
       '$TIRE_TEST_PROFILE_ID'::uuid,
       't8-test'
     );
     RESET ROLE;"

# T9 (requires B2 in status ГОТОВО): set up + expect CANNOT_CANCEL_STATUS_ГОТОВО.
psql -q -t -A "$URL" >/dev/null 2>&1 <<SQL
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
  'Test Slot Car',
  'Т002Т002',
  '$TEST_DATE'::date,
  '11:00:00'::time, 60, '[]'::jsonb, 1000,
  'ГОТОВО', false, 'online', '$TIRE_TEST_PROFILE_ID'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tire_bookings
  WHERE client_id='$TIRE_TEST_CLIENT_ID'
    AND booking_date='$TEST_DATE'::date
    AND start_time='11:00:00'::time
);
SQL
B2=$(psql -q -t -A "$URL" -c "SELECT id FROM public.tire_bookings WHERE client_id='$TIRE_TEST_CLIENT_ID' AND booking_date='$TEST_DATE'::date AND start_time='11:00:00'::time LIMIT 1")
echo "  [setup B2]=$B2 (status ГОТОВО)"

run_expect_error "T9: cancel B2 (status ГОТОВО) → CANNOT_CANCEL_STATUS_ГОТОВО" \
    "CANNOT_CANCEL_STATUS_ГОТОВО" \
    "SET ROLE service_role;
     SELECT public.cancel_own_tire_booking(
       '$B2'::uuid,
       '$TIRE_TEST_PROFILE_ID'::uuid,
       't9-test'
     );
     RESET ROLE;"

# T10: UNIQUE INDEX race guard — duplicate INSERT into booking_cancellations
#      should fail with 23505 unique_violation.
run_expect_error "T10: UNIQUE INDEX race guard — duplicate INSERT → 23505" \
    "duplicate key value violates unique constraint" \
    "SET ROLE service_role;
     INSERT INTO public.booking_cancellations (client_id, tire_booking_id, cancelled_at, reason)
     VALUES ('$TIRE_TEST_CLIENT_ID', '$B1', now(), 't10-duplicate-attempt');
     RESET ROLE;"

# Setup for block test: insert B3, B4, B5 in ОЖИДАЕТ.
psql -q -t -A "$URL" >/dev/null 2>&1 <<SQL
INSERT INTO public.tire_bookings (
  id, client_id, client_name, phone, car_model, plate_number,
  booking_date, start_time, estimated_duration, services, total_price,
  status, is_paid, booking_source, created_by_profile_id
)
SELECT gen_random_uuid(), '$TIRE_TEST_CLIENT_ID', '[TEST ONLY] Tire Test Client',
       '+79991234501', 'Test Slot Car', 'Т003Т003',
       '$TEST_DATE'::date, '12:00:00'::time, 60, '[]'::jsonb, 1000,
       'ОЖИДАЕТ', false, 'online', '$TIRE_TEST_PROFILE_ID'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tire_bookings
  WHERE client_id='$TIRE_TEST_CLIENT_ID' AND booking_date='$TEST_DATE'::date AND start_time='12:00:00'::time
);
INSERT INTO public.tire_bookings (
  id, client_id, client_name, phone, car_model, plate_number,
  booking_date, start_time, estimated_duration, services, total_price,
  status, is_paid, booking_source, created_by_profile_id
)
SELECT gen_random_uuid(), '$TIRE_TEST_CLIENT_ID', '[TEST ONLY] Tire Test Client',
       '+79991234501', 'Test Slot Car', 'Т004Т004',
       '$TEST_DATE'::date, '13:00:00'::time, 60, '[]'::jsonb, 1000,
       'ОЖИДАЕТ', false, 'online', '$TIRE_TEST_PROFILE_ID'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tire_bookings
  WHERE client_id='$TIRE_TEST_CLIENT_ID' AND booking_date='$TEST_DATE'::date AND start_time='13:00:00'::time
);
INSERT INTO public.tire_bookings (
  id, client_id, client_name, phone, car_model, plate_number,
  booking_date, start_time, estimated_duration, services, total_price,
  status, is_paid, booking_source, created_by_profile_id
)
SELECT gen_random_uuid(), '$TIRE_TEST_CLIENT_ID', '[TEST ONLY] Tire Test Client',
       '+79991234501', 'Test Slot Car', 'Т005Т005',
       '$TEST_DATE'::date, '14:00:00'::time, 60, '[]'::jsonb, 1000,
       'ОЖИДАЕТ', false, 'online', '$TIRE_TEST_PROFILE_ID'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tire_bookings
  WHERE client_id='$TIRE_TEST_CLIENT_ID' AND booking_date='$TEST_DATE'::date AND start_time='14:00:00'::time
);
SQL
B3=$(psql -q -t -A "$URL" -c "SELECT id FROM public.tire_bookings WHERE client_id='$TIRE_TEST_CLIENT_ID' AND booking_date='$TEST_DATE'::date AND start_time='12:00:00'::time LIMIT 1")
B4=$(psql -q -t -A "$URL" -c "SELECT id FROM public.tire_bookings WHERE client_id='$TIRE_TEST_CLIENT_ID' AND booking_date='$TEST_DATE'::date AND start_time='13:00:00'::time LIMIT 1")
B5=$(psql -q -t -A "$URL" -c "SELECT id FROM public.tire_bookings WHERE client_id='$TIRE_TEST_CLIENT_ID' AND booking_date='$TEST_DATE'::date AND start_time='14:00:00'::time LIMIT 1")
echo "  [setup] B3=$B3  B4=$B4  B5=$B5"

# Currently we have: T6 = 1 cancellation event for B1.
# Cancel B3 → 2nd event. Cancel B4 → 3rd event → BLOCK triggered.
run_query "T11-setup-A: cancel B3 → 2nd cancellation event (no block yet)" \
    "\"blocked\": false" \
    "SET ROLE service_role;
     SELECT public.cancel_own_tire_booking('$B3'::uuid, '$TIRE_TEST_PROFILE_ID'::uuid, 't11a-test');
     RESET ROLE;"

run_query "T11: cancel B4 → 3rd cancellation event → blocked=true, blocked_until=today+30" \
    "\"blocked\": true" \
    "SET ROLE service_role;
     SELECT public.cancel_own_tire_booking('$B4'::uuid, '$TIRE_TEST_PROFILE_ID'::uuid, 't11-test');
     RESET ROLE;"

# T12: blocked_until row exists & is approximately today+30
TODAY_PLUS_30=$(date -u -v+30d +%Y-%m-%d 2>/dev/null || date -u -d "+30 days" +%Y-%m-%d)
run_query "T12: clients.online_booking_blocked_until = today + 30 ($TODAY_PLUS_30)" \
    "$TODAY_PLUS_30" \
    "SELECT online_booking_blocked_until::text FROM public.clients
     WHERE id='$TIRE_TEST_CLIENT_ID';"

# T13: 4th cancel inside active block → blocked=false, blocked_until unchanged.
run_query "T13: 4th cancel B5 → blocked=false (idempotent guard), blocked_until unchanged" \
    "\"blocked\": false" \
    "SET ROLE service_role;
     SELECT public.cancel_own_tire_booking('$B5'::uuid, '$TIRE_TEST_PROFILE_ID'::uuid, 't13-test');
     RESET ROLE;"

# T14: blocked_until still equals today + 30 (NOT extended).
run_query "T14: blocked_until row unchanged after re-cancel" \
    "$TODAY_PLUS_30" \
    "SELECT online_booking_blocked_until::text FROM public.clients
     WHERE id='$TIRE_TEST_CLIENT_ID';"

# T15: ownership — cancel somebody else's booking (not in our test client).
FOREIGN_ID=$(psql -q -t -A "$URL" -c "
  SELECT id FROM public.tire_bookings
  WHERE client_id IS DISTINCT FROM '$TIRE_TEST_CLIENT_ID'
  LIMIT 1;")
echo "  [T15 setup] foreign booking id=$FOREIGN_ID"
run_expect_error "T15: cancel foreign booking (other client's tire_booking_id) → NOT_FOUND_OR_NOT_OWNED" \
    "NOT_FOUND_OR_NOT_OWNED" \
    "SET ROLE service_role;
     SELECT public.cancel_own_tire_booking(
       '$FOREIGN_ID'::uuid,
       '$TIRE_TEST_PROFILE_ID'::uuid,
       't15-foreign'
     );
     RESET ROLE;"

echo ""
echo "--- post-test cleanup ---"
cleanup
echo "  done"
echo ""

echo "=========================================================="
echo "RESULT: PASS=$PASS  FAIL=$FAIL"
echo "=========================================================="

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "FAILURES:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
