-- ============================================================================
-- Migration: 016_revoke_change_password_phase_2_1a.sql
-- ============================================================================
-- Phase 2.1a — REVOKE EXECUTE on change_password RPC.
--
-- After Phase 2.1a deployed:
--   • /api/staff?action=change-password is the only path used by frontend
--     (components/admin/ChangePasswordWizard.tsx now calls
--     changeStaffPassword() → dispatchStaffCall('change-password', ...) which
--     requires admin/owner JWT).
--   • The direct supabase.rpc('change_password') call in ChangePasswordWizard
--     was REMOVED — verified zero remaining callers via AST-scanner.
--   • Service_role EXEC preserved (supabaseAdmin.rpc via /api/staff dispatcher).
--   • 79/80 PASS on full test cluster post-REVOKE (E3 fail is cosmetic
--     error-code consistency, fixed in commit 3e2a068 — not yet pushed
--     due to GitHub credential issue, work-around in progress).
--
-- Per entry 20d general REVOKE rule: this RPC has BOTH PUBLIC and explicit
-- anon + authenticated grants (verified via proacl). All three targets
-- REVOKED separately.
--
-- 4-step checklist (verified before committing this migration file):
--   (i)  proacl: {postgres=X/postgres, service_role=X/postgres}
--   (ii) has_function_privilege('anon', 'change_password(...)', 'EXECUTE') = f
--   (iii) has_function_privilege('authenticated', 'change_password(...)', 'EXECUTE') = f
--   (iv) SET ROLE anon + change_password(...) →  permission denied
--   And: has_function_privilege('service_role', 'change_password(...)', 'EXECUTE') = t
-- ============================================================================

begin;

revoke execute on function public.change_password(p_user_id uuid, p_old_password text, p_new_password text)
  from PUBLIC;
revoke execute on function public.change_password(p_user_id uuid, p_old_password text, p_new_password text)
  from anon;
revoke execute on function public.change_password(p_user_id uuid, p_old_password text, p_new_password text)
  from authenticated;

commit;

-- ============================================================================
-- Verification (run after apply):
--   SELECT proname, proacl::text
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='change_password';
-- Expected: {postgres=X/postgres, service_role=X/postgres}
--
--   SELECT
--     has_function_privilege('anon', 'public.change_password(uuid,text,text)', 'EXECUTE') AS anon_exec,
--     has_function_privilege('authenticated', 'public.change_password(uuid,text,text)', 'EXECUTE') AS auth_exec,
--     has_function_privilege('service_role', 'public.change_password(uuid,text,text)', 'EXECUTE') AS sr_exec;
-- Expected: anon_exec=f, auth_exec=f, sr_exec=t
--
-- Anon smoke test (must fail):
--   psql -c "SET ROLE anon; SELECT public.change_password(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'x', 'y'); RESET ROLE;"
-- Expected: ERROR: permission denied for function change_password
-- ============================================================================