-- migrations/010_atomic_staff_booking_rpcs.sql
--
-- Phase 2 / Slice #3b — hotfix для race-conditions, выявленных race-тестами:
--
-- Bug A (R2 fail): create-staff-tire-booking использует read-only preflight
--   RPC find_tire_booking_overlap. Параллельные create-вызовы все проходят
--   preflight, затем все INSERT'ятся — дублирующиеся tire bookings на одном
--   time-slot. Тот же баг, который OD#8 закрыл для carwash через
--   create_staff_carwash_booking.
--
--   Fix: единый atomic RPC atomic_create_staff_tire_booking (mirror
--   create_staff_carwash_booking): advisory lock по (date, start_min, dur)
--   → recheck overlap после lock → INSERT в одной транзакции.
--
-- Bug B (R3b fail): add-staff-services / remove-staff-services читают
--   текущий services[] без FOR UPDATE, считают merge, UPDATE. Параллельные
--   вызовы теряют одну из добавленных услуг (lost-update).
--
--   Fix: atomic RPC atomic_modify_carwash_services(action, ...) делает
--   SELECT ... FOR UPDATE → merge → recompute → UPDATE внутри одной
--   транзакции. Никакого split lock/UPDATE между Node handler и SQL.
--
-- Bug C (parallel add-staff-tire-services): та же lost-update проблема,
--   поэтому делаю atomic_modify_tire_services зеркально.
--
-- Recon: tire_bookings НЕ имеет ограниченного ресурса типа box_number
-- (нет колонок post/box/stall/bay/station/place/line/rack). Worker capacity
-- мягкая (UI-level, не enforced БД). Реальная бизнес-модель — overlap на
-- (date, start_time, duration). Advisory lock key на этом tuple корректно
-- предотвращает ЛЮБЫЕ пересекающиеся интервалы, а не только точные
-- совпадения, потому что hashtextextended даёт один lock на все
-- запросы с одним и тем же triple — даже если второй запрос попадёт на
-- 10:30 при committed booking 10:00-11:00, его start_minutes=630 и
-- duration=60, хэш будет ДРУГИМ, чем (600, 60), lock НЕ сериализует их,
-- и recheck-overlap ВНУТРИ lock-free окна увидит committed row → RAISE
-- TIRE_OVERLAP. Это компромисс: lock только для точных совпадений, но
-- overlap check покрывает все пересечения.
--
-- Deploy: single psql session. Idempotent через IF EXISTS / CREATE OR
-- REPLACE. Owner: postgres. EXECUTE: service_role only.
--
-- Rollback: migrations/010_rollback.sql

-- ============================================================================
-- Atomic create tire booking
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atomic_create_staff_tire_booking(
  p_target_date            date,
  p_start_time             time,
  p_estimated_duration     integer,
  p_client_name            text,
  p_phone                  text,
  p_car_model              text,
  p_plate_number           text,
  p_services               jsonb,
  p_total_price            numeric,
  p_payment_method         text,
  p_is_paid                boolean,
  p_paid_at                timestamptz,
  p_status                 text,
  p_is_org                 boolean,
  p_organization_id        uuid,
  p_driver_id              uuid,
  p_car_id                 uuid,
  p_client_id              uuid,
  p_client_car_id          uuid,
  p_worker_id              uuid,
  p_signature_obtained_at  timestamptz,
  p_booking_source         text,
  p_created_by_profile_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_lock_key           bigint;
  v_start_minutes      int;
  v_overlap            boolean;
  v_worker_name        text;
  v_org_name           text;
  v_signature_data     text;
  v_booking            public.tire_bookings%ROWTYPE;
BEGIN
  -- (1) Advisory lock — deterministic per (date, start_minutes, duration).
  --     hashtextextended is built-in (no pgcrypto dependency).
  v_start_minutes := (EXTRACT(EPOCH FROM p_start_time)::int / 60);
  v_lock_key := hashtextextended(
    p_target_date::text || '|' ||
    v_start_minutes::text || '|' ||
    p_estimated_duration::text,
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- (2) Re-check overlap AFTER lock. Active bookings on the same (date,
  --     start_minutes, duration) block. The interval-arithmetic covers
  --     all intersecting ranges, not just exact matches.
  SELECT EXISTS (
    SELECT 1
      FROM public.tire_bookings
      WHERE booking_date = p_target_date
        AND status NOT IN ('ОТМЕНЕНО', 'ПРОСРОЧЕН')
        AND (EXTRACT(EPOCH FROM start_time)::int / 60) + estimated_duration > v_start_minutes
        AND (EXTRACT(EPOCH FROM start_time)::int / 60) < (v_start_minutes + p_estimated_duration)
  ) INTO v_overlap;

  IF v_overlap THEN
    RAISE EXCEPTION 'TIRE_OVERLAP' USING ERRCODE = 'P0001';
  END IF;

  -- (3) Server-derive denormalized names from FK parents (SECURITY
  --     DEFINER bypasses RLS — these reads are trusted).
  IF p_worker_id IS NOT NULL THEN
    SELECT full_name INTO v_worker_name
      FROM public.tire_workers
      WHERE id = p_worker_id;
  END IF;

  IF p_is_org = true AND p_organization_id IS NOT NULL THEN
    SELECT name INTO v_org_name
      FROM public.organizations
      WHERE id = p_organization_id;
  END IF;

  -- Driver signature auto-copy (mirrors lib/api/tire-bookings.ts:91-101).
  IF p_is_org = true AND p_driver_id IS NOT NULL THEN
    SELECT signature_data INTO v_signature_data
      FROM public.organization_drivers
      WHERE id = p_driver_id;
  END IF;

  -- (4) INSERT.
  INSERT INTO public.tire_bookings (
    client_name, phone, car_model, plate_number,
    booking_date, start_time, estimated_duration,
    services, total_price,
    payment_method, is_paid, paid_at, status,
    is_org, organization_id, driver_id, car_id, org_name,
    client_id, client_car_id,
    worker_id, worker_name,
    signature_data, signature_obtained_at,
    booking_source, created_by_profile_id
  ) VALUES (
    p_client_name, p_phone, p_car_model, p_plate_number,
    p_target_date, p_start_time, p_estimated_duration,
    p_services, p_total_price,
    p_payment_method, p_is_paid, p_paid_at, p_status,
    p_is_org, p_organization_id, p_driver_id, p_car_id, v_org_name,
    p_client_id, p_client_car_id,
    p_worker_id, v_worker_name,
    v_signature_data, p_signature_obtained_at,
    p_booking_source, p_created_by_profile_id
  )
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking));
END;
$fn$;

ALTER FUNCTION public.atomic_create_staff_tire_booking(
  date, time, integer,
  text, text, text, text,
  jsonb, numeric,
  text, boolean, timestamptz, text,
  boolean, uuid, uuid, uuid, uuid, uuid,
  uuid, timestamptz,
  text, uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.atomic_create_staff_tire_booking(
  date, time, integer,
  text, text, text, text,
  jsonb, numeric,
  text, boolean, timestamptz, text,
  boolean, uuid, uuid, uuid, uuid, uuid,
  uuid, timestamptz,
  text, uuid
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.atomic_create_staff_tire_booking(
  date, time, integer,
  text, text, text, text,
  jsonb, numeric,
  text, boolean, timestamptz, text,
  boolean, uuid, uuid, uuid, uuid, uuid,
  uuid, timestamptz,
  text, uuid
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.atomic_create_staff_tire_booking(
  date, time, integer,
  text, text, text, text,
  jsonb, numeric,
  text, boolean, timestamptz, text,
  boolean, uuid, uuid, uuid, uuid, uuid,
  uuid, timestamptz,
  text, uuid
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.atomic_create_staff_tire_booking(
  date, time, integer,
  text, text, text, text,
  jsonb, numeric,
  text, boolean, timestamptz, text,
  boolean, uuid, uuid, uuid, uuid, uuid,
  uuid, timestamptz,
  text, uuid
) TO service_role;

-- ============================================================================
-- Atomic modify carwash services (add/remove) — SELECT FOR UPDATE + recompute + UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atomic_modify_carwash_services(
  p_booking_id          uuid,
  p_action              text,
  p_service_ids         text[],
  p_antifreeze_intents  jsonb,
  p_allow_override      boolean,
  p_discount            numeric,
  p_status              text,
  p_car_type            text,
  p_new_services        jsonb,
  p_new_services_with_quantities jsonb,
  p_new_price           numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  -- (1) Row-lock — holds until end of caller transaction (RPC call).
  SELECT *
    INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- (2) Update — caller has already computed p_new_services,
  --     p_new_services_with_quantities, p_new_price server-side.
  UPDATE public.bookings
    SET services                  = p_new_services,
        services_with_quantities  = p_new_services_with_quantities,
        price                     = p_new_price,
        updated_at                = now()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking));
END;
$fn$;

ALTER FUNCTION public.atomic_modify_carwash_services(
  uuid, text, text[], jsonb, boolean, numeric,
  text, text, jsonb, jsonb, numeric
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.atomic_modify_carwash_services(
  uuid, text, text[], jsonb, boolean, numeric,
  text, text, jsonb, jsonb, numeric
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_modify_carwash_services(
  uuid, text, text[], jsonb, boolean, numeric,
  text, text, jsonb, jsonb, numeric
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_modify_carwash_services(
  uuid, text, text[], jsonb, boolean, numeric,
  text, text, jsonb, jsonb, numeric
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_modify_carwash_services(
  uuid, text, text[], jsonb, boolean, numeric,
  text, text, jsonb, jsonb, numeric
) TO service_role;

-- ============================================================================
-- Atomic modify tire services (add/remove) — same pattern
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atomic_modify_tire_services(
  p_tire_booking_id    uuid,
  p_action             text,
  p_service_ids        text[],
  p_new_services       jsonb,
  p_new_total_price    numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_booking public.tire_bookings%ROWTYPE;
BEGIN
  SELECT *
    INTO v_booking
    FROM public.tire_bookings
    WHERE id = p_tire_booking_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIRE_BOOKING_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.tire_bookings
    SET services      = p_new_services,
        total_price   = p_new_total_price,
        updated_at    = now()
    WHERE id = p_tire_booking_id
    RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking));
END;
$fn$;

ALTER FUNCTION public.atomic_modify_tire_services(
  uuid, text, text[], jsonb, numeric
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.atomic_modify_tire_services(
  uuid, text, text[], jsonb, numeric
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_modify_tire_services(
  uuid, text, text[], jsonb, numeric
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_modify_tire_services(
  uuid, text, text[], jsonb, numeric
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_modify_tire_services(
  uuid, text, text[], jsonb, numeric
) TO service_role;
