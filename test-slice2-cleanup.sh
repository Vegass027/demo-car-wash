#!/bin/bash
# test-slice2-cleanup.sh
#
# Standalone pre-test cleanup for Slice #2 test fixtures.
#
# Bounded to migration 007's Tire Test Client only.
# Removes phantom 2099-* tire bookings and their cancellations,
# then clears that test client's online_booking_blocked_until.
#
# NEVER operates on real clients (Test Owner / Test Admin / Test Client
# / live Telegram 7295309649). This script is the "manual reset"
# Slice #1 §5.7 cleanup policy explicitly asks for.
#
# Run from /Users/dmitriy/Downloads/demo-car-wash:
#   bash test-slice2-cleanup.sh

set -uo pipefail

PASSWORD="${PGPASSWORD:-YVJlmcibmLQYBtRM}"
URL="postgresql://postgres.danobongqzbxilyvdwig:${PASSWORD}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?options=-c%20project%3Dpostgres"
TIRE_TEST_CLIENT_ID='2c89868f-e85b-44cb-825b-896c3f77c474'

echo "[test-slice2-cleanup] bounded to test client $TIRE_TEST_CLIENT_ID"

psql "$URL" <<SQL
-- Bound cleanup for migration 007's Tire Test Client.
DELETE FROM public.booking_cancellations
  WHERE client_id = '$TIRE_TEST_CLIENT_ID';
DELETE FROM public.tire_bookings
  WHERE client_id = '$TIRE_TEST_CLIENT_ID';
UPDATE public.clients
  SET online_booking_blocked_until = NULL
  WHERE id = '$TIRE_TEST_CLIENT_ID';
SQL

echo "[test-slice2-cleanup] done"
