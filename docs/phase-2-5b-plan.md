# Phase 2.5b — план фикса anon WS access к PII таблицам

> **Read-only план-документ.** Никаких SQL-изменений и деплоев в рамках этого документа. Цель — согласовать с владельцем механизм, scope, миграции и порядок выполнения.
>
> Создан: 2026-08-31 после Phase E (a) P0+P1 deploy (commit `a1989a5`). Связь с entry 22e в `PROJECT_STATE.md`.

---

## 0. Контекст и приоритет

Phase E (a) (commit `a1989a5`) закрыл **client-to-client data-leak через Realtime** для authenticated клиента. Но параллельно выяснилось, что **anon-подписчик** через Realtime получает **полный payload с PII** на 4 из 5 целевых таблиц. UI анона это не показывает (Mini App dispatcher фильтрует), но через DevTools или прямой WS subscribe любой анонимный пользователь читает все данные клиентов и бронирований в realtime без какой-либо авторизации.

Это серьёзнее чем Phase E (a) косметика, потому что:
- Не нужен ни JWT, ни Telegram ID, ни вообще какая-то аутентификация.
- Данные полные: `client_name`, `phone`, `car_model`, `plate_number`, `services`, `payment_method`, `signature_data`, `created_by_profile_id`.
- Через DevTools доступно любому человеку, открывшему `https://demo-car-wash.vercel.app` в браузере.

---

## 1. Подтверждённый scope (live recon `realtime-25b-5tables-smoke.mjs`)

Anon-subscribe на каждую из 5 целевых таблиц, UPDATE через service-role, проверка payload:

| Таблица | Anon получает event? | `new` keys count | `errors` | Verdict |
|---|---|---|---|---|
| `bookings` | **NO** | — | — | ✅ УЖЕ ЗАЩИЩЕНА — отдельный фикс не нужен |
| `tire_bookings` | **YES** | 31 | `[]` | 🔴 FULL DATA LEAK |
| `client_cars` | **YES** | 7 | `[]` | 🔴 FULL DATA LEAK |
| `clients` | **YES** | 10 | `[]` | 🔴 FULL DATA LEAK |
| `loyalty_carwash_progress` | **YES** | 8 | `[]` | 🔴 FULL DATA LEAK |

**Итог**: реальный scope фикса — **4 таблицы**, не 5. `bookings` уже защищена (предположительно одной из Slice #3d-#3e миграций — нужно проверить какой именно, см. open question в §7).

---

## 2. Три механизма фикса — анализ

### Механизм (a): REVOKE anon SELECT GRANT

```sql
REVOKE SELECT ON public.tire_bookings FROM anon;
REVOKE SELECT ON public.client_cars FROM anon;
REVOKE SELECT ON public.clients FROM anon;
REVOKE SELECT ON public.loyalty_carwash_progress FROM anon;
```

**Влияние на REST**: anon больше не может делать `SELECT * FROM tire_bookings` через PostgREST → HTTP 403.
**Влияние на Realtime**: через `apply_rls(wal jsonb)` anon подписка получает `permission denied` (или `errors=['401']` если Supabase маппит).
**Влияние на dispatcher**: dispatcher использует `service_role` ключ → grants на anon не влияют.
**Влияние на legit anon paths**: см. §3.

### Механизм (b): убрать таблицы из `supabase_realtime` publication

```sql
ALTER PUBLICATION supabase_realtime DROP TABLE public.tire_bookings;
-- ...etc
```

**Влияние на Realtime**: события перестают публиковаться в WAL-slot вообще. Никто (anon, authenticated, admin, owner) больше не получает их через Realtime.

**Проблема**: это сломает admin/owner dashboard. Они сейчас подписаны на эти таблицы через `App.tsx` Realtime subscriptions (line 700 — bookings, line 754 — tire_bookings, line 867 — clients, line 902 — client_cars). Без publication admin/owner теряют live-обновления.

**Решение-обход**: создать split-publication `supabase_realtime_staff` с теми же таблицами, переключить admin/owner subscriptions на новую publication через `client.channel().subscribe({publication: 'supabase_realtime_staff'})`. **Но**: supabase-js Realtime client не поддерживает per-channel publication routing — это feature-level ограничение. **Механизм (b) практически нереализуем без миграции каждого вызова `.channel()` в App.tsx**, что выходит за рамки «read-only plan».

**Verdict**: не подходит в текущей архитектуре. Отклонён.

### Механизм (c): composite RLS policy

```sql
-- For each of 4 tables:
DROP POLICY "public_all_access" ON public.<table>;
CREATE POLICY "authenticated_only" ON public.<table>
  FOR ALL TO authenticated, service_role
  USING (auth.jwt() IS NOT NULL)
  WITH CHECK (auth.jwt() IS NOT NULL);
```

**Влияние на REST**: anon делает SELECT → RLS USING возвращает false (auth.jwt() IS NULL) → 0 rows. Для write: WITH CHECK тоже false → 0 rows affected.
**Влияние на Realtime**: `apply_rls` устанавливает `claims_role = 'anon'`, `auth.jwt()` будет NULL в этом контексте → USING false → пустой `new`/`old` + `errors=['Error 401: Unauthorized']` (как Phase D Test 2 на `organization_drivers`).
**Влияние на authenticated**: `auth.jwt() IS NOT NULL` → true → все rows. ✓
**Влияние на admin/owner**: их JWT `role=authenticated`, `app_role=admin`/`owner` — `auth.jwt() IS NOT NULL` → true → все rows. ✓
**Влияние на service_role** (dispatcher): service_role имеет `auth.jwt()` = NULL (service_role JWT нестандартный), но в RLS evaluator проверка `TO service_role` явно означает что service_role выполняется как **superuser-like** в контексте RLS, или просто policy применяется к нему. **Нужно проверить экспериментально** (см. open question §7).

**Симметрия со Slice #3d**: Phase 2 / Slice #3d (entry 23, migration `020_category_b_path_b_rls.sql`) применяет аналогичный паттерн на 15 Category B таблицах. `organization_drivers`, `organization_cars` после Slice #3d показали в Phase D Test 2 (control C2) `errors=['401']` для anon — что и требуется от Phase 2.5b.

**Verdict**: **рекомендуемый механизм**. Симметрично уже отлаженному Slice #3d.

---

## 3. Legit anon read paths — что может сломаться

Из recon `migrations/*.sql` (grep по `FROM public.<table>`):

### `tire_bookings` — anon-readable callers
| Caller | Type | Grants needed on table |
|---|---|---|
| `get_public_tire_booking_slots(date)` (migration 004) | **SECURITY DEFINER** (postgres user) | нет (bypass RLS) |
| `find_tire_booking_overlap(date, int, int)` (migration 004) | service_role only | anon EXECUTE already REVOKEd |
| `cancel_own_tire_booking` (migration 005) | service_role only | anon EXECUTE already REVOKEd |
| `cancel_own_booking` (migration 002) | service_role only | — |
| `atomic_staff_booking_rpcs` (migration 010) | service_role only | — |

**Verdict**: после фикса ни один anon path не сломается. Все публичные RPC — SECURITY DEFINER, читают `tire_bookings` с правами `postgres` (bypass RLS).

### `client_cars` — anon-readable callers
| Caller | Type |
|---|---|
| `get_client_combined_cars` (lib/api/combined-cars.ts) | anon direct SELECT (legacy path) |

**Verdict**: ⚠️ **`get_client_combined_cars` использует anon-direct SELECT** через `lib/api/combined-cars.ts:37` (per PROJECT_STATE.md entry 22a). Если применяем механизм (c) — этот SELECT вернёт 0 rows. **Нужно либо портировать на dispatcher, либо проверить что этот путь уже мёртвый** (per recon 22a — это legacy path, может быть не используется в активных UI).

### `clients` — anon-readable callers
| Caller | Type |
|---|---|
| `cancel_own_booking` (migration 002, 003) | service_role only |
| `link_legacy_clients_1to1.sql` | admin maintenance SQL, not runtime |
| `get_client_combined_cars` (lib/api/combined-cars.ts) | anon direct SELECT |
| `getMyClientAction` (api/client.ts dispatcher) | service_role only |

**Verdict**: ⚠️ `get_client_combined_cars` — тот же legacy concern что для `client_cars`. dispatcher path уже есть.

### `loyalty_carwash_progress` — anon-readable callers
| Caller | Type |
|---|---|
| (нет anon-direct SELECT в grep) | — |

**Verdict**: ✅ после фикса ничего не сломается. Все reads — через dispatcher `getMyLoyaltyProgressAction`.

### Общий вердикт

- ✅ `tire_bookings` — фикс безопасен, всё через SECURITY DEFINER RPC.
- ⚠️ `client_cars` — legacy `get_client_combined_cars` path может сломаться. **Recon перед фиксом**: проверить callers в `components/`, если нет — безопасно фиксить.
- ⚠️ `clients` — аналогично, тот же legacy concern.
- ✅ `loyalty_carwash_progress` — фикс безопасен.

**Перед фиксом**: recon callers `get_client_combined_cars` (если нет активных UI callsites — legacy, безопасно; если есть — порт на dispatcher перед Phase 2.5b).

---

## 4. Ожидаемый smoke после фикса (по аналогии с Phase D Test 2)

```bash
node realtime-25b-5tables-smoke.mjs
```

Ожидаемый результат для каждой из 4 таблиц:

```
[2.5b-RECON] tire_bookings                ⚠️  METADATA-ONLY  (new/old пустые, errors=['Error 401: Unauthorized'])
[2.5b-RECON] client_cars                  ⚠️  METADATA-ONLY
[2.5b-RECON] clients                      ⚠️  METADATA-ONLY
[2.5b-RECON] loyalty_carwash_progress     ⚠️  METADATA-ONLY
TOTAL: 0/4 tables leak full data
```

Контроль:
- `admin JWT` через `app_role=admin` — все 4 таблицы продолжают доставлять полный payload (regression check).
- `client JWT` через `app_role=client` с filter `client_id=eq.${ownClientId}` (Phase E fix из commit `a1989a5`) — только свои events.

---

## 5. Предлагаемые migration statements (для review)

**Предлагается один файл** `migrations/024_realtime_anon_pii_block.sql`:

```sql
-- Migration 024: REVOKE anon Realtime payload on 4 PII tables.
-- Phase 2.5b fix — defense against anon WS subscribers reading full
-- row payloads via public_all_access USING(true) + supabase_realtime
-- publication. After fix: anon receives only signal metadata with
-- errors=['Error 401: Unauthorized'], as Phase D Test 2 confirmed for
-- organization_drivers post Slice #3d.
--
-- Scope confirmed by realtime-25b-5tables-smoke.mjs:
--   bookings                  — already blocked (not in scope)
--   tire_bookings             — leaks full data, scope in
--   client_cars               — leaks full data, scope in
--   clients                   — leaks full data, scope in
--   loyalty_carwash_progress  — leaks full data, scope in
--
-- Legit anon read paths verified safe:
--   get_public_tire_booking_slots — SECURITY DEFINER (postgres), bypasses RLS
--   All other reads — dispatcher (service_role) or RPC (SECURITY DEFINER)
--   Recon TODO before apply: confirm get_client_combined_cars has no
--   active UI callers (lib/api/combined-cars.ts:37 — anon direct SELECT)
--
-- Mechanism: composite RLS USING(auth.jwt() IS NOT NULL), mirroring
-- Slice #3d migration 020 pattern for Category B tables.

BEGIN;  -- review note: Supavisor timeout workaround §5.6 prefers autocommit; can be split if needed

-- ───── tire_bookings ─────
DROP POLICY IF EXISTS "public_all_access" ON public.tire_bookings;
CREATE POLICY "authenticated_only" ON public.tire_bookings
  FOR ALL TO authenticated, service_role
  USING (auth.jwt() IS NOT NULL)
  WITH CHECK (auth.jwt() IS NOT NULL);

-- ───── client_cars ─────
DROP POLICY IF EXISTS "public_all_access" ON public.client_cars;
CREATE POLICY "authenticated_only" ON public.client_cars
  FOR ALL TO authenticated, service_role
  USING (auth.jwt() IS NOT NULL)
  WITH CHECK (auth.jwt() IS NOT NULL);

-- ───── clients ─────
DROP POLICY IF EXISTS "public_all_access" ON public.clients;
CREATE POLICY "authenticated_only" ON public.clients
  FOR ALL TO authenticated, service_role
  USING (auth.jwt() IS NOT NULL)
  WITH CHECK (auth.jwt() IS NOT NULL);

-- ───── loyalty_carwash_progress ─────
DROP POLICY IF EXISTS "public_all_access" ON public.loyalty_carwash_progress;
CREATE POLICY "authenticated_only" ON public.loyalty_carwash_progress
  FOR ALL TO authenticated, service_role
  USING (auth.jwt() IS NOT NULL)
  WITH CHECK (auth.jwt() IS NOT NULL);

COMMIT;

-- Post-deploy verification:
-- 1. node realtime-25b-5tables-smoke.mjs — expect 0/4 leaks
-- 2. node browser-smoke-checklist.mjs — expect 16/16 PASS
-- 3. node test-slice1-rpcs.sh — expect T1-T21 PASS (anon public RPCs unaffected)
-- 4. node test-slice2-tire-rpcs.sh — expect T1-T15 PASS (anon tire RPCs unaffected)
-- 5. Manual: open Mini App under test client, verify own bookings + loyalty still update in real-time
```

**Альтернативный механизм (a) — REVOKE GRANT variant** (если RLS path вызовет проблемы с service_role dispatcher):

```sql
-- Migration 024 variant: GRANT-based defense.
-- Doesn't touch RLS, only revokes anon SELECT privilege.
-- Realtime apply_rls returns permission denied → errors=['401'].

REVOKE SELECT ON public.tire_bookings FROM anon;
REVOKE SELECT ON public.client_cars FROM anon;
REVOKE SELECT ON public.clients FROM anon;
REVOKE SELECT ON public.loyalty_carwash_progress FROM anon;
```

**Trade-off**:
- Механизм (c, RLS): более глубокий defense-in-depth (закрывает и будущие write-через-anon попытки), симметричен со Slice #3d. Требует проверки service_role RLS-обхода.
- Механизм (a, GRANT): минимальный, безопасный rollback. Не блокирует anon-write (но Phase 2.5 это покрывает отдельно).

**Рекомендация**: начать с механизма (a) как primary, потому что:
- Проще для review
- Безопаснее для rollback (одна команда `GRANT SELECT ... TO anon`)
- Точно не сломает dispatcher (anon grants на service_role не влияют)
- Покрывает только read (то что нужно)

После успешного Phase 2.5b (механизм a) — добавить Phase 2.5 (механизм c) для `clients` write-revoke как **отдельную миграцию 025**.

---

## 6. Порядок относительно Phase 2.5 (REST write-side)

**Phase 2.5** (PROJECT_STATE.md entry 18): «REVOKE INSERT/UPDATE на `clients` для anon/authenticated». Это **write-side** REVOKE на одной таблице `clients`.

**Phase 2.5b** (этот план): **read-side** REVOKE на 4 таблицах через Realtime.

**Связь**: Phase 2.5 фиксит только `clients` и только write-операции. Phase 2.5b фиксит 4 таблицы на read через WS. Пересечение — таблица `clients` (одна из 4 в Phase 2.5b).

**Рекомендация — две отдельные миграции**:

1. **`024_realtime_anon_pii_block.sql`** (Phase 2.5b) — REVOKE anon SELECT на 4 таблицах. Сначала это, потому что read-leak более критичен.
2. **`025_clients_write_revoke.sql`** (Phase 2.5 proper) — REVOKE anon/authenticated INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER на `clients`. После 024, потому что зависит от уже суженной RLS (механизм c) или идёт независимо (механизм a + manual write-revoke).

**Объединение в одну миграцию не рекомендую**: разные уровни (WS read vs REST write), разные механизмы фикса, разные rollback-ситуации. Раздельные миграции позволяют:
- Phase 2.5b → если что-то сломалось, откатить только 024 без потери уже применённого Phase 2.5.
- Phase 2.5 → после применения можно отдельно проверить что client-registration flow (`/api/telegram-auth`) не зависит от anon INSERT в `clients`.

**Post-deploy sequence** (после review):
1. Apply migration 024 → run `realtime-25b-5tables-smoke.mjs` → expect 0/4 leaks
2. Run regression: `browser-smoke-checklist.mjs` 16/16 + `test-slice1-rpcs.sh` 21/21 + `test-slice2-tire-rpcs.sh` 15/15
3. Manual Mini App check (как Phase E a)
4. Apply migration 025 → run full regression ещё раз
5. Manual: client registration + Mini App create-booking flow

---

## 7. Open questions (перед apply)

1. **`bookings` уже не leak — почему?** Recon: нужно понять какой именно migration сделал anon-read-blocked для bookings. Предположительно одна из Slice #3d-#3e (`017_category_a_rls_split_owner_all_admin_select.sql`, `020_category_b_path_b_rls.sql`). Если так — аналогичный паттерн уже отлажен для bookings и должен сработать для 4 других таблиц.

2. **`get_client_combined_cars` (lib/api/combined-cars.ts:37)** — anon direct SELECT на `client_cars`. Recon: grep callers в `components/`, если нет активных UI — legacy, безопасно отключить. Если есть — порт на dispatcher перед Phase 2.5b.

3. **`service_role` и новая policy `USING(auth.jwt() IS NOT NULL)`** — service_role JWT не содержит `auth.jwt()` claims. Нужно проверить экспериментально (test SET ROLE service_role + SELECT) что dispatcher path не сломается. Если сломается — добавить отдельную policy `FOR ALL TO service_role USING (true) WITH CHECK (true)`.

4. **Public RPCs (`get_public_*_slots`)** — они SECURITY DEFINER, выполняются с правами `postgres`. Postgres superuser bypass RLS. Но если Supabase managed-инфра ограничивает это, нужно проверить. Подтверждение: Phase D Test 2 на `organization_drivers` (anon через WS получил только metadata) не сломал существующие public RPCs → значит SECURITY DEFINER bypass работает.

---

## 8. Что НЕ покрыто этим планом

- **P3 tech-debt** (`getBookingsByDate`/etc. role guards) — entry 22d, отдельная задача.
- **Phase 2.5 proper** (write-side REVOKE для anon/authenticated на `clients`) — entry 18, миграция 025 (после 024).
- **P2 useActiveBookings/useBookingHistory `created_by_profile_id` → `client_id` filter improvement** — entry 22b замечание, не security-fix, отдельная задача.
- **Phase 2/3+ полная RLS-стратификация** (Category A/B/C composite) — entry 17, основной security-план, после Slice #3e.

---

## 9. TL;DR для ленивого агента

```
SCOPE:  4 tables (tire_bookings, client_cars, clients, loyalty_carwash_progress)
        bookings уже защищена, не трогаем
MECH:   REVOKE SELECT FROM anon (механизм a)
        или RLS USING(auth.jwt() IS NOT NULL) (механизм c, симметрия Slice #3d)
FILE:   migrations/024_realtime_anon_pii_block.sql
REGR:   smoke 0/4 leaks + browser 16/16 + slice1 21/21 + slice2 15/15 + Mini App manual
ORDER:  024 (WS read REVOKE) → 025 (REST write REVOKE для clients) — РАЗДЕЛЬНО
OPEN:   §7 — 3 вопроса перед apply
```

---

**Status**: ready for владелец review. После ОК — apply migration 024 + regression suite + manual Mini App verify.
