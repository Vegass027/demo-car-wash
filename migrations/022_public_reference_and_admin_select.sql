-- 022_public_reference_and_admin_select.sql
--
-- Closes three confirmed gaps from Slice #3e Step #1 retest:
--
-- (A) closed_boxes / tire_service_days anon SELECT — Slice #3d
--     migration 019 (A2/A3 splits) replaced public_all_access with
--     staff_select_* USING (auth.jwt() IS NULL). Real anon JWT is '{}'
--     (NOT NULL), so RLS returns 0 rows. Client booking flow cannot
--     see closed slots → can book on closed time → race. Fix:
--     client_select_closed_boxes / client_select_tire_service_days
--     USING (true) for anon+authenticated.
--
-- (B) admins SELECT for authenticated — Slice #3d migration 020
--     Path B left grant = false for authenticated on admins. Even
--     admin Bearer gets 42501. Admin management page
--     ([Admins] Ошибка при получении админов) is broken. Fix:
--     GRANT SELECT ON public.admins TO authenticated.
--     staff_select_admins USING (app_role IN ('admin','owner'))
--     enforces role check.
--
-- (C) Note: organizations / workers / salary_settings / tire_workers
--     are already fixed via admin Bearer through wrappedFetch (verified
--     200 data with admin Bearer). No further action needed.
--
-- All RLS policies preserved:
-- - staff_write_closed_boxes / staff_delete_closed_boxes stay (Path B)
-- - staff_select_admins (app_role filter) stays
-- - service_role_all_* stay (bypass for dispatcher)
-- - INSERT/UPDATE/DELETE remain staff-only for closed_boxes
--
-- Demo-only. Prod-only after coordinated rollout (entry 22 owner policy).

-- (A) closed_boxes / tire_service_days: re-open anon SELECT
DROP POLICY IF EXISTS "staff_select_closed_boxes" ON public.closed_boxes;
CREATE POLICY "client_select_closed_boxes"
  ON public.closed_boxes
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "staff_select_tire_service_days" ON public.tire_service_days;
CREATE POLICY "client_select_tire_service_days"
  ON public.tire_service_days
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- (B) admins SELECT grant for authenticated
GRANT SELECT ON public.admins TO authenticated;