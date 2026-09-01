-- Migration 034 — DEMO-only: persist v_discount in atomic_modify_carwash_services
--
-- Background: migration 010 created atomic_modify_carwash_services(uuid, text,
-- jsonb, jsonb, boolean, numeric). The function already uses p_discount for
-- price calculation (line 294: v_discount := COALESCE(p_discount, v_booking.discount)
-- and line 351: v_new_price := GREATEST(0, v_total - v_discount)) but the
-- final UPDATE (line 356-362) did NOT persist v_discount back into
-- bookings.discount. PROD parity requires writing both price and discount.
--
-- This migration is a CREATE OR REPLACE FUNCTION with NO signature change,
-- NO logic change, NO privilege change. The only delta is one line added
-- to the final UPDATE SET list: `discount = v_discount`.
--
-- Semantics preserved:
--   p_discount = N>0  → price reduced, bookings.discount = N
--   p_discount = 0    → price = sum,    bookings.discount = 0
--   p_discount = NULL → COALESCE keeps existing bookings.discount,
--                       price recomputed against it, same value persisted
--   p_discount > sum  → price = 0 (GREATEST(0,...) clamp), bookings.discount
--                       stored as the full amount (matches prod behavior —
--                       prod's lib/api/bookings.ts:write also stores the full
--                       value without clamping the column)
--
-- Status guard, FOR UPDATE row-lock, merge logic, antifreeze recompute,
-- price formula, SECURITY DEFINER, search_path, GRANT/REVOKE — all
-- preserved verbatim from migration 010.
--
-- Phase E(a) security model: this function is REVOKEd from PUBLIC and anon
-- (migration 010 lines 372-377). Only authenticated callers via the
-- server-side dispatcher (api/staff.ts:addStaffServicesAction) with admin/
-- owner claims can invoke it. Migration 034 does NOT change grants.

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
  --     Issue 2 follow-up: also persist v_discount so the bookings.discount
  --     column reflects the value the RPC actually used for pricing
  --     (matches prod lib/api/bookings.ts:addServicesToBooking semantics).
  UPDATE public.bookings
    SET services                  = v_new_services,
        services_with_quantities  = v_new_swq,
        price                     = v_new_price,
        discount                  = v_discount,
        updated_at                = now()
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking', to_jsonb(v_booking));
END;
$fn$;

-- Re-apply ownership and revocation (matches migration 010 lines 368-378).
-- These statements are idempotent and safe to re-run on each migration.
ALTER FUNCTION public.atomic_modify_carwash_services(
  uuid, text, jsonb, jsonb, boolean, numeric
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.atomic_modify_carwash_services(
  uuid, text, jsonb, jsonb, boolean, numeric
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_modify_carwash_services(
  uuid, text, jsonb, jsonb, boolean, numeric
) FROM anon;