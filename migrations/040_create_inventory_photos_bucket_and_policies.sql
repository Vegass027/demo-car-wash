-- migrations/040_create_inventory_photos_bucket_and_policies.sql
-- Issue 7: server-side photo storage for inventory arrivals (admin/owner).
--
-- Scope: bucket + storage policies ONLY.
-- Does NOT touch RLS/grants on the `inventory_arrivals` table itself — that
-- table is already correctly protected on DEMO (service_role_all_inventory_arrivals
-- + staff_*_inventory_arrivals policies gate authenticated by app_role).
--
-- Security model mirrors migration 037 (expense-receipts):
--   staff-only (admin/owner), gate by app_role claim.
--   PRIVATE bucket (no anonymous reads). Photo URLs from inventory_arrivals.photos
--   are returned as-is to staff callers (browser-direct via supabase.storage).
--
-- Path convention: <item_id>/<operation_id>_<index>.<ext>
-- Generated client-side in lib/api/inventory.ts:uploadInventoryPhotos(). The
-- operation_id is also a uuid PK on inventory_arrivals, so cross-row path
-- collision is impossible. Index discriminates between multiple photos of
-- the same arrival (re-upload with upsert:true on retry).
--
-- This migration closes DEMO/PROD drift #3 (storage buckets): inventory-photos
-- exists on PROD (created out-of-band) but was missing from DEMO, causing
-- "Bucket not found" on every inventory arrival with a receipt photo. See
-- lib/api/inventory.ts:uploadInventoryPhotos.

BEGIN;

-- 1. Bucket (private, 5MB, JPEG/PNG/PDF)
-- 5MB cap matches expense-receipts bucket (same rationale: dispatcher's
-- 3MB effective base64 limit is below Vercel's 4.5MB body cap; bucket
-- limit is the authoritative server-side cap for any future signed-upload
-- path).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-photos',
  'inventory-photos',
  false,           -- PRIVATE bucket (no anonymous reads)
  5242880,         -- 5 MB hard cap
  ARRAY['image/jpeg','image/jpg','image/png','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies — staff-only (admin/owner), gate by app_role claim.
-- Pattern matches migration 037 (expense-receipts) and existing
-- staff_*_inventory_arrivals table policies on DEMO.

DROP POLICY IF EXISTS "staff_select_photos" ON storage.objects;
CREATE POLICY "staff_select_photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inventory-photos'
    AND (auth.jwt() ->> 'app_role') IN ('admin', 'owner')
  );

DROP POLICY IF EXISTS "staff_insert_photos" ON storage.objects;
CREATE POLICY "staff_insert_photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'inventory-photos'
    AND (auth.jwt() ->> 'app_role') IN ('admin', 'owner')
  );

DROP POLICY IF EXISTS "staff_delete_photos" ON storage.objects;
CREATE POLICY "staff_delete_photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'inventory-photos'
    AND (auth.jwt() ->> 'app_role') IN ('admin', 'owner')
  );

-- Intentionally NO storage UPDATE policy: arrival photos are append-only.
-- Replacing a photo requires deleting the old one and uploading a new
-- arrival (matches lib/api/inventory.ts uploadInventoryPhotos behavior).

-- Intentionally NO anon policies. Anon is blocked by missing policy + no
-- GRANT chain. Service_role bypasses RLS entirely (used by future dispatcher
-- migration if photo upload ever moves server-side).

COMMIT;
