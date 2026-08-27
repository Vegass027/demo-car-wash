-- migrations/008_atomic_create_staff_carwash_booking_rpc.sql
--
-- Phase 2 / Slice #3b — atomic carwash booking create path.
--
-- Purpose: close the box-overlap race window that exists today in
-- `lib/api/bookings.ts:172-208` (frontend anon SELECT + non-atomic INSERT).
-- That preflight works on RLS-public_all_access only; once Phase 2 RLS
-- Category C turns off anon read of bookings, it becomes impossible.
-- This RPC is the only sanctioned path for staff to insert a booking
-- with a non-trivial (date, box, time) tuple.
--
-- Trust boundary:
--   * api/staff.ts handler validates the browser body, resolves FK IDs,
--     derives booking_source='admin', created_by_profile_id=claims.profile_id,
--     status='ОЖИДАЕТ', is_paid+paid_at, antifreeze overrides, and the
--     server-built services_with_quantities+price (see api/_lib/booking-services.ts
--     recomputeBookingServices). It passes ONLY typed scalars to this RPC.
--   * This RPC does NOT accept a raw browser JSONB. Every immutable
--     value (booking_source, created_by_profile_id, status) is server-
--     stamped inside the RPC and echoed back; client JSON cannot reach
--     those columns.
--   * Denormalized values (worker_name, worker_name_2, org_name,
--     signature_data) are read inside the RPC from workers / workers /
--     organizations / organization_drivers tables — never accepted from
--     caller.
--
-- Concurrency:
--   * `pg_advisory_xact_lock(hashtextextended(p_target_date::text||'|'||
--     p_box_number::text, 0))` — deterministic per (date, box); held
--     until the end of the calling RPC transaction (which is the
--     supabaseAdmin RPC call). Two parallel create-staff-booking for
--     the same (date, box) are serialized; second sees the first's
--     INSERT and gets BOX_OVERLAP. hashtextextended is built into
--     PostgreSQL (no pgcrypto dependency).
--   * No BEGIN/COMMIT in the function body — caller manages the
--     transaction; pg_advisory_xact_lock's xact scope covers it.
--   * No EXCEPTION WHEN OTHERS wrapper — BOX_OVERLAP and BOX_CLOSED
--     propagate raw to dispatcher; dispatcher matches error.message
--     EXACTLY (===) and maps to 409.
--
-- Closed-box logic: mirrors `lib/api/bookings.ts:172-189`. Reads
-- closed_boxes row by (box_number, closed_date, is_closed=true). If
-- found, extracts EXTRACT(HOUR FROM p_start_time)::int and tests
-- `= ANY(open_hours)`. open_hours is int[] (hours 8..18 in real data).
--
-- Deploy: single psql session; idempotent via IF EXISTS guard.
-- Owner: postgres. EXECUTE: service_role only.
--
-- Rollback: see migrations/008_atomic_create_staff_carwash_booking_rollback.sql

CREATE OR REPLACE FUNCTION public.create_staff_carwash_booking(
  p_target_date              date,
  p_box_number               integer,
  p_start_time               time,
  p_end_time                 time,
  p_client_name              text,
  p_phone                    text,
  p_car_model                text,
  p_plate_number             text,
  p_car_type                 text,
  p_services                 jsonb,
  p_services_with_quantities jsonb,
  p_price                    numeric,
  p_payment_method           text,
  p_worker_id                uuid,
  p_worker_id_2              uuid,
  p_working_mode             text,
  p_is_org                   boolean,
  p_organization_id          uuid,
  p_driver_id                uuid,
  p_car_id                   uuid,
  p_client_id                uuid,
  p_client_car_id            uuid,
  p_signature_obtained_at    timestamptz,
  p_is_quick_booking         boolean,
  p_discount                 numeric,
  p_is_paid                  boolean,
  p_paid_at                  timestamptz,
  p_created_by_profile_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_lock_key          bigint;
  v_open_hours        int[];
  v_start_hour        int;
  v_overlap           boolean;
  v_worker_name       text;
  v_worker_name_2     text;
  v_org_name          text;
  v_signature_data    text;
  v_booking           public.bookings%ROWTYPE;
BEGIN
  -- (1) Advisory lock — deterministic per (date, box).
  v_lock_key := hashtextextended(
    p_target_date::text || '|' || p_box_number::text,
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- (2) Closed-box check (mirrors lib/api/bookings.ts:172-189).
  SELECT open_hours
    INTO v_open_hours
    FROM public.closed_boxes
    WHERE box_number  = p_box_number
      AND closed_date = p_target_date
      AND is_closed   = true
    LIMIT 1;

  IF FOUND THEN
    v_start_hour := EXTRACT(HOUR FROM p_start_time)::int;
    IF NOT (v_start_hour = ANY(v_open_hours)) THEN
      RAISE EXCEPTION 'BOX_CLOSED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- (3) Re-check overlap AFTER lock. Active bookings on same (date, box)
  --     whose time window intersects [start_time, end_time] block.
  SELECT EXISTS (
    SELECT 1
      FROM public.bookings
      WHERE booking_date = p_target_date
        AND box_number   = p_box_number
        AND status NOT IN ('ОТМЕНЕНО', 'ГОТОВО')
        AND (EXTRACT(EPOCH FROM start_time)::int / 60) < EXTRACT(EPOCH FROM p_end_time)::int / 60
        AND (EXTRACT(EPOCH FROM end_time  )::int / 60) > EXTRACT(EPOCH FROM p_start_time)::int / 60
  ) INTO v_overlap;

  IF v_overlap THEN
    RAISE EXCEPTION 'BOX_OVERLAP' USING ERRCODE = 'P0001';
  END IF;

  -- (4) Server-derive denormalized names from FK parents.
  --     SECURITY DEFINER bypasses RLS — these reads are trusted.
  IF p_worker_id IS NOT NULL THEN
    SELECT full_name INTO v_worker_name
      FROM public.workers
      WHERE id = p_worker_id;
  END IF;

  IF p_worker_id_2 IS NOT NULL THEN
    SELECT full_name INTO v_worker_name_2
      FROM public.workers
      WHERE id = p_worker_id_2;
  END IF;

  IF p_organization_id IS NOT NULL THEN
    SELECT name INTO v_org_name
      FROM public.organizations
      WHERE id = p_organization_id;
  END IF;

  -- Driver signature auto-copy (matches lib/api/bookings.ts:233-242).
  IF p_is_org = true AND p_driver_id IS NOT NULL THEN
    SELECT signature_data INTO v_signature_data
      FROM public.organization_drivers
      WHERE id = p_driver_id;
  END IF;

  -- (5) INSERT. booking_source is server-stamped 'admin' (caller cannot
  --     pass it; this row echoes the policy from §5.10 of PROJECT_STATE).
  INSERT INTO public.bookings (
    client_name, phone, car_model, plate_number, car_type,
    services, services_with_quantities, price,
    payment_method, status,
    booking_date, start_time, end_time,
    box_number,
    worker_id, worker_name, worker_id_2, worker_name_2, working_mode,
    is_org, organization_id, driver_id, car_id, org_name,
    client_id, client_car_id,
    signature_data, signature_obtained_at,
    is_quick_booking, discount,
    is_paid, paid_at,
    booking_source, created_by_profile_id
  ) VALUES (
    p_client_name, p_phone, p_car_model, p_plate_number, p_car_type,
    p_services, p_services_with_quantities, p_price,
    p_payment_method, 'ОЖИДАЕТ',
    p_target_date, p_start_time, p_end_time,
    p_box_number,
    p_worker_id, v_worker_name, p_worker_id_2, v_worker_name_2, p_working_mode,
    p_is_org, p_organization_id, p_driver_id, p_car_id, v_org_name,
    p_client_id, p_client_car_id,
    v_signature_data, p_signature_obtained_at,
    p_is_quick_booking, p_discount,
    p_is_paid, p_paid_at,
    'admin', p_created_by_profile_id
  )
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking));
END;
$fn$;

-- (6) ACL: service_role only.
ALTER FUNCTION public.create_staff_carwash_booking(
  date, integer, time, time,
  text, text, text, text, text,
  jsonb, jsonb, numeric, text,
  uuid, uuid, text,
  boolean, uuid, uuid, uuid,
  uuid, uuid,
  timestamptz, boolean, numeric,
  boolean, timestamptz, uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_staff_carwash_booking(
  date, integer, time, time,
  text, text, text, text, text,
  jsonb, jsonb, numeric, text,
  uuid, uuid, text,
  boolean, uuid, uuid, uuid,
  uuid, uuid,
  timestamptz, boolean, numeric,
  boolean, timestamptz, uuid
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.create_staff_carwash_booking(
  date, integer, time, time,
  text, text, text, text, text,
  jsonb, jsonb, numeric, text,
  uuid, uuid, text,
  boolean, uuid, uuid, uuid,
  uuid, uuid,
  timestamptz, boolean, numeric,
  boolean, timestamptz, uuid
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_staff_carwash_booking(
  date, integer, time, time,
  text, text, text, text, text,
  jsonb, jsonb, numeric, text,
  uuid, uuid, text,
  boolean, uuid, uuid, uuid,
  uuid, uuid,
  timestamptz, boolean, numeric,
  boolean, timestamptz, uuid
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.create_staff_carwash_booking(
  date, integer, time, time,
  text, text, text, text, text,
  jsonb, jsonb, numeric, text,
  uuid, uuid, text,
  boolean, uuid, uuid, uuid,
  uuid, uuid,
  timestamptz, boolean, numeric,
  boolean, timestamptz, uuid
) TO service_role;
