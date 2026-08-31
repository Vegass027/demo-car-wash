-- ============================================================================
-- Migration 027: select_worker_mode_solo, select_worker_pair_mode, change_worker_mode
-- ============================================================================
-- Phase 2/Commit 6 — three RPCs that mirror prod JS logic 1:1 from
-- lib/api/workers.ts:
--   - select_worker_mode_solo(worker_id)
--   - select_worker_pair_mode(worker_id1, worker_id2)
--   - change_worker_mode(worker_id, new_mode, new_partner_id)
--
-- Replaces direct supabase.from('workers').update() calls that hit
-- 403 after migration 020 REVOKEd UPDATE grant on authenticated.
--
-- Idempotency rules (1:1 from JS):
--   - select_worker_mode_solo: if base_rate_taken_today=true, no-op
--     (defensive, unreachable via current UI flow)
--   - select_worker_pair_mode: if BOTH workers have base_rate_taken_today=true,
--     no-op (defensive, unreachable via current UI flow). Mixed state
--     also unreachable via current UI.
--   - change_worker_mode: only callable when working_mode_status='locked'
--     (throws otherwise). Idempotent for the caller — multiple switches
--     in a day do NOT re-accrue base_rate.
--
-- Access: service_role only (anon/authenticated REVOKEd).
-- ============================================================================

-- ============================================================================
-- select_worker_mode_solo
-- 1:1 port of lib/api/workers.ts:549-637 (selectWorkerModeSolo)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.select_worker_mode_solo(
  p_worker_id uuid
) RETURNS public.workers
LANGUAGE plpgsql
SECURITY DEFINER
AS $FUNC$
DECLARE
  v_worker workers;
  v_base_rate numeric;
  v_new_earned_today numeric;
BEGIN
  -- Lock + validate
  SELECT * INTO v_worker FROM workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'worker_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Get salary settings (worker_solo_base)
  SELECT worker_solo_base INTO v_base_rate FROM salary_settings LIMIT 1;
  IF v_base_rate IS NULL THEN
    RAISE EXCEPTION 'salary_settings_missing' USING ERRCODE = 'P0001';
  END IF;

  -- ✅ If base already taken today — just fix mode without re-charging
  IF v_worker.base_rate_taken_today THEN
    UPDATE workers SET
      working_mode = 'solo',
      working_mode_status = 'locked',
      partner_id = NULL,
      -- ❌ НЕ перезаписываем base_rate_amount - база уже зафиксирована на весь день
      status = 'available',
      updated_at = NOW()
    WHERE id = p_worker_id
    RETURNING * INTO v_worker;
  ELSE
    -- ✅ Accrue base + set all flags atomically
    v_new_earned_today := v_worker.earned_today + v_base_rate;
    UPDATE workers SET
      working_mode = 'solo',
      working_mode_status = 'locked',  -- БАЗА ЗАФИКСИРОВАНА
      partner_id = NULL,
      base_rate_amount = v_base_rate,  -- НАВСЕГДА
      base_rate_taken_today = TRUE,
      earned_today = v_new_earned_today,  -- Добавляем базу к дневному балансу
      status = 'available',
      updated_at = NOW()
    WHERE id = p_worker_id
    RETURNING * INTO v_worker;
  END IF;

  RETURN v_worker;
END;
$FUNC$;

ALTER FUNCTION public.select_worker_mode_solo(p_worker_id uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.select_worker_mode_solo(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.select_worker_mode_solo(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.select_worker_mode_solo(uuid) FROM authenticated;

-- ============================================================================
-- select_worker_pair_mode
-- 1:1 port of lib/api/workers.ts:647-807 (selectWorkerPairMode)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.select_worker_pair_mode(
  p_worker_id1 uuid,
  p_worker_id2 uuid
) RETURNS public.workers[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $FUNC$
DECLARE
  v_worker1 workers;
  v_worker2 workers;
  v_base_rate numeric;
  v_new_earned_today1 numeric;
  v_new_earned_today2 numeric;
  v_result workers[];
BEGIN
  -- Lock both, deterministic order to prevent deadlock
  IF p_worker_id1 < p_worker_id2 THEN
    SELECT * INTO v_worker1 FROM workers WHERE id = p_worker_id1 FOR UPDATE;
    SELECT * INTO v_worker2 FROM workers WHERE id = p_worker_id2 FOR UPDATE;
  ELSE
    SELECT * INTO v_worker2 FROM workers WHERE id = p_worker_id2 FOR UPDATE;
    SELECT * INTO v_worker1 FROM workers WHERE id = p_worker_id1 FOR UPDATE;
  END IF;

  IF v_worker1.id IS NULL OR v_worker2.id IS NULL THEN
    RAISE EXCEPTION 'worker_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Get salary settings (worker_pair_base)
  SELECT worker_pair_base INTO v_base_rate FROM salary_settings LIMIT 1;
  IF v_base_rate IS NULL THEN
    RAISE EXCEPTION 'salary_settings_missing' USING ERRCODE = 'P0001';
  END IF;

  -- ✅ If both already taken — just fix pair mode (no re-charge)
  --    Defensive: unreachable via current UI (pre-check ensures both waiting),
  --    preserved 1:1 for parity.
  IF v_worker1.base_rate_taken_today AND v_worker2.base_rate_taken_today THEN
    UPDATE workers SET
      working_mode = 'pair',
      working_mode_status = 'locked',
      partner_id = p_worker_id2,
      -- ❌ НЕ перезаписываем base_rate_amount - база уже зафиксирована
      status = 'available',
      updated_at = NOW()
    WHERE id = p_worker_id1
    RETURNING * INTO v_worker1;

    UPDATE workers SET
      working_mode = 'pair',
      working_mode_status = 'locked',
      partner_id = p_worker_id1,
      -- ❌ НЕ перезаписываем base_rate_amount
      status = 'available',
      updated_at = NOW()
    WHERE id = p_worker_id2
    RETURNING * INTO v_worker2;
  ELSE
    -- ✅ Accrue base for both atomically (same value)
    v_new_earned_today1 := v_worker1.earned_today + v_base_rate;
    v_new_earned_today2 := v_worker2.earned_today + v_base_rate;

    UPDATE workers SET
      working_mode = 'pair',
      working_mode_status = 'locked',  -- БАЗА ЗАФИКСИРОВАНА
      partner_id = p_worker_id2,
      base_rate_amount = v_base_rate,
      base_rate_taken_today = TRUE,
      earned_today = v_new_earned_today1,  -- Добавляем базу к дневному балансу
      status = 'available',
      updated_at = NOW()
    WHERE id = p_worker_id1
    RETURNING * INTO v_worker1;

    UPDATE workers SET
      working_mode = 'pair',
      working_mode_status = 'locked',
      partner_id = p_worker_id1,
      base_rate_amount = v_base_rate,
      base_rate_taken_today = TRUE,
      earned_today = v_new_earned_today2,
      status = 'available',
      updated_at = NOW()
    WHERE id = p_worker_id2
    RETURNING * INTO v_worker2;
  END IF;

  v_result := ARRAY[v_worker1, v_worker2];
  RETURN v_result;
END;
$FUNC$;

ALTER FUNCTION public.select_worker_pair_mode(p_worker_id1 uuid, p_worker_id2 uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.select_worker_pair_mode(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.select_worker_pair_mode(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.select_worker_pair_mode(uuid, uuid) FROM authenticated;

-- ============================================================================
-- change_worker_mode
-- 1:1 port of lib/api/workers.ts:817-891+ (changeWorkerMode)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.change_worker_mode(
  p_worker_id uuid,
  p_new_mode text,
  p_new_partner_id uuid DEFAULT NULL
) RETURNS public.workers
LANGUAGE plpgsql
SECURITY DEFINER
AS $FUNC$
DECLARE
  v_worker workers;
  v_booking record;
  v_booking_hour int;
  v_current_hour int;
  v_is_booking_time_passed boolean;
  v_is_booking_completed boolean;
  v_should_clear_booking_id boolean := FALSE;
  v_should_make_available boolean := FALSE;
BEGIN
  -- Lock + validate
  SELECT * INTO v_worker FROM workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'worker_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- ✅ Guard: only locked workers can change mode (must fix base first)
  IF v_worker.working_mode_status <> 'locked' THEN
    RAISE EXCEPTION 'base_rate_not_locked_use_select_worker_mode_first'
      USING ERRCODE = 'P0001',
            HINT = 'Use selectWorkerModeSolo/Pair RPC first to fix base rate';
  END IF;

  -- Validate new_mode
  IF p_new_mode NOT IN ('solo', 'pair') THEN
    RAISE EXCEPTION 'invalid_mode' USING ERRCODE = 'P0001';
  END IF;

  -- ✅ If switching to solo and has current_booking_id, check if нужно очистить
  IF p_new_mode = 'solo' AND v_worker.current_booking_id IS NOT NULL THEN
    SELECT start_time, booking_date, status
    INTO v_booking
    FROM bookings
    WHERE id = v_worker.current_booking_id;

    IF FOUND THEN
      v_booking_hour := COALESCE(NULLIF(split_part(v_booking.start_time::text, ':', 1), ''), '0')::int;
      v_current_hour := EXTRACT(HOUR FROM NOW())::int;

      v_is_booking_time_passed := v_booking_hour < v_current_hour;
      v_is_booking_completed := v_booking.status IN ('ГОТОВО', 'ОТМЕНЕНО');

      IF v_is_booking_time_passed OR v_is_booking_completed THEN
        v_should_clear_booking_id := TRUE;
        v_should_make_available := TRUE;
      END IF;
    END IF;
  ELSIF p_new_mode = 'solo' AND v_worker.current_booking_id IS NULL THEN
    v_should_make_available := TRUE;
  END IF;

  -- ✅ Update mode, partner, and conditional status/booking_id.
  --    БАЗУ НЕ ТРОГАЕМ (base_rate_amount, base_rate_taken_today, earned_today).
  UPDATE workers SET
    working_mode = p_new_mode,
    partner_id = CASE WHEN p_new_mode = 'pair' THEN p_new_partner_id ELSE NULL END,
    updated_at = NOW(),
    current_booking_id = CASE WHEN v_should_clear_booking_id THEN NULL ELSE current_booking_id END,
    status = CASE WHEN v_should_make_available THEN 'available' ELSE status END
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  RETURN v_worker;
END;
$FUNC$;

ALTER FUNCTION public.change_worker_mode(p_worker_id uuid, p_new_mode text, p_new_partner_id uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.change_worker_mode(uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.change_worker_mode(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.change_worker_mode(uuid, text, uuid) FROM authenticated;

-- Verify:
--   SELECT has_function_privilege('anon', 'public.select_worker_mode_solo(uuid)', 'EXECUTE');  -- f
--   SELECT has_function_privilege('authenticated', 'public.select_worker_mode_solo(uuid)', 'EXECUTE');  -- f
--   SELECT has_function_privilege('service_role', 'public.select_worker_mode_solo(uuid)', 'EXECUTE');  -- t
