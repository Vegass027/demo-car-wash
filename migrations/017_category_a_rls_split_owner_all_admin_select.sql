-- ============================================================================
-- Migration: 017_category_a_rls_split_owner_all_admin_select.sql
-- ============================================================================
-- Phase 2.4 / Slice #3c — Category A (admins/salary_settings/
-- salary_transactions/company_settings) RLS enable.
--
-- Authorization matrix (entry 21 in PROJECT_STATE.md):
--   4 admin-or-owner: start-admin-shift, create-earning-transaction,
--                      create-advance-transaction, create-transfer-transaction
--  11 owner-only:    create-admin, update-admin, delete-admin,
--                      admin-give-advance, admin-payout-salary,
--                      admin-transfer-balance, create-payout-transaction,
--                      delete-salary-transaction, update-salary-settings,
--                      create-company-settings, update-company-settings
--
-- Defense-in-depth (entry 20d general REVOKE rule):
--   * REVOKE grant-level (step 1) — admin/anon direct writes blocked
--   * RLS policy (step 3) — additional filter via auth.jwt()->>'app_role'
--   * REVOKE EXECUTE on start_admin_shift RPC (step 4) — only dispatcher
--     calls it via service_role
--
-- Reads stay direct via supabase.from() in admin dashboard — admin role
-- can SELECT via admin_select_* policies (Path B from earlier recon).
-- Writes go through /api/staff dispatcher (15 new actions in
-- api/staff.ts) using supabaseAdmin (service_role) which bypasses
-- both grant REVOKE and RLS USING.
--
-- 4-step checklist (entry 20d) verified for each REVOKE step:
--   (i)   proacl::text inspection (no PUBLIC, no anon, no auth)
--   (ii)  has_function_privilege('anon'/'authenticated', ...) = f
--   (iii) has_function_privilege('service_role', ...) = t
--   (iv)  SET ROLE anon + actual call → permission denied
-- ============================================================================

begin;

-- ============================================================
-- STEP 1: Table-level grants (defense-in-depth BEFORE RLS)
-- ============================================================

-- anon: NO privileges at all on Category A tables
REVOKE ALL ON public.admins               FROM anon;
REVOKE ALL ON public.salary_settings      FROM anon;
REVOKE ALL ON public.company_settings     FROM anon;
REVOKE ALL ON public.salary_transactions  FROM anon;

-- authenticated: SELECT only — writes blocked at grant level
-- even if RLS policy were misconfigured. Admin's dispatcher writes
-- go through supabaseAdmin (service_role) which bypasses this.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.admins, public.salary_settings, public.company_settings, public.salary_transactions
  FROM authenticated;

GRANT SELECT ON public.admins               TO authenticated;
GRANT SELECT ON public.salary_settings      TO authenticated;
GRANT SELECT ON public.company_settings     TO authenticated;
GRANT SELECT ON public.salary_transactions  TO authenticated;

-- service_role keeps ALL (default postgres grants remain) —
-- preserves dispatcher flow via supabaseAdmin.

-- ============================================================
-- STEP 2: Drop old public_all_access policies (superseded by
--         the new split policies in STEP 3)
-- ============================================================
DROP POLICY IF EXISTS public_all_access       ON public.admins;
DROP POLICY IF EXISTS service_role_all_access ON public.admins;
DROP POLICY IF EXISTS public_all_access       ON public.salary_settings;
DROP POLICY IF EXISTS service_role_all_access ON public.salary_settings;
DROP POLICY IF EXISTS public_all_access       ON public.company_settings;
DROP POLICY IF EXISTS service_role_all_access ON public.company_settings;
DROP POLICY IF EXISTS public_all_access       ON public.salary_transactions;
DROP POLICY IF EXISTS service_role_all_access ON public.salary_transactions;

-- ============================================================
-- STEP 3: New RLS policies
-- ============================================================

-- admins: owner-ALL + admin-SELECT
CREATE POLICY owner_all_admins ON public.admins FOR ALL TO authenticated
  USING ((auth.jwt()->>'app_role') = 'owner')
  WITH CHECK ((auth.jwt()->>'app_role') = 'owner');
CREATE POLICY admin_select_admins ON public.admins FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));

-- salary_settings: owner-ALL + admin-SELECT (singleton config)
CREATE POLICY owner_all_salary_settings ON public.salary_settings FOR ALL TO authenticated
  USING ((auth.jwt()->>'app_role') = 'owner')
  WITH CHECK ((auth.jwt()->>'app_role') = 'owner');
CREATE POLICY admin_select_salary_settings ON public.salary_settings FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));

-- company_settings: owner-ALL + admin-SELECT
CREATE POLICY owner_all_company_settings ON public.company_settings FOR ALL TO authenticated
  USING ((auth.jwt()->>'app_role') = 'owner')
  WITH CHECK ((auth.jwt()->>'app_role') = 'owner');
CREATE POLICY admin_select_company_settings ON public.company_settings FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));

-- salary_transactions: owner-ALL + admin-SELECT
CREATE POLICY owner_all_salary_tx ON public.salary_transactions FOR ALL TO authenticated
  USING ((auth.jwt()->>'app_role') = 'owner')
  WITH CHECK ((auth.jwt()->>'app_role') = 'owner');
CREATE POLICY admin_select_salary_tx ON public.salary_transactions FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));

-- ============================================================
-- STEP 4: REVOKE EXECUTE on start_admin_shift RPC
--         (now dispatcher is sole legitimate caller via service_role)
-- ============================================================
-- The old direct call from Admins.tsx was ported to /api/staff?
-- action=start-admin-shift (lib/api/staff-actions.ts:startStaffAdminShift).
-- The JS wrapper startAdminShift in lib/api/admins.ts still exists but
-- is no longer called (verified via AST scanner).
-- After REVOKE, the only path that can call start_admin_shift is
-- dispatcher → supabaseAdmin.rpc (service_role bypasses REVOKE).

REVOKE EXECUTE ON FUNCTION public.start_admin_shift(p_admin_id uuid, p_salary numeric, p_today date)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_admin_shift(p_admin_id uuid, p_salary numeric, p_today date)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_admin_shift(p_admin_id uuid, p_salary numeric, p_today date)
  FROM authenticated;
-- service_role keeps EXECUTE (default postgres grants remain)

-- finish_admin_shift RPC does NOT EXIST in pg_proc (verified). No REVOKE needed.

commit;

-- ============================================================================
-- Verification (run after apply):
--
-- 1. Grants (defense-in-depth):
--    SELECT table_name, grantee, privilege_type
--    FROM information_schema.role_table_grants
--    WHERE table_schema='public'
--      AND table_name IN ('admins','salary_settings','company_settings','salary_transactions')
--      AND grantee IN ('anon','authenticated')
--    ORDER BY table_name, grantee, privilege_type;
-- Expected: only 'SELECT' rows for 'authenticated', NO rows for 'anon'.
--
-- 2. RLS policies:
--    SELECT tablename, policyname, cmd, roles::text
--    FROM pg_policies
--    WHERE schemaname='public'
--      AND tablename IN ('admins','salary_settings','company_settings','salary_transactions')
--    ORDER BY tablename, policyname;
-- Expected: 2 policies per table (owner_all_* + admin_select_*).
--
-- 3. RPC grants (start_admin_shift):
--    SELECT grantee, privilege_type
--    FROM information_schema.routine_privileges
--    WHERE routine_schema='public' AND routine_name='start_admin_shift';
-- Expected: only service_role (and postgres).
--
-- 4. Anon smoke test:
--    psql -c "SET ROLE anon; SELECT public.start_admin_shift(
--      '00000000-0000-0000-0000-000000000000'::uuid, 0, '2026-01-01'); RESET ROLE;"
--    Expected: ERROR: permission denied for function start_admin_shift
--
-- 5. Authenticated smoke (no dispatcher):
--    psql -c "SET ROLE authenticated;
--      UPDATE public.admins SET full_name='test' WHERE id IS NULL;
--      RESET ROLE;"
--    Expected: ERROR: permission denied for table admins
--
-- 6. service_role still works:
--    psql -c "SELECT has_function_privilege('service_role',
--      'public.start_admin_shift(uuid, numeric, date)', 'EXECUTE');"
--    Expected: t
-- ============================================================================