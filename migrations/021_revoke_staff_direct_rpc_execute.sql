-- Migration 021 — Slice #3d REVOKE EXECUTE on staff-direct RPCs (DEMO-ONLY).
--
-- Step 0 already deployed the frontend switch + dispatcher proxies
-- (api/staff.ts + lib/api/staff-actions.ts + tire-workers.ts + inventory.ts
-- + product-sales.ts + document-numbers.ts + TireTechnicianCard.tsx).
-- All staff-direct RPC calls now go through JWT-protected dispatcher
-- actions (which use supabaseAdmin = service_role bypass RLS).
--
-- This migration REVOKEs EXECUTE on the underlying RPCs from PUBLIC +
-- anon + authenticated. service_role EXECUTE preserved (dispatcher).
--
-- Per-overload handling (D2/D3 prod-drift findings):
--   * get_next_document_number has 2 overloads on both demo and prod
--     (verified recon). REVOKE per overload using specific signature.
--   * inventory_arrival has 2 overloads (7-arg DEF + 8-arg INV). Both
--     REVOKEd.
--   * stop_tire_worker_shift EXISTS on demo (migration 019a created
--     it) but DOES NOT exist on prod (verified recon). REVOKE wrapped
--     in DO block checking pg_proc existence so migration is safe to
--     apply on prod later.
--
-- 4-step §20d checklist per RPC.

-- ============================================================================
-- start_worker_shift (1 overload) — INVOKER
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.start_worker_shift(uuid, numeric, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_worker_shift(uuid, numeric, date)
  TO service_role;

-- ============================================================================
-- start_tire_worker_shift (1 overload) — INVOKER
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.start_tire_worker_shift(uuid, numeric, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_tire_worker_shift(uuid, numeric, date)
  TO service_role;

-- ============================================================================
-- stop_tire_worker_shift (CONDITIONAL — only on demo, not on prod)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='stop_tire_worker_shift'
    AND pg_get_function_identity_arguments(p.oid) = 'p_worker_id uuid'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.stop_tire_worker_shift(uuid)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.stop_tire_worker_shift(uuid)
      TO service_role;
    RAISE NOTICE 'stop_tire_worker_shift REVOKEd (demo-only function)';
  ELSE
    RAISE NOTICE 'stop_tire_worker_shift NOT FOUND (production schema); skipping';
  END IF;
END $$;

-- ============================================================================
-- add_tire_worker_earnings (1 overload) — INVOKER
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.add_tire_worker_earnings(uuid, uuid, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_tire_worker_earnings(uuid, uuid, numeric)
  TO service_role;

-- ============================================================================
-- inventory_usage (1 overload) — DEFINER
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.inventory_usage(uuid, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_usage(uuid, numeric, text, uuid)
  TO service_role;

-- ============================================================================
-- inventory_restock (1 overload) — DEFINER
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.inventory_restock(uuid, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_restock(uuid, numeric, text, uuid)
  TO service_role;

-- ============================================================================
-- add_inventory_category (1 overload) — DEFINER
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.add_inventory_category(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_inventory_category(text, text)
  TO service_role;

-- ============================================================================
-- delete_inventory_category (1 overload) — DEFINER
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.delete_inventory_category(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_inventory_category(uuid)
  TO service_role;

-- ============================================================================
-- inventory_arrival (2 overloads)
-- 7-arg (no operation_id) — DEFINER
-- 8-arg (+ operation_id) — INVOKER
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.inventory_arrival(uuid, numeric, numeric, date, text[], text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_arrival(uuid, numeric, numeric, date, text[], text, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.inventory_arrival(uuid, numeric, numeric, date, text[], text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_arrival(uuid, numeric, numeric, date, text[], text, uuid, uuid)
  TO service_role;

-- ============================================================================
-- get_next_document_number (2 overloads) — INVOKER
-- (doc_type text) and (doc_type text, doc_month int, doc_year int)
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.get_next_document_number(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_document_number(text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_next_document_number(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_document_number(text, integer, integer)
  TO service_role;