-- migration 042 — Issue 13: bcrypt cost 6 → 10 in change_password
--
-- DEMO-only. Per owner direction: minimal, no opportunistic rehash at login,
-- no bulk rehash of existing accounts. Cost 10 (not 12) — substantial
-- improvement over default 6 without serverless-timeout risk.
--
-- Why this is safe without a bulk rehash:
--   PostgreSQL `crypt(p_password, p.password_hash)` is constant-time at the
--   verification layer — the cost factor is encoded IN the stored hash
--   (`$2a$10$...` vs `$2a$06$...`). Existing cost-6 hashes continue to
--   verify via verify_password. New hashes get cost 10. A user transitions
--   to cost 10 the next time they change their password (or when an admin
--   runs the manual `crypt(p_new_password, gen_salt('bf', 10))` for them).
--
-- Bench expectation (1× Intel i5/M1 class): cost 10 = ~80ms per verify,
-- cost 6 = ~10ms. Still well under Vercel Hobby 10s maxDuration on
-- /api/login even with the additional rate-limit RPC roundtrip.

CREATE OR REPLACE FUNCTION public.change_password(p_user_id uuid, p_old_password text, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_current_hash TEXT;
BEGIN
  -- Текущий хеш
  SELECT password_hash INTO v_current_hash
  FROM profiles
  WHERE id = p_user_id;

  IF v_current_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Старый хеш может иметь любой cost (6/10/12/...) — crypt() авто-определяет
  IF v_current_hash != crypt(p_old_password, v_current_hash) THEN
    RETURN FALSE;
  END IF;

  -- Issue 13: cost 10 (was: gen_salt('bf') which defaults to 6). Существующие
  -- пользователи перейдут на cost 10 при следующей смене пароля.
  UPDATE profiles
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$function$;

-- Grants are already in place from migration 016; do not re-REVOKE here.
-- Service_role retains EXECUTE (for /api/staff:change-password dispatcher).
