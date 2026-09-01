-- Migration 036 — DEMO-only: partial UNIQUE INDEX on work_shifts
--
-- Background: idx_work_shifts_unique was CREATE UNIQUE (worker_id, work_date)
-- — unconditional. After start_tire_worker_shift (or start_admin_shift) inserts
-- a row and stop_*_shift closes it (sets status='finished'), the row STAYS in
-- the table. A second toggle ON the same day tries to INSERT another row with
-- the same (worker_id, work_date) and hits the unique constraint → HTTP 500.
--
-- PROD equivalent (lib/api/workers.ts:startWorkerShift for carwash workers)
-- doesn't insert work_shifts at all for carwash workers, so this bug doesn't
-- surface. But for tire_workers and admins, PROD start_tire_worker_shift and
-- start_admin_shift DO insert work_shifts rows — so PROD has the same latent
-- bug if a worker toggles ON-OFF-ON multiple times in one day. The end-of-day
-- reset_daily cron closes all status='working' rows, masking it in practice.
--
-- Fix: replace the strict UNIQUE INDEX with a PARTIAL UNIQUE INDEX that
-- enforces uniqueness only for currently-open shifts (status='working').
-- Multiple closed (finished) work_shifts rows per (worker_id, work_date) are
-- allowed, preserving audit history. Toggle ON-OFF-ON in a single day now
-- works: stop sets status='finished', a new start inserts a new row that
-- becomes the only status='working' for that day.
--
-- CRITICAL: This migration is DEMO-only. PROD already has the strict
-- idx_work_shifts_unique and PROD behavior is "don't toggle ON-OFF-ON"
-- in practice — leaving PROD untouched.
--
-- Verified on demo DB:
--   - Old index: idx_work_shifts_unique UNIQUE (worker_id, work_date)
--   - After migration: idx_work_shifts_open_per_day UNIQUE (worker_id, work_date)
--       WHERE status = 'working'
--   - Existing finished rows from prior runs: kept intact (no DELETE)
--   - All other indexes on work_shifts: untouched

DROP INDEX IF EXISTS public.idx_work_shifts_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_shifts_open_per_day
  ON public.work_shifts(worker_id, work_date)
  WHERE status = 'working';

-- Verify
COMMENT ON INDEX public.idx_work_shifts_open_per_day IS
  'Partial unique index — allows multiple closed work_shifts per (worker_id, work_date) '
  'for audit history, but only one OPEN shift per day. Replaces strict idx_work_shifts_unique '
  'in migration 036 (DEMO-only, fixes toggle ON-OFF-ON 500 errors for tire_workers and admins).';