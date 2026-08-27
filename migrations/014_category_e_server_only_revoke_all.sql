-- ============================================================================
-- Migration: 014_category_e_server_only_revoke_all.sql
-- ============================================================================
-- Phase 2.3 / Category E — server-only tables: REVOKE ALL from anon+authenticated.
--
-- Tables: payments, pending_bookings, otp_codes, sms_logs, sms_rate_limits,
--         auth_logs, _legacy_link_audit, bookings_timeline.
--
-- All operations on these tables go through service_role (Vercel Functions
-- with verifyJwt + service_role key). No frontend code reads or writes
-- these tables directly — verified by AST-scanner audit on
-- lib/, components/, features/, App.tsx (zero callers).
--
-- Server-only tables rationale:
--   payments           — written by yookassa-webhook / dispatcher only
--   pending_bookings   — written by /api/create-pending-booking only
--   otp_codes          — written by SMS flow dispatcher only
--   sms_logs           — written by SMS flow dispatcher only
--   sms_rate_limits    — written by SMS flow dispatcher only
--   auth_logs          — written by /api/login, /api/telegram-auth only
--   _legacy_link_audit — Phase 1.5.1 audit log; no UI callsite, dead table
--   bookings_timeline  — 0 frontend callers; not a trigger source either
--
-- After this migration:
--   • anon + authenticated: NO privileges at all.
--   • service_role: ALL preserved (default postgres grants remain).
--   • RLS policies (public_all_access USING(true)) still apply; the actual
--     gate is now the GRANT/REVOKE structure below. RLS Category B/D/E
--     enable (future phases) will narrow USING clauses.
-- ============================================================================

begin;

-- REVOKE all privileges from anon and authenticated on all 8 Category E tables.
revoke delete, insert, references, select, trigger, truncate, update
  on public.payments           from anon, authenticated;
revoke delete, insert, references, select, trigger, truncate, update
  on public.pending_bookings   from anon, authenticated;
revoke delete, insert, references, select, trigger, truncate, update
  on public.otp_codes          from anon, authenticated;
revoke delete, insert, references, select, trigger, truncate, update
  on public.sms_logs           from anon, authenticated;
revoke delete, insert, references, select, trigger, truncate, update
  on public.sms_rate_limits    from anon, authenticated;
revoke delete, insert, references, select, trigger, truncate, update
  on public.auth_logs          from anon, authenticated;
revoke delete, insert, references, select, trigger, truncate, update
  on public._legacy_link_audit from anon, authenticated;
revoke delete, insert, references, select, trigger, truncate, update
  on public.bookings_timeline  from anon, authenticated;

commit;

-- ============================================================================
-- Verification (run after apply):
--   SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema='public'
--     AND table_name IN ('payments','pending_bookings','otp_codes','sms_logs',
--                        'sms_rate_limits','auth_logs','_legacy_link_audit',
--                        'bookings_timeline')
--     AND grantee IN ('anon','authenticated');
-- Expected: 0 rows.
--
-- Anon smoke test (SELECT must fail):
--   psql -c "SET ROLE anon; SELECT count(*) FROM public.payments; RESET ROLE;"
--   Expected: ERROR: permission denied for table payments
--
-- service_role smoke test (SELECT must work):
--   psql -c "SET ROLE service_role; SELECT count(*) FROM public.payments; RESET ROLE;"
--   Expected: count(*)
-- ============================================================================
