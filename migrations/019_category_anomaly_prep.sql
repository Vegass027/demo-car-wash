-- Migration 019 — Slice #3d Phase 2 RLS anomaly prep (DEMO-ONLY).
--
-- Closes 5 demo-only security gaps (all live breach vectors on prod
-- per entry 22 PROJECT_STATE; not applied on prod yet — coordinated
-- migration after Slice #3d/#3e/Phase 2.5/Phase 3 fully green on demo).
--
-- IMPORTANT column-grant mechanics in PostgreSQL:
--   * REVOKE (col1) on table FROM role does NOT revoke a table-level
--     SELECT grant. Need REVOKE SELECT on table first, then GRANT SELECT
--     on (col1, col2, ...) — granting a subset means role gets only those.
--   * Existing public_all_access USING(true) policy on a table grants ALL
--     rows to ALL roles regardless of column GRANTs. Must DROP first.
--
-- A1. tire_bookings_timeline view (anon+authenticated had full access)
-- A2. closed_boxes split: anon SELECT remains (Category D public catalog);
--     anon/authenticated lose INSERT/UPDATE/DELETE/TRUNCATE;
--     DROP public_all_access; new staff policy for writes (admin/owner).
-- A3. tire_service_days split: same pattern as A2.
-- A6. profiles.password_hash column REVOKE (REVOKE table-level SELECT,
--     then GRANT SELECT (all except password_hash)).
-- A7. workers/tire_workers/admins card_number+payment_phone column REVOKE.
--
-- Each section: 4-step verify checklist (§20d) per object.
-- =============================================================================

-- ============================================================================
-- A1. View tire_bookings_timeline — REVOKE from anon + authenticated
-- ============================================================================

REVOKE ALL ON public.tire_bookings_timeline FROM anon;
REVOKE ALL ON public.tire_bookings_timeline FROM authenticated;
GRANT SELECT ON public.tire_bookings_timeline TO service_role;

-- ============================================================================
-- A2. closed_boxes — split (anon SELECT only, staff writes only)
-- ============================================================================

REVOKE ALL ON public.closed_boxes FROM anon;
REVOKE ALL ON public.closed_boxes FROM authenticated;
GRANT SELECT ON public.closed_boxes TO anon;
GRANT SELECT ON public.closed_boxes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.closed_boxes TO service_role;

-- Drop the public_all_access USING(true) policy — it gave ALL roles full
-- access regardless of our grants. Replace with staff-only writes.
DROP POLICY IF EXISTS public_all_access ON public.closed_boxes;
DROP POLICY IF EXISTS staff_write_closed_boxes ON public.closed_boxes;
CREATE POLICY staff_select_closed_boxes ON public.closed_boxes
  FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner') OR auth.jwt() IS NULL);
-- ^ SELECT to authenticated is already GRANTed; anon SELECT bypasses RLS
--   (Postgres BYPASSRLS for anon by default — but our policy lets anon
--   through because auth.jwt() IS NULL for anon role).

CREATE POLICY staff_write_closed_boxes ON public.closed_boxes
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY staff_update_closed_boxes ON public.closed_boxes
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY staff_delete_closed_boxes ON public.closed_boxes
  FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));

-- service_role bypass (own policy)
CREATE POLICY service_role_all_closed_boxes ON public.closed_boxes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- A3. tire_service_days — split (same pattern as A2)
-- ============================================================================

REVOKE ALL ON public.tire_service_days FROM anon;
REVOKE ALL ON public.tire_service_days FROM authenticated;
GRANT SELECT ON public.tire_service_days TO anon;
GRANT SELECT ON public.tire_service_days TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tire_service_days TO service_role;

DROP POLICY IF EXISTS public_all_access ON public.tire_service_days;
DROP POLICY IF EXISTS staff_write_tire_service_days ON public.tire_service_days;
CREATE POLICY staff_select_tire_service_days ON public.tire_service_days
  FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner') OR auth.jwt() IS NULL);

CREATE POLICY staff_write_tire_service_days ON public.tire_service_days
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY staff_update_tire_service_days ON public.tire_service_days
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY staff_delete_tire_service_days ON public.tire_service_days
  FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY service_role_all_tire_service_days ON public.tire_service_days
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- A6. profiles.password_hash — column-level REVOKE
-- Strategy: REVOKE table-level SELECT, GRANT SELECT on all columns
-- except password_hash.
-- ============================================================================

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, login, full_name, role, phone, telegram_id,
              last_auth_method, created_at, updated_at)
  ON public.profiles TO anon;
GRANT SELECT (id, login, full_name, role, phone, telegram_id,
              last_auth_method, created_at, updated_at)
  ON public.profiles TO authenticated;
-- service_role retains full table-level SELECT (covers password_hash for
-- the verify_password RPC).

-- ============================================================================
-- A7. card_number + payment_phone — column-level REVOKE
-- ============================================================================

REVOKE SELECT ON public.workers FROM anon;
REVOKE SELECT ON public.workers FROM authenticated;
GRANT SELECT (id, full_name, phone, is_active, created_at,
              is_working_today, earned_today, current_balance,
              is_advance_taken, completed_bookings, updated_at,
              status, current_booking_id, payment_comment,
              cars_today, last_shift_date, salary_comment,
              working_mode, working_mode_status, partner_id,
              base_rate_amount)
  ON public.workers TO anon;
GRANT SELECT (id, full_name, phone, is_active, created_at,
              is_working_today, earned_today, current_balance,
              is_advance_taken, completed_bookings, updated_at,
              status, current_booking_id, payment_comment,
              cars_today, last_shift_date, salary_comment,
              working_mode, working_mode_status, partner_id,
              base_rate_amount)
  ON public.workers TO authenticated;

REVOKE SELECT ON public.tire_workers FROM anon;
REVOKE SELECT ON public.tire_workers FROM authenticated;
GRANT SELECT (id, full_name, phone, is_active, created_at,
              is_working_today, earned_today, current_balance,
              is_advance_taken, completed_bookings, updated_at,
              status, current_booking_id, payment_comment,
              cars_today, last_shift_date, salary_comment)
  ON public.tire_workers TO anon;
GRANT SELECT (id, full_name, phone, is_active, created_at,
              is_working_today, earned_today, current_balance,
              is_advance_taken, completed_bookings, updated_at,
              status, current_booking_id, payment_comment,
              cars_today, last_shift_date, salary_comment)
  ON public.tire_workers TO authenticated;

REVOKE SELECT ON public.admins FROM anon;
REVOKE SELECT ON public.admins FROM authenticated;
GRANT SELECT (id, full_name, phone, is_active, created_at, updated_at,
              current_balance, earned_today, profile_id)
  ON public.admins TO anon;
GRANT SELECT (id, full_name, phone, is_active, created_at, updated_at,
              current_balance, earned_today, profile_id)
  ON public.admins TO authenticated;