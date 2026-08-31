-- =============================================================
-- migration: 024_anon_block_pii_rls.sql
-- Phase: 2.5b (P0)
-- Purpose: Block anon (no JWT) from reading or writing PII tables
--          via REST + Realtime. Single-layer RESTRICTIVE policy:
--          (a) intentional simplification vs full Hybrid C re-write
--          (b) mathematically equivalent (PERMISSIVE OR + RESTRICTIVE AND)
--          (c) smaller diff + instant rollback via DROP POLICY
--
-- Scope: STRICTLY anon-only. No authenticated policy touched.
-- Tables: bookings, tire_bookings, client_cars, clients,
--         loyalty_carwash_progress (only 5 of 10 publication tables).
--
-- Mechanism: RESTRICTIVE USING(false) WITH CHECK(false) targeted at
--            TO anon only. Authenticated (admin/owner/client) JWT
--            sessions continue to read via existing
--            public_all_access USING(true).
--
-- Background (recon, /tmp/pgmig/prod-recon-realtime.mjs):
--   - Same 5 tables in supabase_realtime publication on prod AND demo
--   - All have public_all_access USING(true) + service_role_all_access USING(true)
--   - anon has full DML GRANTs (SELECT/INSERT/UPDATE/DELETE/...)
--   - WS subscriber with no JWT → role=anon → public_all_access passes → full 45-col payload
--
-- Background (write-path audit, see chat msg 2026-08-31T18:14):
--   - ZERO anon-write paths exist on these 5 tables in app code
--   - All writes go through api/staff.ts (service_role) OR wrappedFetch+JWT (role=authenticated)
--   - Read paths in components/client/* happen AFTER loginViaTelegram() sets JWT
-- =============================================================

CREATE POLICY anon_blocked ON public.bookings
  AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY anon_blocked ON public.tire_bookings
  AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY anon_blocked ON public.client_cars
  AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY anon_blocked ON public.clients
  AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY anon_blocked ON public.loyalty_carwash_progress
  AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);
