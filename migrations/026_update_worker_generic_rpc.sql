-- ============================================================================
-- Migration 026: update_worker generic RPC (whitelisted)
-- ============================================================================
-- Phase 2/Commit 1 — replaces direct supabase.from('workers').update() in
-- lib/api/workers.ts:225 with dispatcher path through update_worker RPC.
--
-- Whitelist (9 fields):
--   full_name, phone, card_number, payment_phone, payment_comment,
--   salary_comment, is_active, working_mode, partner_id
--
-- SQL CHECKs:
--   - working_mode: only when working_mode_status='waiting' (before base taken)
--   - partner_id:   only when working_mode_status='locked'  (after RPC select_*)
--   - partner_id CANNOT be cleared (null) — unpairing goes through
--     changeWorkerMode RPC (commit 8)
--
-- Blacklist (12+ salary/status fields — never updatable here):
--   working_mode_status, base_rate_amount, base_rate_taken_today,
--   earned_today, is_working_today, last_shift_date, current_balance,
--   current_booking_id, days_worked_this_month, cars_today,
--   completed_bookings
--
-- Access: service_role only (anon/authenticated REVOKEd).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_worker(
  p_worker_id uuid,
  p_updates jsonb
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
  v_working_mode text;
  v_partner_id uuid;
BEGIN
  v_full_name := p_updates->>'full_name';
  v_phone := p_updates->>'phone';
  v_card_number := p_updates->>'card_number';
  v_payment_phone := p_updates->>'payment_phone';
  v_payment_comment := p_updates->>'payment_comment';
  v_salary_comment := p_updates->>'salary_comment';
  v_partner_id := CASE WHEN p_updates ? 'partner_id'
                       THEN NULLIF(p_updates->>'partner_id','')::uuid
                       ELSE NULL END;
  v_working_mode := p_updates->>'working_mode';
  IF p_updates ? 'is_active' THEN
    v_is_active := (p_updates->>'is_active')::boolean;
  END IF;

  SELECT * INTO v_worker FROM workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'worker_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_updates ? 'partner_id' AND p_updates->>'partner_id' IS NULL THEN
    RAISE EXCEPTION 'partner_id_cannot_be_cleared_use_change_worker_mode'
      USING ERRCODE = 'P0001',
            HINT = 'unpairing requires changeWorkerMode RPC, not generic update';
  END IF;

  IF v_working_mode IS NOT NULL AND v_worker.working_mode_status = 'locked' THEN
    RAISE EXCEPTION 'working_mode_locked_use_change_worker_mode_rpc'
      USING ERRCODE = 'P0001',
            HINT = 'Use changeWorkerMode RPC to alter mode after base is taken';
  END IF;

  IF v_partner_id IS NOT NULL AND v_worker.working_mode_status <> 'locked' THEN
    RAISE EXCEPTION 'partner_id_requires_locked_status'
      USING ERRCODE = 'P0001',
            HINT = 'partner_id can only be set after select_worker_mode_pair/solo RPC';
  END IF;

  UPDATE workers SET
    full_name        = COALESCE(v_full_name, full_name),
    phone            = COALESCE(v_phone, phone),
    card_number      = COALESCE(v_card_number, card_number),
    payment_phone    = COALESCE(v_payment_phone, payment_phone),
    payment_comment  = COALESCE(v_payment_comment, payment_comment),
    salary_comment   = COALESCE(v_salary_comment, salary_comment),
    is_active        = COALESCE(v_is_active, is_active),
    working_mode     = COALESCE(v_working_mode, working_mode),
    partner_id       = COALESCE(v_partner_id, partner_id),
    updated_at       = NOW()
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  RETURN v_worker;
END;
$FUNC$;

ALTER FUNCTION public.update_worker(p_worker_id uuid, p_updates jsonb)
  OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.update_worker(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_worker(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_worker(uuid, jsonb) FROM authenticated;

-- Verify:
--   SELECT has_function_privilege('anon', 'public.update_worker(uuid, jsonb)', 'EXECUTE');  -- f
--   SELECT has_function_privilege('authenticated', 'public.update_worker(uuid, jsonb)', 'EXECUTE');  -- f
--   SELECT has_function_privilege('service_role', 'public.update_worker(uuid, jsonb)', 'EXECUTE');  -- t
