# PROJECT_STATE.md — Состояние проекта `demo-car-wash`

> **Этот файл — «передаточный» для следующего агента или сессии.** Прочитай целиком прежде чем что-то делать. Здесь: что это за проект, что сделано, что лежит где, какие пароли и токены используются, какие правила безопасности соблюдать, и что делать дальше.

---

## 0. Кто ты и где ты (быстрый self-check)

**Перед ЛЮБОЙ командой `git` / `npm` / `vercel` / `psql` / `curl` — выполни:**

```bash
pwd
```

Должно быть:
```
/Users/dmitriy/Downloads/demo-car-wash
```

Если ты в `/Users/dmitriy/Downloads/carwash-admin-pro` — **ты в проде. НИЧЕГО НЕ ДЕЛАЙ.** Сначала `cd /Users/dmitriy/Downloads/demo-car-wash`.

---

## 1. Что это за проект (в двух абзацах)

**Безопасность-аудит и план фикса** для клиентского production-проекта **carwash-admin-pro** (CRM для автомойки с Telegram Mini App, 38 таблиц в Supabase, AI-аудит выявил critical дыры — anon-доступ ко всей БД через public_all_access политики). Полный план фикса в [`/Users/dmitriy/Downloads/carwash-admin-pro/carwash-full-security-lockdown-plan.md`](carwash-full-security-lockdown-plan.md) — 849 строк, 8 фаз (0, 1, 1.5, 1.7, 1.8, 2, 2.5, 3).

**Изолированный demo-клон** для безопасной проверки плана **без касания прода**. Этот репозиторий (`/Users/dmitriy/Downloads/demo-car-wash`) — копия прода с **синтетическими** данными (не реальные клиенты мойки), задеплоенная на `https://demo-car-wash.vercel.app` и работающая с **отдельным** Supabase-проектом (`danobongqzbxilyvdwig`). Тестовый Telegram-бот на отдельном токене шлёт Mini App в этот demo-деплой. После успешного прогона плана в demo — пользователь примет решение, переносить ли фиксы на прод.

---

## 2. Карта файлов и окружений

### 2.1. Репозитории (на диске)

| Путь | Что | Можно трогать? |
|---|---|---|
| `/Users/dmitriy/Downloads/carwash-admin-pro/` | **ПРОД-репо**. Исходный код, который сейчас работает у клиента. | ❌ **НИЧЕГО НЕ МЕНЯТЬ**. Только `git log`/`grep`/`read` для справки. |
| `/Users/dmitriy/Downloads/bot-dovatora-crm-online/` | **ПРОД-бот**. Работает на сервере у клиента, обслуживает реальных клиентов мойки. | ❌ **НИЧЕГО НЕ МЕНЯТЬ**. |
| `/Users/dmitriy/Downloads/Demo-car-wash-bot-tg-online/` | **Demo-бот**. Копия прод-бота, `.env` переключён на test-БД и test-токен. | ✅ Рабочая директория для правок бота. |
| `/Users/dmitriy/Downloads/demo-car-wash/` | **Demo-репо**. Где мы работаем. Git: `Vegass027/demo-car-wash`. Vercel: `demo-car-wash.vercel.app`. | ✅ **Рабочая директория**. Все правки — здесь. |
| `/Users/dmitriy/Downloads/carwash-admin-pro/дамп/` | **Дамп прод-БД** (22 MB, schema + data). | ⚠️ Только для справки, не для восстановления. |

### 2.2. Supabase проекты

| Project ref | Назначение | Что внутри |
|---|---|---|
| `avajtwihzjfpytimfbaw` | **ПРОД Supabase** | Реальные данные клиента мойки. НЕ ТРОГАТЬ. |
| `danobongqzbxilyvdwig` | **Test Supabase** (для demo) | Скопированная schema + синтетические seed данные (~430 записей). Сюда пишем миграции плана. |

### 2.3. Connection strings

**TEST DB (ЭТО ИСПОЛЬЗУЕМ):**
```
postgresql://postgres.danobongqzbxilyvdwig:YVJlmcibmLQYBtRM@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
```

**TEST DB anon key (для Vercel env `VITE_SUPABASE_ANON_KEY`):**
```bash
supabase projects api-keys --project-ref danobongqzbxilyvdwig
# Или Dashboard → Settings → API → "anon public"
```

**PROD DB (НЕ ИСПОЛЬЗУЕМ напрямую):**
```
postgresql://postgres.avajtwihzjfpytimfbaw:BFmxgPpKmnsjWayO@aws-1-eu-west-1.pooler.supabase.com:6543/postgres
```

### 2.4. Telegram

| Что | Значение |
|---|---|
| **Прод-бот токен** (НЕ используем) | `8555107860:AAFqQSG7q22Nv7iKf5dhie_8ZoYLaJjhCOI` (в `.env` прод-бота, остаётся там) |
| **Test-бот токен** (используем) | `8968802010:AAFsPlpWkW-GQWmJjSP25MKLU0jCooE7hdM` |
| **Тестовые telegram_id** (для HMAC-spoofing тестов) | `111111111` (owner), `222222222` (admin), `333333333` (client) |

### 2.5. Деплой

- **Vercel**: `https://demo-car-wash.vercel.app` (задеплоен из GitHub `Vegass027/demo-car-wash`, branch `main`, commit `2bf8240`)
- **Авто-деплой**: включён — каждый `git push origin main` → ~30 сек → обновление в браузере
- **Vercel env-переменные** (настраиваются через Vercel Dashboard → Settings → Environment Variables, **НЕ через агента**):
  - `VITE_SUPABASE_URL` = `https://danobongqzbxilyvdwig.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = `<test anon key>`
  - `SUPABASE_SERVICE_ROLE_KEY` = `<test service_role key>`
  - `SUPABASE_JWT_SECRET` = `<test JWT secret>` (нужно для Фазы1)
  - `TELEGRAM_BOT_TOKEN` = `8968802010:AAFsPlpWkW-GQWmJjSP25MKLU0jCooE7hdM` (нужно для Фазы1)
  - `YOOKASSA_SHOP_ID` = `<sandbox>` (нужно для Фазы1 — пока нет)
  - `YOOKASSA_SECRET_KEY` = `<sandbox>` (нужно для Фазы1 — пока нет)
  - `NEXT_PUBLIC_APP_URL` = `https://demo-car-wash.vercel.app/`
  - `CRON_SECRET` = `e93570d29d5569f734c6ae34408dc71c43a5af28b65dc26ba705e5b9aea042ae` (сгенерирован, нигде не использовался)

### 2.6. Demo-бот (запущен как background process)

```
PID: 8740
Команда: cd /Users/dmitriy/Downloads/Demo-car-wash-bot-tg-online/telegram-bot && python3 bot.py
Лог: "🚀 Бот запущен"
Проверить лог: tail -f (через background_process logs bgp_xxx)
Остановить: background_process stop bgp_03a38794e001Rsg7hO8YcJEfHu
```

---

## 3. Состояние базы данных (test DB)

### 3.1. Schema

Применена полностью из прода через `supabase db dump --schema public | psql`. Все 38 таблиц, индексы, FK, ENUM, RPC (`verify_password`, `reset_daily`, `save_daily_report`), RLS-политики `public_all_access USING (true)`.

⚠️ **Все RLS-политики = `USING (true)`** — это и есть дыра безопасности, которую фиксит план. Не «исправляй» их руками — это задача Фазы 2.

### 3.2. Данные (синтетические)

| Таблица | Кол-во | Содержимое |
|---|---|---|
| `profiles` | 29 | 3 тестовых (telegram_id 111111111/222222222/333333333), 2 browser (demo_owner/demo_admin), 24 синтетических |
| `clients` | 30 | **3 legacy с profile_id=NULL** (для теста миграции Фазы 1.5.1), 3 bound к тестовым профилям, 24 generic |
| `services` | 28 | 10 переименованных + 18 добавленных, **все `service_id` совпадают с категориями в `lib/config/serviceCategories.ts`** |
| `tire_services` | 11 | Для шиномонтажа |
| `bookings` | 128 | 8-10 на день × 14 дней, +2 созданных пользователем вручную при тестировании |
| `tire_bookings` | 40 | Для шиномонтажа |
| `salary_transactions` | 42 | 6 мойщиков × 7 дней, тип `EARNING` |
| `work_shifts` | 18 | 6 мойщиков × 3 дня, статус `finished` |
| `expenses` | 10 | Разные категории |
| `daily_reports` | 7 | finalized, finalized_by = ADMIN_PROFILE |
| `loyalty_carwash_progress` | 10 | По клиенту |
| `worksheet_entries` | 15 | organization_id + driver_name обязательные |
| `closed_boxes` | 3 | На даты 21, 22, 23 августа — **НЕ на сегодня** |
| `sbp_banks` | 4 | Сбер, Альфа, Тинькофф, ВТБ |
| `inventory_categories`, `inventory_items` | 5 + 10 | unit='штуки' (не 'pcs') |
| `workers`, `tire_workers` | 8 + 2 | status='available', working_mode='solo' |
| `admins` | 2 | profile_id NOT NULL |
| `auth_logs`, `sms_logs`, `otp_codes`, `sms_rate_limits` | 0 | Все пустые (нужно заполнять в Фазе1) |

### 3.3. Тестовые логины для проверки

| Login | Password | Роль | Где работает |
|---|---|---|---|
| `demo_owner` | `test1234` | owner | Browser-логин через `https://demo-car-wash.vercel.app/` |
| `demo_admin` | `test1234` | admin | Browser-логин |

Telegram-логин через Mini App: реальный Telegram-аккаунт, чей `user.id` совпадает с `111111111`/`222222222`/`333333333` (для теста нужны эти аккаунты).

---

## 4. Что сделано (хронология)

| # | Что | Когда |
|---|---|---|
| 1 | Read-only аудит БД (38 таблиц, политики, привилегии) | Старт |
| 2 | Read-only аудит клиентского кода (Login.tsx, App.tsx, lib/api/*) | Старт |
| 3 | Read-only аудит Telegram-аутентификации (источник: `bot-dovatora-crm-online/telegram-bot`) | Старт |
| 4 | Создан план `carwash-full-security-lockdown-plan.md` | Середина сессии |
| 5 | План обновлён после 6 итераций замечаний (JWT-инъекция, race conditions, миграция legacy localStorage, тестовые кейсы в seed, ENV-переменные, Supabase Branch, runbook отката, открытые продуктовые вопросы) | Позже |
| 6 | Полный `pg_dump` прод-БД в `дамп/carwash_full_dump_20260825_180810.sql` (22 MB, schema + data через Docker) | Позже |
| 7 | Создан GitHub-репо `Vegass027/demo-car-wash`, push 279 файлов (commit `2bf8240`), Vercel auto-deploy | Позже |
| 8 | Создан test Supabase-проект `danobongqzbxilyvdwig`, schema-only restore + seed (430 синтетических записей) | Позже |
| 9 | Demo-бот: скопирован из прод-бота в `/Users/dmitriy/Downloads/Demo-car-wash-bot-tg-online/`, `.env` переключён на test-токен и test-БД, запущен (PID 8740) | Позже |
| 10 | Fix services: переименованы `service_id` в test-БД чтобы совпадали с категориями `lib/config/serviceCategories.ts` (продовый конфиг, не трогали) | Позже |
| 11 | Verified: browser-логин `demo_owner/test1234` работает в demo-car-wash.vercel.app, Mini App открывается из тестового бота, бронирования создаются | Подтверждено пользователем |
| 12 | Verified: бронирования отображаются в списке после hard reload (был баг client-side cache, не трогали) | Подтверждено |
| 13 | **Фаза 1.2:** `/api/telegram-auth.ts` с HMAC-проверкой initData + JWT HS256 (12ч TTL) + auth_logs INSERT (каждая попытка) + саморегистрация profile+clients с `role='client'` хардкод | Коммиты `6c1f16d` → `0f33773` |
| 14 | **Фаза 1.3:** `/api/login.ts` для staff + extract JWT helpers в `api/_lib/jwt.ts` + рефактор telegram-auth на общий модуль + ESM `.js` extension fix (Vercel bundler требует `.js` в relative-импортах, не `.ts`) | Коммиты `0ae2947` → `e7934b1` → `b3be469` |
| 15 | **Verified end-to-end** `/api/login`: 200 + JWT (demo_owner), 401 (wrong pwd), 401 (non-existent login), 400 (oversized 300-char pwd, length guard сработал ДО bcrypt), 405 (GET). Все 4 попытки в `auth_logs` с корректным IP, error_message хранит только длину логина (не сам логин) | Подтверждено curl + psql |
| 16 | **Фаза 1.4:** `lib/supabase.ts` fetch-wrapper с JWT-инъекцией + `lib/_supabase-wrapper.ts` (testable, без Vite-API) + race-condition fix (LOCAL `retriedThisRequest`, не module-level) | Коммиты `09ec6a2` → `fd31656` |
| 17 | **Verified:** 11/11 unit-тестов на wrapper через `node --experimental-strip-types --test` (T3 = Authorization header инжектится, T6 = 1 retry с новым токеном, T7 = 3 параллельных 401 каждый получает свой retry). Real REST: anon apikey + JWT из `/api/login` = 200 (это то что wrapper шлёт). Anon без токена = 200 (regression OK, 17 файлов не задеты). Vite build без TS-ошибок | Подтверждено node:test + curl |
| 18 | **Фаза 1.6a:** `Login.tsx` → `/api/login` + `setSessionToken` + `registerSessionExpiredHandler` для централизованной обработки staff 401 mid-session + legacy localStorage миграция + `last_auth_method` обновление на сервере (`/api/login` + `/api/telegram-auth`) | Коммит `ee8c0e8` |
| 19 | **Verified 1.6a:** curl-тесты `/api/login` (200/401/400/405), Supabase REST с JWT = 200, `auth_logs` имеет запись с `success=true, profile_id=44444444...`, `profiles.last_auth_method='password'`. Unit-тесты 11/11 (T9=staff handler fires, T10=client не fires, T11=anon не fires) | Подтверждено curl + psql + node:test |
| 20 | **Фаза 1.6b:** `lib/client-auth.ts` (loginViaTelegram + TelegramAuthError union + UI mapper + reloadMiniApp) + 3 wrapper'а → `loginViaTelegram()` + recovery buttons + `api/telegram-auth:179` role-check fix | Коммиты `0492a4f` + `83b828c` |
| 21 | **Verified 1.6b:** ✅ admin telegram_id=222222222 → **HTTP 403** «Role not permitted — Telegram Mini App is for client role only» (regression fix!). ✅ client telegram_id=333333333 → HTTP 200 + JWT (347 chars, app_role=client). ✅ bad HMAC → HTTP 401. ✅ Supabase REST с новым JWT = 200 (wrapper proof). ✅ `auth_logs` записан. ✅ `profiles.last_auth_method='telegram'`. Unit-тесты wrapper 11/11 (regression) | Подтверждено curl + psql |
| 22 | **Фаза 2 — Slice #1: DB-миграции** `migrations/001_public_carwash_slot_rpcs.sql` (anon+authenticated EXECUTE) + `migrations/002_cancel_own_booking_rpc.sql` (service-role only, `FOR UPDATE` row-lock, идемпотентный cancel_id path, UNIQUE(booking_id), 30-day cancel-count → auto-block логика). RPC-аудит: `prosecdef=t, provolatile=s/v, owner=postgres, search_path=pg_catalog,public` | Подтверждено через `pg_proc`+`routine_privileges` |
| 23 | **Фаза 2 — Slice #1: Atomic cancel RPC + smoke**: `test-slice1-rpcs.sh` (T1-T24) + `test-slice1-t21-concurrent-cancel.mjs` (8 параллельных `Promise.all` через supabaseAdmin.rpc). T1-T21 PASS, T15 доказал что 3-я отмена → `online_booking_blocked_until = current_date + 30` (с конкретной цифрой). T21 доказал FOR UPDATE: 8 одновременных rpc → 1 cancellation row + 7 idempotent returns, **0 ошибок**. Численные данные в отчёте, не «PASS» | Подтверждено |
| 24 | **Фаза 2 — Slice #1: API layer** — `api/_lib/validation.ts` (server-only, class-based `ValidationError`) + `api/_lib/require-client.ts` (HS256+JWT, role check, UUID profile_id) + 7 client endpoints → **консолидированы** в один dispatcher `api/client.ts` для укладывания в Vercel Hobby limit (12 serverless functions). URLs: `POST /api/client?action={get-my-cars,get-bookings,create-booking,cancel-booking,create-car,update-car,delete-car}` | Коммиты `4fbffff`, `6bdcd89` |
| 25 | **Фаза 2 — Slice #1: Tenant-isolation verified** — все 7 endpoints устроены так что `service_role` через `SELECT clients WHERE profile_id=jwt.profile_id` фильтрует только own; `create-booking` верифицирует ownership всех 4 external ID (client_car_id, car_id, organization_id, driver_id) через server-side SELECT `WHERE client_id = own.id AND phone = own.phone`. Box-overlap predicate `b.start_time < new_end_time AND b.end_time > new_start_time` (overlap, не exact match) | Тесты в `test-client-carwash-endpoints.mjs` 42 PASS |
| 26 | **Фаза 2 — Slice #1: Mini App UI switch** — `ClientBookingWrapper.tsx` (timeline = `rpc/get_public_booking_slots` + `rpc/get_public_closed_boxes` + `POST /api/client?action=get-bookings` для own; create/cancel через dispatcher), `AddCarForm.tsx` → `POST /api/client?action=create-car`, `MyGarage.tsx` → `POST /api/client?action=delete-car`. `lib/api/*` нетронут | Коммиты `f3947d8`, `e346ad7` |
| 27 | **Фаза 2 — Slice #1: Bug fixes after live Mini App verification** — (1) DayTimeline показывал пустой блок для чужих слотов из-за `undefined.slice()` синтетик-строки без `status`-поля — фикс: rpc-слоты теперь идут уже redacted-формой (`status='ОЖИДАЕТ'`, `client_name='Занято'`, пустые `car_model/plate_number/phone/services`) + `unified=[...ownBookings, ...syntheticSlots]` (own first, stable sort сохраняет порядок). (2) `useClientCars` хук показывал 27 машин (9 test pollution + 18 historic soft-deleted) — фикс: переписан на `/api/client?action=get-my-cars`, +9 тест-машин софт-делены в БД (Porsche Cayenne сохранён). (3) Own bookings в DayTimeline теперь видны (та же причина что 1) | Коммит `4a204b4` |
| 28 | **Фаза 2 — Slice #1: Idempotent block policy C** — `migrations/003_idempotent_block_on_cancel.sql`. В UPDATE блокировки добавлен WHERE guard `(online_booking_blocked_until IS NULL OR < current_date)`, чтобы повторные отмены внутри активной блокировки **не продлевали** её каждый раз на новые 30 дней. Счётчик и INSERT в booking_cancellations не изменились — подтверждено `test-003-idempotent-block.sh` (7 PASS): cancel1/2/3 устанавливают блок на 2026-09-25, cancel4 → `blocked=false, blocked_until=2026-09-25` (echoes существующее, не продлевает). DB row после cancel4: 2026-09-25 == 2026-09-25 (unchanged) | Подтверждено |
| 29 | **Vercel deploy** серии Slice #1: 17 serverless functions → over Vercel Hobby limit (12). Dispatcher `api/client.ts` снизил счёт до 11 (10 existing + 1 dispatcher). One-shot consolidation commit `6bdcd89`. **11 serverless functions, ≤ 12 — deploy passes.** При ручном `vercel deploy --prod` на этапе сборки Удалён второй раз (pnpm-lock.yaml, неверный package-manager detection) — откатил pnpm side-effects, `git push` прошёл через Vercel auto-deploy | Production: `https://demo-car-wash-eendx0vc5...`, потом `nlslke7jk...`, потом `393osy2ka...` |
| 30 | **Фаза 2 — Slice #2 (tire client flow): RECON** — read-only pgsql/migration-review подтвердил: ownership path только `tire_bookings.client_id → clients.profile_id` (НЕ через `created_by_profile_id`!); `booking_cancellations` уже имеет колонку `tire_booking_id` но без UNIQUE; `tire_service_days` anon-direct SELECT работает без RPC; `estimated_duration` фактически всегда 60 мин (1 distinct value); 4-ID ownership chain (client_car_id/car_id/organization_id/driver_id) идентичен carwash. RPC list: `get_public_booking_slots/closed_boxes/cancel_own_booking` (carwash) + **миграции 004/005/006 ещё не существовали**. GRANTs по tire-related таблицам = ALL для anon+authenticated | recon записан |
| 31 | **Фаза 2 — Slice #2: DB-миграции** `migrations/004_public_tire_slot_rpcs.sql` — `get_public_tire_booking_slots(p_target_date date)` RETURNS TABLE(id, booking_date, start_time, end_time, status) — **только slot metadata, БЕЗ PII** (no client_name, phone, car_model, plate_number, services, signature_data); end_time вычисляется SQL-выражением `(start_time + (estimated_duration \|\| ' minute')::interval)::time`. + companion `find_tire_booking_overlap(date, start_min, dur_min)` для create-tire-booking dispatcher-overlap-check. ACL: первая — anon+authenticated+service_role; вторая — service_role only (явный REVOKE FROM anon, authenticated) | Применено в demo-DB отдельными `psql -c`, preflight на дубликаты = 0, anon-smoke | 
| 32 | **Фаза 2 — Slice #2: DB-migrations 005+006** `migrations/005_cancel_own_tire_booking_rpc.sql` — функция `cancel_own_tire_booking(p_tire_booking_id uuid, p_profile_id uuid, p_reason text)` SECURITY DEFINER. Шаги: (1) FOR UPDATE row-lock на tire_bookings; (2) ownership через `tire_bookings.client_id → clients.profile_id`; (3) idempotency primary (existing booking_cancellations row) + fallback (status='ОТМЕНЕНО'); (4) status guard — только ОЖИДАЕТ; (5) UPDATE status='ОТМЕНЕНО'; (6) INSERT booking_cancellations; (7) shared 30-day counter (carwash+tire via `client_id`, без разделения); (8) **idempotent block guard Policy C** сразу встроен (повторные отмены не продлевают block). ACL: service_role only (anon+authenticated explicit REVOKE). `migrations/006_idempotent_block_on_tire_cancel.sql` — companion `CREATE UNIQUE INDEX CONCURRENTLY idx_booking_cancellations_tire_booking_unique ON booking_cancellations(tire_booking_id) WHERE tire_booking_id IS NOT NULL` (UNIQUE guard для race). Деплой-порядок: 006 ПЕРЕД 005 (без UNIQUE INDEX INSERT в RPC имеет race window) | Применено в demo-DB отдельными psql -c | 
| 33 | **Фаза 2 — Slice #2: Seed test client** `migrations/007_seed_test_tire_client.sql` — изолированный профиль + клиент (`profile_id=de8998b6-0725-46de-89e5-a89061daa2b5`, `client_id=2c89868f-e85b-44cb-825b-896c3f77c474`, `telegram_id=444444444`, phone `+79991234501`) для tire smoke / RPC / endpoint тестов. Идемпотентно (`WHERE NOT EXISTS`). Cleanup ограничен только этим client + 2099-* датами. Никогда не общий DELETE/UPDATE | Применено в demo-DB, профиль verified SELECT-ом | 
| 34 | **Фаза 2 — Slice #2: API dispatcher + components** — `api/client.ts` +3 handler'а inline (`getTireBookings` — server-resolved own по `client_id IN (SELECT id FROM clients WHERE profile_id=jwt)`; `createTireBooking` — 4-ID ownership + overlap через `find_tire_booking_overlap` RPC + server-computed `end_time = start_time + estimated_duration minutes`; `cancelTireBooking` — thin adapter, 404/409/500 mapping). ALLOWED_ACTIONS теперь **10** (7 carwash + 3 tire). `components/client/ClientTireBookingWrapper.tsx` — 4 replacement points: `getTireBookingsByDate` → `fetchOwnTireBookings` (3×), `createOnlineTireBooking` → `postTireBookingToDispatcher` (1×). `components/client/ActiveBookingCard.tsx` — tire cancel через fetch dispatcher (было anon `cancelOnlineTireBooking`). TypeScript `npx tsc --noEmit` чистый | Коммиты pending |
| 35 | **Фаза 2 — Slice #2: Tests** — `test-slice2-tire-rpcs.sh` (T1-T15, **16 PASS / 0 FAIL**): anon public RPC (T1-T4), `cancel_own_tire_booking` NOT_FOUND_OR_NOT_OWNED (T5), own cancel (T6), idempotency (T7), anon permission denied (T8), status guard (T9), UNIQUE INDEX race guard 23505 (T10), 30-day block на 3-й отмене (T11-T12), idempotent block guard (T13-T14), foreign ownership (T15). `test-slice2-tire-concurrent-cancel.sh` (8× параллельных RPC → 1 success + 7 idempotent + 0 errors + 1 cancellation row, ОТМЕНЕНО status). `test-slice2-cleanup.sh` standalone. Pre-test cleanup inline в обоих скриптах (`WHERE client_id=tire_test_client` + 2099-* dates только, никогда broad DELETE/UPDATE) | Commits pending, Vercel deploy triggered |
| 36 | **Фаза 2 — Slice #3a: Recon** — schema preflight на 5 целевых таблиц (clients / client_cars / organizations / organization_drivers / organization_cars). Применил §5.9 cross-check rule из Slice #2 retrospective. Находки: (1) `clients.phone` NOT NULL UNIQUE — никаких placeholder phone, нормализация критична; (2) `clients.profile_id` UNIQUE — admin pathway не может вставить profile_id (только `/api/link-client-profile.ts` это делает); (3) `client_cars.car_type` NOT NULL без default — обязательно в INSERT; (4) `organization_cars.car_type` HAS default 'SEDAN' — INSERT может опустить; (5) `organizations.contact_phone` UNIQUE; (6) `organization_drivers.phone` NULLABLE — для водителя без телефона. **0 GENERATED columns** во всех 5 таблицах (cf. Slice #2 bug 4). Vercel: 11 функций → 12/12 после `api/staff.ts` | recon записан |
| 37 | **Фаза 2 — Slice #3a: API dispatcher `api/staff.ts`** — 13 actions: `search-client-by-phone` (universal — clients + orgs в SearchResult-shape с type='client'/'organization', include cars per-client для UI compat, allow-list полей), `create-client/update-client/unblock-client`, `create-client-car/update-client-car`, `create-organization/update-organization`, `create-org-driver/update-org-driver/update-driver-signature`, `create-org-car/update-org-car`. Все write через `service_role` supabaseAdmin (как Slice #1 client dispatcher). Validation: normalization через `normalizePhoneNumber`, collision preflight SELECT (23505 race-window catches to 409), FK preflight SELECT (404 on missing parent), patch allow-list + require ≥1 поле для всех update actions. profile_id НЕ часть `create-client` action contract — legacy linking остаётся в `/api/link-client-profile.ts` (Phase 1.5). `api/_lib/require-staff.ts` — mirror `require-client`, verifyJwt + role check `app_role ∈ {admin, owner}` | Применено в demo-DB... нет, миграций нет (только dispatcher) |
| 38 | **Фаза 2 — Slice #3a: Tests — 19 assert() PASS / 0 FAIL на первом deploy** — `test-staff-endpoints.mjs` имеет 15 E-номеров (E0–E14), но 4 из них содержат ПОД-assert'ы — префикс `-prep` для setup без post-check или `-b` для independent property. Итого 19 `assert(...)` вызовов = 19 PASS. Точная таблица:<br>• E0 `login → JWT` (1)<br>• E1 `no token → 401` (1)<br>• E2 `client JWT → 403` (1, prep без assert)<br>• E3 `unknown action → 404` (1)<br>• **E4 cluster** (3): E4-prep seed → 200, E4 returns row, E4b fields allow-list<br>• E5 `create-client valid` (1)<br>• E6 `collision → 409` (1)<br>• E7 `foreign client_id → 404` (1)<br>• E8 `create-client-car` (1)<br>• E9 `update-client patch` (1)<br>• **E10 cluster** (2): E10-prep plant block, E10 unblock cleared<br>• **E11 cluster** (2): E11-prep create-org, E11 collision 409<br>• E12 `create-org-driver` (1)<br>• E13 `create-org-car` (1)<br>• E14 `update-driver-signature` (1). Пред-деплойный preflight 5 таблиц + §5.9 rule дали 0 bugs в первом run (cf. Slice #2 имел 4 contract-bugs на старте). cleanup через `psql` shell-out (`client_cars BEFORE clients` FK order) | Commit fc31d78, deploy |
| 39 | **Фаза 2 — Slice #3a: BookingWizard UI switch** — `components/admin/BookingWizard.tsx` 12 anon-call replacements → `dispatchStaffCall(action, body)` helper (inline POST /api/staff с JWT). Также `searchByPhone` → `dispatchStaffCall('search-client-by-phone', ...)` (SearchResult-shape сохранена для BookingWizard без frontend rewrite). `lib/api/clients.ts`, `lib/api/organizations.ts`, `lib/api/booking-cancellations.ts`, `lib/api/search.ts` НЕ редактируются — anon paths оставлены для admin компонент, не тронутых в #3a (BookingDetailModal / BookingsList / SalarySummary). TypeScript `npx tsc --noEmit` чист | Commit 4a380cf |
| 39b | **Фаза 2 — Slice #3a: universal `search-client-by-phone` discriminator** — `api/staff.ts` action `search-client-by-phone` возвращает массив `{type: 'client'|'organization', ...}` вместо двух отдельных query'ев. `type` discriminator обязателен для потребителя — он определяет:<br>• client: какие id подставлять в `client_id` (organization.id **НЕ валиден** как client_id),<br>• organization: какие id подставлять в `organization_id` (НЕ используется в client-side wizard'е напрямую — требует driver-создания flow). Contract ниже — сохранён в JSDoc на action.<br>⚠️ **SLICE #3b INVARIANT** (вытекает из этого): booking-create action принимает ТОЛЬКО id из **`type==='client'`** result-row; organization_id никогда не принимается как client_id. При попытке создать booking с organization_id в поле client_id — 400 `client_id_must_belong_to_client`. Универсальный `search-client-by-phone` сознательно проигнорировал wizard-only ui edge — wizard'у нужен список для выбора, бэк защищает idempotency | Commit c716514 |
| 40 | **Фаза 2 — Slice #3a: Vercel 12/12 ceiling** — api/*.ts теперь ровно 12 serverless files (telegram-auth, login, link-client-profile, client, create-pending-booking, check-payment-status, create-payment-sbp, update-sbp-banks, cleanup-expired-payments, reset-daily, yookassa-webhook, **staff**). **Достигнут лимит Vercel Hobby**. Будущие dispatcher actions идут в существующие dispatcher'ы (`api/client.ts`, `api/staff.ts`), новые `api/*.ts` файлы недопустимы без upgrade до Pro плана. Перед любым новым serverless slot — ручная проверка фактического счёта в build output | подтверждено в vercel ls |

---

## 5. Что в работе / что не начато

| # | Что | Статус |
|---|---|---|
| 1 | Vercel env-переменные для test Supabase | ✅ Установлены пользователем (`SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). ⚠️ **Ротация после закрытия Фазы 1** — секреты прошли через чат с агентом. `YOOKASSA_*` пока не нужны (sandbox ещё не настроен) |
| 2 | Фаза 0 (revoke column-level, TRUNCATE/REFERENCES) | Не начато |
| 3 | Фаза 1.1 — env-переменные | ✅ Готово (см. п.1) |
| 4 | Фаза 1.2 — `/api/telegram-auth.ts` | ✅ Готово, задеплоен, end-to-end проверен |
| 5 | Фаза 1.3 — `/api/login.ts` | ✅ Готово, задеплоен, end-to-end проверен (5 curl-тестов) |
| 6 | Фаза 1.4 — `lib/supabase.ts` fetch-wrapper + `setSessionToken()` + sessionStorage restore + 401-retry | ✅ Готово, задеплоен, 8/8 unit-тестов прошли, регресс-чек anon OK |
| 7 | Фаза 1.5 — DB-часть: `migrations/create_normalize_phone_function.sql` + `migrations/link_legacy_clients_1to1.sql` | ✅ Применены на test DB, отчёт `audit=0, NO_MATCH=3, AMBIGUOUS=0` |
| 8 | Фаза 1.5 — Endpoint `/api/link-client-profile.ts` (client-only, JWT-verified, smart upsert с 4 состояниями) + refactor 2 client wrappers | ✅ Готово, задеплоен, 13/13 verifyJwt unit-тестов + 9/9 endpoint curl-тестов (E1-E3, E4-E6, E7-E10, E13 + bonus notes validation) |
| 8 | Фаза 1.6a — `Login.tsx` → `/api/login` + `registerSessionExpiredHandler` + legacy localStorage миграция + `last_auth_method` server-side | ✅ Готово, задеплоен, end-to-end проверен |
| 9 | Фаза 1.6b — `lib/client-auth.ts` + `ClientBookingWrapper/ClientTireBookingWrapper/MyGarage` → `/api/telegram-auth` + server-side role-check fix (`profile.role !== 'client'`) + recovery buttons | ✅ Готово, задеплоен, end-to-end проверен |
| 10 | Фаза 1.6b мониторинг 1-2 дня в demo | ✅ Мониторинг завершён, реальный Mini App протестирован, ошибок не было |
| 11 | Фаза 1.7 — REVOKE EXECUTE на `verify_password` для anon | ✅ Готово, задеплоен, end-to-end проверен (7 curl-тестов) |
| 12 | Фаза 1.8 — `/api/upload-receipt.ts` + Storage lockdown | Не начато |
| 13 | Фаза 2 — Slice #1 (carwash client flow) | ✅ Done (commits 4fbffff, 6bdcd89, f3947d8, 4a204b4, e346ad7) |
| 14 | Фаза 2 — Slice #2 (tire client flow) | ✅ Done (5 deploys, 4 contract-bugs обнаружены тестами — детали §5.9); commits 1e4e3c7, 142c646, df6a6e2, e293c07, b681190 |
| 15 | **Фаза 2 — Slice #3a (staff client/car/org writes)** | ✅ **Done** — `api/staff.ts` (13 actions dispatcher, 12/12 Vercel Hobby = exactly at limit), `api/_lib/require-staff.ts`, **19 assert() PASS / 0 FAIL** на prod alias (`test-staff-endpoints.mjs`: 15 E-номеров, 4 из них имеют sub-assert'ы: E4-prep/E4b/E10-prep/E11-prep — см. entry 38). Universal `search-client-by-phone` возвращает `{type:'client'\|'organization'}` discriminator — см. invariant в entry 39b. `BookingWizard.tsx` switched (12 anon calls → `dispatchStaffCall`). Pre-flight §5.9 cross-check на 5 целевых таблиц выявил 0 GENERATED columns и поймал 0 багов на первом deploy (vs 4 багов в Slice #2) |
| 15b | **Фаза 2 — Slice #3b (staff booking mutations)** | ✅ **Done** — `api/staff.ts` +21 actions (11 carwash + 10 tire = 21), 2 helpers `api/_lib/{booking-services,earnings}.ts` (NOT serverless, не считается к 12/12), migrations `008_atomic_create_staff_carwash_booking_rpc.sql` (carwash atomic create), `009_drop_old_overload.sql` (hotfix), `010_atomic_staff_booking_rpcs.sql` (tire atomic create + atomic_modify_carwash/tire services — FOR UPDATE row-lock + merge+recompute inside), `010_rollback.sql`, `011_drop_old_modify_overloads.sql` (hotfix). **73 assert() PASS / 0 FAIL** на prod alias (`test-staff-booking-endpoints.mjs`: 21 sequential sections E0-E46+T1-T9 = ~54 asserts + 8 race sections R1-R8 = ~19 asserts). Race-test cluster R1-R8 подтверждает экспериментально: pg_advisory_xact_lock работает (R1 carwash + R2 tire atomic), FOR UPDATE row-lock закрывает lost-update (R3/R3b — обе parallel add-staff-services учтены), двухшаговая earnings (RPC + INSERT ledger) идемпотентна (R5/R5d/R8/R8c — ровно 1 ledger row после 3× parallel re-marks), OD#1 invariant проверен (R6b/R7b — staff cancel не пишет в booking_cancellations). Vercel: 10 deploys в Slice #3b (8 contract-bug hotfixes + 2 race-fix re-deploys). Bugs caught at runtime: ALLOWED_ACTIONS set не обновлён; .or(id.in.(${idList})) одинарные кавычки; два overloads RPC (text[]/jsonb); JSONB возвращается как raw JSON string через supabase-js (lockCarwashBooking JSON.parse); tire_bookings НЕ имеет `notes` column; tire_payment_method enum шире чем carwash; merge logic была вне RPC (R3b lost-update); text[] param не transmissible через PostgREST (jsonb нужен); p_services=JSON.stringify(...) давал string JSONB scalar вместо array; carwash add-merge нужен DISTINCT; два overloads после re-edit (migration 011 fix). Все 4 pre-Step-2 условия + race-test expectations закрыты. Vercel: 12/12 serverless function count без изменений. |
| 16 | Фаза 2 — Slice #3b (staff booking status mutations) | Не начато — отдельный recon/plan после Slice #3a (assignWorkerToBooking, updateBookingStatus, addServicesToBooking, removeServiceFromBooking, cancelBooking, markAsReady, startWork, markAsPaid, updatePaymentMethod). Использует тот же `api/staff.ts` dispatcher + новые actions |
| 16b | **Фаза 2 — Slice #3b Step 3 (UI switch на `dispatchStaffCall`)** | ✅ **Done** — `lib/api/staff-actions.ts` (NEW, 313 строк) — тонкий typed wrapper вокруг `/api/staff?action=...` со strict input/output (один wrapper на action, dispatchStaffCall унифицирует POST + error unwrap). `App.tsx` 14 callsites переключены (createBooking ×3, createTireBooking, assignWorkerToBooking, assignTireTechnicianToBooking, updatePaymentMethod ×2, updateTireBooking(payment), cancelBooking, markAsReady, startWork, markAsPaid, addServicesToBooking, removeServiceFromBooking, updateBooking(discount), updateBookingCarType, cancelTireBooking, updateTireBooking(start), markTireBookingAsReady, markTireBookingAsPaid, addTireServicesToBooking, removeTireServiceFromBooking). `BookingsList.tsx` — удалён dead import `updateBookingCarType`. `addTireWorkerEarningsForBooking` удалён из импортов App.tsx (unused). createStaffBooking + createStaffTireBooking через `stripServerDerivedBookingFields` вырезают browser-поля которые server reject'ит (price/services_with_quantities/booking_source/created_by_profile_id/status/paid_at/worker_name/worker_name_2/org_name/signature_data/completed_at/id/created_at/updated_at/end_time для tire). Server-side fixes в этом цикле: (1) `add-staff-services`/`remove-staff-services` теперь передают `p_discount: null` (вместо 0) — иначе COALESCE в RPC перезаписывал существующий booking.discount при каждой операции; (2) `update-staff-booking` теперь server-side пересчитывает price при изменении `car_type` или `discount` (использует stored services_with_quantities или fallback на lookup в services table для antifreeze detection) — восстанавливает поведение старого client-side updateBookingCarType; (3) `notes` убран из ALLOWED list `update-staff-booking` (column отсутствует в bookings, был silent DB error). Browser smoke на prod alias (curl + JWT demo_admin): carwash flow 14 steps все PASS (create→add-services price recompute 500→1300→500, assign worker→worker_name derived, start work, mark paid→payment_method change→mark ready→salary 200 RUB earning (40% of 500)→idempotent re-mark→cancel после ГОТОВО 409), tire flow 10 steps все PASS (create→add→remove→start→paid→payment→ready→idempotent→cancel 409). Final test suite на новом prod alias: **73/73 PASS / 0 FAIL** (sequential E0-E46+T1-T9 + race R1-R8). Cleanup: 0 smoke bookings, 0 smoke tires, 0 test salary_txns. Vercel: 12/12 serverless без изменений. |
| 16c | **Dispatcher response contract (для Phase 2 RLS-Category C read path)** | 📜 Документация — `api/staff.ts` actions возвращают `{status: number, body: {data?: {booking?: T, idempotent?: boolean}, error?: string, ...}}`. Флаг `idempotent: true` устанавливается когда повторный вызов идемпотентного action-а не выполнил side-effects (mark-staff-paid/mark-staff-ready/start-staff-work/update-staff-payment-method/staff-cancel-booking × tire parallels). Этот флаг НЕ является ошибкой — HTTP status остаётся 200. UI-компоненты после Phase 2 RLS-Category C смогут интерпретировать `idempotent:true` для предотвращения лишних refetch/refetch-confusion (например, повторный mark-ready после быстрого двойного клика staff). **Важно для протокола**: `idempotent: true` ≠ «ничего не делал». Например, `start-staff-work` если status уже `В РАБОТЕ` вернёт `{idempotent:true}` и current booking row — без повторной записи `work_start_time`. Тест кластер: R4 (mark-paid 4× parallel → все 200, paid_at выставлен), R5c (mark-ready 3× → все 200), R8c (tire mark-ready 3× → все 200) подтверждают что `idempotent:true` не приводит к дублированию salary_transactions. Полный список действий с idempotent-flag: см. grep `idempotent: true` в `api/staff.ts` (выставляется в: markStaffPaidAction/markStaffReadyAction/startStaffWorkAction/staffCancelBookingAction/markStaffTirePaidAction/markStaffTireReadyAction/startStaffTireWorkAction/staffCancelTireBookingAction). |
| 17 | Фаза 2 — RLS 5 категорий A-E | Не начато — ТОЛЬКО после Slice #3a+3b, иначе RLS Category C сломает admin booking create/status anon paths |
| 18 | Фаза 2.5 — REVOKE INSERT/UPDATE на `clients` | Не начато (после Slice #3b + admin staff-client-create) |
| 19 | Фаза 3 — public views для занятости слотов | Не начато |
| 20 | **Phase 2 RPC-backdoor recon (corrected)** | � Inventory — 9 RPCs с anon EXECUTE. SECURITY DEFINER (bypass RLS, critical): `add_worker_earnings` (LIVE × 2 in App.tsx handleMarkAsReady antifreeze branch — needs micro-slice), `change_password` (LIVE in ChangePasswordWizard.tsx:77 — needs micro-slice), `get_user_role` (DEAD — pure REVOKE), `handle_new_user` (DEAD on demo, **LIVE on prod** via trigger `on_auth_user_created` on `auth.users`), `search_profile_by_phone` (DEAD wrapper `getUserProfileByPhone` in expenses.ts has no callers — pure REVOKE). SECURITY INVOKER (gated by RLS): `add_tire_worker_earnings` (DEAD — pure REVOKE), `start_worker_shift`/`start_tire_worker_shift`/`start_admin_shift` (LIVE — covered by Category B enable, REVOKE part of #3d). Quick-win: 4 pure SQL REVOKEs (no Slice). Micro-slices: 1 each for `add-worker-earnings` and `change-password` dispatcher actions. Corrected order: Quick-win REVOKE → D → E → Slice #3c/A → Slice #3d/B → Slice #3e/C → clients REVOKE. **handle_new_user demo-side: REVOKE is safe (zero pg_depend refs, zero triggers on auth.users in demo). PROD-side: must NOT drop — see entry 20b for prod migration plan.** See `entry 20b` below for full plan. |
| 20a | **Phase 2 RPC-backdoor re-verification** | ✅ Verified pg_proc.prosecdef directly from catalog (not from prior memory): `add_tire_worker_earnings` = **INVOKER** (prosecdef=f). My entry 20 was correct on this. Original entry 17 mislabeled it DEFINER — corrected in entry 20. handle_new_user Auth Hooks check: (a) `information_schema.triggers WHERE event_object_schema='auth'` = 0 rows; (b) `pg_trigger WHERE tgrelid='auth.users'::regclass` = 0 rows; (c) `pg_depend WHERE refobjid=handle_new_user oid` = 0 rows; (d) `auth.config` / `auth.gotrue_settings` / `auth.instance_settings` — none exist in this DB; (e) `auth.instances.raw_base_config` is empty (no rows); (f) **production-side check** (read-only via prod URL): `pg_trigger WHERE tgrelid='auth.users'` = 1 row, `on_auth_user_created` calling `handle_new_user`. **Conclusion**: handle_new_user is **DEAD on demo** (zero pg_depend refs, zero triggers attached to auth.users), but **LIVE on production** via the auth.users INSERT trigger. Demo REVOKE is safe; prod migration must NOT drop the function — must keep as-is or migrate to Supabase Auth Hooks mechanism (Dashboard → Authentication → Hooks) as part of Phase 1.5 prod work. `add_tire_worker_earnings` confirmed INVOKER (entry 20 correct). All 8 Category E tables (`payments`, `pending_bookings`, `otp_codes`, `sms_logs`, `sms_rate_limits`, `auth_logs`, `_legacy_link_audit`, `bookings_timeline`) have **zero frontend callers** (AST-scanner audit on lib/, components/, features/, App.tsx). Zero pg_depend refs for `bookings_timeline`. `_legacy_link_audit` only has its own index dependent. Phase 2.3 is safe to apply after Phase 2.2. |
| 20b | **Phase 2.0 + 2.2 + 2.3 deployed (Вариант A)** | ✅ **Done** — 3 pure SQL REVOKE/GRANT migrations applied on demo (`danobongqzbxilyvdwig`), zero code changes, zero new dispatcher actions, Vercel deploy not needed. **(1) Migration `012_revoke_dead_backdoor_rpcs_DEMO_ONLY.sql`** — REVOKE EXECUTE FROM PUBLIC on 4 dead backdoor RPCs: `add_tire_worker_earnings`, `search_profile_by_phone`, `get_user_role`, `handle_new_user`. handle_new_user line tagged **⛔ DEMO-ONLY ⛔** with explicit comment that prod-migration must omit this line (handle_new_user is LIVE `on_auth_user_created` trigger on `auth.users` in prod — auto-creates profile on signup). Initial REVOKE attempt used `FROM anon,authenticated` — **WRONG** because pg_proc.proacl showed `{=X/postgres}` (PUBLIC), not explicit anon/authenticated grants. Fixed to `FROM PUBLIC`. After fix: anon calls → permission_denied ✓; service_role still EXEC ✓. **(2) Migration `013_category_d_public_catalogs_select_only.sql`** — REVOKE insert/update/delete/truncate/references/trigger + GRANT select on `services`, `tire_services`, `booking_settings`, `sbp_banks` to anon + authenticated. Anon SELECT works (count=28/11/4/2); anon INSERT → permission_denied ✓. **(3) Migration `014_category_e_server_only_revoke_all.sql`** — REVOKE all privileges on 8 server-only tables (`payments`, `pending_bookings`, `otp_codes`, `sms_logs`, `sms_rate_limits`, `auth_logs`, `_legacy_link_audit`, `bookings_timeline`) from anon + authenticated. Anon SELECT → permission_denied ✓; service_role SELECT works (auth_logs=180, bookings_timeline=149, payments=0). **После каждой миграции: 73/73 PASS** на полном тест-кластере (sequential E0-E46 + T1-T9 + race R1-R8). Cleanup verify: 0 test rows. RLS `public_all_access USING(true)` политики НЕ трогали — фактический gate сейчас это GRANT/REVOKE структура; RLS USING narrowing произойдёт в Phase 2.4/2.5/2.6 (Category A/B/C enable) после Slice #3c/#3d/#3e. |

---

## 5.5. Vercel ESM gotcha (важно для будущих `/api/*.ts` файлов)

Vercel serverless functions в `api/` бандлят TypeScript → JavaScript как **чистые ES-модули** (не CommonJS). Это значит:

```typescript
// ❌ НЕ РАБОТАЕТ — модуль собирается в .js, а import без расширения не разрешается
import { signJwt } from './_lib/jwt';

// ✅ РАБОТАЕТ — указываем расширение скомпилированного файла, не исходного
import { signJwt } from './_lib/jwt.js';
```

**Симптом:** `FUNCTION_INVOCATION_FAILED` (HTTP 500), в Vercel logs:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/api/_lib/jwt'
imported from /var/task/api/<your-endpoint>.js
```

**Фикс:** одна строка в каждом новом файле, который импортирует из `api/_lib/*` или любой другой relative path в `api/`. Vercel docs: "TypeScript files in the api directory are compiled to ESM JavaScript".

**Уже применено в:**
- `api/telegram-auth.ts` (commit `b3be469`)
- `api/login.ts` (commit `e7934b1`)

---

## 5.6. Supavisor timeout workaround (Phase 1.5 DB migrations)

**Проблема (зафиксирована Phase 1.5):** Supavisor connection pooler в нашей demo-среде теряет long-running `psql` сессии через свой TCP-keepalive. Любой DO block / multi-statement `psql -f` через Supavisor может оставить `idle in transaction` zombie-сессии, которые держат row-level locks. Последующие запуски блокируются на этих locks — внешне выглядит как зависание миграции.

**Workaround (применён в Phase 1.5 миграциях):**

1. **Никаких `DO $$ ... RAISE NOTICE` блоков** — были опробованы v1 и v2 миграции, обе зависали. v3 использует plain SQL statements.
2. **Insert + Update в одном atomic CTE statement** через `WITH inserted AS (INSERT ... RETURNING) UPDATE ... FROM inserted` — нет окна между INSERT и UPDATE, нет zombie.
3. **Report queries отдельными короткими `psql` вызовами** — write-side (atomic CTE) и read-side (SELECT-ы для отчёта) не должны жить в одной `psql -f` сессии, потому что длинная сессия = риск Supavisor timeout.
4. **Никаких `BEGIN; ... COMMIT;` обёрток** — DDL + DML в одной сессии = та же проблема. Каждый statement autocommit.

**Cleanup zombie-сессий** (если что-то залипло):
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = current_database()
  AND state IN ('idle in transaction', 'idle in transaction (aborted)')
  AND pid != pg_backend_pid();
```
**Не трогать** pid из `supabase_admin` (WalSender — `START_REPLICATION SLOT`, Realtime agent, pg_cron scheduler) — это replication-инфраструктура, не блокирует `UPDATE clients`.

**Если будущие миграции зависают** — сначала проверить `pg_stat_activity` на наличие zombie, потом рефакторить в plain SQL без DO block.

---

## 5.7. Test-data cleanup между сессиями (Phase 2 / Slice #1 артефакты)

**Проблема:** после Phase 2 / Slice #1 manual Mini App тестирования в demo-БД остаются test-pollution ряды:

- `client_cars` с `car_model IN ('Test Car', 'Test Slot Car', 'T7 Car')` — от моих smoke-тестов (T15, T6, T7 которые сетали множество машин). Soft-delete их (`is_active=false`) достаточно, **не удалять физически** (FK на `bookings.client_car_id`).
- `booking_cancellations` строки с `reason='client_self_cancel'` — от множественных cancel-вызовов. Пока не удалено, `cancel_own_booking` RPC продолжает считать их в 30-day rolling window и блокировать клиента при ≥3 cancel-ах.
- `clients.online_booking_blocked_until` — периодически взводится если пользователь вручную отменяет несколько броней. Снять = `UPDATE clients SET online_booking_blocked_until = NULL`.

**Mandatory cleanup на старте каждой тестовой сессии:**

```sql
-- (1) Снять блокировку с тест-клиента.
UPDATE clients SET online_booking_blocked_until = NULL
  WHERE online_booking_blocked_until IS NOT NULL;

-- (2) Soft-delete test-pollution cars (preserve real cars like Porsche Cayenne).
UPDATE client_cars SET is_active = false
  WHERE is_active = true
    AND car_model IN ('Test Car', 'Test Slot Car', 'T7 Car');

-- (3) Очистить cancellation events (ОБЯЗАТЕЛЬНО после test-runs иначе auto-block ретригерится).
--     Легитимные cancellations (admin staff отмены с reason='admin_cancel') не трогать.
DELETE FROM booking_cancellations
  WHERE reason = 'client_self_cancel';

-- (4) Удалить phantom 2099-* бронирования от T15 / T21 тестов.
DELETE FROM booking_cancellations
  WHERE booking_id IN (SELECT id FROM bookings WHERE booking_date >= '2099-01-01');
DELETE FROM bookings WHERE booking_date >= '2099-01-01';
DELETE FROM closed_boxes WHERE closed_date >= '2099-01-01';
```

**Script-утилиты для быстрой очистки:**
- `test-slice1-rpcs.sh` имеет `teardown()` с удалением 2099-* bookings (cleanup step #4).
- `test-slice1-t21-concurrent-cancel.mjs` использует admin client + удаляет тестовые ряды после run (cleanup в script).

**ОБЯЗАТЕЛЬНО запустите cleanup перед каждой новой тестовой сессией** — не разовая мера, иначе test pollution накопится и тесты начнут отказывать с блокировкой-внезапно (cancel count за 30 дней накопит ≥3) и orphan-cars в DayTimeline.

---

## 5.8. Test client fixture (Phase 2 / Slice #2 — tire client flow)

**Изолированный demo-клиент только для tire smoke / RPC / endpoint тестов. Не использовать ни в каком другом сценарии.**

| Поле | Значение | Где |
|---|---|---|
| `telegram_id` | `444444444` | `profiles.telegram_id` |
| `role` | `'client'` | `profiles.role` |
| `full_name` | `'[TEST ONLY] Tire Test Client'` | profiles + clients |
| `profile_id` | `de8998b6-0725-46de-89e5-a89061daa2b5` | `profiles.id`, `clients.profile_id` |
| `client_id` | `2c89868f-e85b-44cb-825b-896c3f77c474` | `clients.id` |
| `phone` | `'+79991234501'` | `clients.phone` |

Применяется миграцией `migrations/007_seed_test_tire_client.sql` с `INSERT ... WHERE NOT EXISTS` (идемпотентно).

**Cleanup** — ровно этот клиент + 2099-* даты. **Никогда** общий `DELETE` по всем bookings/cancellations или общий `UPDATE` всех блокировок:

```sql
DELETE FROM public.booking_cancellations
  WHERE client_id = '2c89868f-e85b-44cb-825b-896c3f77c474';
DELETE FROM public.tire_bookings
  WHERE client_id = '2c89868f-e85b-44cb-825b-896c3f77c474';
UPDATE public.clients
  SET online_booking_blocked_until = NULL
  WHERE id = '2c89868f-e85b-44cb-825b-896c3f77c474';
```

Также включено в `test-slice2-cleanup.sh` (для ручного reset между сессиями) и inline в `test-slice2-tire-rpcs.sh` и `test-slice2-tire-concurrent-cancel.sh` (pre-test reset перед каждым тестом).

---

## 5.9. Правило cross-check перед copy-paste валидаторов/insert-логики (Slice #2 retrospective)

**Проблема (зафиксирована в Slice #2):** при переиспользовании **уже написанного** car-wash кода (lib/api/, api/_lib/validation.ts, insert payloads в `api/client.ts`) для tire-flow было поймано **четыре** бага контрактных несовпадений, которые copy-paste-паттерн сам по себе не обнаруживает:

| # | Bug | Что произошло | Что должен был делать cross-check |
|---|---|---|---|
| 1 | `tire_bookings.notes` не существует | Я добавил колонку в `.select(...)` по TS-интерфейсу, не сверяясь с реальной `\d tire_bookings`. Postgres SQLSTATE 42703 | Перед каждой новой таблицей — `psql \d <table>` или `information_schema.columns`, не доверять TS-интерфейсу |
| 2 | `services[]` JSONB shape | carwash `readServicesArray()` принимал `string[]` UUID, а tire требует массив `{service_id, name, quantity, price, total}` объектов. validation error `services_item_not_uuid` | Разная форма массивов → новый validator. Schema cross-check должен показать `services JSONB` vs `services text[]` типов |
| 3 | `payment_method: 'Наличные'` vs `'Наличный'` | My E2E отправлял `'Наличные'` (по CHECK constraint), но Slice #1 API принимает только `'Наличный'`. CASCADE: 400 даже когда формально valid | CHECK constraint ≠ API-контракт enum. Перед каждым create endpoint — посмотреть Slice #1 `PAYMENT_METHODS` в `api/_lib/validation.ts`, **а не** `tire_bookings_payment_method_check` |
| 4 | `end_time` GENERATED ALWAYS AS | Я пытался вставить `end_time` через dispatcher. Postgres: "cannot insert a non-DEFAULT value into column end_time" | PostgreSQL GENERATED columns не попадают ни в `\d` defaults, ни в CHECK — нужно `attgenerated != ''` или `pg_get_expr()` |

**Правило (обязательно, применимое ко всем будущим slice'ам — staff, RLS Category C, real-time-to-view):**

1. **Перед копированием insert/validator логики из соседнего slice** — выполнить schema diff целевой таблицы vs исходной через `psql`/`pg_catalog`, не полагаясь на TS-интерфейс. Конкретные шаги:
   ```sql
   -- Всегда перед первым endpoint для новой таблицы:
   SELECT column_name, data_type, is_nullable, column_default, attgenerated
   FROM information_schema.columns
   JOIN pg_attribute ON attrelid=('public.<table>')::regclass AND attname=column_name
   WHERE table_schema='public' AND table_name='<table>'
   ORDER BY ordinal_position;
   ```
2. **Не доверять** `CHECK (column IN (...))` для API-контрактов. Это constraint, не API allow-list. Узнавать API allow-list из `api/_lib/validation.ts` (Slice #1 `PAYMENT_METHODS = ['Наличный', ...]`).
3. **GENERATED columns** помечать в плане явно. Любая колонка, помеченная GENERATED ALWAYS AS, не попадает в INSERT/UPDATE — её обрабатывает Postgres.

**Экономия:** 4 бага в Slice #2 = 4 дополнительных deploy × ~3 мин = ~12 мин. В Slice #3 (staff flow) применяется правило на старте.

---

## 5.10. Ownership invariants для staff-created bookings (Slice #3a + future #3b)

**Зафиксировано в решении пользователя 2026-08-26 при recon Slice #3a.** Применяется в #3a (только read/contract) и в #3b (booking create + status mutations).

### Четыре invariants:

1. **`created_by_profile_id` = audit — кто физически создал запись.**
   - Staff (CRM): `claims.profile_id` из JWT (выдан через `/api/login` admin/owner).
   - Online (Mini App Slice #1+2): client JWT `profile_id` (выдан через `/api/telegram-auth`).
   - Не используется для ownership-check (для этого — цепочка client_id → clients.profile_id).

2. **`client_id` = business owner — чья запись.**
   - `bookings.client_id → clients.id → clients.profile_id`. Только эта цепочка:
     - показывает клиенту его записи (Slice #1/2 own-only RPCs);
     - входит в client cancel path;
     - считается в `getClientCancellationCount` для 30-day block;
     - `online_booking_blocked_until` и его reset (`unblockClientForOnlineBooking`);
     - будущая RLS Category C policy.
   - Для org-driver без связанной `clients` row: `client_id = NULL`.

3. **`booking_source` = channel — канал оформления.**
   - `'admin'` для записей из CRM (BookingWizard / BookingDetailModal / etc).
   - `'online'` для Mini App Slice #1/2.
   - **Не заменяет audit actor**, только источник. CHECK constraint в `bookings` и `tire_bookings` уже enforces.

4. **Не создаём второй `booking_owner_profile_id`** — он дублирует цепочку #2 и создаёт лишнюю миграцию + риск рассинхронизации.

### Где это применяется

| Slice | Применение |
|---|---|
| #3a | Создаёт `api/staff.ts` dispatcher для **client/сar/org management** writes. **Booking creation не входит.** В Slice #3a эти правила имеют референсный характер, не код. |
| #3b (отдельный recon/plan/ОК) | Endpoint staff-create-booking: создаёт bookings с этими 4 инвариантами. |
| Фаза 2.RLS Category C | RLS policies используют цепочку `bookings.client_id → clients.profile_id` (не `created_by_profile_id`). Это даёт правильную ownership семантику для client-only data. |

---

## 6. Правила безопасности (ОБЯЗАТЕЛЬНО соблюдать)

### 6.1. Никогда не трогать прод

```bash
# ❌ НЕ ДЕЛАТЬ НИКОГДА:
cd /Users/dmitriy/Downloads/carwash-admin-pro
git add .         # или commit/push в прод-репо
vim любой_файл.ts  # любое редактирование в проде
psql ...avajtwihzjfpytimfbaw  # прямое подключение к прод-БД

cd /Users/dmitriy/Downloads/bot-dovatora-crm-online
# ❌ НЕ трогать прод-бот
```

### 6.2. Перед любой командой — `pwd`

Перед каждым `git`/`npm`/`psql`/`curl`/`vercel`:
```bash
pwd  # должно быть /Users/dmitriy/Downloads/demo-car-wash
```

### 6.3. ENV-переменные — только через Vercel Dashboard руками

Никогда не пиши secrets в код. Не добавляй `VITE_*` префикс к sensitive переменным. Используй `process.env.X` в serverless-функциях (`/api/*.ts`), `import.meta.env.VITE_*` — только для публичных.

### 6.4. БД-запросы — только test DB

`postgresql://postgres.danobongqzbxilyvdwig:...` — ОК.

`postgresql://postgres.avajtwihzjfpytimfbaw:...` — **ТОЛЬКО для read-only справки** через `pg_get_functiondef`, `pg_policies`, `information_schema`. Никогда INSERT/UPDATE/DELETE на прод-БД.

### 6.5. Demo-бот

Только `/Users/dmitriy/Downloads/Demo-car-wash-bot-tg-online/telegram-bot/`. Прод-бот на сервере клиента — не трогать (там прод-токен и прод-БД).

---

## 7. Как начать работу (next session checklist)

### Если ты — новый агент в новой сессии:

1. Прочитай этот файл целиком (ты это делаешь сейчас ✅)
2. Прочитай план: `cat /Users/dmitriy/Downloads/carwash-admin-pro/carwash-full-security-lockdown-plan.md | less`
3. Проверь состояние: `pwd`, `cd /Users/dmitriy/Downloads/demo-car-wash && git status`
4. Проверь что бот запущен: `ps aux | grep "bot.py"`
5. Проверь что Vercel деплой жив: `curl -I https://demo-car-wash.vercel.app`
6. Проверь БД: `PGPASSWORD="YVJlmcibmLQYBtRM" psql "postgresql://postgres.danobongqzbxilyvdwig:..." -c "SELECT count(*) FROM public.bookings;"`
7. **Спроси пользователя**: «Что делаем дальше?» — пользователь выбирает фазу/задачу

### Если продолжаешь Фазу 1:

Жди от пользователя:
- `SUPABASE_JWT_SECRET` test-проекта (из Supabase Dashboard → Settings → API → JWT Secret)
- `YOOKASSA_SHOP_ID` (sandbox) + `YOOKASSA_SECRET_KEY` (sandbox)

Когда пользователь даст — добавляет в Vercel env, потом реализуем:

| Файл | Что |
|---|---|
| `api/telegram-auth.ts` (NEW) | HMAC-SHA256 проверка `initData`, JWT HS256 с `app_role`, INSERT в `auth_logs`, silent auto-create profile+client с `role='client'` хардкод |
| `api/login.ts` (NEW) | `verify_password` через service_role, JWT с `app_role`, INSERT в `auth_logs` |
| `lib/supabase.ts` (MODIFY) | `let currentToken: string \| null = null`, `setSessionToken()`, custom `global.fetch` с `injectAuth`, sessionStorage restore, 401 retry |
| `components/auth/Login.tsx` (MODIFY) | Заменить `supabase.rpc('verify_password')` на `fetch('/api/login')` |
| `components/client/ClientBookingWrapper.tsx`, `ClientTireBookingWrapper.tsx`, `MyGarage.tsx` (MODIFY) | silent `/api/telegram-auth` на mount, заменить прямой `supabase.from('profiles').eq('telegram_id')` |
| `App.tsx` (MODIFY) | `authState` lifecycle, localStorage cleanup на старте, useEffect'ы для staff-данных зависят от `authState.status === 'authenticated'` |

После реализации: `git add -A && git commit -m "..." && git push origin main` → Vercel auto-deploy через ~30 сек → тест.

---

## 8. Open issues / decisions pending

| Тема | Вопрос | | Решение |
|---|---|---|---|
| Телефон legacy-клиентов | Разный формат в `clients` vs `profiles` (`+7...` vs `8...`) — миграция Фазы 1.5.1 не сматчит | | Принято (b) — ручная привязка через кнопку в админке |
| Публичность фото инвентаря | После Фазы 1.8 bucket `inventory-photos` закрыт для anon SELECT | | По умолчанию закрыто, потом решим |
| Realtime на view | Supabase Realtime не подписывается на view | | По умолчанию — polling для клиента |
| Self-service смена пароля | Нет UI | | Отдельная задача |
| Кнопка «привязать Telegram» в админке | Для не-сматчившихся legacy | | Отдельная задача |

---

## 9. Полезные команды (cheat sheet)

```bash
# === Где я? ===
pwd

# === Перейти в demo (ОБЯЗАТЕЛЬНО перед любой работой) ===
cd /Users/dmitriy/Downloads/demo-car-wash

# === Git status ===
git status
git log --oneline -5

# === Тест-БД: count records ===
PGPASSWORD="YVJlmcibmLQYBtRM" psql "postgresql://postgres.danobongqzbxilyvdwig:YVJlmcibmLQYBtRM@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" -c "
SELECT 'bookings' AS tbl, count(*) FROM public.bookings
UNION ALL SELECT 'clients', count(*) FROM public.clients
UNION ALL SELECT 'services', count(*) FROM public.services;"

# === Бот: проверить что запущен ===
ps aux | grep "Demo-car-wash-bot-tg-online.*bot.py"

# === Vercel: проверить деплой ===
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://demo-car-wash.vercel.app

# === Services: все service_id ===
PGPASSWORD="YVJlmcibmLQYBtRM" psql "postgresql://postgres.danobongqzbxilyvdwig:..." -c "SELECT service_id, name FROM public.services ORDER BY service_id;"

# === Auth logs: пусто (после Фазы1 должны заполыться) ===
PGPASSWORD="YVJlmcibmLQYBtRM" psql "postgresql://postgres.danobongqzbxilyvdwig:..." -c "SELECT count(*) FROM public.auth_logs;"
```

---

## 10. Ссылка на основной план

📄 **`/Users/dmitriy/Downloads/carwash-admin-pro/carwash-full-security-lockdown-plan.md`** — 849 строк, 8 фаз. Файл был создан агентом в этой сессии, теперь обновлён и согласован с пользователем. **Не редактируй без явного запроса** — это мастер-план всей работы.

---

## TL;DR для ленивого агента

> Тестовая среда для security-плана. Всё в `/Users/dmitriy/Downloads/demo-car-wash/`. Ничего в проде. Test DB = `danobongqzbxilyvdwig`. Бот = PID 8740. План в плане. Креды ЮKassa жду. JWT secret жду. Погнали в Фазу1.