-- migrations/037_expense_receipts_bucket_and_policies.sql
-- Issue 3 (Phase 2 / Slice #3f): server-side receipt storage for staff expenses.
--
-- Scope: bucket + storage policies ONLY.
-- Does NOT touch RLS/grants on the `expenses` table itself — that table is
-- already correctly protected on DEMO (migration 021 closed anon grants;
-- staff_*_expenses policies gate authenticated by app_role).
--
-- Security model intentionally differs from PROD:
--   PROD has storage policy "Allow all operations on expense-receipts"
--   with USING(bucket_id = 'expense-receipts') and NO role check (effectively
--   public for any JWT holder). DEMO uses app_role-gated policies.
--
-- Bucket is PRIVATE. Receipt access goes through dispatcher createSignedUrl
-- with 1h TTL — no public access path.
--
-- Path convention: <owner_profile_id>/<timestamp>_<sanitized_filename>
-- Generated server-side in api/staff.ts (NOT from client). Path collision on
-- (owner, timestamp) is avoided by Date.now() resolution; upload uses
-- upsert:false to surface collisions explicitly.

BEGIN;

-- 1. Bucket (private, 5MB, JPEG/PNG/PDF)
-- Note: keeping 5MB at bucket level even though dispatcher enforces 3MB
-- effective limit (base64 4/3 overhead → ~4MB body, under Vercel 4.5MB cap).
-- Bucket-level limit is the authoritative server-side cap for any future
-- direct upload path (e.g., signed upload URL if we ever add one).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,           -- PRIVATE bucket (no anonymous reads)
  5242880,         -- 5 MB hard cap
  ARRAY['image/jpeg','image/jpg','image/png','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies — staff-only (admin/owner), gate by app_role claim.
-- Pattern matches existing staff_*_expenses policies on DEMO.

DROP POLICY IF EXISTS "staff_select_receipts" ON storage.objects;
CREATE POLICY "staff_select_receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (auth.jwt() ->> 'app_role') IN ('admin', 'owner')
  );

DROP POLICY IF EXISTS "staff_insert_receipts" ON storage.objects;
CREATE POLICY "staff_insert_receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (auth.jwt() ->> 'app_role') IN ('admin', 'owner')
  );

DROP POLICY IF EXISTS "staff_delete_receipts" ON storage.objects;
CREATE POLICY "staff_delete_receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (auth.jwt() ->> 'app_role') IN ('admin', 'owner')
  );

-- Intentionally NO storage UPDATE policy: receipt-replace flow is
-- delete-old + upload-new (matches SummaryPage.tsx handleSaveInlineEdit).
-- No UPDATE on storage.objects from authenticated for this bucket.

-- Intentionally NO anon policies. Anon is blocked by missing policy + no
-- GRANT chain. Service_role bypasses RLS entirely (used by dispatcher).

COMMIT;
