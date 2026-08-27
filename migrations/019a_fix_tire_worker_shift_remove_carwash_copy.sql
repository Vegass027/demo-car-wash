-- Migration 019a: fix tire worker shift RPCs (demo-only, separate from future 019 anomaly prep).
--
-- Purpose:
--   start_tire_worker_shift originally was a copy-paste of carwash start_worker_shift,
--   including a reference to v_worker.base_rate_taken_today — a column that does NOT
--   exist in tire_workers. Calling it raised:
--     "record 'v_worker' has no field 'base_rate_taken_today'"
--   making the ON-shift button broken on both demo and prod (verified — pg_get_functiondef
--   and tire_workers schema are identical on demo and prod; recon-slice-3d-fix-plan-v2.md).
--
-- Fix:
--   1. start_tire_worker_shift: keep legacy 3-param signature (backward compat for any
--      unknown bundle / cron / manual SQL). Drop the carwash base-rate block:
--         - drop check on v_worker.base_rate_taken_today (column doesn't exist)
--         - drop INSERT INTO salary_transactions at shift start (tire has no base rate)
--         - drop UPDATE tire_workers SET base_rate_taken_today=TRUE
--         - keep p_salary parameter, but ignore (SQL comment).
--   2. stop_tire_worker_shift: NEW RPC, atomic OFF path with FOR UPDATE serialization.
--      Single-param (p_worker_id only). finished_at = NOW() server-stamped inside the
--      function. last_shift_date PRESERVED (history semantics).
--      Selects/updates ONLY the active work_shift row (status='working', ORDER BY started_at
--      DESC LIMIT 1, FOR UPDATE) — never touches historical shifts.
--
-- Demo-only. Production gets a coordinated migration once the full Slice #3d/#3e/Phase
-- 2.5/Phase 3 architecture is green on demo (per owner decision 2026-08-27).

-- ============================================================================
-- 1. start_tire_worker_shift — REPLACE (signature unchanged)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.start_tire_worker_shift(
  p_worker_id uuid,
  p_salary numeric,            -- retained for backward-compatible RPC signature;
                               -- tire technicians have no carwash base-rate accounting
  p_today date
)
RETURNS public.tire_workers
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
DECLARE
  v_worker tire_workers;
BEGIN
  -- 🔒 LOCK tire worker (serializes parallel calls for idempotency)
  SELECT * INTO v_worker
    FROM tire_workers
    WHERE id = p_worker_id
    FOR UPDATE;

  -- ✅ Idempotent: already working today → return current state, no duplicate work_shift
  IF v_worker.is_working_today THEN
    RETURN v_worker;
  END IF;

  -- ✅ Flip the toggle. p_salary intentionally ignored (tire has no base rate).
  UPDATE tire_workers
    SET is_working_today = TRUE,
        last_shift_date  = p_today
    WHERE id = p_worker_id
    RETURNING * INTO v_worker;

  -- ✅ Audit row in work_shifts (worker_type='tire_worker' allowed by CHECK constraint)
  INSERT INTO work_shifts (
    worker_type, worker_id, worker_name, work_date,
    started_at, status, earnings
  )
  VALUES (
    'tire_worker', p_worker_id, v_worker.full_name, p_today,
    NOW(), 'working', 0
  );

  RETURN v_worker;
END;
$function$;

-- ============================================================================
-- 2. stop_tire_worker_shift — NEW RPC (1-param signature)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.stop_tire_worker_shift(
  p_worker_id uuid
)
RETURNS public.tire_workers
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
DECLARE
  v_worker tire_workers;
  v_active_shift_id uuid;
BEGIN
  -- 🔒 LOCK tire worker (serializes parallel OFF calls)
  SELECT * INTO v_worker
    FROM tire_workers
    WHERE id = p_worker_id
    FOR UPDATE;

  -- ✅ Idempotent: not currently working → return current state
  IF NOT v_worker.is_working_today THEN
    RETURN v_worker;
  END IF;

  -- ✅ Flip the toggle. last_shift_date PRESERVED as history
  --    (semantics: "last day worker WAS on shift", not cleared on OFF).
  UPDATE tire_workers
    SET is_working_today = FALSE
    WHERE id = p_worker_id
    RETURNING * INTO v_worker;

  -- ✅ Close ONLY the active work_shift row (status='working'),
  --    never touch historical shifts.
  SELECT id INTO v_active_shift_id
    FROM work_shifts
    WHERE worker_id   = p_worker_id
      AND worker_type = 'tire_worker'
      AND status      = 'working'
    ORDER BY started_at DESC
    LIMIT 1
    FOR UPDATE;

  IF v_active_shift_id IS NOT NULL THEN
    UPDATE work_shifts
      SET finished_at = NOW(),
          status      = 'finished'
      WHERE id = v_active_shift_id;
  END IF;

  RETURN v_worker;
END;
$function$;

-- ============================================================================
-- 3. Grants — 4-step checklist (per §20d of PROJECT_STATE):
--    (a) proacl inspection
--    (b) has_function_privilege('anon', ...) = false
--    (c) has_function_privilege('authenticated', ...) = false
--    (d) SET ROLE anon + actual call → permission_denied
--    + service_role EXECUTE preserved (for dispatcher proxy)
--
-- start_tire_worker_shift was already public+anon+authenticated EXECUTE
-- (pre-existing demo/prod drift, see recon-slice-3d-fix-plan-v2.md).
-- stop_tire_worker_shift is brand-new and inherits the same grants.
--
-- We REVOKE EXECUTE from PUBLIC + anon + authenticated now, BEFORE the
-- dispatcher goes live (deployment order: migration → verify → code).
-- Frontend never calls these RPCs directly after the dispatcher proxy
-- ships (the parallel anon-direct grant was only used by the old direct-
-- .rpc() path that this slice is replacing).
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.start_tire_worker_shift(uuid, numeric, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_tire_worker_shift(uuid, numeric, date)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.stop_tire_worker_shift(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stop_tire_worker_shift(uuid)
  TO service_role;
