-- migrations/002_cancel_own_booking_rpc.sql
--
-- Phase 2 / Slice #1 (client car-wash flow).
--
-- Transactional cancel RPC for client-own booking.
-- SERVICE-ROLE EXECUTE ONLY (no anon, no authenticated).
--
-- DEPLOYMENT INSTRUCTIONS (Supavisor-safe, single short sessions):
-- This file is applied as TWO separate short psql sessions in commit #1:
--   Session A (preflight already verified false at apply time):
--     psql -c "ALTER TABLE public.booking_cancellations
--              ADD CONSTRAINT booking_cancellations_booking_unique UNIQUE (booking_id);"
--   Session B (function + ALTER OWNER + REVOKE + GRANT):
--     psql -c "<contents of this file from line 17 onward, function body and grants>"
-- Each session is short, no DO block, no transactional wrapper
-- (per PROJECT_STATE.md §5.6 Supavisor workaround).
--
-- The constraint itself is idempotent via preflight only — manual re-apply
-- would error with duplicate object. Re-application policy: NEVER re-run
-- session A blindly; always preflight first.

-- ============================================================================
-- Function definition follows. Apply via session B (separate psql call).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_own_booking(
  p_booking_id uuid,
  p_profile_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_booking                bookings%ROWTYPE;
  v_status                 varchar;
  v_client_id              uuid;
  v_existing_cancellation  boolean;
  v_cancellation_count     int;
  v_blocked_until          date;
  v_blocked_now            bool := false;
BEGIN
  -- (1) Row-lock + full row in one SELECT.
  SELECT *
    INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND_OR_NOT_OWNED';
  END IF;

  v_client_id := v_booking.client_id;
  v_status    := v_booking.status;

  -- (2) Ownership. UUID equality, no text casts.
  PERFORM 1
    FROM public.clients c
    WHERE c.id = v_client_id
      AND c.profile_id = p_profile_id
    LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND_OR_NOT_OWNED';
  END IF;

  -- (3) Idempotency, primary: existing cancellation event row.
  SELECT EXISTS (
    SELECT 1 FROM public.booking_cancellations
    WHERE booking_id = p_booking_id
  ) INTO v_existing_cancellation;
  IF v_existing_cancellation THEN
    RETURN jsonb_build_object(
      'booking',           to_jsonb(v_booking),
      'already_cancelled', true,
      'blocked',           false,
      'blocked_until',     null
    );
  END IF;

  -- (3b) Idempotency, fallback: status='ОТМЕНЕНО' без event row (исторически inconsistent).
  IF v_status = 'ОТМЕНЕНО' THEN
    RETURN jsonb_build_object(
      'booking',           to_jsonb(v_booking),
      'already_cancelled', true,
      'blocked',           false,
      'blocked_until',     null
    );
  END IF;

  -- (4) Status guard: only ОЖИДАЕТ or В РАБОТЕ can be cancelled.
  IF v_status NOT IN ('ОЖИДАЕТ', 'В РАБОТЕ') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANNOT_CANCEL_STATUS_' || v_status;
  END IF;

  -- (5) Update booking.
  UPDATE public.bookings
    SET status         = 'ОТМЕНЕНО',
        cancel_comment = 'Отменено клиентом',
        updated_at     = now()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

  -- (6) Single cancellation event row. UNIQUE(booking_id) DB-level guard.
  INSERT INTO public.booking_cancellations
    (client_id, booking_id, cancelled_at, reason)
    VALUES (v_client_id, p_booking_id, now(), 'client_self_cancel');

  -- (7) Rolling 30-day count (includes this one).
  SELECT COUNT(*) INTO v_cancellation_count
    FROM public.booking_cancellations
    WHERE client_id = v_client_id
      AND cancelled_at >= (now() - INTERVAL '30 days');

  -- (8) Conditional 30-day block.
  IF v_cancellation_count >= 3 THEN
    v_blocked_until := (current_date + 30);
    UPDATE public.clients
      SET online_booking_blocked_until = v_blocked_until
      WHERE id = v_client_id;
    v_blocked_now := true;
  END IF;

  RETURN jsonb_build_object(
    'booking',           to_jsonb(v_booking),
    'already_cancelled', false,
    'blocked',           v_blocked_now,
    'blocked_until',     v_blocked_until
  );
  -- No EXCEPTION WHEN OTHERS. Postgres natural error propagation handles unexpected errors.
  -- Endpoint adapter maps P0001 to 404/409; everything else → 500 with logging.
END;
$fn$;

-- Order matters: ALTER OWNER TO postgres resets default ACL to
-- {=X/postgres, postgres=X/postgres, anon=X/postgres,
--  authenticated=X/postgres, service_role=X/postgres}.
-- We must REVOKE anon + authenticated explicitly (REVOKE ALL FROM PUBLIC alone
-- does NOT remove per-role entries granted by postgres-owner default).
ALTER FUNCTION public.cancel_own_booking(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_own_booking(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_own_booking(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_own_booking(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_booking(uuid, uuid) TO service_role;
