-- migrations/045_unified_document_number.sql
--
-- Issue 17 — единая сквозная нумерация invoice/act по ведомости.
--
-- Ведомость организации = (organization_id, fiscal_year, fiscal_month, service_type).
-- Invoice и act одной ведомости делят ОДИН document_number.
-- Counter ГЛОБАЛЬНЫЙ, без month-reset, без per-document-type split — root cause
-- прежнего расхождения номеров.
--
-- Этот миграционный файл добавляет новые таблицы (singleton counter + persistent
-- assignments) и RPC allocate_document_number. Существующая
-- `document_numbers` (per-doc_type counter) оставляется нетронутой как legacy
-- read-only путь для тестов и старого RPC — backward-compat, без retroactive
-- правок отпечатанных PDF'ов.

BEGIN;

-- 1. Persistent таблица ведомостей: одна строка на (org, year, month, service_type).
--    UNIQUE на этом tuple — гарантия, что одна ведомость не получит два разных номера.
--    UNIQUE на document_number — глобальная уникальность, монотонно растёт.
CREATE TABLE IF NOT EXISTS public.document_assignments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fiscal_year     integer     NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2100),
  fiscal_month    integer     NOT NULL CHECK (fiscal_month BETWEEN 1 AND 12),
  service_type    text        NOT NULL CHECK (service_type IN ('carwash', 'tire')),
  document_number integer     NOT NULL CHECK (document_number > 0),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, fiscal_year, fiscal_month, service_type),
  UNIQUE (document_number)
);

CREATE INDEX IF NOT EXISTS idx_document_assignments_lookup
  ON public.document_assignments(organization_id, fiscal_year, fiscal_month, service_type);

-- 2. Глобальный counter — ОДНА-ЕДИНСТВЕННАЯ строка благодаря singleton-PRIMARY KEY.
--    Без month-reset, без произвольного UUID. Физически невозможно создать вторую row.
--    Backfill: current_number = MAX(legacy document_numbers.current_number), чтобы
--    новые номера не пересекались с уже отпечатанными PDF'ами legacy-эпохи.
CREATE TABLE IF NOT EXISTS public.document_counter (
  singleton      boolean     PRIMARY KEY DEFAULT true CHECK (singleton),
  current_number integer     NOT NULL CHECK (current_number >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.document_counter (singleton, current_number)
SELECT true, COALESCE(MAX(current_number), 0) FROM public.document_numbers
ON CONFLICT (singleton) DO NOTHING;

-- 3. RPC: atomic allocate-or-lookup document_number для одной ведомости.
--    На входе: (organization_id, year, month, service_type).
--    - Если assignment для tuple уже существует → возвращает сохранённый document_number
--      (idempotency — повторный вызов для той же ведомости = тот же номер).
--    - Иначе → под глобальным advisory-lock'ом increment'ит singleton counter и INSERT'ит
--      assignment, возвращает новый номер.
--    Idempotent. Concurrency-safe: advisory-lock сериализует ВСЕ allocations через один
--    фиксированный ключ, гарантируя монотонный counter без дубликатов.
--    On missing counter row: RAISE EXCEPTION (не пытаемся авто-чинить — singleton row
--    должна быть создана migration 045; если кто-то её удалил руками, это авария, и
--    выдавать непредсказуемый номер хуже, чем остановиться).
CREATE OR REPLACE FUNCTION public.allocate_document_number(
  p_organization_id uuid,
  p_fiscal_year     integer,
  p_fiscal_month    integer,
  p_service_type    text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_existing integer;
  v_next     integer;
BEGIN
  -- Step 1: Fast path — assignment уже существует для этой ведомости.
  --         Идемпотентно возвращаем сохранённый document_number.
  SELECT document_number INTO v_existing
  FROM public.document_assignments
  WHERE organization_id = p_organization_id
    AND fiscal_year = p_fiscal_year
    AND fiscal_month = p_fiscal_month
    AND service_type = p_service_type;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Step 2: Slow path — захватываем глобальный advisory-lock для serializing
  --         любых allocations (любые ведомости, любые месяца), чтобы counter
  --         инкрементировался строго по одному за раз.
  PERFORM pg_advisory_xact_lock(hashtextextended('document_counter_global', 0));

  -- Step 3: Re-check после lock — параллельный allocate мог уже состояться и
  --         создать assignment пока мы ждали lock.
  SELECT document_number INTO v_existing
  FROM public.document_assignments
  WHERE organization_id = p_organization_id
    AND fiscal_year = p_fiscal_year
    AND fiscal_month = p_fiscal_month
    AND service_type = p_service_type;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Step 4: Bump singleton counter атомарно. PK на singleton гарантирует, что
  --         UPDATE затронет ровно одну строку и RETURNING вернёт ровно одно число.
  UPDATE public.document_counter
    SET current_number = current_number + 1,
        updated_at = now()
  WHERE singleton = true
  RETURNING current_number INTO v_next;

  -- Защита от случайного повреждения: singleton row обязана существовать после
  -- seed в этой миграции. Если кто-то её удалил руками — лучше упасть громко,
  -- чем выдать NULL и потом сломать INSERT в document_assignments.
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'document_counter_missing';
  END IF;

  -- Step 5: INSERT assignment. ON CONFLICT защищает от race в edge cases
  --         (если INSERT пришёл позже параллельного allocate для той же ведомости).
  INSERT INTO public.document_assignments
    (organization_id, fiscal_year, fiscal_month, service_type, document_number)
  VALUES (p_organization_id, p_fiscal_year, p_fiscal_month, p_service_type, v_next)
  ON CONFLICT (organization_id, fiscal_year, fiscal_month, service_type) DO NOTHING
  RETURNING document_number INTO v_existing;

  -- Если параллельный allocate уже создал assignment — возвращаем его номер.
  -- Иначе возвращаем вновь созданный.
  RETURN COALESCE(v_existing, v_next);
END;
$fn$;

ALTER FUNCTION public.allocate_document_number(uuid, integer, integer, text) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.allocate_document_number(uuid, integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_document_number(uuid, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.allocate_document_number(uuid, integer, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_document_number(uuid, integer, integer, text) TO service_role;

COMMENT ON FUNCTION public.allocate_document_number IS
  'Issue 17: allocate or lookup один document_number для ведомости (organization, year, month, service_type). Idempotent. Глобальный counter, монотонно растёт.';

COMMIT;
