-- =============================================================
-- rollback: 025_ROLLBACK_EMERGENCY.sql (Phase E(a) ⚠⚠⚠ DANGER ⚠⚠⚠)
--
-- ⚠⚠⚠ THIS FILE RE-OPENS ALL CONFIRMED PHASE E(a) PII VECTORS ⚠⚠⚠
--
-- Recreates public_all_access TO anon, authenticated USING(true)
-- WITH CHECK(true) on the 5 PII tables. This recreates the exact
-- leak surface that migration 025 was designed to close, including:
--
--   1. List-all of bookings/tire_bookings/clients/loyalty via REST
--   2. Known-foreign-id SELECT on bookings and clients
--   3. UPDATE foreign booking (T2.9 recon vector)
--   4. INSERT forged booking under foreign client_id (T2.10 recon vector)
--   5. WS PII stream no-filter (T3.1 recon vector)
--   6. client-to-client list leak via clients table (T2.5 recon vector)
--   7. client_cars / loyalty full leak once seeded (T2.6/T2.8 latent vectors)
--
-- USE ONLY: as a last-resort atomic restore, when migration 025
-- proves irrecoverable and full data model has to be reverted to
-- the pre-fix posture. This is the OPPOSITE of what Phase E(a)
-- intends — it should normally NEVER be applied.
--
-- APPLYING THIS FILE REQUIRES A SEPARATE, EXPLICIT, OUT-OF-BAND
-- OWNER OK ("apply emergency full rollback and accept known PII
-- re-exposure for N hours while we diagnose the regression").
-- The smoke runner in tests/smoke-phase-e-a.mjs does NOT call this
-- file. The safe narrow rollback does NOT call this file.
-- =============================================================

DROP POLICY IF EXISTS client_own_select ON public.clients;
DROP POLICY IF EXISTS staff_all ON public.clients;
CREATE POLICY public_all_access ON public.clients
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS client_own_select ON public.client_cars;
DROP POLICY IF EXISTS staff_all ON public.client_cars;
CREATE POLICY public_all_access ON public.client_cars
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS client_own_select ON public.bookings;
DROP POLICY IF EXISTS staff_all ON public.bookings;
CREATE POLICY public_all_access ON public.bookings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS client_own_select ON public.tire_bookings;
DROP POLICY IF EXISTS staff_all ON public.tire_bookings;
CREATE POLICY public_all_access ON public.tire_bookings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS client_own_select ON public.loyalty_carwash_progress;
DROP POLICY IF EXISTS staff_all ON public.loyalty_carwash_progress;
CREATE POLICY public_all_access ON public.loyalty_carwash_progress
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
