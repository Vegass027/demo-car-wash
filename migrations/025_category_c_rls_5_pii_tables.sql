-- =============================================================
-- migration: 025_category_c_rls_5_pii_tables.sql (Phase E(a))
--
-- Replaces permissive public_all_access on 5 PII tables with
-- composite role-aware policies:
--   staff_all         FOR ALL TO authenticated
--                       USING (auth.jwt()->>'app_role') IN ('admin','owner')
--                       WITH CHECK (auth.jwt()->>'app_role') IN ('admin','owner')
--   client_own_select  FOR SELECT TO authenticated
--                       USING ownership-predicate per table
--
-- Scope: STRICTLY 5 PII tables. No changes to:
--   * anon_blocked (migration 024) — preserved intact
--   * service_role_all_access          — preserved intact
--   * public_all_access on any other table
--   * table-level GRANTS for any role
--   * any other table's policies
--
-- Use (select auth.uid()) and (select auth.jwt()->>'...') initPlan pattern
-- to avoid per-row JWT function calls per Supabase performance guidance.
-- =============================================================

-- =============================================================
-- clients
-- =============================================================
DROP POLICY IF EXISTS public_all_access ON public.clients;

CREATE POLICY staff_all ON public.clients
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((SELECT auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY client_own_select ON public.clients
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt()->>'app_role') = 'client'
    AND profile_id = (SELECT auth.uid())
  );

-- =============================================================
-- client_cars
-- =============================================================
DROP POLICY IF EXISTS public_all_access ON public.client_cars;

CREATE POLICY staff_all ON public.client_cars
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((SELECT auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY client_own_select ON public.client_cars
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt()->>'app_role') = 'client'
    AND EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = client_cars.client_id
        AND clients.profile_id = (SELECT auth.uid())
    )
  );

-- =============================================================
-- bookings
-- =============================================================
DROP POLICY IF EXISTS public_all_access ON public.bookings;

CREATE POLICY staff_all ON public.bookings
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((SELECT auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY client_own_select ON public.bookings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt()->>'app_role') = 'client'
    AND EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = bookings.client_id
        AND clients.profile_id = (SELECT auth.uid())
    )
  );

-- =============================================================
-- tire_bookings
-- =============================================================
DROP POLICY IF EXISTS public_all_access ON public.tire_bookings;

CREATE POLICY staff_all ON public.tire_bookings
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((SELECT auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY client_own_select ON public.tire_bookings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt()->>'app_role') = 'client'
    AND EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = tire_bookings.client_id
        AND clients.profile_id = (SELECT auth.uid())
    )
  );

-- =============================================================
-- loyalty_carwash_progress
-- =============================================================
DROP POLICY IF EXISTS public_all_access ON public.loyalty_carwash_progress;

CREATE POLICY staff_all ON public.loyalty_carwash_progress
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((SELECT auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY client_own_select ON public.loyalty_carwash_progress
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT auth.jwt()->>'app_role') = 'client'
    AND EXISTS (
      SELECT 1 FROM public.clients
      WHERE clients.id = loyalty_carwash_progress.client_id
        AND clients.profile_id = (SELECT auth.uid())
    )
  );

-- =============================================================
-- PRESERVED INTACT (no changes):
--   * anon_blocked             (RESTRICTIVE TO anon USING(false) WITH CHECK(false))
--   * service_role_all_access  (PERMISSIVE TO service_role USING(true))
--   * any other table's policies
--   * any GRANT/REVOKE statements
-- =============================================================
