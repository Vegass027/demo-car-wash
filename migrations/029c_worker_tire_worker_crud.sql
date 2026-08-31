-- ============================================================================
-- Migration 029c: CRUD RPCs for workers + tire_workers (4 RPCs)
-- ============================================================================
-- Phase 2.5/Hotfix C — restores worker/tire_worker CRUD flows broken by
-- Commit 1 anon RLS lockdown:
--
--   workers:
--     - createWorker (lib/api/workers.ts:194) — INSERT via anon (403)
--     - deleteWorker (lib/api/workers.ts:248) — DELETE via anon (403)
--   tire_workers:
--     - createTireWorker (lib/api/tire-workers.ts:181) — INSERT (403)
--     - deleteTireWorker (lib/api/tire-workers.ts:228) — DELETE (403)
--
-- For admins, dispatcher actions + wrappers ALREADY EXIST. JS-side rewire only.
--
-- PRINCIPLE: passthrough. No FK pre-checks. No "active bookings" guards.
-- FK violation behavior in prod (NO ACTION) is the natural guard —
-- DELETE fails with 23503 if related rows exist, same as in original prod.
-- No new CHECK constraints — table CHECKs (workers_status_check,
-- tire_workers_status_check, workers_working_mode_check) provide validation.
--
-- Pre-existing gaps documented (not fixed in this migration):
--   Gap #1: work_shifts row not closed on off-shift (Commit 8 territory)
--   Gap #2: bookings.worker_id has no FK to workers.id → DELETE worker
--     silently orphans bookings.worker_id (verified live during recon).
--
-- Required field: full_name (NOT NULL no default) — RPC validates it.
-- All other fields use server defaults or null.
--
-- Access: service_role only.
-- ============================================================================

-- ============================================================================
-- 1. create_worker
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_worker(
  p_data jsonb
) RETURNS public.workers
LANGUAGE plpgsql
SECURITY DEFINER
AS $FUNC$
DECLARE
  v_worker workers;
  v_full_name text;
  v_phone text;
  v_card_number text;
  v_payment_phone text;
  v_payment_comment text;
  v_salary_comment text;
  v_is_active boolean;
BEGIN
  v_full_name := NULLIF(p_data->>'full_name', '');
  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'full_name_required' USING ERRCODE = 'P0001';
  END IF;

  v_phone := NULLIF(p_data->>'phone', '');
  v_card_number := NULLIF(p_data->>'card_number', '');
  v_payment_phone := NULLIF(p_data->>'payment_phone', '');
  v_payment_comment := NULLIF(p_data->>'payment_comment', '');
  v_salary_comment := NULLIF(p_data->>'salary_comment', '');
  v_is_active := COALESCE((p_data->>'is_active')::boolean, true);

  INSERT INTO workers (
    full_name, phone, card_number, payment_phone, payment_comment,
    salary_comment, is_active
  ) VALUES (
    v_full_name, v_phone, v_card_number, v_payment_phone, v_payment_comment,
    v_salary_comment, v_is_active
  )
  RETURNING * INTO v_worker;

  RETURN v_worker;
END;
$FUNC$;

ALTER FUNCTION public.create_worker(jsonb) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.create_worker(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_worker(jsonb) TO service_role;

-- ============================================================================
-- 2. delete_worker
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_worker(
  p_worker_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $FUNC$
DECLARE
  v_count integer;
BEGIN
  -- 1:1 mirror of prod JS — bare DELETE. FK behavior preserved:
  --   bookings.worker_id_2 → SET NULL (no error)
  --   workers.partner_id → NO ACTION (23503 if partner exists)
  --   workers.current_booking_id → SET NULL via FK
  --   bookings.worker_id has NO FK → silent orphans (pre-existing gap #2)
  SELECT COUNT(*) INTO v_count FROM workers WHERE id = p_worker_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'worker_not_found' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM workers WHERE id = p_worker_id;
END;
$FUNC$;

ALTER FUNCTION public.delete_worker(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.delete_worker(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_worker(uuid) TO service_role;

-- ============================================================================
-- 3. create_tire_worker
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_tire_worker(
  p_data jsonb
) RETURNS public.tire_workers
LANGUAGE plpgsql
SECURITY DEFINER
AS $FUNC$
DECLARE
  v_worker tire_workers;
  v_full_name text;
  v_phone text;
  v_card_number text;
  v_payment_phone text;
  v_payment_comment text;
  v_salary_comment text;
  v_is_active boolean;
BEGIN
  v_full_name := NULLIF(p_data->>'full_name', '');
  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'full_name_required' USING ERRCODE = 'P0001';
  END IF;

  v_phone := NULLIF(p_data->>'phone', '');
  v_card_number := NULLIF(p_data->>'card_number', '');
  v_payment_phone := NULLIF(p_data->>'payment_phone', '');
  v_payment_comment := NULLIF(p_data->>'payment_comment', '');
  v_salary_comment := NULLIF(p_data->>'salary_comment', '');
  v_is_active := COALESCE((p_data->>'is_active')::boolean, true);

  INSERT INTO tire_workers (
    full_name, phone, card_number, payment_phone, payment_comment,
    salary_comment, is_active
  ) VALUES (
    v_full_name, v_phone, v_card_number, v_payment_phone, v_payment_comment,
    v_salary_comment, v_is_active
  )
  RETURNING * INTO v_worker;

  RETURN v_worker;
END;
$FUNC$;

ALTER FUNCTION public.create_tire_worker(jsonb) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.create_tire_worker(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tire_worker(jsonb) TO service_role;

-- ============================================================================
-- 4. delete_tire_worker
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_tire_worker(
  p_worker_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $FUNC$
DECLARE
  v_count integer;
BEGIN
  -- 1:1 mirror of prod JS. FK behavior preserved:
  --   tire_bookings.worker_id → NO ACTION (23503 if has bookings)
  --   tire_workers.current_booking_id → SET NULL via FK
  SELECT COUNT(*) INTO v_count FROM tire_workers WHERE id = p_worker_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'tire_worker_not_found' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM tire_workers WHERE id = p_worker_id;
END;
$FUNC$;

ALTER FUNCTION public.delete_tire_worker(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.delete_tire_worker(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tire_worker(uuid) TO service_role;