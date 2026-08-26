-- migrations/004_public_tire_slot_rpcs.sql
--
-- Phase 2 / Slice #2 (tire client flow).
--
-- Public RPC returning slot occupancy for tire-timeline rendering.
-- Anonymous + authenticated may call.
-- Only slot metadata: id, booking_date, start_time, end_time, status.
-- No PII columns (client_name, phone, car_model, plate_number, services,
-- signature_data) — foreign-client slots render as "Занято" by the
-- client UI after dispatcher merges this with own-bookings endpoint.
--
-- SECURITY DEFINER + fixed search_path + OWNER postgres + narrow GRANT.
--
-- Migration is single short psql call (function CREATE is idempotent).
-- No DO block, no transactional wrapper (Supavisor-safe per
-- PROJECT_STATE.md §5.6).
--
-- Format note: tire bookings have variable estimated_duration (data
-- shows 60 min today; UI declares [30, 60] via DURATION_OPTIONS). So
-- end_time is computed, not stored. Public response uses
-- (start_time + estimated_duration minute interval) :: time.

CREATE OR REPLACE FUNCTION public.get_public_tire_booking_slots(p_target_date date)
RETURNS TABLE (
  id            uuid,
  booking_date  date,
  start_time    time without time zone,
  end_time      time without time zone,
  status        varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      tb.id,
      tb.booking_date,
      tb.start_time,
      ((tb.start_time + (tb.estimated_duration || ' minute')::interval))::time AS end_time,
      tb.status::varchar
    FROM public.tire_bookings tb
    WHERE tb.booking_date = p_target_date
      AND tb.status NOT IN ('ОТМЕНЕНО');
END;
$$;

ALTER FUNCTION public.get_public_tire_booking_slots(date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_tire_booking_slots(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tire_booking_slots(date) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Companion RPC for create-tire-booking dispatcher.
-- SERVER-USE ONLY: returns existing tire_bookings rows that overlap the
-- proposed (start_min, duration_min) window for the given date, regardless of
-- who owns them. Restricted to service_role because:
--   * anon/anon-auth callers must not see other clients' bookings;
--   * the dispatcher writes via service_role anyway, so this matches the
--     existing trust boundary.
--
-- TIME MATH:
--   time → minutes-since-midnight via EXTRACT(EPOCH FROM start_time)::int / 60
--   (01:30:00 → 5400 sec → 90 min). end_minutes of an existing booking is
--   start_minutes + estimated_duration. Overlap predicate: a booking
--   overlaps (s_new, d_new) iff its [s_exist, s_exist + d_exist) intersects
--   [s_new, s_new + d_new) — i.e. s_exist < new_end AND s_exist + d_exist > new_start.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_tire_booking_overlap(
  p_target_date       date,
  p_start_minutes     int,
  p_duration_minutes  int
)
RETURNS TABLE (
  id                  uuid,
  start_time          time without time zone,
  estimated_duration  int,
  status              varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_new_end_minutes int := p_start_minutes + p_duration_minutes;
BEGIN
  RETURN QUERY
    SELECT
      tb.id,
      tb.start_time,
      tb.estimated_duration,
      tb.status::varchar
    FROM public.tire_bookings tb
    WHERE tb.booking_date = p_target_date
      AND tb.status NOT IN ('ОТМЕНЕНО')
      AND ((EXTRACT(EPOCH FROM tb.start_time)::int / 60) + tb.estimated_duration)
            > p_start_minutes
      AND (EXTRACT(EPOCH FROM tb.start_time)::int / 60)
            < v_new_end_minutes;
END;
$fn$;

ALTER FUNCTION public.find_tire_booking_overlap(date, int, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.find_tire_booking_overlap(date, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_tire_booking_overlap(date, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_tire_booking_overlap(date, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_tire_booking_overlap(date, int, int) TO service_role;
