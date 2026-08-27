-- ============================================================================
-- Migration: 015_revoke_add_worker_earnings_od11.sql
-- ============================================================================
-- OD#11 consolidation: handleMarkAsReady no longer calls
-- addWorkerEarningsForBooking (lib/api/workers.ts) directly. The function
-- was fully removed in commit b005839. Earnings are now exclusively
-- computed and persisted via /api/staff?action=mark-staff-ready server-side
-- (api/_lib/earnings.ts: addWorkerEarningAndLedger helper).
--
-- R5 race cluster (test-staff-booking-endpoints.mjs) proves idempotency:
-- mark-staff-ready is safe under 4× parallel calls — exactly 1 ledger row.
--
-- After App.tsx + lib/api/workers.ts commit, add_worker_earnings RPC has
-- ZERO frontend callers. Safe to REVOKE anon + authenticated EXECUTE.
--
-- NOTE on REVOKE TARGET: this function had EXPLICIT anon + authenticated
-- grants (proacl: {anon=X/postgres, authenticated=X/postgres, ...}), NOT
-- just PUBLIC. So we must REVOKE FROM PUBLIC + FROM anon + authenticated
-- separately. Verified via pg_proc.proacl inspection.
--
-- service_role EXECUTE preserved (default postgres grants remain).
-- ============================================================================

begin;

revoke execute on function public.add_worker_earnings(p_worker_id uuid, p_booking_id uuid, p_earnings numeric, p_cars numeric)
  from PUBLIC;
revoke execute on function public.add_worker_earnings(p_worker_id uuid, p_booking_id uuid, p_earnings numeric, p_cars numeric)
  from anon;
revoke execute on function public.add_worker_earnings(p_worker_id uuid, p_booking_id uuid, p_earnings numeric, p_cars numeric)
  from authenticated;

commit;

-- ============================================================================
-- Verification (run after apply):
--   SELECT proname, proacl::text
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='add_worker_earnings';
-- Expected: proacl = {postgres=X/postgres, service_role=X/postgres}
--           (no PUBLIC, no anon, no authenticated entries).
--
-- Anon smoke test (must fail):
--   psql -c "SET ROLE anon; SELECT public.add_worker_earnings(
--     '00000000-0000-0000-0000-000000000000'::uuid,
--     '00000000-0000-0000-0000-000000000000'::uuid, 0, 0); RESET ROLE;"
--   Expected: ERROR: permission denied for function add_worker_earnings
--
-- service_role smoke test (must work):
--   psql -c "SELECT has_function_privilege('service_role',
--     'public.add_worker_earnings(uuid,uuid,numeric,numeric)', 'EXECUTE');"
--   Expected: t
-- ============================================================================
