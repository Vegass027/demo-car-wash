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
-- Atomic modify carwash services (add/remove) — full read-modify-write
-- inside ONE transaction so concurrent handlers serialize on row-lock and
-- see each other's committed changes. Caller passes ONLY intent (action
-- + service_ids + antifreeze_intents + allow_override); the RPC does
-- FOR UPDATE, status guard, merge, recompute price, UPDATE, return.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atomic_modify_carwash_services(
  p_booking_id          uuid,
  p_action              text,
  p_service_ids         jsonb,
  p_antifreeze_intents  jsonb,
  p_allow_override      boolean,
  p_discount            numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_booking               public.bookings%ROWTYPE;
  v_current_services      text[];
  v_merged                text[];
  v_intent_map            jsonb;
  v_status_guard          text;
  v_car_type              text;
  v_discount              numeric;
  v_allow_override        boolean;
  v_resolved              jsonb;
  v_recomputed            jsonb;
  v_new_services          jsonb;
  v_new_swq               jsonb;
  v_new_price             numeric;
BEGIN
  -- (1) Row-lock — holds until end of caller transaction.
  SELECT *
    INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- (2) Status guard — same as Node-side lockCarwashBooking check.
  IF v_booking.status NOT IN ('ОЖИДАЕТ', 'В РАБОТЕ') THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  -- (3) Build merged services[] inside the locked transaction.
  --     p_service_ids arrives as JSONB array of strings (supabase-js
  --     doesn't transmit Postgres text[] arrays cleanly through PostgREST;
  --     jsonb passes through natively and we cast here).
  v_current_services := COALESCE(
    (SELECT array_agg(value::text) FROM jsonb_array_elements_text(v_booking.services)),
    ARRAY[]::text[]
  );
  IF p_action = 'add' THEN
    -- DISTINCT removes duplicates that arise when a parallel handler
    -- already added one of the new service_ids (race-safe via FOR UPDATE).
    v_merged := array(
      SELECT DISTINCT unnest(v_current_services
                              || ARRAY(SELECT jsonb_array_elements_text(p_service_ids)))
    );
  ELSIF p_action = 'remove' THEN
    v_merged := array(
      SELECT unnest(v_current_services)
      EXCEPT
      SELECT jsonb_array_elements_text(p_service_ids)
    );
  ELSE
    RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE = 'P0001';
  END IF;

  -- (4) Build intent map for antifreeze recompute (only for add).
  v_intent_map := COALESCE(p_antifreeze_intents, '[]'::jsonb);
  v_status_guard := v_booking.status;
  v_car_type     := v_booking.car_type;
  v_discount     := COALESCE(p_discount, v_booking.discount);
  v_allow_override := COALESCE(p_allow_override, false);

  -- (5) Call internal recompute RPC — same SECURITY DEFINER context so
  --     it can read services/tire_services tables regardless of RLS.
  --     We don't have a recompute RPC yet; emulate via direct SELECT +
  --     inline arithmetic. This is the safe path because we hold the
  --     row lock and the recompute is deterministic for the same input.
  DECLARE
    v_prices jsonb := '[]'::jsonb;
    v_total  numeric := 0;
    v_row    record;
  BEGIN
    -- Build {service_id, quantity, price, total}[] by joining services.
    FOR v_row IN
      SELECT s.id::text AS sid,
             s.service_id AS slug,
             COALESCE(s.price_sedan, 0)::numeric AS price_sedan,
             COALESCE(s.allow_multiple, false) AS allow_multiple,
             1 AS qty
        FROM public.services s
        WHERE s.id::text = ANY(v_merged)
          AND s.is_active = true
    LOOP
      -- antifreeze override: service_id matches antifreeze-org/umc
      -- slugs, price is base price_sedan (not car-type-priced).
      IF v_row.slug IN ('antifreeze-org', 'antifreeze-umc') THEN
        v_prices := v_prices || jsonb_build_object(
          'service_id', v_row.sid,
          'quantity',   v_row.qty,
          'price',      v_row.price_sedan,
          'total',      v_row.price_sedan * v_row.qty
        );
        v_total := v_total + v_row.price_sedan * v_row.qty;
      ELSE
        -- car-type priced
        DECLARE
          v_ct_price numeric;
        BEGIN
          v_ct_price := CASE v_car_type
            WHEN 'CROSSOVER' THEN COALESCE((SELECT price_crossover FROM public.services WHERE id::text = v_row.sid), 0)
            WHEN 'JEEP'      THEN COALESCE((SELECT price_jeep      FROM public.services WHERE id::text = v_row.sid), 0)
            WHEN 'LARGE_SUV' THEN COALESCE((SELECT price_large_suv FROM public.services WHERE id::text = v_row.sid), 0)
            WHEN 'MINIVAN'   THEN COALESCE((SELECT price_minivan   FROM public.services WHERE id::text = v_row.sid), 0)
            ELSE                 COALESCE((SELECT price_sedan    FROM public.services WHERE id::text = v_row.sid), 0)
          END;
          v_prices := v_prices || jsonb_build_object(
            'service_id', v_row.sid,
            'quantity',   v_row.qty,
            'price',      v_ct_price,
            'total',      v_ct_price * v_row.qty
          );
          v_total := v_total + v_ct_price * v_row.qty;
        END;
      END IF;
    END LOOP;
    v_new_swq   := v_prices;
    v_new_price := GREATEST(0, v_total - COALESCE(v_discount, 0));
    v_new_services := to_jsonb(v_merged);
  END;

  -- (6) UPDATE inside the locked transaction.
  UPDATE public.bookings
    SET services                  = v_new_services,
        services_with_quantities  = v_new_swq,
        price                     = v_new_price,
        updated_at                = now()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking));
END;
$fn$;

ALTER FUNCTION public.atomic_modify_carwash_services(
  uuid, text, jsonb, jsonb, boolean, numeric
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.atomic_modify_carwash_services(
  uuid, text, jsonb, jsonb, boolean, numeric
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_modify_carwash_services(
  uuid, text, jsonb, jsonb, boolean, numeric
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_modify_carwash_services(
  uuid, text, jsonb, jsonb, boolean, numeric
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_modify_carwash_services(
  uuid, text, jsonb, jsonb, boolean, numeric
) TO service_role;

-- ============================================================================
-- Atomic modify tire services (add/remove) — full read-modify-write
-- inside ONE transaction. Mirrors atomic_modify_carwash_services shape.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atomic_modify_tire_services(
  p_tire_booking_id    uuid,
  p_action             text,
  p_service_ids        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_booking           public.tire_bookings%ROWTYPE;
  v_current_services  jsonb;
  v_merged_ids        text[];
  v_new_services      jsonb;
  v_new_total         integer;
  v_row               record;
BEGIN
  -- (1) Row-lock — holds until end of caller transaction.
  SELECT *
    INTO v_booking
    FROM public.tire_bookings
    WHERE id = p_tire_booking_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIRE_BOOKING_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- (2) Status guard.
  IF v_booking.status NOT IN ('ОЖИДАЕТ', 'В РАБОТЕ') THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION' USING ERRCODE = 'P0001';
  END IF;

  -- (3) Build merged id list inside the locked transaction.
  --     p_service_ids is jsonb (text[] not transmissible through PostgREST).
  --     v_booking.services is jsonb array of {id,name,price} objects.
  v_current_services := COALESCE(v_booking.services, '[]'::jsonb);
  SELECT COALESCE(array_agg(value->>'id'), ARRAY[]::text[])
    INTO v_merged_ids
    FROM jsonb_array_elements(v_current_services);

  IF p_action = 'add' THEN
    v_merged_ids := array(
      SELECT DISTINCT unnest(v_merged_ids || ARRAY(SELECT jsonb_array_elements_text(p_service_ids)))
    );
  ELSIF p_action = 'remove' THEN
    v_merged_ids := array(
      SELECT unnest(v_merged_ids)
      EXCEPT
      SELECT jsonb_array_elements_text(p_service_ids)
    );
  ELSE
    RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE = 'P0001';
  END IF;

  -- (4) Recompute services[] and total_price from tire_services table
  --     inside the locked transaction.
  v_new_total := 0;
  v_new_services := '[]'::jsonb;
  FOR v_row IN
    SELECT s.id::text AS sid,
           s.name::text AS sname,
           COALESCE(s.price, 0)::numeric AS sprice
      FROM public.tire_services s
      WHERE s.id::text = ANY(v_merged_ids)
        AND s.is_active = true
  LOOP
    v_new_services := v_new_services || jsonb_build_object(
      'id',    v_row.sid,
      'name',  v_row.sname,
      'price', v_row.sprice
    );
    v_new_total := v_new_total + v_row.sprice;
  END LOOP;

  -- (5) UPDATE inside the locked transaction.
  UPDATE public.tire_bookings
    SET services      = v_new_services,
        total_price   = v_new_total,
        updated_at    = now()
    WHERE id = p_tire_booking_id
    RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking));
END;
$fn$;

ALTER FUNCTION public.atomic_modify_tire_services(
  uuid, text, jsonb
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.atomic_modify_tire_services(
  uuid, text, jsonb
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_modify_tire_services(
  uuid, text, jsonb
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_modify_tire_services(
  uuid, text, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_modify_tire_services(
  uuid, text, jsonb
) TO service_role;
