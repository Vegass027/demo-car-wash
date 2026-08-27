-- migrations/008_atomic_create_staff_carwash_booking_rollback.sql
--
-- Phase 2 / Slice #3b rollback.
-- Drops create_staff_carwash_booking RPC. Idempotent via IF EXISTS.

DROP FUNCTION IF EXISTS public.create_staff_carwash_booking(
  date, integer, time, time,
  text, text, text, text, text,
  text[], jsonb, numeric, text,
  uuid, uuid, text,
  boolean, uuid, uuid, uuid,
  uuid, uuid,
  timestamptz, boolean, numeric,
  boolean, timestamptz, uuid
) CASCADE;
