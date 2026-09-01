-- Migration 035 — DEMO-only: fix start_worker_shift idempotent toggle
--
-- Background: previous RPC implementation had two related bugs:
--   (1) Early-return guard on v_worker.base_rate_taken_today = true:
--       After worker picks solo/pair mode (sets base_rate_taken_today=true),
--       toggling OFF then ON again failed because RPC returned without
--       setting is_working_today = true.
--   (2) INSERT INTO work_shifts on toggle ON: prod's worker toggle handlers
--       (lib/api/workers.ts:startWorkerShift + features/workers/calculateEarnings.ts:toggleWorkerWorkingToday)
--       only UPDATE workers — they NEVER insert work_shifts rows for workers.
--       Demo's RPC was inserting work_shifts which:
--         (a) on the second toggle ON, hit idx_work_shifts_unique (worker_id, work_date);
--         (b) generally diverged from prod semantics.
--
-- PROD parity (lib/api/workers.ts:481-514):
--   - Idempotent on is_working_today (already working → return as-is)
--   - Otherwise always set is_working_today=true, last_shift_date=p_today
--   - Do NOT re-charge base rate (base already credited at selectWorkerModeSolo/Pair)
--   - Do NOT touch work_shifts (workers work_shifts rows are managed by cron / transferDailyEarningsToBalance
--     on prod, not by toggle handlers — we mirror that)
--
-- This migration is a CREATE OR REPLACE FUNCTION with NO signature change,
-- NO grants/REVOKEs change, NO table changes. Two changes to the function body:
--   (1) idempotency guard: is_working_today instead of base_rate_taken_today
--   (2) remove INSERT INTO work_shifts block
--
-- Security model unchanged: function stays SECURITY DEFINER (inherited),
-- EXECUTE stays REVOKEd from PUBLIC and authenticated (migration 021);
-- only service_role + dispatcher (api/staff.ts:startWorkerShiftAction)
-- can call it.

CREATE OR REPLACE FUNCTION public.start_worker_shift(p_worker_id uuid, p_salary numeric, p_today date)
 RETURNS workers
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_worker workers;
BEGIN
  -- 🔒 LOCK мойщика (блокирует параллельные вызовы!)
  SELECT * INTO v_worker
  FROM workers
  WHERE id = p_worker_id
  FOR UPDATE;

  -- ✅ Idempotent: уже на смене — возвращаем текущее состояние,
  --    не пере-начисляем базу.
  IF v_worker.is_working_today THEN
    RETURN v_worker;
  END IF;

  -- ✅ Включаем смену, не начисляя базу. Базовая ставка уже была начислена
  --    через select_worker_mode_solo / select_worker_mode_pair (если работник
  --    уже выбрал режим) либо ещё не была начислена (если работник только
  --    вошёл на смену без выбора режима — earned_today останется 0 до выбора).
  --    work_shifts для worker НЕЕ создаётся здесь — это соответствует
  --    поведению prod (см. lib/api/workers.ts:startWorkerShift). Worker
  --    work_shifts rows создаются/закрываются через отдельный cron job.
  UPDATE workers
  SET
    is_working_today = TRUE,
    last_shift_date = p_today
    -- base_rate_taken_today устанавливается ТОЛЬКО при выборе режима (solo/pair),
    -- а не при входе на смену. Это даёт семантику "база фиксируется на весь день".
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  RETURN v_worker;
END;
$function$

-- Re-apply ownership (matches prior migration 010 pattern).
-- CREATE OR REPLACE keeps the function OID and grants intact, but we
-- re-apply ownership defensively for clarity in the audit trail.
ALTER FUNCTION public.start_worker_shift(uuid, numeric, date) OWNER TO postgres;