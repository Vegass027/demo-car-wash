#!/usr/bin/env bash
# test-slice1-rpcs.sh
# Slice #1 RPC smoke verification.
#
# Setup env: export PGPASSWORD and DB.
#   PGPASSWORD=... DB="postgresql://postgres.danobongqzbxilyvdwig:...@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
#
# Or inline (demo-car-wash test):
#   PGPASSWORD="YVJlmcibmLQYBtRM" \
#     DB="postgresql://postgres.danobongqzbxilyvdwig:YVJlmcibmLQYBtRM@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" \
#     ./test-slice1-rpcs.sh
#
# Exits non-zero on any failure. Prints `[Txx]` PASS / FAIL per assertion.

set -euo pipefail
: "${DB:?Must set DB env (e.g. postgres://user:pass@host:port/postgres)}"
: "${PGPASSWORD:?Must set PGPASSWORD env}"

PASS=0
FAIL=0
report() {
  local label="$1" status="$2"
  echo "[$label] $status"
  if [ "$status" = "PASS" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
}

# ----------------------------------------------------------------------------
# T1-T3: anon can call public slot RPCs
# ----------------------------------------------------------------------------
echo "[T1] anon can call get_public_booking_slots('2026-08-26')"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "SET ROLE anon; SELECT count(*) FROM public.get_public_booking_slots('2026-08-26'::date);" || echo "ERR")
[ "$RESULT" -ge 0 ] 2>/dev/null && report "T1" "PASS" || report "T1" "FAIL ($RESULT)"

echo "[T2] anon can call get_public_closed_boxes('2026-08-23')"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "SET ROLE anon; SELECT count(*) FROM public.get_public_closed_boxes('2026-08-23'::date);" || echo "ERR")
[ "$RESULT" -eq 1 ] && report "T2" "PASS" || report "T2" "FAIL ($RESULT)"

echo "[T3] anon can call get_public_closed_boxes('2099-01-01') — empty"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "SET ROLE anon; SELECT count(*) FROM public.get_public_closed_boxes('2099-01-01'::date);" || echo "ERR")
[ "$RESULT" -eq 0 ] && report "T3" "PASS" || report "T3" "FAIL ($RESULT)"

# ----------------------------------------------------------------------------
# T4-T5: result column counts (3 each, no PII)
# ----------------------------------------------------------------------------
echo "[T4] get_public_booking_slots result schema = 3 columns"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "SELECT pg_get_function_result(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='get_public_booking_slots';")
EXPECTED="TABLE(start_time time without time zone, end_time time without time zone, box_number integer)"
[ "$RESULT" = "$EXPECTED" ] && report "T4" "PASS" || report "T4" "FAIL ($RESULT)"

echo "[T5] get_public_closed_boxes result schema = 3 columns"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "SELECT pg_get_function_result(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='get_public_closed_boxes';")
EXPECTED="TABLE(box_number integer, closed_date date, open_hours integer[])"
[ "$RESULT" = "$EXPECTED" ] && report "T5" "PASS" || report "T5" "FAIL ($RESULT)"

# ----------------------------------------------------------------------------
# T6-T7: audit public RPCs (prosecdef, owner, config, grants)
# ----------------------------------------------------------------------------
echo "[T6] public RPCs audit: prosecdef=true provolatile=s owner=postgres search_path set"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SELECT proname || ':' || prosecdef::text || ':' || provolatile::text || ':' || pg_get_userbyid(proowner)::text
FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('get_public_booking_slots','get_public_closed_boxes')
ORDER BY proname;")
EXPECTED=$'get_public_booking_slots:true:s:postgres\nget_public_closed_boxes:true:s:postgres'
[ "$RESULT" = "$EXPECTED" ] && report "T6" "PASS" || report "T6" "FAIL ($RESULT)"

echo "[T7] public RPCs proconfig contains search_path=pg_catalog,public"
FAILS_T7=$FAIL
for fn in get_public_booking_slots get_public_closed_boxes; do
  RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "SELECT proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='$fn';")
  if [[ "$RESULT" != *"search_path=pg_catalog, public"* ]]; then
    report "T7" "FAIL ($fn proconfig=$RESULT)"
    break
  fi
done
[ "$FAIL" = "$FAILS_T7" ] && report "T7" "PASS"

# ----------------------------------------------------------------------------
# T8: cancel RPC existence + ACL
# ----------------------------------------------------------------------------
echo "[T8] cancel_own_booking: owner=postgres, only service_role (no anon/authenticated/PUBLIC)"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SELECT pg_get_userbyid(proowner) || '|' || proacl::text
FROM pg_proc
WHERE pronamespace='public'::regnamespace AND proname='cancel_own_booking';")
EXPECTED="postgres|{postgres=X/postgres,service_role=X/postgres}"
[ "$RESULT" = "$EXPECTED" ] && report "T8" "PASS" || report "T8" "FAIL ($RESULT)"

# ----------------------------------------------------------------------------
# T9: UNIQUE constraint exists
# ----------------------------------------------------------------------------
echo "[T9] UNIQUE constraint booking_cancellations_booking_unique"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='public.booking_cancellations'::regclass
  AND conname='booking_cancellations_booking_unique';")
[ "$RESULT" = "UNIQUE (booking_id)" ] && report "T9" "PASS" || report "T9" "FAIL ($RESULT)"

# ----------------------------------------------------------------------------
# T10-T11-T11b: idempotent cancel
# ----------------------------------------------------------------------------
echo "[T10+T11+T11b] double cancel idempotent — race-safe via FOR UPDATE + UNIQUE"
FIXTURE_ID=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SELECT b.id FROM bookings b JOIN clients c ON c.id=b.client_id
WHERE b.status='ОЖИДАЕТ' AND c.profile_id IS NOT NULL LIMIT 1;")
FIXTURE_PROFILE=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SELECT c.profile_id FROM bookings b JOIN clients c ON c.id=b.client_id
WHERE b.id='$FIXTURE_ID';")

# Capture only the SELECT outputs via subquery trick to filter psql header noise.
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -v ON_ERROR_STOP=1 <<EOF
BEGIN;
SET ROLE service_role;
SELECT 'first=' || (cancel_own_booking('$FIXTURE_ID'::uuid, '$FIXTURE_PROFILE'::uuid)::text);
SELECT 'second=' || (cancel_own_booking('$FIXTURE_ID'::uuid, '$FIXTURE_PROFILE'::uuid)::text);
SELECT 'count=' || (SELECT COUNT(*)::int FROM booking_cancellations WHERE booking_id='$FIXTURE_ID'::uuid);
ROLLBACK;
EOF
)

if echo "$RESULT" | grep -q '"already_cancelled": false' \
   && echo "$RESULT" | grep -q '"already_cancelled": true' \
   && echo "$RESULT" | grep -q '^count=1$' ; then
  report "T10-T11-T11b" "PASS"
else
  report "T10-T11-T11b" "FAIL"
  echo "  ---- raw output ----"
  echo "$RESULT"
fi

# ----------------------------------------------------------------------------
# T12: cancel ГОТОВО → CANNOT_CANCEL_STATUS_ГОТОВО
# ----------------------------------------------------------------------------
echo "[T12] cancel ГОТОВО booking → expected raise"
GOTOVO_ID=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SELECT b.id FROM bookings b JOIN clients c ON c.id=b.client_id
WHERE b.status='ГОТОВО' AND c.profile_id IS NOT NULL LIMIT 1;")
GOTOVO_PROFILE=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SELECT c.profile_id FROM bookings b JOIN clients c ON c.id=b.client_id
WHERE b.id='$GOTOVO_ID';")
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SET ROLE service_role; SELECT cancel_own_booking('$GOTOVO_ID'::uuid, '$GOTOVO_PROFILE'::uuid);" 2>&1 || true)
if [[ "$RESULT" == *"CANNOT_CANCEL_STATUS_ГОТОВО"* ]]; then
  report "T12" "PASS"
else
  report "T12" "FAIL ($RESULT)"
fi

# ----------------------------------------------------------------------------
# T13: random uuid → NOT_FOUND_OR_NOT_OWNED
# ----------------------------------------------------------------------------
echo "[T13] random uuid → expected raise"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SET ROLE service_role; SELECT cancel_own_booking('00000000-0000-0000-0000-000000000999'::uuid, '11111111-1111-1111-1111-111111111111'::uuid);" 2>&1 || true)
if [[ "$RESULT" == *"NOT_FOUND_OR_NOT_OWNED"* ]]; then
  report "T13" "PASS"
else
  report "T13" "FAIL ($RESULT)"
fi

# ----------------------------------------------------------------------------
# T14: wrong profile_id → NOT_FOUND_OR_NOT_OWNED
# ----------------------------------------------------------------------------
echo "[T14] wrong profile_id → expected raise"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SET ROLE service_role; SELECT cancel_own_booking('c9d26792-65f8-4490-89b4-e6130ff25337'::uuid, '99999999-9999-9999-9999-999999999999'::uuid);" 2>&1 || true)
if [[ "$RESULT" == *"NOT_FOUND_OR_NOT_OWNED"* ]]; then
  report "T14" "PASS"
else
  report "T14" "FAIL ($RESULT)"
fi

# ----------------------------------------------------------------------------
# T16+T18: anon and authenticated cannot call cancel_own_booking
# ----------------------------------------------------------------------------
echo "[T16] anon role permission"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SET ROLE anon; SELECT cancel_own_booking('c9d26792-65f8-4490-89b4-e6130ff25337'::uuid, 'b33e4171-7ba4-44b3-bf7a-babe766cb338'::uuid);" 2>&1 || true)
[[ "$RESULT" == *"permission denied for function cancel_own_booking"* ]] && report "T16" "PASS" || report "T16" "FAIL ($RESULT)"

echo "[T18] authenticated role permission"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SET ROLE authenticated; SELECT cancel_own_booking('c9d26792-65f8-4490-89b4-e6130ff25337'::uuid, 'b33e4171-7ba4-44b3-bf7a-babe766cb338'::uuid);" 2>&1 || true)
[[ "$RESULT" == *"permission denied for function cancel_own_booking"* ]] && report "T18" "PASS" || report "T18" "FAIL ($RESULT)"

# ----------------------------------------------------------------------------
# T19+T20: status ОТМЕНЕНО без event row → fallback already_cancelled, no insert
# ----------------------------------------------------------------------------
echo "[T19+T20] fallback path on inconsistent state"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -v ON_ERROR_STOP=1 <<EOF
BEGIN;
SET ROLE service_role;
UPDATE bookings SET status='ОТМЕНЕНО', cancel_comment='manual_t19' WHERE id='$FIXTURE_ID';
SELECT 'call=' || (cancel_own_booking('$FIXTURE_ID'::uuid, '$FIXTURE_PROFILE'::uuid)::text);
SELECT 'count=' || (SELECT COUNT(*)::int FROM booking_cancellations WHERE booking_id='$FIXTURE_ID'::uuid);
ROLLBACK;
EOF
)
if echo "$RESULT" | grep -q '"already_cancelled": true' \
   && echo "$RESULT" | grep -q '^count=0$'; then
  report "T19-T20" "PASS"
else
  report "T19-T20" "FAIL"
  echo "  ---- raw output ----"
  echo "$RESULT"
fi

# ----------------------------------------------------------------------------
# T22: preflight constraint exists
# ----------------------------------------------------------------------------
echo "[T22] preflight constraint_exists=true"
RESULT=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='booking_cancellations_booking_unique' AND conrelid='public.booking_cancellations'::regclass);")
[ "$RESULT" = "t" ] && report "T22" "PASS" || report "T22" "FAIL ($RESULT)"

# T23 already covered by T9

# ----------------------------------------------------------------------------
# T24: duplicate insert → 23505 unique_violation
# ----------------------------------------------------------------------------
echo "[T24] UNIQUE constraint enforces single event per booking_id"
# Step 1: insert first event
FIRST=$(psql "$DB" --no-psqlrc -P pager=off -At -c "
INSERT INTO booking_cancellations (client_id, booking_id, cancelled_at, reason)
VALUES ('b1000000-0000-0000-0000-000000000001'::uuid, 'c9d26792-65f8-4490-89b4-e6130ff25337'::uuid, now(), 'unique_test_t24_v1')
RETURNING id;" 2>&1 || true)
# Cleanup first row before second insert to avoid setup-asymmetric state
psql "$DB" --no-psqlrc -P pager=off -At -c "
DELETE FROM booking_cancellations WHERE reason LIKE 'unique_test_t24%';" >/dev/null 2>&1

# Step 2: re-insert with same booking_id within same connection — must hit constraint
# We use a 2-step subtransaction so the first insert persists, then the second insert hits the constraint.
SECOND=$(psql "$DB" --no-psqlrc -P pager=off -v ON_ERROR_STOP=0 <<EOF 2>&1 || true
BEGIN;
INSERT INTO booking_cancellations (client_id, booking_id, cancelled_at, reason)
VALUES ('b1000000-0000-0000-0000-000000000001'::uuid, 'c9d26792-65f8-4490-89b4-e6130ff25337'::uuid, now(), 'unique_test_t24_v1');
INSERT INTO booking_cancellations (client_id, booking_id, cancelled_at, reason)
VALUES ('b1000000-0000-0000-0000-000000000001'::uuid, 'c9d26792-65f8-4490-89b4-e6130ff25337'::uuid, now(), 'unique_test_t24_v2');
ROLLBACK;
EOF
)
if [[ "$SECOND" == *"duplicate key value violates unique constraint"* ]]; then
  report "T24" "PASS"
else
  report "T24" "FAIL ($SECOND)"
fi

# ----------------------------------------------------------------------------
# Final
# ----------------------------------------------------------------------------
echo ""
echo "==================================================="
echo "Slice #1 RPC smoke: $PASS pass, $FAIL fail"
echo "==================================================="
[ "$FAIL" = "0" ]
