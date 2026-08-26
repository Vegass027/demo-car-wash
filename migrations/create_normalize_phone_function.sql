-- Phase 1.5 of carwash-full-security-lockdown-plan.md
-- SQL helper to mirror JS normalizePhoneNumber (shared/utils/phone.ts).
-- Used by both legacy linkage migration and future client-upsert paths.
--
-- Rules (matching JS):
--   strip non-digits → if 11 chars and starts with 8 → +7 + last 10
--                       if 11 chars and starts with 7 → + + all 11
--                       if 10 chars → +7 + 10
--                       else return digits as-is

CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p IS NULL OR p = '' THEN NULL
    WHEN LENGTH(REGEXP_REPLACE(p, '\D', '', 'g')) = 11
     AND REGEXP_REPLACE(p, '\D', '', 'g') LIKE '8%'
      THEN '+7' || SUBSTRING(REGEXP_REPLACE(p, '\D', '', 'g') FROM 2)
    WHEN LENGTH(REGEXP_REPLACE(p, '\D', '', 'g')) = 11
         AND REGEXP_REPLACE(p, '\D', '', 'g') LIKE '7%'
      THEN '+' || REGEXP_REPLACE(p, '\D', '', 'g')
    WHEN LENGTH(REGEXP_REPLACE(p, '\D', '', 'g')) = 10
      THEN '+7' || REGEXP_REPLACE(p, '\D', '', 'g')
    ELSE REGEXP_REPLACE(p, '\D', '', 'g')
  END;
$$;

COMMENT ON FUNCTION public.normalize_phone(text) IS
  'Mirrors shared/utils/phone.ts:normalizePhoneNumber. Used by legacy client linkage and future upsert paths.';