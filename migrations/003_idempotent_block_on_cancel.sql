-- migrations/003_idempotent_block_on_cancel.sql
--
-- Phase 2 / Slice #1, follow-up policy C (idempotent block).
-- Author: agent on 2026-08-26.
--
-- Original (migration 002) block logic unconditionally extended the block
-- to `current_date + 30` on every 3rd cancel, so successive cancels
-- could infinitely extend an active block instead of letting it
-- expire on the original schedule.
--
-- This patch makes the block update idempotent: it only re-applies
-- when the existing `online_booking_blocked_until` is NULL or already
-- in the past. The 3-cancel threshold is unchanged.
--
-- Count semantics also unchanged: `v_cancellation_count` and
-- `INSERT INTO booking_cancellations` (with UNIQUE(booking_id) guard)
-- still run on every cancel. Idempotency only prevents the side-effect
-- of NEW 30-day extensions.
--
-- Deployment: applied as 2 short psql sessions (function replace + grants).
-- No DO-block, no data migration (table is empty in production).

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
  v_existing_block_until   date;
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
      'booking', to_jsonb(v_booking),
      'already_cancelled', true,
      'blocked', false,
      'blocked_until', null
    );
  END IF;

  -- (3b) Idempotency, fallback: status='ОТМЕНЕНО' без event row (исторически inconsistent).
  IF v_status = 'ОТМЕНЕНО' THEN
    RETURN jsonb_build_object(
      'booking', to_jsonb(v_booking),
      'already_cancelled', true,
      'blocked', false,
      'blocked_until', null
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

  -- (8) Conditional 30-day block — IDEMPOTENT GUARD.
  --     Read the current block state (after the FOR UPDATE on bookings
  --     serialized this client_id within the transaction).
  SELECT online_booking_blocked_until
    INTO v_existing_block_until
    FROM public.clients
    WHERE id = v_client_id;

  IF v_cancellation_count >= 3 THEN
    IF v_existing_block_until IS NULL OR v_existing_block_until < current_date THEN
      -- Either unblocked or last block has expired — apply a new 30-day block
      -- from today. (Repeated cancels inside an ACTIVE block do not extend it.)
      v_blocked_until := (current_date + 30);
      UPDATE public.clients
        SET online_booking_blocked_until = v_blocked_until
        WHERE id = v_client_id;
      v_blocked_now := true;
    ELSE
      -- Block is already active. Do NOT extend.
      v_blocked_until := v_existing_block_until;
      v_blocked_now := false;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'booking',           to_jsonb(v_booking),
    'already_cancelled', false,
    'blocked',           v_blocked_now,
    'blocked_until',     v_blocked_until
  );
END;
$fn$;

ALTER FUNCTION public.cancel_own_booking(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_own_booking(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_own_booking(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_own_booking(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_booking(uuid, uuid) TO service_role;
