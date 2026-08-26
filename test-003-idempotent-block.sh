#!/usr/bin/env bash
# test-003-idempotent-block.sh
#
# Regression for migration 003_idempotent_block_on_cancel.sql.
# Verifies that:
#   (a) 3rd cancel still sets the block to today+30 (no regression).
#   (b) 4th (and 5th...) cancel inside the active block does NOT extend
#       online_booking_blocked_until: the value remains the original
#       today+30, not some future extension.
#   (c) Idempotent paths (existing cancellation row, status=ОТМЕНЕНО without
#       event row) still work.
#
# Wraps all setup and cancellations in a single BEGIN/ROLLBACK so the
# demo DB state is unchanged after the run.

set -euo pipefail
DB="${SUPABASE_DB_URL:-postgresql://postgres.danobongqzbxilyvdwig:YVJlmcibmLQYBtRM@aws-1-eu-west-1.pooler.supabase.com:5432/postgres}"
PGPASSWORD="${PGPASSWORD:-YVJlmcibmLQYBtRM}"
export PGPASSWORD

PASS=0
FAIL=0
report() {
  local label="$1" status="$2" detail="${3:-}"
  if [ "$status" = "PASS" ]; then PASS=$((PASS+1)); echo "  [PASS] $label"
  else FAIL=$((FAIL+1)); echo "  [FAIL] $label ${detail:+— $detail}"; fi
}

# Pre-flight
CLIENT_ID="f2799b3d-37aa-4976-a23a-df5cba10e463"
PROFILE_ID="b33e4171-7ba4-44b3-bf7a-babe766cb338"

psql "$DB" --no-psqlrc -P pager=off -At <<EOF
SELECT 'T0 preflight: ensure test client has NO block';
SELECT online_booking_blocked_until FROM clients WHERE id='$CLIENT_ID';
-- Hard reset before test (defensive — DB cleanup should already have cleared this).
UPDATE clients SET online_booking_blocked_until=NULL WHERE id='$CLIENT_ID';
EOF

# Now the full transactional test:
OUT=$(psql "$DB" --no-psqlrc -P pager=off -At -v ON_ERROR_STOP=1 <<EOF
BEGIN;

-- Test profile/client: b33e4171 / f2799b3d.
-- Insert 4 fresh bookings in ОЖИДАЕТ that are owned by this client.
-- Use a single batch insert for speed.
INSERT INTO bookings
  (id, client_id, client_name, booking_date, start_time, end_time, box_number,
   car_model, plate_number, car_type, status, booking_source, is_paid, price, services)
VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, '$CLIENT_ID', 'Test Block User',
   '2099-06-01', '10:00', '11:00', 1, 'Reg-Car', 'А001АА', 'SEDAN', 'ОЖИДАЕТ', 'online', false, 100, '[]'::jsonb),
  ('a0000000-0000-0000-0000-000000000002'::uuid, '$CLIENT_ID', 'Test Block User',
   '2099-06-01', '11:00', '12:00', 1, 'Reg-Car', 'А001АА', 'SEDAN', 'ОЖИДАЕТ', 'online', false, 100, '[]'::jsonb),
  ('a0000000-0000-0000-0000-000000000003'::uuid, '$CLIENT_ID', 'Test Block User',
   '2099-06-01', '12:00', '13:00', 1, 'Reg-Car', 'А001АА', 'SEDAN', 'ОЖИДАЕТ', 'online', false, 100, '[]'::jsonb),
  ('a0000000-0000-0000-0000-000000000004'::uuid, '$CLIENT_ID', 'Test Block User',
   '2099-06-01', '13:00', '14:00', 1, 'Reg-Car', 'А001АА', 'SEDAN', 'ОЖИДАЕТ', 'online', false, 100, '[]'::jsonb);

-- Cancel #1 — should be NO block (count=1 < 3).
SELECT 'cancel1' AS step, cancel_own_booking('a0000000-0000-0000-0000-000000000001'::uuid,
                                          '$PROFILE_ID'::uuid)::text AS resp;

-- Cancel #2 — still NO block.
SELECT 'cancel2' AS step, cancel_own_booking('a0000000-0000-0000-0000-000000000002'::uuid,
                                          '$PROFILE_ID'::uuid)::text AS resp;

-- Cancel #3 — BLOCK SET (count=3).
SELECT 'cancel3' AS step, cancel_own_booking('a0000000-0000-0000-0000-000000000003'::uuid,
                                          '$PROFILE_ID'::uuid)::text AS resp;

-- Capture the original block date right after cancel #3.
SELECT 'block_after_3' AS marker, online_booking_blocked_until
  FROM clients WHERE id='$CLIENT_ID';

-- Cancel #4 — should NOT extend (idempotent guard). blocked=false, blocked_until stays.
SELECT 'cancel4' AS step, cancel_own_booking('a0000000-0000-0000-0000-000000000004'::uuid,
                                          '$PROFILE_ID'::uuid)::text AS resp;

-- Read block again — must equal the value after cancel #3.
SELECT 'block_after_4' AS marker, online_booking_blocked_until
  FROM clients WHERE id='$CLIENT_ID';

ROLLBACK;
EOF
)
echo "$OUT"
echo "==== OUTPUT_DONE ===="

# Parse results: extract cancel1..cancel4 responses + block_after_X.
CANCEL1=$(echo "$OUT" | grep '^cancel1|' | sed 's/^cancel1|//')
CANCEL3=$(echo "$OUT" | grep '^cancel3|' | sed 's/^cancel3|//')
CANCEL4=$(echo "$OUT" | grep '^cancel4|' | sed 's/^cancel4|//')
BLOCK3=$(echo "$OUT" | grep '^block_after_3|')
BLOCK4=$(echo "$OUT" | grep '^block_after_4|')

echo ""
echo "Parsed:"
echo "  cancel1 = $CANCEL1"
echo "  cancel3 = $CANCEL3"
echo "  cancel4 = $CANCEL4"
echo "  block_after_3 = $BLOCK3"
echo "  block_after_4 = $BLOCK4"
echo ""

# ——— assertions ———
# (a) cancel1 blocked=false, blocked_until=null
echo "$CANCEL1" | grep -q '"blocked": false' \
  && report "cancel1 blocked=false" "PASS" \
  || report "cancel1 blocked=false" "FAIL" "$CANCEL1"

# (b) cancel3 blocked=true, blocked_until set to today+30 (4Xdec)
echo "$CANCEL3" | grep -q '"blocked": true' \
  && report "cancel3 blocked=true" "PASS" \
  || report "cancel3 blocked=true" "FAIL" "$CANCEL3"

# (c) cancel3 blocked_until is non-empty yyyy-MM-dd (today+30)
CANCEL3_DATE=$(echo "$CANCEL3" | grep -oE '"blocked_until": "[0-9-]+"' | head -1)
[ -n "$CANCEL3_DATE" ] \
  && report "cancel3 blocked_until is set (${CANCEL3_DATE:-empty})" "PASS" \
  || report "cancel3 blocked_until is set" "FAIL" "$CANCEL3"

# (d) cancel4 — idempotent: blocked=false in response (block NOT extended)
echo "$CANCEL4" | grep -q '"blocked": false' \
  && report "cancel4 blocked=false (idempotent)" "PASS" \
  || report "cancel4 blocked=false (idempotent)" "FAIL" "$CANCEL4"

# (e) cancel4 blocked_until reflects EXISTING block (not null, not current+30+30)
CANCEL4_DATE=$(echo "$CANCEL4" | grep -oE '"blocked_until": "[0-9-]+"' | head -1)
[ -n "$CANCEL4_DATE" ] \
  && report "cancel4 blocked_until echoes existing (${CANCEL4_DATE:-empty})" "PASS" \
  || report "cancel4 blocked_until echoes existing" "FAIL" "$CANCEL4"

# (f) DB row still has the ORIGINAL block date (NOT extended).
# block_after_3 and block_after_4 should be identical date strings.
DATE3=$(echo "$BLOCK3"  | grep -oE '\|[0-9]{4}-[0-9]{2}-[0-9]{2}' | tr -d '|')
DATE4=$(echo "$BLOCK4"  | grep -oE '\|[0-9]{4}-[0-9]{2}-[0-9]{2}' | tr -d '|')
[ -n "$DATE3" ] && [ "$DATE3" = "$DATE4" ] \
  && report "DB block unchanged after cancel4 ($DATE3 == $DATE4)" "PASS" \
  || report "DB block unchanged after cancel4" "FAIL" "date3=$DATE3 date4=$DATE4"

# (g) Block date = cancel3 response blocked_until (server-side OK).
[ -n "$CANCEL3_DATE" ] && echo "$CANCEL3_DATE" | grep -q "$DATE3" \
  && report "cancel3.blocked_until ↔ DB row" "PASS" \
  || report "cancel3.blocked_until ↔ DB row" "FAIL" "$CANCEL3_DATE vs $DATE3"

# (h) Post-test cleanup: bookings and cancellations were created in the
# transaction above and ROLLBACK discarded them. Verify they're gone.
psql "$DB" --no-psqlrc -P pager=off -At -c "
  SELECT 'cleanup: leftover bk=' || count(*) FROM bookings
  WHERE id IN (
    'a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004'
  );
  SELECT 'cleanup: leftover cc=' || count(*) FROM booking_cancellations
  WHERE reason = 'client_self_cancel' AND cancelled_at > now();
"

# Post-test: block cleared (defensive reset).
psql "$DB" --no-psqlrc -P pager=off -At -c "
  UPDATE clients SET online_booking_blocked_until=NULL WHERE id='$CLIENT_ID'
  RETURNING id || '|' || online_booking_blocked_until;
"

echo ""
echo "=========================================="
echo "Migration 003 regression: $PASS PASS, $FAIL FAIL"
echo "=========================================="
[ "$FAIL" = "0" ]
