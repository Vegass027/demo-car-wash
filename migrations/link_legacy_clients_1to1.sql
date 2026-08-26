-- Phase 1.5 of carwash-full-security-lockdown-plan.md
-- Link orphan clients (profile_id IS NULL) to profiles by normalized phone.
--
-- Classes:
--   NO_MATCH (0 profile matches)   → no change (report only)
--   1_TO_1 (exactly 1 match)        → auto-link
--   AMBIGUOUS (2+ matches)          → no change (report only)
--
-- Idempotent and re-runnable safely:
-- - persistent _legacy_link_audit table (created once, reused across runs)
-- - run_id scopes every audit row to the migration execution
-- - INSERT + UPDATE in ONE statement via CTE RETURNING (atomic, no zombie
--   window between them — earlier split into 2 statements caused 'idle in
--   transaction' zombies via Supavisor connection pooler)
-- - INSERT ... ON CONFLICT DO NOTHING handles same-client repeats within run
--
-- Run with:  psql -v ON_ERROR_STOP=1 -v run_id="$(uuidgen)" -f migrations/link_legacy_clients_1to1.sql
--
-- NO DO $$ ... $$, NO RAISE NOTICE, NO BEGIN/COMMIT wrapper.
-- Every statement is autocommit. INSERT+UPDATE is one atomic CTE statement.
--
-- Rollback (precise, by exact run_id):
--   BEGIN;
--   UPDATE public.clients AS c
--   SET profile_id = audit.old_profile_id, updated_at = NOW()
--   FROM public._legacy_link_audit AS audit
--   WHERE c.id = audit.client_id
--     AND audit.run_id = '<run_id>'
--     AND c.profile_id = audit.new_profile_id;  -- only restore if still linked
--   DELETE FROM public._legacy_link_audit WHERE run_id = '<run_id>';
--   COMMIT;

-- Persistent audit table (idempotent CREATE IF NOT EXISTS).
-- PK (run_id, client_id) so the same client can be linked by multiple runs.
CREATE TABLE IF NOT EXISTS public._legacy_link_audit (
  run_id        uuid NOT NULL,
  client_id      uuid NOT NULL,
  old_profile_id uuid,
  new_profile_id uuid NOT NULL,
  linked_at      timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_link_audit_run_id
  ON public._legacy_link_audit (run_id);

-- INSERT 1_TO_1 candidates into audit + UPDATE clients FROM inserted — one atomic statement.
-- After WHERE cm.match_count = 1, each cm row is unique per c.id.
WITH
client_matches AS (
  SELECT
    c.id AS client_id,
    p.id AS profile_id,
    COUNT(*) OVER (PARTITION BY c.id) AS match_count
  FROM public.clients AS c
  JOIN public.profiles AS p
    ON public.normalize_phone(p.phone) = public.normalize_phone(c.phone)
   AND p.role = 'client'
  WHERE c.profile_id IS NULL
),
inserted AS (
  INSERT INTO public._legacy_link_audit (
    run_id, client_id, old_profile_id, new_profile_id
  )
  SELECT
    :'run_id'::uuid,
    c.id,
    c.profile_id,
    cm.profile_id
  FROM public.clients AS c
  JOIN client_matches AS cm ON cm.client_id = c.id
  WHERE cm.match_count = 1
    AND c.profile_id IS NULL
  ON CONFLICT (run_id, client_id) DO NOTHING
  RETURNING client_id, new_profile_id
)
UPDATE public.clients AS c
SET profile_id = ins.new_profile_id,
    updated_at = NOW()
FROM inserted AS ins
WHERE c.id = ins.client_id
  AND c.profile_id IS NULL;            -- belt-and-suspenders: re-runs safe

-- Reports (separate autocommit SELECTs, each <2ms per EXPLAIN ANALYZE).
SELECT 'RUN_ID' AS metric, :'run_id'::uuid::text AS value;

SELECT '1_TO_1_LINKED' AS class, COUNT(*)::text AS count
FROM public._legacy_link_audit
WHERE run_id = :'run_id'::uuid;

SELECT 'NO_MATCH' AS class, COUNT(*)::text AS count
FROM public.clients c
WHERE c.profile_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.role = 'client'
      AND public.normalize_phone(p.phone) = public.normalize_phone(c.phone)
  );

SELECT 'AMBIGUOUS' AS class, COUNT(*)::text AS count
FROM (
  SELECT c.id
  FROM public.clients c
  JOIN public.profiles p
    ON p.role = 'client'
   AND public.normalize_phone(p.phone) = public.normalize_phone(c.phone)
  WHERE c.profile_id IS NULL
  GROUP BY c.id
  HAVING COUNT(*) >= 2
) AS ambiguous;