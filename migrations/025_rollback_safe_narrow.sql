-- =============================================================
-- rollback: 025_rollback_safe_narrow.sql (Phase E(a) SAFE)
--
-- Default rollback path for migration 025. Does NOT recreate
-- public_all_access and therefore does NOT re-open the
-- Phase E(a) confirmed PII leak vectors.
--
-- Effect after apply:
--   * admin/owner STILL have full access via staff_all
--   * client LOSES own-row visibility (no client_own_select)
--   * anon STAYS blocked (anon_blocked preserved)
--   * service_role STAYS unaffected
--   * dispatcher paths unaffected
--
-- Apply only AFTER explicit owner OK ("apply safe narrow rollback").
-- To fully reverse and accept leak re-open, use
-- 025_ROLLBACK_EMERGENCY.sql instead — that file requires a
-- separate explicit owner OK.
-- =============================================================

DROP POLICY IF EXISTS client_own_select ON public.clients;
DROP POLICY IF EXISTS client_own_select ON public.client_cars;
DROP POLICY IF EXISTS client_own_select ON public.bookings;
DROP POLICY IF EXISTS client_own_select ON public.tire_bookings;
DROP POLICY IF EXISTS client_own_select ON public.loyalty_carwash_progress;

-- staff_all on 5 tables PRESERVED: admin/owner keep working
-- anon_blocked PRESERVED: anon stays blocked
-- service_role_all_access PRESERVED: dispatcher keeps working
-- public_all_access stays absent — NOT recreated here
