-- migrations/005_cancel_own_tire_booking_rpc.sql
--
-- Phase 2 / Slice #2 (tire client flow).
--
-- Transactional cancel RPC for client-own tire_booking.
-- SERVICE-ROLE EXECUTE ONLY (no anon, no authenticated).
--
-- DEPLOYMENT ORDER:
--   1. migrations/006_idempotent_block_on_tire_cancel.sql
--      (CREATE UNIQUE INDEX CONCURRENTLY — DB-level guard for race integrity).
--      MUST run before this file. Without UNIQUE INDEX, INSERT step (6) has a
--      race window for duplicate cancellation rows under concurrent RPC calls.
--   2. THIS file (cancel_own_tire_booking RPC + REVOKE + GRANT).
--
-- DESIGN:
-- * FOR UPDATE row-lock on tire_bookings. Holds through whole transaction.
-- * Ownership chain: tire_bookings.client_id → clients.profile_id (NOT
--   tire_bookings.created_by_profile_id — confirmed by recon).
--   Strict equality, no text casts.
-- * Idempotency:
--     (a) Existing cancellation event row → echo `already_cancelled=true`.
--     (b) Status='ОТМЕНЕНО' без event row → echo (historical inconsistency).
-- * Status guard: только ОЖИДАЕТ (tire client business rule — booking
--   которое уже 'В РАБОТЕ' не отменяется через Mini App, master tips it
--   in workshop). NOT 'В РАБОТЕ' / 'ГОТОВО' / 'ПРОСРОЧЕН' → 409.
-- * Carwash RPC v1 had 'ОЖИДАЕТ' + 'В РАБОТЕ' both allowed. For tire we
--   start stricter (only ОЖИДАЕТ). Easier to relax later than tighten.
-- * Booking update: only status + updated_at (no cancel_comment — that's
--   carwash-specific).
-- * Shared 30-day counter (carwash + tire combined, by client_id).
--   getClientCancellationCount in lib/api/booking-cancellations.ts:43
--   already aggregates without type filter. No business-logic change here.
-- * Policy C block guard (idempotent since first application).
--   Only updates online_booking_blocked_until when NULL or in the past.
--   Same pattern as carwash Slice #1 migration 003.

CREATE OR REPLACE FUNCTION public.cancel_own_tire_booking(
  p_tire_booking_id uuid,
  p_profile_id      uuid,
  p_reason          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_tire_booking           tire_bookings%ROWTYPE;
  v_status                 varchar;
  v_client_id              uuid;
  v_existing_cancellation  boolean;
  v_cancellation_count     int;
  v_blocked_until          date;
  v_existing_block_until   date;
  v_blocked_now            bool := false;
BEGIN
  -- (1) Row-lock + full row.
  SELECT *
    INTO v_tire_booking
    FROM public.tire_bookings
    WHERE id = p_tire_booking_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND_OR_NOT_OWNED';
  END IF;

  v_client_id := v_tire_booking.client_id;
  v_status    := v_tire_booking.status;

  -- (2) Ownership through tire_bookings.client_id → clients.profile_id.
  --     Empty client_id means admin-flow booking (no client linkage);
  --     that path won't legitimately carry a profile-bound cancellation.
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND_OR_NOT_OWNED';
  END IF;

  PERFORM 1
    FROM public.clients c
    WHERE c.id = v_client_id
      AND c.profile_id = p_profile_id
    LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_FOUND_OR_NOT_OWNED';
  END IF;

  -- (3) Idempotency primary: existing cancellation event row.
  SELECT EXISTS (
    SELECT 1 FROM public.booking_cancellations
    WHERE tire_booking_id = p_tire_booking_id
  ) INTO v_existing_cancellation;
  IF v_existing_cancellation THEN
    RETURN jsonb_build_object(
      'booking',           to_jsonb(v_tire_booking),
      'already_cancelled', true,
      'blocked',           false,
      'blocked_until',     null
    );
  END IF;

  -- (3b) Idempotency fallback: status='ОТМЕНЕНО' without event row.
  IF v_status = 'ОТМЕНЕНО' THEN
    RETURN jsonb_build_object(
      'booking',           to_jsonb(v_tire_booking),
      'already_cancelled', true,
      'blocked',           false,
      'blocked_until',     null
    );
  END IF;

  -- (4) Status guard: only ОЖИДАЕТ — strict tire client flow.
  IF v_status <> 'ОЖИДАЕТ' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CANNOT_CANCEL_STATUS_' || v_status;
  END IF;

  -- (5) Update tire_booking.
  UPDATE public.tire_bookings
    SET status     = 'ОТМЕНЕНО',
        updated_at = now()
    WHERE id = p_tire_booking_id
    RETURNING * INTO v_tire_booking;

  -- (6) Cancellation event. UNIQUE INDEX on (tire_booking_id) WHERE NOT NULL
  --     (applied via 006) is the DB-level race guard.
  INSERT INTO public.booking_cancellations
    (client_id, tire_booking_id, cancelled_at, reason)
    VALUES (
      v_client_id,
      p_tire_booking_id,
      now(),
      COALESCE(p_reason, 'client_self_cancel')
    );

  -- (7) Shared rolling 30-day count for the same client_id (carwash + tire).
  SELECT COUNT(*) INTO v_cancellation_count
    FROM public.booking_cancellations
    WHERE client_id = v_client_id
      AND cancelled_at >= (now() - INTERVAL '30 days');

  -- (8) Conditional 30-day block — idempotent (Policy C guard).
  SELECT online_booking_blocked_until
    INTO v_existing_block_until
    FROM public.clients
    WHERE id = v_client_id;

  IF v_cancellation_count >= 3 THEN
    IF v_existing_block_until IS NULL OR v_existing_block_until < current_date THEN
      v_blocked_until := (current_date + 30);
      UPDATE public.clients
        SET online_booking_blocked_until = v_blocked_until
        WHERE id = v_client_id;
      v_blocked_now := true;
    ELSE
      v_blocked_until := v_existing_block_until;
      v_blocked_now := false;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'booking',           to_jsonb(v_tire_booking),
    'already_cancelled', false,
    'blocked',           v_blocked_now,
    'blocked_until',     v_blocked_until
  );
END;
$fn$;

-- Order matters: ALTER OWNER TO postgres resets default ACL to
-- {=X/postgres, postgres=X/postgres, anon=X/postgres,
--  authenticated=X/postgres, service_role=X/postgres}.
-- Must REVOKE anon + authenticated explicitly afterwards.
ALTER FUNCTION public.cancel_own_tire_booking(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cancel_own_tire_booking(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_own_tire_booking(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_own_tire_booking(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_tire_booking(uuid, uuid, text) TO service_role;
