-- ============================================================================
-- Migration 029a: extend update_worker whitelist to restore salary/booking flows
-- ============================================================================
-- Phase 2.5/Hotfix A — extends migration 026 whitelist to restore flows
-- broken by the security lockdown (handleWorkerAssigned, transferDailyEarnings,
-- payoutSalary, giveAdvance, addBookingEarnings, etc).
--
-- PRINCIPLE: pure passthrough. No new CHECK constraints, no new validation.
-- Original prod JS (commit 2bf8240: lib/api/workers.ts:225) was a thin
-- supabase.from('workers').update() wrapper — no validation. Same semantics
-- restored here. Table-level CHECKs (workers_status_check etc.) provide
-- existing schema validation; we don't duplicate them in RPC.
--
-- Fields restored to whitelist:
--   - status, current_booking_id  (assignment/release)
--   - current_balance, earned_today (transfer daily)
--   - is_advance_taken (advance)
--   - completed_bookings (earnings)
--
-- Fields STILL blacklisted (must go through specialized RPCs):
--   working_mode_status — via select_worker_mode_*, change_worker_mode
--   base_rate_amount, base_rate_taken_today — via select_worker_mode_*
--   is_working_today — via start_worker_shift, stop_worker_shift (commit 8)
--   last_shift_date — via start_worker_shift
--   days_worked_this_month, cars_today — server-derived, never client-updatable
--
-- Access: service_role only (anon/authenticated REVOKEd — already from 026).
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
  v_status text;
  v_current_booking_id uuid;
  v_current_balance numeric;
  v_earned_today numeric;
  v_is_advance_taken boolean;
  v_completed_bookings text[];
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

  -- Hotfix A: 6 additional salary/booking fields — pure passthrough
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
  IF p_updates ? 'completed_bookings' THEN
    -- ✅ completed_bookings is text[] (PostgreSQL _text array), NOT jsonb.
    -- Convert JSON array of strings to PostgreSQL text[].
    -- For empty array → empty text[] (cleared).
    -- For JSON null → empty text[] (cleared, NOT preserve — CLEARABLE semantics).
    -- For absent key → v_completed_bookings stays NULL → COALESCE preserves.
    -- For other JSON types (object, scalar) → throw to surface UI bugs.
    --
    -- ⚠️ DEVIATION from v2 (commit 1a1634a): jsonb_array_elements_text throws
    -- SQLSTATE 22023 on JSON null (treated as scalar). Must check jsonb_typeof
    -- first and route null→empty-array, non-array→throw. Caught by post-deploy
    -- smoke test 4 (`completed_bookings: null` → 22023 without this guard).
    IF jsonb_typeof(p_updates->'completed_bookings') = 'array' THEN
      v_completed_bookings := ARRAY(SELECT jsonb_array_elements_text(p_updates->'completed_bookings'));
    ELSIF jsonb_typeof(p_updates->'completed_bookings') = 'null' THEN
      v_completed_bookings := ARRAY[]::text[];
    ELSE
      RAISE EXCEPTION 'completed_bookings_must_be_array' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT * INTO v_worker FROM workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'worker_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Preserved from migration 026: working_mode/partner_id guard rails
  IF v_working_mode IS NOT NULL AND v_worker.working_mode_status <> 'waiting' THEN
    RAISE EXCEPTION 'working_mode_only_when_waiting' USING ERRCODE = 'P0001';
  END IF;
  IF v_partner_id IS NOT NULL AND v_worker.working_mode_status <> 'locked' THEN
    RAISE EXCEPTION 'partner_id_only_when_locked' USING ERRCODE = 'P0001';
  END IF;

  UPDATE workers SET
    full_name          = COALESCE(v_full_name, full_name),
    phone              = COALESCE(v_phone,              phone),
    card_number        = COALESCE(v_card_number,        card_number),
    payment_phone      = COALESCE(v_payment_phone,      payment_phone),
    payment_comment    = COALESCE(v_payment_comment,    payment_comment),
    salary_comment     = COALESCE(v_salary_comment,     salary_comment),
    is_active          = COALESCE(v_is_active,          is_active),
    working_mode       = COALESCE(v_working_mode,       working_mode),
    partner_id         = CASE WHEN p_updates ? 'partner_id'
                              THEN v_partner_id
                              ELSE partner_id END,
    status             = COALESCE(v_status,             status),
    current_booking_id = CASE WHEN p_updates ? 'current_booking_id'
                              THEN v_current_booking_id
                              ELSE current_booking_id END,
    current_balance    = COALESCE(v_current_balance,    current_balance),
    earned_today       = COALESCE(v_earned_today,       earned_today),
    is_advance_taken   = COALESCE(v_is_advance_taken,   is_advance_taken),
    completed_bookings = COALESCE(v_completed_bookings, completed_bookings),
    updated_at = NOW()
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  RETURN v_worker;
END;
$FUNC$;

-- ACL already from migration 026 (service_role only). No changes.