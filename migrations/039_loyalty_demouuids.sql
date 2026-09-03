-- ============================================================================
-- 039_loyalty_demouuids.sql  (DEMO only)
-- ----------------------------------------------------------------------------
-- Issue 5: loyalty UUID drift fix.
--
-- ROOT CAUSE:
--   The trigger `update_loyalty_progress` hardcodes 6 service UUIDs that match
--   the PROD `services.id` values. DEMO has different `services.id` UUIDs
--   (placeholder 71000000-...-XXXX + a few newer ones) — same `service_id`
--   slugs (body-wash, full-wash, salon-vacuum, salon-dry-clean, full-dry-clean)
--   exist on both envs but with different UUIDs. Additionally, the
--   `free-body-wash` service (the bonus wash) does not exist on DEMO at all.
--
--   Result on DEMO: trigger never matches → loyalty never increments →
--   `loyalty_carwash_progress` stays empty → free-body-wash never awarded.
--
-- FIX (Variant D — minimal, no catalog changes):
--   1. INSERT one new row into `services` for the missing `free-body-wash`
--      with a fresh, locally-generated UUID (no collision: this service_id
--      is absent on DEMO). Business-meaningful fields (name, category,
--      prices, is_active, is_visible_in_online_booking) mirror PROD.
--      `id` is brand-new — NOT a copy of the PROD UUID — so this migration
--      has zero impact on PROD.
--
--   2. CREATE OR REPLACE FUNCTION `update_loyalty_progress()` with the same
--      logic, same trigger event/timing, same structure, but with the 6
--      hardcoded UUIDs replaced by DEMO UUIDs:
--        - body-wash         = 71000000-0000-0000-0000-000000000001
--        - full-wash         = 71000000-0000-0000-0000-000000000002
--        - salon-vacuum      = 71000000-0000-0000-0000-000000000007
--        - salon-dry-clean   = c093cace-b02a-434e-b0ed-d708f52c4f25
--        - full-dry-clean    = 9e800ff9-b1ea-471d-b036-16dab5e69869
--        - free-body-wash    = 1b3953ef-e9a9-4307-8d09-508dded4ffea  (new)
--
--      The trigger `trigger_update_loyalty_progress` on bookings is NOT
--      dropped/recreated — `CREATE OR REPLACE FUNCTION` swaps the function
--      body, the existing trigger continues to invoke the new version
--      automatically on next booking status update.
--
-- WHAT IS NOT CHANGED:
--   * The 5 existing DEMO services with `service_id` = body-wash / full-wash /
--     salon-vacuum / salon-dry-clean / full-dry-clean — names, prices, IDs
--     all untouched ("Экспресс-мойка", "Стандартная мойка" etc. remain).
--   * The single existing DEMO booking — its `services` JSONB (which still
--     references placeholder UUIDs) is NOT migrated.
--   * No other rows in `services` are touched (only INSERT of one new row).
--   * No RLS or grants changes. RLS on `loyalty_carwash_progress` already
--     correctly gates writes through `staff_all` / `service_role_all_access`
--     policies; `services` grants allow service_role INSERT.
--   * `shared/config/loyalty.ts` is NOT modified — it reflects PROD semantics
--     and is consumed only by PROD-side dispatcher reads (the trigger is the
--     authoritative writer on both envs; this migration brings DEMO trigger
--     in sync with what the trigger already does on PROD, just with DEMO UUIDs).
--
-- SECURITY NOTE (informational, NOT in scope of this migration):
--   `loyalty_carwash_progress` has wide grants: anon and authenticated roles
--   have ALL (DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE).
--   RLS gates this via `anon_blocked` (USING/WITH CHECK=false) and
--   `client_own_select` (USING only via clients JOIN), but the GRANT itself
--   is architecturally broad — same pattern as the wide grants on `expenses`
--   on PROD that we closed in migration 021. Tracking as a separate
--   technical-debt item; out of scope here.
-- ============================================================================

-- ============================================================================
-- Step 1: add the missing free-body-wash service.
-- ============================================================================
--
-- UUID chosen deterministically via gen_random_uuid() at migration
-- authoring time and inlined as a constant (the same constant is also used
-- in the trigger function below — no reliance on RETURNING).
--
-- `is_visible_in_online_booking` is `true` — that is the actual PROD value
-- (verified via /rest/v1/services?service_id=eq.free-body-wash). We mirror
-- PROD behavior: the bonus wash CAN be picked manually (e.g. if staff
-- awards it manually and adds it to a booking).
INSERT INTO services (
  id, service_id, name, service_type, category,
  price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan,
  is_active, sort_order, allow_multiple, is_visible_in_online_booking
) VALUES (
  '1b3953ef-e9a9-4307-8d09-508dded4ffea',
  'free-body-wash',
  'Бонусная мойка кузова',
  'carwash',
  'Бонус',
  0, 0, 0, 0, 0,
  true,
  999,
  false,
  true
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Step 2: swap the trigger function body to use DEMO UUIDs.
-- ============================================================================
--
-- Same trigger event/timing (`AFTER UPDATE OF status ON bookings`), same
-- WHEN condition, same 5-level nested if/elsif structure. Only the 6
-- hardcoded service UUIDs change.
--
-- The existing trigger `trigger_update_loyalty_progress` continues to call
-- `update_loyalty_progress()`; CREATE OR REPLACE FUNCTION rebinds it to the
-- new body atomically.
CREATE OR REPLACE FUNCTION public.update_loyalty_progress()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
DECLARE
    has_free_wash boolean;
    current_pending boolean;
BEGIN
    -- ✅ ПРОВЕРКА 1: только для физических лиц с client_id
    IF NEW.is_org = false AND NEW.client_id IS NOT NULL THEN
        -- ✅ ПРОВЕРКА 2: только при завершении заказа
        IF NEW.status = 'ГОТОВО' AND (OLD.status IS NULL OR OLD.status != 'ГОТОВО') THEN
            -- ✅ ПРОВЕРКА 3: только онлайн-записи
            IF NEW.booking_source = 'online' THEN
                -- Проверяем содержит ли заказ бонусную мойку
                -- DEMO UUID для free-body-wash (сгенерирован в шаге 1 этой миграции)
                has_free_wash := NEW.services @> '["1b3953ef-e9a9-4307-8d09-508dded4ffea"]'::jsonb;

                -- Получаем текущий статус pending
                SELECT free_wash_pending INTO current_pending
                FROM loyalty_carwash_progress
                WHERE client_id = NEW.client_id;

                IF has_free_wash THEN
                    -- ✅ Клиент ИСПОЛЬЗОВАЛ бонусную мойку → сброс
                    INSERT INTO loyalty_carwash_progress (client_id, total_washes_with_body, free_wash_pending, last_booking_id, last_wash_date)
                    VALUES (NEW.client_id, 0, FALSE, NEW.id, NEW.booking_date)
                    ON CONFLICT (client_id) DO UPDATE
                    SET
                        total_washes_with_body = 0,
                        free_wash_pending = FALSE,
                        last_booking_id = EXCLUDED.last_booking_id,
                        last_wash_date = EXCLUDED.last_wash_date,
                        updated_at = NOW();
                ELSIF current_pending = TRUE THEN
                    -- ✅ Бонус доступен, но НЕ использован в этом заказе
                    -- НЕ увеличиваем счётчик, ждём пока клиент использует бонус
                    -- Просто обновляем last_booking_id и дату
                    UPDATE loyalty_carwash_progress
                    SET
                        last_booking_id = NEW.id,
                        last_wash_date = NEW.booking_date,
                        updated_at = NOW()
                    WHERE client_id = NEW.client_id;
                ELSE
                    -- ✅ Бонус НЕ доступен → проверяем услуги для лояльности
                    -- Условия: full-wash ИЛИ (body-wash + salon-vacuum) ИЛИ химчистка
                    -- DEMO UUID'ы:
                    --   body-wash       = 71000000-...-0001
                    --   full-wash       = 71000000-...-0002
                    --   salon-vacuum    = 71000000-...-0007
                    --   salon-dry-clean = c093cace-b02a-434e-b0ed-d708f52c4f25
                    --   full-dry-clean  = 9e800ff9-b1ea-471d-b036-16dab5e69869
                    IF NEW.services @> '["71000000-0000-0000-0000-000000000002"]'::jsonb OR (
                        NEW.services @> '["71000000-0000-0000-0000-000000000001"]'::jsonb AND
                        NEW.services @> '["71000000-0000-0000-0000-000000000007"]'::jsonb
                    ) OR (
                        NEW.services @> '["c093cace-b02a-434e-b0ed-d708f52c4f25"]'::jsonb
                    ) OR (
                        NEW.services @> '["9e800ff9-b1ea-471d-b036-16dab5e69869"]'::jsonb
                    ) THEN
                        -- Увеличиваем счётчик
                        INSERT INTO loyalty_carwash_progress (client_id, total_washes_with_body, free_wash_pending, last_booking_id, last_wash_date)
                        VALUES (NEW.client_id, 1, FALSE, NEW.id, NEW.booking_date)
                        ON CONFLICT (client_id) DO UPDATE
                        SET
                            total_washes_with_body = loyalty_carwash_progress.total_washes_with_body + 1,
                            last_booking_id = EXCLUDED.last_booking_id,
                            last_wash_date = EXCLUDED.last_wash_date,
                            updated_at = NOW();

                        -- Проверяем достиг ли 10 моек → устанавливаем pending = TRUE
                        UPDATE loyalty_carwash_progress
                        SET free_wash_pending = TRUE
                        WHERE client_id = NEW.client_id
                          AND total_washes_with_body >= 10
                          AND (total_washes_with_body % 10) = 0;
                    END IF;
                END IF;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- ============================================================================
-- No COMMENT/GRANT changes needed.
-- ============================================================================
-- - The function has no explicit GRANT — it's invoked only by the trigger,
--   which runs in the security context of the row write (trigger functions
--   in plpgsql run as the calling user unless SECURITY DEFINER is set).
--   The existing trigger was already created without explicit GRANT, so
--   this matches the prior state exactly.
-- - No trigger DDL change: `trigger_update_loyalty_progress` continues to
--   fire on `AFTER UPDATE OF status ON bookings` and now invokes the new
--   function body automatically.
