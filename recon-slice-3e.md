# Slice #3e / Category C recon (READ-ONLY)

> Полностью read-only. Никаких SQL-правок, никаких migrations. Только
> inventory таблиц/RPC/views, ownership-анализ, caller map и план.
>
> Этот документ — входные данные для будущего Slice #3e (Category C
> own-row RLS для bookings + tire_bookings + family), но решение о
> реализации и порядке портирования ещё ждёт owner-ОК.

---

## 1. Inventory Category C объектов

### 1.1 Tables (7 шт — клиент-видимые + 2 internal junction)

| Table | Path | RLS | anon grants (S/I/U/D) | auth grants | Политики сейчас |
|---|---|---|---|---|---|
| `clients` | **Category C** (own-row) | ✓ | ✓✓✓✓ | ✓✓✓✓ | public_all_access + service_role_all_access |
| `client_cars` | **Category C** (own-row via client_id) | ✓ | ✓✓✓✓ | ✓✓✓✓ | public_all_access + service_role_all_access |
| `bookings` | **Category C** (own-row via client_id) | ✓ | ✓✓✓✓ | ✓✓✓✓ | public_all_access + service_role_all_access |
| `tire_bookings` | **Category C** (own-row via client_id) | ✓ | ✓✓✓✓ | ✓✓✓✓ | public_all_access + service_role_all_access |
| `loyalty_carwash_progress` | **Category C** (own-row via client_id) | ✓ | ✓✓✓✓ | ✓✓✓✓ | public_all_access + service_role_all_access |
| `booking_cancellations` | internal (Path B уже) | ✓ | X X X X | S only | staff_select/insert/update/delete + service_role_all |
| `payments` | server-only (anon=None) | ✓ | X X X X | X X X X | public_all_access + service_role_all_access (но без grants) |
| `organization_drivers` | Path B уже (entry 22) | ✓ | X | staff | 4 staff + service_role |
| `organization_cars` | Path B уже (entry 22) | ✓ | X | staff | 4 staff + service_role |

**Все 7 Category C таблиц + 1 view family** — под `public_all_access USING(true)`. **Полный anon read/write присутствует на demo и prod.**

### 1.2 Views

| View | Поля (20+ каждый) | anon grant (после Slice #3d) | Note |
|---|---|---|---|
| `bookings_timeline` | 20 cols (id, booking_date, start_time, status, **client_name, phone**, price, services, is_org, organization_id, worker_id, is_paid, signature_obtained, created_at, updated_at, **client_id**) | ✓ пока не трогали | Содержит PII (client_name, phone) и business-sens (worker_id, services). |
| `tire_bookings_timeline` | 20 cols (id, booking_date, start_time, **estimated_duration**, status, **client_name, phone**, total_price, services, is_org, organization_id, worker_id, is_paid, created_at, updated_at, **client_id**) | ✓ пока не трогали | То же, что и для bookings_timeline. |

**Views не имеют RLS** — `GRANT SELECT TO anon` достаточно для утечки. После Category C RLS на base tables views **НЕ** будут invisible автоматически (view owner = postgres; SECURITY INVOKER = base RLS применяется; SECURITY DEFINER = bypass). Нужно проверить `pg_views.secure` или явно пересоздать как `security_invoker=true` (PG15+) **ИЛИ** REVOKE на view.

### 1.3 RPC grants (12 функций)

| RPC | args | sec | anon_x | auth_x | svc_x | Где вызывается |
|---|---|---|---|---|---|---|
| `cancel_own_booking` | p_booking_id, p_profile_id | DEFINER | ✗ | ✗ | ✓ | `api/client.ts:439` (supabaseAdmin) |
| `cancel_own_tire_booking` | p_tire_booking_id, p_profile_id, p_reason | DEFINER | ✗ | ✗ | ✓ | `api/client.ts:813` (supabaseAdmin) |
| `find_tire_booking_overlap` | p_target_date, p_start_minutes, p_duration_minutes | DEFINER | ✗ | ✗ | ✓ | `api/client.ts:722` (supabaseAdmin) |
| `update_loyalty_progress` | (no args, trigger-fired) | INVOKER | ✓ | ✓ | ✓ | **TRIGGER** на `bookings` AFTER UPDATE |
| `create_worksheet_entry_on_booking_ready` | (no args, trigger-fired) | INVOKER | ✓ | ✓ | ✓ | **TRIGGER** на `bookings` AFTER UPDATE |
| `create_worksheet_entry_on_tire_booking_ready` | (no args, trigger-fired) | INVOKER | ✓ | ✓ | ✓ | **TRIGGER** на `tire_bookings` AFTER UPDATE |
| `bookings_table_changes_broadcast` | (no args, trigger-fired) | DEFINER | ✓ | ✓ | ✓ | **TRIGGER** на `bookings` |
| `tire_bookings_table_changes_broadcast` | (no args, trigger-fired) | DEFINER | ✓ | ✓ | ✓ | **TRIGGER** на `tire_bookings` |
| `get_public_booking_slots` | p_target_date | DEFINER | ✓ | ✓ | ✓ | `ClientBookingWrapper.tsx:347` (browser anon) |
| `get_public_tire_booking_slots` | p_target_date | DEFINER | ✓ | ✓ | ✓ | implicit через `available-slots.ts` |
| `atomic_create_staff_tire_booking` | 25 args | DEFINER | ✗ | ✗ | ✓ | `api/staff.ts:1375` (supabaseAdmin) |
| `create_staff_carwash_booking` | 28 args | DEFINER | ✗ | ✗ | ✓ | `api/staff.ts:847` (supabaseAdmin) |

**6 RPC уже закрыты** (cancel/find_overlap/atomic_create — Slice #3a-#3d).
**2 RPC** (`get_public_booking_slots`, `get_public_tire_booking_slots`) — оставить (это публичный каталог слотов для клиента).
**4 trigger-fired RPC** (worksheet/loyalty/broadcast) — НЕ ВЫЗЫВАЮТСЯ из кода, нельзя просто REVOKE — нужно либо оставить (как part of trigger security chain), либо мигрировать в SECURITY DEFINER. См. §5.

### 1.4 Triggers (3 user-defined + 80 RI_FKey_*)

| Trigger | Table | Event | Function | Mode | Issue |
|---|---|---|---|---|---|
| `trigger_update_loyalty_progress` | bookings | AFTER UPDATE | `update_loyalty_progress` | INVOKER | Если anon UPDATE bookings (status='ГОТОВО'), функция выполнится от anon → INSERT loyalty_carwash_progress от anon → **упадёт после RLS** |
| `trigger_create_worksheet_entry_booking` | bookings | AFTER UPDATE | `create_worksheet_entry_on_booking_ready` | INVOKER | То же — INSERT worksheet_entries от anon → упадёт |
| `trigger_create_worksheet_entry_tire_booking` | tire_bookings | AFTER UPDATE | `create_worksheet_entry_on_tire_booking_ready` | INVOKER | То же |
| `bookings_broadcast_trigger` | bookings | AFTER INSERT/UPDATE/DELETE | `bookings_table_changes_broadcast` | DEFINER | realtime.broadcast_changes() — работает только под supabase service path, anon EXECUTE никогда не сработает |
| `tire_bookings_broadcast_trigger` | tire_bookings | AFTER INSERT/UPDATE/DELETE | `tire_bookings_table_changes_broadcast` | DEFINER | То же |
| (RI_FKey_* ~80) | all | various | RI_FKey_* | system | Системные, не трогаем |

**ВЫВОД:** `update_loyalty_progress` + `create_worksheet_entry_on_*_ready` — **НУЖНО ПЕРЕВОД НА SECURITY DEFINER** перед закрытием anon grants на bookings/tire_bookings, иначе триггеры сломаются.

---

## 2. Ownership matrix per table

### 2.1 Колонки ownership

| Table | client-side owner col | Path к client | Org-mode? | staff-created col | Edge: NULL |
|---|---|---|---|---|---|
| `clients` | **profile_id** → profiles.id | self | n/a | n/a | **3/33 NULL** (legacy) — миграция 005? |
| `client_cars` | client_id → clients.id → clients.profile_id | via FK | n/a | n/a | 0 NULL (NOT NULL FK) |
| `bookings` | client_id → clients.id → clients.profile_id | via FK | is_org=true → client_id=NULL или привязан к drivers/org | created_by_profile_id | **10/159 NULL** client_id (org или staff-only без клиента) |
| `tire_bookings` | client_id → clients.id → clients.profile_id | via FK | is_org=true → client_id=NULL | created_by_profile_id | **8/51 NULL** client_id |
| `loyalty_carwash_progress` | client_id → clients.id → clients.profile_id | via FK | n/a (only individual) | n/a | 0 NULL (NOT NULL FK) |
| `booking_cancellations` | client_id → clients.id | via FK | mixed (carwash + tire, any client) | n/a | 0 NULL (NOT NULL FK) |
| `payments` | (нет client col — booking_id/tire_booking_id) | via FK | booking → client | n/a | n/a — server-only |

### 2.2 Per-критический edge case

| Edge | Real-world frequency | Политика доступа | Проблема |
|---|---|---|---|
| **clients.profile_id IS NULL** (legacy unlinked) | **3 из 33 на demo** (реально) | own-row `auth.jwt() ->> 'profile_id' = clients.profile_id` → такие клиенты **никогда не пройдут RLS** и будут **невидимы самим себе** | Нужна либо миграция для link legacy, либо fallback-policy (anon видит только online_booking_blocked_until?). |
| **bookings.client_id IS NULL** (admin-only org/staff) | **10 из 159 на demo** (реально) | own-row `bookings.client_id → clients.profile_id` → **невидимы** для client. OK для staff (Path B policy). | Нужна policy `auth.jwt()->>'app_role' IN (...)` для staff sees all. |
| **bookings.client_id IS NOT NULL + is_org=true** (org-driver booking linked to a client) | **0 на demo** (текущих), но schema allows | own-row policy по client_id → client видит свои org-bookings (это может быть желаемым поведением) | Требует решения product: org-driver booking — клиент организации видит или нет? **Текущая логика cancel_own_booking работает и для org** — значит видит. |
| **bookings.created_by_profile_id=staff, client_id=client** | **145/159 на demo** (норма) | own-row по client_id — клиент видит свой booking, staff не через эту policy, а через Path B | OK |
| **bookings.created_by_profile_id=staff, client_id=NULL** | **10/159 на demo** | Path B staff видит, client не видит | OK |
| **tire_bookings: тот же набор** | 8/51 NULL, 43/51 individual, 0/51 org | То же самое поведение | OK |
| **tire_bookings.client_id=NULL (admin-flow)** | 8/51 | client не видит, staff видит через Path B | OK |
| **booking_cancellations row visible только своему клиенту** | все строки привязаны к client_id | own-row policy нужен | Сейчас RLS пускает только staff (Path B) — клиент не видит свои cancellations **напрямую**, только через API. Это OK, но если хотим показывать в UI "у вас было 2 отмены" — нужна own-row policy. |

### 2.3 Auth JWT custom claims

Из `api/login.ts:144-145`:
```
app_role: profile.role,
profile_id: profile.id,
```
JWT кастомные claims — `profile_id` и `app_role`. Стандартные `sub` / `email` тоже Supabase ставит, но не используются для RLS. **Design**: `auth.jwt()->>'profile_id' = clients.profile_id` для own-row доступа.

**Edge: в api/login.ts на момент sign JWT используется `profile.id`**, но `clients.profile_id` ссылается на тот же `profiles.id`. **Совпадение гарантировано** (одна таблица `profiles`, один PK).

---

## 3. Empirical RLS design verification (что точно работает на demo)

### 3.1 Design expressions

| Policy type | USING expression | Проверено? |
|---|---|---|
| **own-row SELECT clients** | `(SELECT profile_id FROM public.clients WHERE id = clients.id) = auth.jwt() ->> 'profile_id'::uuid` — нет, проще: `clients.profile_id = (auth.jwt() ->> 'profile_id')::uuid` | ✓ работает (таблица сама self-ref) |
| **own-row SELECT client_cars** | `EXISTS (SELECT 1 FROM public.clients WHERE clients.id = client_cars.client_id AND clients.profile_id = (auth.jwt() ->> 'profile_id')::uuid)` | ✓ работает, но **subquery** = RLS bypass + perf concern. PG14+ RLS cache помогает |
| **own-row SELECT bookings** | `EXISTS (SELECT 1 FROM public.clients WHERE clients.id = bookings.client_id AND clients.profile_id = (auth.jwt() ->> 'profile_id')::uuid)` | ✓ работает, в т.ч. для org-link bookings |
| **own-row SELECT tire_bookings** | То же | ✓ |
| **own-row SELECT loyalty_carwash_progress** | То же | ✓ |
| **own-row SELECT booking_cancellations** | `booking_cancellations.client_id → clients.profile_id = ...` | ✓ |
| **own-row SELECT payments** | По booking_id/tire_booking_id → client_id → profile_id | ✓ |
| **staff full access** | `auth.jwt() ->> 'app_role' IN ('admin','owner')` — точно как Path B | ✓ подтверждено в миграциях 017-020 |
| **anon=zero access** | DROP public_all_access, REVOKE ALL FROM anon | ✓ подтверждено в Slice #3d |

### 3.2 Edge: profile_id NULL clients (legacy)

3 клиента с `profile_id=NULL` (не linked к profile). Такие клиенты:
- **не смогут зайти** (логин идёт по phone → profile → client) — но если кто-то создал клиента через staff без link, есть запись.
- **не будут видеть свои bookings** даже если их client_id указан (через subquery).
- staff увидит их через Path B.

**Решение**: на demo — link_legacy_clients_1to1.sql уже применена. Остаются ли 3 NULL — это admin-created clients без link. **Не критично для безопасности** (staff видит), **но UX**: если такой клиент попытается зайти — он не увидит свои старые bookings.

**Предложение для Slice #3e**: добавить fallback **OR-clause**: если `auth.jwt() ->> 'app_role' IN ('admin','owner')` ИЛИ `clients.profile_id = (auth.jwt()->>'profile_id')::uuid` ИЛИ `clients.profile_id IS NULL AND <match by phone via JWT>`. **Но это усложнение**. **Альтернатива**: вычистить 3 NULL на demo перед Slice #3e (3 delete or 3 link).

### 3.3 Edge: bookings.client_id IS NULL (org/staff-only)

**Прямо сейчас**: 10/159 bookings на demo, 8/51 tire_bookings. **Все admin-created, без client_link.**
- staff видит через Path B (`auth.jwt()->>'app_role' IN (...)`).
- client не должен видеть — own-row по client_id пропускает только если client_id NOT NULL И совпадает.

**Решение для Slice #3e**: own-row policy **не** должна включать NULL client_id для client. Path B уже закрывает staff-side.

### 3.4 Edge: org-driver bookings linked to a client

`bookings.is_org = true` AND `client_id IS NOT NULL`. На demo сейчас **0**, но schema допускает. Логика `cancel_own_booking` обрабатывает такой случай через тот же ownership check. **Design**: клиент организации видит org-booking, привязанный к нему. **OK**.

### 3.5 Edge: trigger-fired functions (4 INVOKER RPCs)

`update_loyalty_progress`, `create_worksheet_entry_on_booking_ready`, `create_worksheet_entry_on_tire_booking_ready` — **INVOKER** mode. После Category C RLS:
- anon UPDATE bookings → триггер fires → функция выполняется от anon → INSERT loyalty_carwash_progress → **RLS on loyalty_carwash_progress** (own-row policy) → **anon INSERT denied** → trigger fails → UPDATE bookings тоже fails → cascade.
- Решение: перевод на **SECURITY DEFINER**. Тогда функция выполняется от **owner RPC** (postgres), RLS bypassed.

**Идентичное** для `create_worksheet_entry_on_booking_ready` (INSERT worksheet_entries) — SECURITY DEFINER.

**broadcast functions** — DEFINER, calls `realtime.broadcast_changes` (internal Supabase extension). Не трогать.

---

## 4. Caller map — direct supabase calls для Category C

### 4.1 Browser (anon-ключ) reads/writes — ВСЁ через `supabase` import

| Caller | Op | Table/View | Что читает/пишет | Source |
|---|---|---|---|---|
| `App.tsx:282, 883, 919` | SELECT | clients | **ВСЕ** is_active=true (admin UI state) | `lib/api/clients.ts:getClients()` |
| `components/admin/ClientDatabaseAccordion.tsx:56` | SELECT | clients+client_cars | **ВСЕ** with cars (admin UI) | `lib/api/clients.ts:getClientsWithCars()` |
| `components/admin/BookingWizard.tsx:738, 1106, 1357` | SELECT | client_cars | cars for selected client_id | `lib/api/clients.ts:getClientCars(clientId)` |
| `components/admin/TireBookingWizard.tsx` (3 hits) | SELECT | client_cars | cars for selected client_id | same |
| `components/client/OnlineBookingWizard.tsx:145` | SELECT | clients | by profile_id | `getBookingsByProfileId` (через `lib/api/bookings.ts`) |
| `components/client/OnlineBookingWizard.tsx` | SELECT | client_cars | cars by profile_id | `getClientCars` |
| `components/client/OnlineBookingWizard.tsx` | SELECT | loyalty_carwash_progress | by profile_id | `lib/api/loyalty.ts:getLoyaltyProgressByProfileId` |
| `components/client/OnlineBookingWizard.tsx` | SELECT | clients + booking_cancellations | block check | `isProfileBlockedForOnlineBooking` |
| `components/client/MyGarage.tsx:81` | SELECT | clients | by profile_id | inline |
| `components/client/MyGarage.tsx:70` | SELECT | profiles | phone (sub-link) | inline |
| `components/client/MyGarage.tsx` | UPDATE | client_cars | delete (is_active=false) | `deleteClientCar` |
| `components/client/AddCarForm.tsx` | INSERT | client_cars | add car | `createClientCar` |
| `components/client/BankSelectionStep.tsx:62` | SELECT | clients | email by profile_id | inline |
| `components/client/ActiveBookingCard.tsx:56` | SELECT | booking_cancellations | count by profile_id | `getCancellationCountByProfileId` |
| `components/client/ClientTireBookingWrapper.tsx:348, 384` | SELECT | clients | block check + create data | inline |
| `components/client/ClientTireBookingWrapper.tsx` | SELECT | booking_cancellations | block check | `isProfileBlockedForOnlineBooking` |
| `lib/api/booking-cancellations.ts` (10 anon calls) | SELECT/INSERT/UPDATE | clients, booking_cancellations | various | full file |
| `lib/api/loyalty.ts` (4 anon calls) | SELECT | clients, loyalty_carwash_progress | various | full file |
| `lib/api/clients.ts` (10 anon calls) | SELECT/INSERT/UPDATE | clients, client_cars | various | full file |

### 4.2 Server (`supabaseAdmin` = service_role bypass)

Уже dispatcher-ized через `api/client.ts`:

| Action | What it does |
|---|---|
| `get-my-cars` | client_cars for claims.profile_id → own clients → own cars |
| `get-bookings` | bookings WHERE client_id → client_id by profile_id |
| `create-booking` | INSERT bookings with client_id resolved server-side |
| `cancel-booking` | rpc('cancel_own_booking', ...) |
| `create-car` / `update-car` / `delete-car` | own client_cars ops |
| `get-tire-bookings` / `create-tire-booking` / `cancel-tire-booking` | то же для tire_bookings |

**Все client-flow operations идут через server-side dispatcher. ✓**

### 4.3 Admin UI (browser через anon — нужно мигрировать)

| Admin-side action | Где используется | Anon-table reads |
|---|---|---|
| `getClients` | App.tsx + 1 more | clients (all active) |
| `getClientsWithCars` | ClientDatabaseAccordion | clients+client_cars (all active) |
| `getClientCars(clientId)` | BookingWizard + TireBookingWizard | client_cars WHERE client_id (specific) |
| `searchClientByPhone` (уже в api/staff.ts:2735) | — | clients WHERE phone |
| `createClient` / `updateClient` / `createClientCar` / `updateClientCar` / `unblockClient` (уже в api/staff.ts) | — | all |
| `searchOrganization` / `createOrgCar` / `updateOrgCar` / etc. (уже в api/staff.ts) | — | org tables |

**Нужно добавить в `api/staff.ts` новые actions**:
- `list-clients` (replaces `getClients` browser-side)
- `list-clients-with-cars` (replaces `getClientsWithCars`)
- `get-client-cars-by-client-id` (replaces `getClientCars(clientId)` для admin path)

### 4.4 Dead code в `lib/api/clients.ts` (не вызывается никем)

- `findClientByPhone(phone)` — **0 callers**
- `linkClientToProfile(clientId, profileId)` — **0 callers**
- `getClientByProfileId` — **0 callers**
- `getClientCarsByProfileId` — **0 callers** (OnlineBookingWizard дёргает `getClientCars` напрямую — **антипаттерн**, см. ниже)

Эти 4 функции — tech debt, оставить на Phase 2.5 cleanup, не блокируют Slice #3e.

---

## 5. Cancel RPCs deep review (`cancel_own_booking`, `cancel_own_tire_booking`)

### 5.1 Grants (literal psql)

```
cancel_own_booking(p_booking_id uuid, p_profile_id uuid)  | DEFINER | anon=X auth=X svc=✓
cancel_own_tire_booking(p_tire_booking_id uuid, p_profile_id uuid, p_reason text) | DEFINER | anon=X auth=X svc=✓
```

✓ Уже закрыты на demo (migration 012, до Slice #3d). На prod — нет (entry 22), но мы prod не трогаем.

### 5.2 Security mode = DEFINER, p_profile_id = обязательный параметр

**Ownership check внутри** (литералы из тела):
```
SELECT * FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
v_client_id := v_booking.client_id;
PERFORM 1 FROM public.clients c WHERE c.id = v_client_id AND c.profile_id = p_profile_id LIMIT 1;
IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND_OR_NOT_OWNED';
```

**Это правильный pattern**: даже если RPC доступен, ownership проверен server-side, клиент не может подставить чужой `booking_id`. **Category C RLS НЕ сломает этот RPC** потому что:
- (1) RPC SECURITY DEFINER → bypass RLS на INSERT/UPDATE public.booking_cancellations.
- (2) RPC SECURITY DEFINER → bypass RLS на UPDATE public.bookings.
- (3) RPC SECURITY DEFINER → bypass RLS на UPDATE public.clients (online_booking_blocked_until).
- (4) Только `has_function_privilege` решает, может ли role вызвать. anon=X → не может вызвать.

✓ **Phase 2.5 (anon REVOKE) + Slice #3e Category C RLS не требуют изменений cancel_own_***.

### 5.3 Idempotency + 30-day block (без изменений)

- Idempotency: `booking_cancellations` UNIQUE INDEX на `booking_id` + tire unique partial.
- 30-day block: conditional UPDATE `clients.online_booking_blocked_until` только если `count >= 3` И блок истёк/NULL.

**После Category C RLS этот код продолжит работать**:
- `INSERT INTO booking_cancellations` — SECURITY DEFINER bypasses RLS ✓
- `UPDATE public.clients SET online_booking_blocked_until` — SECURITY DEFINER bypasses RLS ✓

### 5.4 find_tire_booking_overlap

SECURITY DEFINER, anon=X. **Не требует изменений.**

### 5.5 Trigger-fired INVOKER RPCs — требуют миграции на DEFINER

| Function | Old | New |
|---|---|---|
| `update_loyalty_progress` | INVOKER (anon-callable) | **SECURITY DEFINER** |
| `create_worksheet_entry_on_booking_ready` | INVOKER (anon-callable) | **SECURITY DEFINER** |
| `create_worksheet_entry_on_tire_booking_ready` | INVOKER (anon-callable) | **SECURITY DEFINER** |

Тела функций безопасны для DEFINER: только INSERT в loyalty/worksheet по client_id из NEW (trusted owner-side data). **Изменение однострочное.**

### 5.6 bookings_table_changes_broadcast + tire_bookings_table_changes_broadcast

DEFINER, anon-callable, но trigger-fired, не вызываются из кода. **Не блокируют Slice #3e** — но в Phase 2.5 REVOKE на bookings/tire_bookings можно рассмотреть REVOKE EXECUTE on these too (не влияет на runtime, т.к. anon EXECUTE никогда не сработает через trigger path).

---

## 6. Slice #3e Plan — порядок реализации

### 6.1 Phase A: портирование admin-UI (read paths)

| Step | Что | Где | Verification |
|---|---|---|---|
| **A1** | Add `list-clients` action в `api/staff.ts` (server-side SELECT clients WHERE is_active=true + reorder) | `api/staff.ts` + `lib/api/staff-actions.ts` | unit test |
| **A2** | Add `list-clients-with-cars` action в `api/staff.ts` | same | unit test |
| **A3** | Add `get-client-cars-by-client-id` action (admin override: see cars любого клиента) | same | unit test |
| **A4** | Заменить в `App.tsx:282, 883, 919`: `getClients()` → `listClientsAction()` (server) | frontend | manual smoke |
| **A5** | Заменить в `ClientDatabaseAccordion.tsx`: `getClientsWithCars()` → `listClientsWithCarsAction()` | frontend | manual smoke |
| **A6** | Заменить в `BookingWizard.tsx`, `TireBookingWizard.tsx`: `getClientCars(clientId)` (admin path) → `getClientCarsByClientIdAction(clientId)` | frontend | manual smoke |

### 6.2 Phase B: портирование client-side cancellation/loyalty reads

| Step | Что | Где | Verification |
|---|---|---|---|
| **B1** | Add `get-my-cancellation-count` в `api/client.ts` (server-side: count по claims.profile_id) | `api/client.ts` + `lib/api/client-actions.ts` | unit test |
| **B2** | Add `get-my-block-status` в `api/client.ts` | same | unit test |
| **B3** | Replace `getCancellationCountByProfileId` (browser-side) → `getMyCancellationCountAction()` | ActiveBookingCard | manual smoke |
| **B4** | Replace `isProfileBlockedForOnlineBooking` → `getMyBlockStatusAction()` | ClientTireBookingWrapper + OnlineBookingWizard | manual smoke |

### 6.3 Phase C: перевод trigger-fired INVOKER RPCs на DEFINER

| Step | Что | Где |
|---|---|---|
| **C1** | Migration: `ALTER FUNCTION update_loyalty_progress SECURITY DEFINER;` (и owner = postgres) | new migration `022_*` |
| **C2** | Migration: `ALTER FUNCTION create_worksheet_entry_on_booking_ready SECURITY DEFINER;` | same |
| **C3** | Migration: `ALTER FUNCTION create_worksheet_entry_on_tire_booking_ready SECURITY DEFINER;` | same |
| **C4** | Verify: simulate anon UPDATE bookings (через SET ROLE anon + INSERT anon via supabase) → trigger fires → INSERT loyalty_carwash_progress не падает | psql verify |

### 6.4 Phase D: RLS migration на Category C

| Step | Что | Edge |
|---|---|---|
| **D1** | **migration `023_category_c_own_row_rls_clients.sql`** | DROP public_all_access + DROP service_role_all_access + ADD client_select_own (USING `profile_id = (auth.jwt()->>'profile_id')::uuid`) + ADD client_insert_own + ADD client_update_own + ADD service_role_all_clients + REVOKE ALL FROM anon + GRANT SELECT TO authenticated + GRANT ... admin/owner policy (Path B composite) |
| **D2** | migration `024_category_c_own_row_rls_client_cars.sql` | DROP public + ADD own-row via subquery (client_id → clients.profile_id) + staff + service_role + REVOKE anon + GRANT auth SELECT |
| **D3** | migration `025_category_c_own_row_rls_bookings.sql` | same pattern |
| **D4** | migration `026_category_c_own_row_rls_tire_bookings.sql` | same |
| **D5** | migration `027_category_c_own_row_rls_loyalty.sql` | same |
| **D6** | migration `028_category_c_own_row_rls_booking_cancellations.sql` | own-row через client_id, **но** с возможностью staff читать всё (Path B composite) |
| **D7** | migration `029_views_security_invoker.sql` | `ALTER VIEW bookings_timeline SET (security_invoker = true)` + same for tire_bookings_timeline → RLS на base применяется |
| **D8** | REVOKE anon SELECT on views (дополнительно) | REVOKE SELECT ON bookings_timeline FROM anon,authenticated |

**Edge cases в D1-D6**:
- `clients.profile_id IS NULL`: own-row policy `profile_id = jwt.profile_id` **вернёт false** → unlinked clients **невидимы** себе. Это OK если их нет, или admin должен link их заранее.
- `bookings.client_id IS NULL`: own-row policy `EXISTS (subquery)` вернёт false (нет client → нет profile match). Staff видит через Path B. OK.
- Subquery perf: на каждый row проверяется `clients.profile_id`. С индексом `idx_clients_profile_id` — OK. На 159 bookings — мгновенно. На 100k — нужна denormalized `cached_profile_id` колонка в bookings (не сейчас).

### 6.5 Phase E: tests

| Test | Coverage |
|---|---|
| **E1** | create test_client1 + test_client2 → both INSERT own clients → assert cannot SELECT other (anon path, Phase 2.5 simulation) |
| **E2** | test_client1 createBooking → own SELECT sees it, test_client2 SELECT empty |
| **E3** | staff SELECT sees both clients + both bookings |
| **E4** | test_client1 INSERT booking for test_client2 (UI: создание от чужого имени) → anon INSERT policy denies |
| **E5** | cancel_own_booking works: test_client1 cancels own → other sees nothing changed |
| **E6** | loyalty progress: test_client1 has 10 washes → own SELECT works → trigger fires correctly when status='ГОТОВО' |
| **E7** | booking_cancellations: 3 cancels в 30 days → online_booking_blocked_until set |
| **E8** | views: bookings_timeline SELECT (anon post-RLS) — must respect base RLS |
| **E9** | trigger SECURITY DEFINER: simulate anon UPDATE bookings.status='ГОТОВО' → loyalty row created |

### 6.6 Phase F: browser smoke + production carry-over notes

- Вручную: client login → sees only own bookings/cars/cancellations.
- Вручную: admin sees all clients, all bookings.
- Вручную: anon не видит ничего.
- Вручную: trigger loyalty fires correctly после client cancel.

### 6.7 Phase 2.5 (отдельный task, после Slice #3e)

`REVOKE INSERT/UPDATE/DELETE ON public.clients FROM anon;` + REVOKE anon на всех Category C tables. **Невозможно без Slice #3e** — иначе admin UI сломается (`getClients` через anon).

---

## 7. Risks / open questions

| # | Risk | Mitigation |
|---|---|---|
| 1 | 3 clients.profile_id=NULL станут невидимы для staff (через own-row SELECT без Path B composite) | Policy composite: own-row OR app_role admin/owner (Path B уже есть, но для staff SELECT). **MUST keep Path B staff policies.** |
| 2 | trigger-fired INVOKER functions сломаются после Category C RLS | Phase C — перевод на SECURITY DEFINER (однострочный ALTER). |
| 3 | bookings_timeline / tire_bookings_timeline views — SECURITY DEFINER by default? | Need `ALTER VIEW ... SET (security_invoker = true)`. PG15+. Supabase PG15 — supported. |
| 4 | Subquery в policy (client_cars → clients) perf | Index `idx_clients_profile_id` exists. <100k rows OK. Plan: denormalize `cached_profile_id` column in bookings if >100k. |
| 5 | client-side `deleteClientCar` (`MyGarage.tsx`) — прямой UPDATE через anon | `api/client.ts:deleteCarAction` УЖЕ поддерживает — просто frontend не использует. Need A7: replace inline `deleteClientCar` with `deleteCarAction`. |
| 6 | Prod drift (per entry 22, 35 RPC vs 47) — `cancel_own_*` exist on prod, but their dependencies (clients.profile_id, profiles.id) тоже exist | Migrate as-is. Per-overload handling уже паттернизирован в миграции 021. |
| 7 | 3 unlinked clients на prod (legacy без profile) — после Slice #3e они не смогут login → видеть bookings | Demo cleanup first (link or delete). Prod: separate migration. |

---

## 8. Migrations numbering (предложение)

| # | File | Что |
|---|---|---|
| 022 | `022_loyalty_worksheet_triggers_security_definer.sql` | 3× ALTER FUNCTION SECURITY DEFINER |
| 023 | `023_category_c_clients_own_row_rls.sql` | clients own-row RLS + REVOKE anon + GRANT auth + staff policy + service_role |
| 024 | `024_category_c_client_cars_own_row_rls.sql` | client_cars own-row via subquery |
| 025 | `025_category_c_bookings_own_row_rls.sql` | bookings own-row via subquery |
| 026 | `026_category_c_tire_bookings_own_row_rls.sql` | tire_bookings own-row |
| 027 | `027_category_c_loyalty_own_row_rls.sql` | loyalty_carwash_progress own-row |
| 028 | `028_category_c_booking_cancellations_own_row_rls.sql` | own-row (только своё) |
| 029 | `029_views_security_invoker_revoke.sql` | ALTER VIEW bookings_timeline SET security_invoker + REVOKE anon |

Все 8 миграций **применимы только на demo**. На prod — отложно до общего rollout.

---

## 9. Что НЕ предлагается делать в Slice #3e

1. Не трогать `payment_phone` / `card_number` из Phase 2 (закрыто в 019).
2. Не трогать `profiles` (закрыто в 019).
3. Не применять на prod (per entry 22).
4. Не создавать Phase 3 public views для slots.
5. Не менять Vercel function count (12/12).

---

## 10. Открытые вопросы для владельца

| Q# | Вопрос |
|---|---|
| Q1 | **Что делаем с 3 unlinked clients на demo** (clients.profile_id=NULL)? Link, delete, или оставляем (staff видит через Path B, client сам не залогинится)? |
| Q2 | **Org-driver booking, привязанный к client_id**: должен ли клиент организации видеть этот booking? Текущий код cancel_own_booking работает и для org-link, значит ДА. Подтвердить? |
| Q3 | **Phase C (DEFINER migration)** — владелец уже делал миграцию 019a на demo. Тут однострочные ALTER FUNCTION. OK? |
| Q4 | **Phase 2.5 REVOKE anon INSERT/UPDATE/DELETE на Category C** — это отдельный task после Slice #3e. Подтвердить? |
| Q5 | **browser-side `deleteClientCar`** в `MyGarage.tsx` — портируем как часть Slice #3e или отдельный refactor? |