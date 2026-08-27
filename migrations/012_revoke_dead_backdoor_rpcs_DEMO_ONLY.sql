-- ============================================================================
-- Migration: 012_revoke_dead_backdoor_rpcs_DEMO_ONLY.sql
-- ============================================================================
-- Phase 2.0 / Quick-win REVOKE on dead backdoor RPCs.
--
-- ⚠️ DEMO-ONLY MIGRATION ⚠️
-- DO NOT apply this migration to production without explicit confirmation.
-- See entry 20a in PROJECT_STATE.md.
--
-- Demo (danobongqzbxilyvdwig) state (verified by AST-scanner audit):
--   • add_tire_worker_earnings         — DEAD (zero callers)
--   • search_profile_by_phone          — DEAD (zero callers)
--   • get_user_role                    — DEAD (zero callers)
--   • handle_new_user                  — DEAD on demo (function exists,
--                                        zero triggers on auth.users in demo,
--                                        zero pg_depend references).
--
-- Production (avajtwihzjfpytimfbaw) state:
--   • add_tire_worker_earnings         — LIVE (via dispatcher)
--   • search_profile_by_phone          — DEAD
--   • get_user_role                    — DEAD
--   • handle_new_user                  — **LIVE** as `on_auth_user_created`
--                                        AFTER INSERT trigger on auth.users.
--                                        DROP / REVOKE would break new user
--                                        signup (auto-create profile).
--
-- For prod migration, recreate this file WITHOUT `handle_new_user`.
--
-- NOTE ON REVOKE TARGET: functions were originally granted EXECUTE to
-- PUBLIC (which subsumes anon + authenticated + others). REVOKE FROM
-- anon,authenticated alone is NOT sufficient — must REVOKE FROM PUBLIC
-- to actually remove the grant. Verified via pg_proc.proacl inspection.
-- ============================================================================

begin;

-- 1. add_tire_worker_earnings — DEAD on demo (zero callers per AST audit)
--    SECURITY INVOKER, but RLS on tire_workers + salary_transactions is
--    currently public_all_access USING(true), so anon can hit it. After
--    Category B enable, RLS would gate it; REVOKE here is defensive.
revoke execute on function public.add_tire_worker_earnings(p_worker_id uuid, p_booking_id uuid, p_earnings numeric)
  from PUBLIC;

-- 2. search_profile_by_phone — DEAD on demo (zero callers per AST audit)
--    SECURITY DEFINER: anon could previously leak any profile by phone.
revoke execute on function public.search_profile_by_phone(phone_number text)
  from PUBLIC;

-- 3. get_user_role — DEAD on demo (zero callers per AST audit)
--    SECURITY DEFINER: anon could leak app_role of any user_id.
revoke execute on function public.get_user_role(user_id uuid)
  from PUBLIC;

-- 4. handle_new_user — DEMO-ONLY REVOKE.
--    On demo: DEAD (zero triggers, zero callers, zero pg_depend refs).
--    On prod: LIVE auth.users AFTER INSERT trigger.
--    ⛔ DO NOT COPY THIS LINE INTO PROD MIGRATION ⛔
--    ⛔ On prod, handle_new_user must remain callable by the trigger �
revoke execute on function public.handle_new_user()
  from PUBLIC;
-- End of DEMO-ONLY line.

commit;

-- ============================================================================
-- Verification (run after apply):
--   SELECT proname, proacl::text
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname IN (
--     'add_tire_worker_earnings','search_profile_by_phone',
--     'get_user_role','handle_new_user'
--   ) ORDER BY proname;
-- Expected: proacl shows {postgres=X/postgres, service_role=X/postgres}
--           (no PUBLIC=X/postgres entry).
--
-- Anon smoke test (should fail with permission_denied):
--   psql -c "SET ROLE anon; SELECT public.search_profile_by_phone('+79991234567'); RESET ROLE;"
-- Expected: ERROR: permission denied for function search_profile_by_phone
-- ============================================================================
