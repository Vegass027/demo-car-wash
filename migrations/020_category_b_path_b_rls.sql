-- Migration 020 — Slice #3d Path B RLS (DEMO-ONLY).
--
-- Replaces public_all_access USING(true) on 15 Category B staff-only
-- tables with: staff policies (admin/owner via auth.jwt()->>'app_role')
-- + service_role bypass. Revokes anon full access; authenticated retains
-- SELECT only (writes through dispatcher service_role).
--
-- bookings + tire_bookings INTENTIONALLY excluded — they need composite
-- Category B (staff) + Category C (client own-row) RLS in Slice #3e.
--
-- profiles: staff SELECT (full row minus password_hash which was
-- column-revoked in migration 019). RLS layer is row-filtering;
-- column-level grants from 019 are an independent layer.
--
-- Each section: 4-step verify checklist (§20d) per object.

-- ============================================================================
-- Helper macro: generate 6 policies (staff select/insert/update/delete +
-- service_role_all) + GRANTs + REVOKEs per table.
-- ============================================================================

-- workers
DROP POLICY IF EXISTS public_all_access ON public.workers;
DROP POLICY IF EXISTS service_role_all_access ON public.workers;
DROP POLICY IF EXISTS staff_select_workers ON public.workers;
DROP POLICY IF EXISTS staff_insert_workers ON public.workers;
DROP POLICY IF EXISTS staff_update_workers ON public.workers;
DROP POLICY IF EXISTS staff_delete_workers ON public.workers;
DROP POLICY IF EXISTS service_role_all_workers ON public.workers;
CREATE POLICY staff_select_workers ON public.workers FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_workers ON public.workers FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_workers ON public.workers FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_workers ON public.workers FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_workers ON public.workers FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.workers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.workers FROM authenticated;
GRANT SELECT ON public.workers TO authenticated;

-- tire_workers
DROP POLICY IF EXISTS public_all_access ON public.tire_workers;
DROP POLICY IF EXISTS service_role_all_access ON public.tire_workers;
DROP POLICY IF EXISTS staff_select_tire_workers ON public.tire_workers;
DROP POLICY IF EXISTS staff_insert_tire_workers ON public.tire_workers;
DROP POLICY IF EXISTS staff_update_tire_workers ON public.tire_workers;
DROP POLICY IF EXISTS staff_delete_tire_workers ON public.tire_workers;
DROP POLICY IF EXISTS service_role_all_tire_workers ON public.tire_workers;
CREATE POLICY staff_select_tire_workers ON public.tire_workers FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_tire_workers ON public.tire_workers FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_tire_workers ON public.tire_workers FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_tire_workers ON public.tire_workers FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_tire_workers ON public.tire_workers FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.tire_workers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tire_workers FROM authenticated;
GRANT SELECT ON public.tire_workers TO authenticated;

-- expenses
DROP POLICY IF EXISTS public_all_access ON public.expenses;
DROP POLICY IF EXISTS service_role_all_access ON public.expenses;
DROP POLICY IF EXISTS staff_select_expenses ON public.expenses;
DROP POLICY IF EXISTS staff_insert_expenses ON public.expenses;
DROP POLICY IF EXISTS staff_update_expenses ON public.expenses;
DROP POLICY IF EXISTS staff_delete_expenses ON public.expenses;
DROP POLICY IF EXISTS service_role_all_expenses ON public.expenses;
CREATE POLICY staff_select_expenses ON public.expenses FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_expenses ON public.expenses FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_expenses ON public.expenses FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_expenses ON public.expenses FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_expenses ON public.expenses FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.expenses FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.expenses FROM authenticated;
GRANT SELECT ON public.expenses TO authenticated;

-- inventory_arrivals
DROP POLICY IF EXISTS public_all_access ON public.inventory_arrivals;
DROP POLICY IF EXISTS service_role_all_access ON public.inventory_arrivals;
DROP POLICY IF EXISTS staff_select_inventory_arrivals ON public.inventory_arrivals;
DROP POLICY IF EXISTS staff_insert_inventory_arrivals ON public.inventory_arrivals;
DROP POLICY IF EXISTS staff_update_inventory_arrivals ON public.inventory_arrivals;
DROP POLICY IF EXISTS staff_delete_inventory_arrivals ON public.inventory_arrivals;
DROP POLICY IF EXISTS service_role_all_inventory_arrivals ON public.inventory_arrivals;
CREATE POLICY staff_select_inventory_arrivals ON public.inventory_arrivals FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_inventory_arrivals ON public.inventory_arrivals FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_inventory_arrivals ON public.inventory_arrivals FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_inventory_arrivals ON public.inventory_arrivals FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_inventory_arrivals ON public.inventory_arrivals FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.inventory_arrivals FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.inventory_arrivals FROM authenticated;
GRANT SELECT ON public.inventory_arrivals TO authenticated;

-- inventory_categories
DROP POLICY IF EXISTS public_all_access ON public.inventory_categories;
DROP POLICY IF EXISTS service_role_all_access ON public.inventory_categories;
DROP POLICY IF EXISTS staff_select_inventory_categories ON public.inventory_categories;
DROP POLICY IF EXISTS staff_insert_inventory_categories ON public.inventory_categories;
DROP POLICY IF EXISTS staff_update_inventory_categories ON public.inventory_categories;
DROP POLICY IF EXISTS staff_delete_inventory_categories ON public.inventory_categories;
DROP POLICY IF EXISTS service_role_all_inventory_categories ON public.inventory_categories;
CREATE POLICY staff_select_inventory_categories ON public.inventory_categories FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_inventory_categories ON public.inventory_categories FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_inventory_categories ON public.inventory_categories FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_inventory_categories ON public.inventory_categories FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_inventory_categories ON public.inventory_categories FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.inventory_categories FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.inventory_categories FROM authenticated;
GRANT SELECT ON public.inventory_categories TO authenticated;

-- inventory_items
DROP POLICY IF EXISTS public_all_access ON public.inventory_items;
DROP POLICY IF EXISTS service_role_all_access ON public.inventory_items;
DROP POLICY IF EXISTS staff_select_inventory_items ON public.inventory_items;
DROP POLICY IF EXISTS staff_insert_inventory_items ON public.inventory_items;
DROP POLICY IF EXISTS staff_update_inventory_items ON public.inventory_items;
DROP POLICY IF EXISTS staff_delete_inventory_items ON public.inventory_items;
DROP POLICY IF EXISTS service_role_all_inventory_items ON public.inventory_items;
CREATE POLICY staff_select_inventory_items ON public.inventory_items FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_inventory_items ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_inventory_items ON public.inventory_items FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_inventory_items ON public.inventory_items FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_inventory_items ON public.inventory_items FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.inventory_items FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.inventory_items FROM authenticated;
GRANT SELECT ON public.inventory_items TO authenticated;

-- inventory_operations
DROP POLICY IF EXISTS public_all_access ON public.inventory_operations;
DROP POLICY IF EXISTS service_role_all_access ON public.inventory_operations;
DROP POLICY IF EXISTS staff_select_inventory_operations ON public.inventory_operations;
DROP POLICY IF EXISTS staff_insert_inventory_operations ON public.inventory_operations;
DROP POLICY IF EXISTS staff_update_inventory_operations ON public.inventory_operations;
DROP POLICY IF EXISTS staff_delete_inventory_operations ON public.inventory_operations;
DROP POLICY IF EXISTS service_role_all_inventory_operations ON public.inventory_operations;
CREATE POLICY staff_select_inventory_operations ON public.inventory_operations FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_inventory_operations ON public.inventory_operations FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_inventory_operations ON public.inventory_operations FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_inventory_operations ON public.inventory_operations FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_inventory_operations ON public.inventory_operations FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.inventory_operations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.inventory_operations FROM authenticated;
GRANT SELECT ON public.inventory_operations TO authenticated;

-- work_shifts
DROP POLICY IF EXISTS public_all_access ON public.work_shifts;
DROP POLICY IF EXISTS service_role_all_access ON public.work_shifts;
DROP POLICY IF EXISTS staff_select_work_shifts ON public.work_shifts;
DROP POLICY IF EXISTS staff_insert_work_shifts ON public.work_shifts;
DROP POLICY IF EXISTS staff_update_work_shifts ON public.work_shifts;
DROP POLICY IF EXISTS staff_delete_work_shifts ON public.work_shifts;
DROP POLICY IF EXISTS service_role_all_work_shifts ON public.work_shifts;
CREATE POLICY staff_select_work_shifts ON public.work_shifts FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_work_shifts ON public.work_shifts FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_work_shifts ON public.work_shifts FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_work_shifts ON public.work_shifts FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_work_shifts ON public.work_shifts FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.work_shifts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.work_shifts FROM authenticated;
GRANT SELECT ON public.work_shifts TO authenticated;

-- worksheet_entries
DROP POLICY IF EXISTS public_all_access ON public.worksheet_entries;
DROP POLICY IF EXISTS service_role_all_access ON public.worksheet_entries;
DROP POLICY IF EXISTS staff_select_worksheet_entries ON public.worksheet_entries;
DROP POLICY IF EXISTS staff_insert_worksheet_entries ON public.worksheet_entries;
DROP POLICY IF EXISTS staff_update_worksheet_entries ON public.worksheet_entries;
DROP POLICY IF EXISTS staff_delete_worksheet_entries ON public.worksheet_entries;
DROP POLICY IF EXISTS service_role_all_worksheet_entries ON public.worksheet_entries;
CREATE POLICY staff_select_worksheet_entries ON public.worksheet_entries FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_worksheet_entries ON public.worksheet_entries FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_worksheet_entries ON public.worksheet_entries FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_worksheet_entries ON public.worksheet_entries FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_worksheet_entries ON public.worksheet_entries FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.worksheet_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.worksheet_entries FROM authenticated;
GRANT SELECT ON public.worksheet_entries TO authenticated;

-- worksheets
DROP POLICY IF EXISTS public_all_access ON public.worksheets;
DROP POLICY IF EXISTS service_role_all_access ON public.worksheets;
DROP POLICY IF EXISTS staff_select_worksheets ON public.worksheets;
DROP POLICY IF EXISTS staff_insert_worksheets ON public.worksheets;
DROP POLICY IF EXISTS staff_update_worksheets ON public.worksheets;
DROP POLICY IF EXISTS staff_delete_worksheets ON public.worksheets;
DROP POLICY IF EXISTS service_role_all_worksheets ON public.worksheets;
CREATE POLICY staff_select_worksheets ON public.worksheets FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_worksheets ON public.worksheets FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_worksheets ON public.worksheets FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_worksheets ON public.worksheets FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_worksheets ON public.worksheets FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.worksheets FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.worksheets FROM authenticated;
GRANT SELECT ON public.worksheets TO authenticated;

-- product_sales
DROP POLICY IF EXISTS public_all_access ON public.product_sales;
DROP POLICY IF EXISTS service_role_all_access ON public.product_sales;
DROP POLICY IF EXISTS staff_select_product_sales ON public.product_sales;
DROP POLICY IF EXISTS staff_insert_product_sales ON public.product_sales;
DROP POLICY IF EXISTS staff_update_product_sales ON public.product_sales;
DROP POLICY IF EXISTS staff_delete_product_sales ON public.product_sales;
DROP POLICY IF EXISTS service_role_all_product_sales ON public.product_sales;
CREATE POLICY staff_select_product_sales ON public.product_sales FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_product_sales ON public.product_sales FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_product_sales ON public.product_sales FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_product_sales ON public.product_sales FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_product_sales ON public.product_sales FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.product_sales FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.product_sales FROM authenticated;
GRANT SELECT ON public.product_sales TO authenticated;

-- document_numbers
DROP POLICY IF EXISTS public_all_access ON public.document_numbers;
DROP POLICY IF EXISTS service_role_all_access ON public.document_numbers;
DROP POLICY IF EXISTS staff_select_document_numbers ON public.document_numbers;
DROP POLICY IF EXISTS staff_insert_document_numbers ON public.document_numbers;
DROP POLICY IF EXISTS staff_update_document_numbers ON public.document_numbers;
DROP POLICY IF EXISTS staff_delete_document_numbers ON public.document_numbers;
DROP POLICY IF EXISTS service_role_all_document_numbers ON public.document_numbers;
CREATE POLICY staff_select_document_numbers ON public.document_numbers FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_document_numbers ON public.document_numbers FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_document_numbers ON public.document_numbers FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_document_numbers ON public.document_numbers FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_document_numbers ON public.document_numbers FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.document_numbers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.document_numbers FROM authenticated;
GRANT SELECT ON public.document_numbers TO authenticated;

-- daily_reports
DROP POLICY IF EXISTS public_all_access ON public.daily_reports;
DROP POLICY IF EXISTS service_role_all_access ON public.daily_reports;
DROP POLICY IF EXISTS staff_select_daily_reports ON public.daily_reports;
DROP POLICY IF EXISTS staff_insert_daily_reports ON public.daily_reports;
DROP POLICY IF EXISTS staff_update_daily_reports ON public.daily_reports;
DROP POLICY IF EXISTS staff_delete_daily_reports ON public.daily_reports;
DROP POLICY IF EXISTS service_role_all_daily_reports ON public.daily_reports;
CREATE POLICY staff_select_daily_reports ON public.daily_reports FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_daily_reports ON public.daily_reports FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_daily_reports ON public.daily_reports FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_daily_reports ON public.daily_reports FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_daily_reports ON public.daily_reports FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.daily_reports FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.daily_reports FROM authenticated;
GRANT SELECT ON public.daily_reports TO authenticated;

-- booking_cancellations
DROP POLICY IF EXISTS public_all_access ON public.booking_cancellations;
DROP POLICY IF EXISTS service_role_all_access ON public.booking_cancellations;
DROP POLICY IF EXISTS staff_select_booking_cancellations ON public.booking_cancellations;
DROP POLICY IF EXISTS staff_insert_booking_cancellations ON public.booking_cancellations;
DROP POLICY IF EXISTS staff_update_booking_cancellations ON public.booking_cancellations;
DROP POLICY IF EXISTS staff_delete_booking_cancellations ON public.booking_cancellations;
DROP POLICY IF EXISTS service_role_all_booking_cancellations ON public.booking_cancellations;
CREATE POLICY staff_select_booking_cancellations ON public.booking_cancellations FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_booking_cancellations ON public.booking_cancellations FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_booking_cancellations ON public.booking_cancellations FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_booking_cancellations ON public.booking_cancellations FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_booking_cancellations ON public.booking_cancellations FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.booking_cancellations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.booking_cancellations FROM authenticated;
GRANT SELECT ON public.booking_cancellations TO authenticated;

-- organizations
DROP POLICY IF EXISTS public_all_access ON public.organizations;
DROP POLICY IF EXISTS service_role_all_access ON public.organizations;
DROP POLICY IF EXISTS staff_select_organizations ON public.organizations;
DROP POLICY IF EXISTS staff_insert_organizations ON public.organizations;
DROP POLICY IF EXISTS staff_update_organizations ON public.organizations;
DROP POLICY IF EXISTS staff_delete_organizations ON public.organizations;
DROP POLICY IF EXISTS service_role_all_organizations ON public.organizations;
CREATE POLICY staff_select_organizations ON public.organizations FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_organizations ON public.organizations FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_organizations ON public.organizations FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_organizations ON public.organizations FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_organizations ON public.organizations FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.organizations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.organizations FROM authenticated;
GRANT SELECT ON public.organizations TO authenticated;

-- organization_cars
DROP POLICY IF EXISTS public_all_access ON public.organization_cars;
DROP POLICY IF EXISTS service_role_all_access ON public.organization_cars;
DROP POLICY IF EXISTS staff_select_organization_cars ON public.organization_cars;
DROP POLICY IF EXISTS staff_insert_organization_cars ON public.organization_cars;
DROP POLICY IF EXISTS staff_update_organization_cars ON public.organization_cars;
DROP POLICY IF EXISTS staff_delete_organization_cars ON public.organization_cars;
DROP POLICY IF EXISTS service_role_all_organization_cars ON public.organization_cars;
CREATE POLICY staff_select_organization_cars ON public.organization_cars FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_organization_cars ON public.organization_cars FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_organization_cars ON public.organization_cars FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_organization_cars ON public.organization_cars FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_organization_cars ON public.organization_cars FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.organization_cars FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.organization_cars FROM authenticated;
GRANT SELECT ON public.organization_cars TO authenticated;

-- organization_drivers
DROP POLICY IF EXISTS public_all_access ON public.organization_drivers;
DROP POLICY IF EXISTS service_role_all_access ON public.organization_drivers;
DROP POLICY IF EXISTS staff_select_organization_drivers ON public.organization_drivers;
DROP POLICY IF EXISTS staff_insert_organization_drivers ON public.organization_drivers;
DROP POLICY IF EXISTS staff_update_organization_drivers ON public.organization_drivers;
DROP POLICY IF EXISTS staff_delete_organization_drivers ON public.organization_drivers;
DROP POLICY IF EXISTS service_role_all_organization_drivers ON public.organization_drivers;
CREATE POLICY staff_select_organization_drivers ON public.organization_drivers FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_insert_organization_drivers ON public.organization_drivers FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_organization_drivers ON public.organization_drivers FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_delete_organization_drivers ON public.organization_drivers FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_organization_drivers ON public.organization_drivers FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON public.organization_drivers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.organization_drivers FROM authenticated;
GRANT SELECT ON public.organization_drivers TO authenticated;

-- ============================================================================
-- profiles — staff SELECT (full row minus password_hash column-revoked in 019)
-- ============================================================================
DROP POLICY IF EXISTS public_all_access ON public.profiles;
DROP POLICY IF EXISTS staff_select_profiles ON public.profiles;
DROP POLICY IF EXISTS staff_update_profiles ON public.profiles;
DROP POLICY IF EXISTS service_role_all_profiles ON public.profiles;
CREATE POLICY staff_select_profiles ON public.profiles FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY staff_update_profiles ON public.profiles FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));
CREATE POLICY service_role_all_profiles ON public.profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);
-- anon/authenticated keep column-level non-sensitive SELECT grants from
-- migration 019 (id, login, full_name, role, phone, telegram_id,
-- last_auth_method, created_at, updated_at — NO password_hash).