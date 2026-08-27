-- ============================================================================
-- Migration: 018_alter_admins_profile_id_nullable.sql
-- ============================================================================
-- Phase 2.4 / Slice #3c — fix admin create-admin dispatcher.
--
-- admins.profile_id was NOT NULL with FK to profiles.id. The legacy
-- createAdmin in lib/api/admins.ts and the new createStaffAdmin
-- dispatcher both pass NO profile_id (admin is created as internal
-- record before profile link is established). NOT NULL caused 500 on
-- every create-admin call (caught by owner-path E4 happy-path test).
--
-- Fix: ALTER COLUMN to DROP NOT NULL. Existing rows keep their
-- profile_id values. New dispatcher-created rows can leave profile_id
-- NULL until profile link is established (future slice).
-- ============================================================================

begin;

ALTER TABLE public.admins ALTER COLUMN profile_id DROP NOT NULL;

commit;

-- ============================================================================
-- Verification (run after apply):
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='admins' AND column_name='profile_id';
-- Expected: YES
--
-- Owner-path test:
--   POST /api/staff?action=create-admin {full_name: 'Test'} with owner JWT
--   Expected: 200 success + admin.id returned
-- ============================================================================