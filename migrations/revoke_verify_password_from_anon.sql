-- Phase 1.7 of carwash-full-security-lockdown-plan.md
-- Close brute-force enumeration vector: verify_password RPC was callable
-- by anyone via PostgREST /rest/v1/rpc/verify_password with anon apikey,
-- bypassing /api/login audit trail (no auth_logs entry on each attempt).
--
-- Before this migration:
--   curl -X POST /rest/v1/rpc/verify_password \
--     -H "apikey: <anon>" -d '{"p_login":"demo_owner","p_password":"test1234"}'
--   → HTTP 200 with [{"id":"<uuid>","role":"owner",...,"success":true}]
--   → NO entry in auth_logs
--   → infinite brute-force without forensic trace
--
-- After this migration:
--   - anon can no longer call verify_password (PostgREST returns 401/403)
--   - authenticated (any JWT) also blocked
--   - service_role still works (used by /api/login via supabaseAdmin)
--   - postgres (function owner) keeps EXECUTE (implicit)
--
-- /api/login endpoint is UNAFFECTED — it calls via supabaseAdmin with
-- service_role key, which retains EXECUTE.
--
-- Rollback (30 seconds):
--   GRANT EXECUTE ON FUNCTION public.verify_password(p_login varchar, p_password text)
--     TO PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_password(p_login varchar, p_password text)
  FROM PUBLIC, anon, authenticated;

-- Explicit grants: keep service_role + owner (postgres already has it)
GRANT EXECUTE ON FUNCTION public.verify_password(p_login varchar, p_password text)
  TO service_role;