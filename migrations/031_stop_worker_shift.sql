-- ============================================================================
-- Migration 031: stop_worker_shift RPC (mirror prod lib/api/workers.ts:224)
-- ============================================================================
-- Phase 2.5/Commit 8 — restore off-shift toggle parity with prod.
--
-- Prod off-shift (lib/api/features/workers/calculateEarnings.ts:194-211):
--   updateWorker({is_working_today:false, working_mode_status:'waiting',
--     working_mode:null, partner_id:null, status:'offline'})
--   direct supabase anon (prod has UPDATE access without RLS lockdown).
--
-- Demo (after Phase 2.5): anon UPDATE blocked. Need RPC path.
-- 1:1 mirror prod semantics: UPDATE only the 6 fields prod updates,
-- all other fields (last_shift_date, earned_today, current_balance,
-- base_rate_amount, base_rate_taken_today, cars_today,
-- completed_bookings, is_advance_taken) preserved automatically because
-- not in SET clause.
--
-- Does NOT touch work_shifts row — by design (prod doesn't either).
-- reset_daily cron closes all 'working' shifts on next daily reset.
--
-- NO idempotency guard — prod runs UPDATE unconditionally every time,
-- which is harmless (same values get re-applied). Re-running off-shift
-- multiple times is a no-op write, not an error.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.stop_worker_shift(p_worker_id uuid)
RETURNS public.workers
LANGUAGE plpgsql
SECURITY DEFINER
AS $FUNC$
DECLARE
  v_worker workers;
BEGIN
  -- 🔒 Lock worker (serializes parallel OFF calls — mechanical, not business logic)
  SELECT * INTO v_worker FROM workers WHERE id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'worker_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- ✅ Pure passthrough — always execute UPDATE, mirror prod updateWorker body.
  -- 6 fields, mirror prod calcEarnings.ts:194-204:
  --   is_working_today=false, working_mode_status='waiting',
  --   working_mode=NULL, partner_id=NULL, status='offline',
  --   current_booking_id=NULL
  -- All other fields preserved automatically (not in SET).
  UPDATE workers SET
    is_working_today = FALSE,
    working_mode_status = 'waiting',
    working_mode = NULL,
    partner_id = NULL,
    status = 'offline',
    current_booking_id = NULL,
    updated_at = NOW()
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  RETURN v_worker;
END;
$FUNC$;

ALTER FUNCTION public.stop_worker_shift(uuid) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.stop_worker_shift(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stop_worker_shift(uuid) TO service_role;