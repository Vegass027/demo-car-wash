-- 007_seed_test_tire_client.sql
-- =========================================================================
-- TEST ONLY — do not use in Mini App production flow.
--
-- Создаёт ИЗОЛИРОВАННЫЙ профиль + клиента для tire RPC smoke tests, tire
-- endpoint tests, и tire concurrent-cancel tests.
-- Цель: не допустить тестовое загрязнение
--   - моих реальных Telegram-клиентов (telegram_id 7295309649, etc.),
--   - Test Admin / Test Owner / Test Client demo-аккаунтов
--     (111111111 / 222222222 / 333333333),
--   - car-wash тестов Slice #1
-- и не смешивать счётчик shared 30-day cancellation counter, который
-- объединён по client_id между car-wash и tire booking_cancellations.
--
-- Cleanup scripts ОБЯЗАНЫ ограничивать scope строго этим test client_id
-- и тестовыми датами 2099-*, никогда не делать общий DELETE по всем
-- cancellations или общий UPDATE всех client blocks.
--
-- Hardcoded UUIDs (сгенерированы через `SELECT gen_random_uuid()` в demo-DB):
--   test_tire_profile_id = de8998b6-0725-46de-89e5-a89061daa2b5
--   test_tire_client_id  = 2c89868f-e85b-44cb-825b-896c3f77c474
-- =========================================================================

INSERT INTO public.profiles (id, role, full_name, telegram_id, last_auth_method)
SELECT 'de8998b6-0725-46de-89e5-a89061daa2b5'::uuid,
       'client',
       '[TEST ONLY] Tire Test Client',
       444444444,
       'telegram'
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE telegram_id = 444444444
);

INSERT INTO public.clients (id, profile_id, full_name, phone, is_active, online_booking_blocked_until)
SELECT '2c89868f-e85b-44cb-825b-896c3f77c474'::uuid,
       'de8998b6-0725-46de-89e5-a89061daa2b5'::uuid,
       '[TEST ONLY] Tire Test Client',
       '+79991234501',
       true,
       NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.clients
  WHERE profile_id = 'de8998b6-0725-46de-89e5-a89061daa2b5'::uuid
);
