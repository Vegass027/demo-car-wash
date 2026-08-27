-- migrations/011_drop_old_modify_overloads.sql
--
-- Phase 2 / Slice #3b hotfix.
--
-- Issue: migrations/010_atomic_staff_booking_rpcs.sql used
-- CREATE OR REPLACE FUNCTION which only replaces when signature matches
-- EXACTLY. The first version of atomic_modify_carwash_services and
-- atomic_modify_tire_services had different signatures than the final
-- version (after I moved recompute INSIDE the RPCs). CREATE OR REPLACE
-- did not replace — it created overloads alongside the originals.
-- Postgres RPC dispatch then fails with "Could not find the function
-- ... in the schema cache" because the dispatcher sees multiple
-- candidates and can't pick one.
--
-- Fix: drop the old overloads explicitly. New overloads remain as
-- sole definitions; service_role EXECUTE on each resolves through
-- the remaining function.
--
-- Idempotent via IF EXISTS.

DROP FUNCTION IF EXISTS public.atomic_modify_carwash_services(
  uuid, text, text[], jsonb, boolean, numeric,
  text, text, jsonb, jsonb, numeric
) CASCADE;

DROP FUNCTION IF EXISTS public.atomic_modify_tire_services(
  uuid, text, text[], jsonb, numeric
) CASCADE;
