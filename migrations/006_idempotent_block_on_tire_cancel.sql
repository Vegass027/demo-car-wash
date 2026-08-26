-- migrations/006_idempotent_block_on_tire_cancel.sql
--
-- Companion DB-level constraint for cancel_own_tire_booking race integrity.
--
-- Recon confirmed: booking_cancellations had NO UNIQUE on tire_booking_id
-- (carwash had UNIQUE on booking_id from migration 002 of Slice #1).
-- Without this, RPC INSERT (step 6 of cancel_own_tire_booking) had a
-- race window for duplicate cancellation rows under concurrent calls.
--
-- This file creates a UNIQUE INDEX CONCURRENTLY — no exclusive table
-- locks, safe for Supavisor at any traffic level. Distinct from
-- carwash Slice #1 which used UNIQUE CONSTRAINT (Slice #1 applied it as
-- a separate preflight session because CONSTRAINT requires lock).
--
-- DEPLOYMENT ORDER: this file MUST be applied BEFORE
-- 005_cancel_own_tire_booking_rpc.sql to ensure RPC has DB-level guard
-- from the moment it goes live.
--
-- PREFLIGHT (manual, NOT part of this file):
--   psql -c "SELECT count(*) FROM (
--     SELECT tire_booking_id, count(*) AS n
--       FROM public.booking_cancellations
--       WHERE tire_booking_id IS NOT NULL
--       GROUP BY tire_booking_id HAVING count(*) > 1
--   ) t;"
--   Must return 0 before applying. If ≥1 — clean duplicates FIRST.
--
-- Recon for demo-DB (2026-08-26) confirmed 0 duplicates and 0 rows
-- with tire_booking_id NOT NULL.
--
-- DEPLOYMENT: single short psql -c call. CREATE INDEX CONCURRENTLY
-- holds no exclusive locks at any phase (build, validate, swap). Safe
-- under live traffic.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  idx_booking_cancellations_tire_booking_unique
  ON public.booking_cancellations (tire_booking_id)
  WHERE tire_booking_id IS NOT NULL;
