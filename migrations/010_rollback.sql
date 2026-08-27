-- migrations/010_rollback.sql
--
-- Phase 2 / Slice #3b hotfix rollback.

DROP FUNCTION IF EXISTS public.atomic_create_staff_tire_booking(
  date, time, integer,
  text, text, text, text,
  jsonb, numeric,
  text, boolean, timestamptz, text,
  boolean, uuid, uuid, uuid, uuid, uuid,
  uuid, timestamptz,
  text, uuid
) CASCADE;

DROP FUNCTION IF EXISTS public.atomic_modify_carwash_services(
  uuid, text, jsonb, jsonb, boolean, numeric
) CASCADE;

DROP FUNCTION IF EXISTS public.atomic_modify_tire_services(
  uuid, text, jsonb
) CASCADE;
