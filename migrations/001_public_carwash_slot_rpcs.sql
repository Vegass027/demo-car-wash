-- migrations/001_public_carwash_slot_rpcs.sql
--
-- Phase 2 / Slice #1 (client car-wash flow).
--
-- Public RPCs returning slot occupancy for car-wash timeline rendering.
-- Anonymous + authenticated may call.
-- No PII columns, no internal IDs.
-- SECURITY DEFINER + fixed search_path + OWNER postgres + narrow GRANT.
--
-- Migration is single short psql call (both function CREATEs are idempotent).
-- No DO block, no transactional wrapper (Supavisor-safe per
-- PROJECT_STATE.md §5.6).

-- RPC #1: car-wash occupied slots (active statuses only).
CREATE OR REPLACE FUNCTION public.get_public_booking_slots(p_target_date date)
RETURNS TABLE (
  start_time time without time zone,
  end_time   time without time zone,
  box_number integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
    SELECT b.start_time, b.end_time, b.box_number
    FROM public.bookings b
    WHERE b.booking_date = p_target_date
      AND b.status NOT IN ('ОТМЕНЕНО', 'ГОТОВО')
      AND b.is_quick_booking = false;
END;
$$;

ALTER FUNCTION public.get_public_booking_slots(date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_booking_slots(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_booking_slots(date) TO anon, authenticated;

-- RPC #2: closed-box info for the target date (no closed_by / closed_at / id).
CREATE OR REPLACE FUNCTION public.get_public_closed_boxes(p_target_date date)
RETURNS TABLE (
  box_number integer,
  closed_date date,
  open_hours integer[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
    SELECT cb.box_number, cb.closed_date, cb.open_hours
    FROM public.closed_boxes cb
    WHERE cb.closed_date = p_target_date
      AND cb.is_closed = true;
END;
$$;

ALTER FUNCTION public.get_public_closed_boxes(date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_closed_boxes(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_closed_boxes(date) TO anon, authenticated;
