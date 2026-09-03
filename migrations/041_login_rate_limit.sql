-- migration 041 — Issue 12: per-IP login rate limit
--
-- DEMO-only. Mirrors migration 037/040 pattern: minimal table, atomic
-- SECURITY DEFINER function, server-only access via service_role.
--
-- Threat model: brute-force `/api/login` from a single IP against admin
-- credentials. Current bcrypt cost (6) makes offline attacks cheap if a
-- dump ever leaks. This is the cheap online defense: 10 failed attempts
-- per 15-min window per IP.
--
-- Storage: ip_hash (sha256 hex, NOT raw IP — per requirement
-- "не надо логировать raw IP").
--
-- Lifecycle: NO cron, NO automatic cleanup. Old rows can be pruned
-- manually or by future task. The window auto-resets per-IP on first
-- new attempt past 15 minutes (no row mutation needed for that path).
--
-- Fail-open: caller (api/login.ts) wraps the RPC in try/catch. If the
-- function call errors for any reason, the login flow proceeds and the
-- error is logged. Technical outage must never lock out all staff.

CREATE TABLE IF NOT EXISTS public.login_rate_limits (
  ip_hash text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_rate_limits_updated_at
  ON public.login_rate_limits(updated_at);

-- check_login_rate_limit(p_ip_hash)
--   Read-only check: returns whether a NEW attempt is allowed right now.
--   Does NOT mutate state. Used to gate verify_password before any work.
--   allowed=true means proceed; allowed=false means return 429 immediately.
--   retry_after_seconds is computed only when allowed=false (else 0).
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(p_ip_hash text)
RETURNS TABLE(allowed boolean, current_count integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_interval interval := interval '15 minutes';
  v_max_attempts integer := 10;
  v_existing record;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_existing
  FROM public.login_rate_limits
  WHERE ip_hash = p_ip_hash;

  IF v_existing IS NULL THEN
    RETURN QUERY SELECT true, 0, 0;
    RETURN;
  END IF;

  -- Window expired → count is implicitly reset (row reused on next failure)
  IF v_existing.window_started_at + v_window_interval < v_now THEN
    RETURN QUERY SELECT true, 0, 0;
    RETURN;
  END IF;

  IF v_existing.attempt_count >= v_max_attempts THEN
    RETURN QUERY SELECT
      false,
      v_existing.attempt_count,
      GREATEST(0, EXTRACT(EPOCH FROM (v_existing.window_started_at + v_window_interval - v_now))::integer);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_existing.attempt_count, 0;
END;
$$;

-- record_failed_login(p_ip_hash)
--   Atomically increment the per-IP failure counter, creating or resetting
--   the window as needed. Called only on FAILED login attempts (success
--   path calls reset_login_rate_limit). Atomic via SELECT FOR UPDATE.
CREATE OR REPLACE FUNCTION public.record_failed_login(p_ip_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_interval interval := interval '15 minutes';
  v_now timestamptz := now();
  v_existing record;
BEGIN
  SELECT * INTO v_existing
  FROM public.login_rate_limits
  WHERE ip_hash = p_ip_hash
  FOR UPDATE;

  IF v_existing IS NULL THEN
    INSERT INTO public.login_rate_limits (ip_hash, window_started_at, attempt_count, updated_at)
    VALUES (p_ip_hash, v_now, 1, v_now);
    RETURN;
  END IF;

  -- Window expired → reset atomically
  IF v_existing.window_started_at + v_window_interval < v_now THEN
    UPDATE public.login_rate_limits
    SET window_started_at = v_now, attempt_count = 1, updated_at = v_now
    WHERE ip_hash = p_ip_hash;
    RETURN;
  END IF;

  UPDATE public.login_rate_limits
  SET attempt_count = v_existing.attempt_count + 1, updated_at = v_now
  WHERE ip_hash = p_ip_hash;
END;
$$;

-- reset_login_rate_limit(p_ip_hash)
--   Called on successful login: clears the failure counter entirely.
--   "успешный логин не должен ухудшать ситуацию".
CREATE OR REPLACE FUNCTION public.reset_login_rate_limit(p_ip_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.login_rate_limits WHERE ip_hash = p_ip_hash;
END;
$$;

-- Lockdown: only service_role can read/write this table or call these
-- functions. anon and authenticated get nothing — the dispatcher runs
-- server-side via api/login.ts using the service_role key.
REVOKE ALL ON TABLE public.login_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.login_rate_limits TO service_role;

REVOKE ALL ON FUNCTION public.check_login_rate_limit(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_failed_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_login_rate_limit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_login_rate_limit(text) TO service_role;
