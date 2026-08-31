-- ============================================================================
-- Migration 029b: update_tire_worker RPC (parallel to 029a update_worker)
-- ============================================================================
-- Phase 2.5/Hotfix B — restores tire_worker UI flows broken by Commit 1:
--   transferDailyEarningsToBalanceForTechnician (manageBalance.ts:124)
--   payoutSalaryForTechnician (manageBalance.ts:253)
--   giveAdvanceForTechnician (manageBalance.ts:324)
--   revertTireWorkerPayoutTransaction (manageBalance.ts:405)
--   addCompletedBookingToTechnician (calculateEarnings.ts:121)
--   handleSaveCardDetails/Payment/SalaryComment (TireTechnicianCard.tsx)
--
-- PRINCIPLE: passthrough (same as 029a). No new CHECK constraints.
-- tire_workers_status_check table constraint enforces status enum.
--
-- Fields (14):
--   metadata (7): full_name, phone, card_number, payment_phone,
--     payment_comment, salary_comment, is_active
--   salary/booking (7): status, current_booking_id, current_balance,
--     earned_today, is_advance_taken, cars_today, completed_bookings (text[])
--
-- NOT in whitelist (intentional):
--   is_working_today — via start_tire_worker_shift / stop_tire_worker_shift
--     RPCs (already exist from migration 019a). UI rewire in Hotfix B commit.
--   last_shift_date — via start_tire_worker_shift RPC
--
-- Access: service_role only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_tire_worker(
  p_worker_id uuid,
  p_updates jsonb
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
  v_status text;
  v_current_booking_id uuid;
  v_current_balance numeric;
  v_earned_today numeric;
  v_is_advance_taken boolean;
  v_cars_today numeric;
  v_completed_bookings text[];
BEGIN
  v_full_name := p_updates->>'full_name';
  v_phone := p_updates->>'phone';
  v_card_number := p_updates->>'card_number';
  v_payment_phone := p_updates->>'payment_phone';
  v_payment_comment := p_updates->>'payment_comment';
  v_salary_comment := p_updates->>'salary_comment';
  IF p_updates ? 'is_active' THEN
    v_is_active := (p_updates->>'is_active')::boolean;
  END IF;

  v_status := p_updates->>'status';
  IF p_updates ? 'current_booking_id' THEN
    v_current_booking_id := NULLIF(p_updates->>'current_booking_id','')::uuid;
  END IF;
  IF p_updates ? 'current_balance' THEN
    v_current_balance := (p_updates->>'current_balance')::numeric;
  END IF;
  IF p_updates ? 'earned_today' THEN
    v_earned_today := (p_updates->>'earned_today')::numeric;
  END IF;
  IF p_updates ? 'is_advance_taken' THEN
    v_is_advance_taken := (p_updates->>'is_advance_taken')::boolean;
  END IF;
  IF p_updates ? 'cars_today' THEN
    v_cars_today := (p_updates->>'cars_today')::numeric;
  END IF;
  IF p_updates ? 'completed_bookings' THEN
    IF jsonb_typeof(p_updates->'completed_bookings') = 'array' THEN
      v_completed_bookings := ARRAY(SELECT jsonb_array_elements_text(p_updates->'completed_bookings'));
    ELSIF jsonb_typeof(p_updates->'completed_bookings') = 'null' THEN
      v_completed_bookings := ARRAY[]::text[];
    ELSE
      RAISE EXCEPTION 'completed_bookings_must_be_array' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT * INTO v_worker FROM tire_workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tire_worker_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE tire_workers SET
    full_name          = COALESCE(v_full_name, full_name),
    phone              = COALESCE(v_phone, phone),
    card_number        = COALESCE(v_card_number, card_number),
    payment_phone      = COALESCE(v_payment_phone, payment_phone),
    payment_comment    = COALESCE(v_payment_comment, payment_comment),
    salary_comment     = COALESCE(v_salary_comment, salary_comment),
    is_active          = COALESCE(v_is_active, is_active),
    status             = COALESCE(v_status, status),
    current_booking_id = CASE WHEN p_updates ? 'current_booking_id'
                              THEN v_current_booking_id
                              ELSE current_booking_id END,
    current_balance    = COALESCE(v_current_balance, current_balance),
    earned_today       = COALESCE(v_earned_today, earned_today),
    is_advance_taken   = COALESCE(v_is_advance_taken, is_advance_taken),
    cars_today         = COALESCE(v_cars_today, cars_today),
    completed_bookings = COALESCE(v_completed_bookings, completed_bookings),
    updated_at = NOW()
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  RETURN v_worker;
END;
$FUNC$;

ALTER FUNCTION public.update_tire_worker(uuid, jsonb) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.update_tire_worker(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_tire_worker(uuid, jsonb) TO service_role;