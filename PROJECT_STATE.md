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
| 17 | **Verified:** 8/8 unit-тестов на wrapper через `node --experimental-strip-types --test` (T3 = Authorization header инжектится, T6 = 1 retry с новым токеном, T7 = 3 параллельных 401 каждый получает свой retry). Real REST: anon apikey + JWT из `/api/login` = 200 (это то что wrapper шлёт). Anon без токена = 200 (regression OK, 17 файлов не задеты). Vite build без TS-ошибок | Подтверждено node:test + curl |

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
| 7 | Фаза 1.5 — `/api/link-client-profile.ts` + миграция legacy-клиентов по phone | Не начато (после Фазы 1.6) |
| 8 | Фаза 1.6 — переключение `Login.tsx` и `ClientBookingWrapper.tsx` на новые эндпоинты | ⏭ Следующий шаг |
| 9 | Фаза 1.7 — REVOKE EXECUTE на `verify_password` для anon | Не начато (в тот же день что 1.6 для Login) |
| 10 | Фаза 1.8 — `/api/upload-receipt.ts` + Storage lockdown | Не начато |
| 11 | Фаза 2 — RLS 5 категорий A-E | Не начато |
| 12 | Фаза 2.5 — REVOKE INSERT/UPDATE на `clients` | Не начато (после 1.5) |
| 13 | Фаза 3 — public views для занятости слотов | Не начато |

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