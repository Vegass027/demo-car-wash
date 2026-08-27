-- migrations/009_drop_old_create_staff_carwash_booking_overload.sql
--
-- Phase 2 / Slice #3b hotfix.
--
-- Issue: migrations/008_atomic_create_staff_carwash_booking_rpc.sql used
-- CREATE OR REPLACE FUNCTION which only replaces the function if the
-- signature matches EXACTLY. The first smoke pass surfaced a `p_services`
-- type mismatch (text[] → jsonb) which I fixed by ALTERing the parameter
-- type. The result was two overloads with different p_services type:
--   - (..., p_services text[], ...)
--   - (..., p_services jsonb, ...)
-- Postgres RPC dispatch then fails with "could not choose the best
-- candidate function" since named parameters don't disambiguate type.
--
-- Fix: drop the old text[] overload explicitly. The jsonb overload
-- remains as the sole definition; service_role EXECUTE granted on the
-- overload resolves through the remaining function.
--
-- Idempotent via IF EXISTS.

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
