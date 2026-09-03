-- migration 043 — Issue 12 follow-up: lock down EXECUTE on rate-limit RPCs.
--
-- DEMO-only. Closes a post-apply finding from migration 041 verification:
-- anon and authenticated pseudo-roles inherited EXECUTE on the three
-- rate-limit SECURITY DEFINER functions via the PUBLIC pseudo-role, even
-- though migration 041 already did `REVOKE ALL FROM PUBLIC`. The migration
-- 041 REVOKE FROM PUBLIC does not propagate to anon/authenticated in
-- Supabase's role model, leaving the RPCs callable by anyone holding the
-- anon JWT (the Supabase anon key is public, ships in the browser bundle).
--
-- Threat model this closes:
--   1. DoS against staff logins: an attacker calls record_failed_login
--      repeatedly with arbitrary ip_hash values to fill legitimate
--      employees' counters and lock them out for 15 minutes.
--   2. Self-bypass: an attacker repeatedly calls reset_login_rate_limit
--      to keep their own counter at zero while brute-forcing passwords.
--   3. Enumeration: an attacker calls check_login_rate_limit with arbitrary
--      hashes to probe whether a given IP is currently rate-limited.
--
-- None of the rate-limit *data* is sensitive (only SHA-256 IP hashes and
-- integer counters), but the ability to mutate it is. After this migration
-- only service_role (used server-side by api/login.ts via supabaseAdmin)
-- can read or mutate the counter — the public anon key can do nothing.
--
-- Idempotent: REVOKE / GRANT are safe to re-apply. If migration 041 ever
-- added these statements later, this migration just re-asserts them.
--
-- Does NOT change: table, RLS, business logic, application code, or the
-- rate-limit constants (10 attempts / 15 min). api/login.ts keeps using
-- service_role and continues to work unchanged.

-- check_login_rate_limit
REVOKE EXECUTE ON FUNCTION public.check_login_rate_limit(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_login_rate_limit(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_login_rate_limit(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text) TO service_role;

-- record_failed_login
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO service_role;

-- reset_login_rate_limit
REVOKE EXECUTE ON FUNCTION public.reset_login_rate_limit(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_login_rate_limit(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_login_rate_limit(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_login_rate_limit(text) TO service_role;
