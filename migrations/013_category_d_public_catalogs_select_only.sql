-- ============================================================================
-- Migration: 013_category_d_public_catalogs_select_only.sql
-- ============================================================================
-- Phase 2.2 / Category D — public catalogs: anon SELECT only.
--
-- Tables: services, tire_services, booking_settings, sbp_banks.
--
-- These are reference catalogs read by the booking widget (anon, before
-- login). Frontend reads direct via supabase.from(...).select() — this
-- is intentional for Category D and must remain so.
--
-- After this migration:
--   • anon + authenticated: SELECT only.
--   • INSERT/UPDATE/DELETE: only via service_role (initial seed) or
--     future staff dispatcher action (admin UI to manage services).
--   • RLS policies (public_all_access) still USING(true) — they need to
--     be narrowed in Category B enable (admin/owner only). For now,
--     RLS permits everything; table grants below are the actual gate.
--
-- Service_role retains ALL for seed/admin operations.
-- ============================================================================

begin;

-- REVOKE write privileges from anon and authenticated.
revoke insert, update, delete, truncate, references, trigger
  on public.services          from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.tire_services     from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.booking_settings  from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.sbp_banks         from anon, authenticated;

-- GRANT SELECT explicitly (in case PUBLIC grant was previously used).
grant select on public.services          to anon, authenticated;
grant select on public.tire_services     to anon, authenticated;
grant select on public.booking_settings  to anon, authenticated;
grant select on public.sbp_banks         to anon, authenticated;

commit;

-- ============================================================================
-- Verification (run after apply):
--   SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema='public'
--     AND table_name IN ('services','tire_services','booking_settings','sbp_banks')
--     AND grantee IN ('anon','authenticated')
--   ORDER BY table_name, privilege_type;
-- Expected: only 'SELECT' rows. No INSERT/UPDATE/DELETE/TRUNCATE.
--
-- Anon smoke test (SELECT should work, INSERT should fail):
--   psql -c "SET ROLE anon; SELECT count(*) FROM public.services; RESET ROLE;"
--   Expected: count(*)
--   psql -c "SET ROLE anon; INSERT INTO public.services(name,...) VALUES (...); RESET ROLE;"
--   Expected: ERROR: permission denied for table services
-- ============================================================================
