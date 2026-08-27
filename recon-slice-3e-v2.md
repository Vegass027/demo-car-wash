# Slice #3e / Category C — recon v2 (READ-ONLY)

> v2 добавляет два артефакта по запросу владельца (Q1, Q4, Q5
> resolved; Q2 + Q3 нужны детали):
>
> 1. **Полная ownership/access matrix** для 7 Category C таблиц
>    (anon / authenticated / staff-admin / staff-owner /
>    service_role × SELECT / INSERT / UPDATE / DELETE).
> 2. **Q2/Q3 детальный разбор** с именами функций, эмпирическими
>    тестами trigger-as-anon, и явный REVOKE plan.
>
> Никаких SQL/policy/code изменений, только анализ.

---

## Ответы на resolved вопросы (Q1, Q4, Q5)

### Q1 — 3 unlinked clients (profile_id=NULL)

**Решение**: ничего не делать, оставить как есть. Под own-row RLS
`clients.profile_id = auth.jwt()->>'profile_id'` для client JWT —
сравнение UUID с NULL даёт UNKNOWN → RLS трактует как `false` →
строка не видна. **Дополнительный test**: проверю в Phase E что
client с profile_id=NULL невидим для своего client JWT (если бы он
мог залогиниться) и виден через Path B staff policy. Явный edge
test добавляется в Phase E5/E6.

### Q4 — Phase 2.5 в этом же цикле

**Решение**: делаем Phase 2.5 (REVOKE anon INSERT/UPDATE/DELETE) как
последний шаг Slice #3e, не откладываем. Phase A (admin-side ports)
+ Phase B (client-side cancellation/loyalty ports) готовят почву.

### Q5 — `deleteClientCar` browser call

**Решение**: уже портирован.

`components/client/MyGarage.tsx:19`:
```ts
// deleteClientCar removed: soft-delete routes through POST /api/client?action=delete-car
```

Callsite удалён, функция осталась как dead code в `lib/api/clients.ts`
(для обратной совместимости). Dispatcher `deleteCarAction` в
`api/client.ts` уже существует и используется. **Дополнительной
работы не требуется**, кроме как cleanup dead code в Phase A
(опционально).

---

## 1. Полная ownership/access matrix для 7 Category C таблиц

### 1.1 CURRENT STATE (после Slice #3d, перед Slice #3e)

**Легенда**: `public_all_access` означает `policy USING(true)` для
всех команд. `service_role_*` = `TO service_role USING(true) WITH
CHECK(true)`. `staff_*` = `app_role IN ('admin','owner')` для
authenticated. **Grant** = privilege на table-level (не RLS).

| Table | Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| **clients** | anon | ✓ (public_all_access) | ✓ (public_all_access) | ✓ (public_all_access) | ✓ (public_all_access) |
| | authenticated | ✓ (public_all_access) | ✓ (public_all_access) | ✓ (public_all_access) | ✓ (public_all_access) |
| | admin (via staff policy) | ✗ (no policy yet) | ✗ | ✗ | ✗ |
| | owner (via staff policy) | ✗ | ✗ | ✗ | ✗ |
| | service_role | ✓ | ✓ | ✓ | ✓ |
| **client_cars** | anon | ✓ | ✓ | ✓ | ✓ |
| | authenticated | ✓ | ✓ | ✓ | ✓ |
| | admin | ✗ | ✗ | ✗ | ✗ |
| | owner | ✗ | ✗ | ✗ | ✗ |
| | service_role | ✓ | ✓ | ✓ | ✓ |
| **bookings** | anon | ✓ | ✓ | ✓ | ✓ |
| | authenticated | ✓ | ✓ | ✓ | ✓ |
| | admin | ✗ | ✗ | ✗ | ✗ |
| | owner | ✗ | ✗ | ✗ | ✗ |
| | service_role | ✓ | ✓ | ✓ | ✓ |
| **tire_bookings** | anon | ✓ | ✓ | ✓ | ✓ |
| | authenticated | ✓ | ✓ | ✓ | ✓ |
| | admin | ✗ | ✗ | ✗ | ✗ |
| | owner | ✗ | ✗ | ✗ | ✗ |
| | service_role | ✓ | ✓ | ✓ | ✓ |
| **loyalty_carwash_progress** | anon | ✓ | ✓ | ✓ | ✓ |
| | authenticated | ✓ | ✓ | ✓ | ✓ |
| | admin | ✗ | ✗ | ✗ | ✗ |
| | owner | ✗ | ✗ | ✗ | ✗ |
| | service_role | ✓ | ✓ | ✓ | ✓ |
| **booking_cancellations** | anon | ✗ (grant=X, policy uses) | ✗ | ✗ | ✗ |
| | authenticated | ✓ (staff_select) | ✗ | ✗ | ✗ |
| | admin | ✓ (staff_select) | ✓ (staff_insert) | ✓ (staff_update) | ✓ (staff_delete) |
| | owner | ✓ (staff_select) | ✓ (staff_insert) | ✓ (staff_update) | ✓ (staff_delete) |
| | service_role | ✓ | ✓ | ✓ | ✓ |
| **payments** | anon | ✗ | ✗ | ✗ | ✗ |
| | authenticated | ✗ | ✗ | ✗ | ✗ |
| | admin | ✗ | ✗ | ✗ | ✗ |
| | owner | ✗ | ✗ | ✗ | ✗ |
| | service_role | ✓ | ✓ | ✓ | ✓ |

**Current bugs (anon видит всё)**:
- clients: 33 строки (включая profile_id, phone, online_booking_blocked_until — утечка контактов и block-state)
- client_cars: все cars любого клиента
- bookings: 159 строк с client_name, phone, price, services, payment_method, worker_id, signature_data
- tire_bookings: 51 строка с тем же набором
- loyalty_carwash_progress: free_wash_pending и total_washes — паттерн потребления каждого клиента

### 1.2 TARGET STATE (после Phase D + E + 2.5)

**Design policy**:
- **own-row SELECT/UPDATE**: `(client_id → clients.profile_id) = (auth.jwt()->>'profile_id')::uuid` (для bookings, tire_bookings, loyalty, booking_cancellations)
- **own-row SELECT/UPDATE для clients**: `clients.profile_id = (auth.jwt()->>'profile_id')::uuid`
- **own-row SELECT/UPDATE/INSERT для client_cars**: через subquery к clients
- **own-row INSERT для bookings/tire_bookings**: только `clients.id` resolved server-side (из `claims.profile_id`); client не может вставить запись с чужим client_id
- **staff full access** (`app_role IN ('admin','owner')`): Path B composite — staff sees/inserts/updates/deletes все rows
- **service_role bypass**: все команды
- **REVOKE**: anon DELETE, anon UPDATE, anon INSERT на 5 таблицах (clients, client_cars, bookings, tire_bookings, loyalty) — **но SELECT для clients остаётся анонимным?** Нет — закрываем полностью, см. 2.5
- **auth SELECT**: остаётся для staff через Path B + собственный через own-row; non-staff authenticated client видит только свои
- **anon SELECT**: REVOKE ALL

| Table | Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| **clients** | anon | ✗ (REVOKE ALL — нет reads) | ✗ | ✗ | ✗ |
| | authenticated client | own (profile_id match) | own (own profile) | own | ✗ |
| | authenticated admin | all (Path B staff) | all | all | ✗ (нет admin del — кроме dispatcher) |
| | authenticated owner | all | all | all | all |
| | service_role | all | all | all | all |
| **client_cars** | anon | ✗ | ✗ | ✗ | ✗ |
| | authenticated client | own (via client_id subquery) | own (subquery) | own | own |
| | authenticated admin | all | all | all | all |
| | authenticated owner | all | all | all | all |
| | service_role | all | all | all | all |
| **bookings** | anon | ✗ | ✗ | ✗ | ✗ |
| | authenticated client | own (client_id subquery, is_org=false AND client_id NOT NULL) | own (server resolves client_id) | own (status cancel via RPC only) | ✗ |
| | authenticated admin | all | all | all | all |
| | authenticated owner | all | all | all | all |
| | service_role | all | all | all | all |
| **tire_bookings** | anon | ✗ | ✗ | ✗ | ✗ |
| | authenticated client | own (is_org=false, client_id subquery) | own (server) | own (status cancel via RPC) | ✗ |
| | authenticated admin | all | all | all | all |
| | authenticated owner | all | all | all | all |
| | service_role | all | all | all | all |
| **loyalty_carwash_progress** | anon | ✗ | ✗ | ✗ | ✗ |
| | authenticated client | own (client_id subquery) | ✗ (server-managed only) | ✗ | ✗ |
| | authenticated admin | all | all | all | all |
| | authenticated owner | all | all | all | all |
| | service_role | all | all | all | all |
| **booking_cancellations** | anon | ✗ (без изменений — grant=X уже) | ✗ | ✗ | ✗ |
| | authenticated client | own (client_id subquery) | ✗ (RPC only) | ✗ | ✗ |
| | authenticated admin | all | all | all | all |
| | authenticated owner | all | all | all | all |
| | service_role | all | all | all | all |
| **payments** | anon | ✗ (без изменений) | ✗ | ✗ | ✗ |
| | authenticated client | ✗ (server-managed) | ✗ | ✗ | ✗ |
| | authenticated admin | ✗ | ✗ | ✗ | ✗ |
| | authenticated owner | ✗ | ✗ | ✗ | ✗ |
| | service_role | ✓ | ✓ | ✓ | ✓ |

### 1.3 Edge case coverage в target state

| Edge case | Текущий результат (anon leaks) | Target (после Slice #3e) | Verified |
|---|---|---|---|
| Client A смотрит bookings Client B | ✓ leaks все | own-row SELECT exclude B | need test |
| Client смотрит свои отменённые bookings | ✓ visible | visible через own-row | need test |
| Client видит чужие loyalty | ✓ leaks free_wash_pending | own-row only | need test |
| Client INSERT booking с чужим client_id | ✓ succeeds (anon INSERT) | INSERT policy USING auth.jwt()'s profile_id match | need test |
| 3 unlinked clients (profile_id=NULL) | ✓ anon sees | own-row: profile_id NULL → no match → невидимы. Staff sees через Path B | add test |
| 10 bookings с client_id=NULL (org/staff-only) | ✓ anon sees | own-row: client_id NULL → no match → client невидимы. Staff sees. | need test |
| 8 tire_bookings с client_id=NULL | ✓ anon sees | same | need test |
| 0 org-link bookings | n/a | own-row: is_org=true AND client_id NOT NULL → client видит свой org-booking | design decision (см. Q2 ответ) |
| bookings_timeline view (anon) | ✓ leaks 159 | security_invoker=true → RLS base applies → anon видит 0 | need test |
| tire_bookings_timeline view | ✓ leaks 51 | same | need test |

---

## 2. Q2 — Детальный ответ: organization_driver НЕ имеет client JWT

### 2.1 Эмпирические данные

```
profiles.user_role enum range = {client, admin, owner}
profiles distribution: 29 client, 2 admin, 2 owner — НЕТ driver
organization_drivers schema:
  - id (uuid PK)
  - organization_id (FK to organizations)
  - full_name, phone, is_active, signature_data
  - НЕТ profile_id (нет FK в profiles)
```

### 2.2 Login flow

`api/login.ts` принимает 4 типа логина: admin (login/password), owner
(login/password), client (phone/SMS), client (telegram). **Никакого
driver login flow не существует.**

### 2.3 Driver UI

`updateDriverSignature` — **staff-action** (`api/staff.ts:697`):
вызывается только из `BookingWizard.tsx:834` (admin UI). Driver сам
никогда не заходит в систему, только staff вводит его подпись при
приёмке автомобиля.

### 2.4 Вывод

**organization_drivers — это НЕ users. Это справочная сущность
с phone + signature для удобства staff. У driver нет и не может
быть client JWT / mini-app доступа.**

### 2.5 Политика для own-row bookings/tire_bookings

Так как driver не имеет собственного login, а `bookings.driver_id`
— это просто ссылка для staff, **own-row policy для client НЕ должна
зависеть от driver**. Driver невидим для client, его bookings —
admin-flow.

**Решение**: own-row SELECT policy для bookings/tire_bookings:

```sql
CREATE POLICY client_own_select_bookings ON public.bookings
FOR SELECT TO authenticated
USING (
  is_org = false
  AND client_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = bookings.client_id
      AND c.profile_id = (auth.jwt() ->> 'profile_id')::uuid
  )
);
```

Ключевое: `is_org = false` И `client_id IS NOT NULL`. Это
**исключает**:

1. Все `client_id IS NULL` rows (org bookings без привязки к client,
   или staff-only bookings) — клиент их не видит.
2. Все `is_org = true` rows — даже если у них есть client_id
   (гипотетический случай "client организации"), клиент их не видит.

**Почему исключаем org-bookings**: если у организации есть
linked clients (через driver/contract), и booking создан от имени
driver, **организация** — это субъект-агрегатор (видит всё через
admin UI), а не сам driver. **Клиент**-физлицо не должен видеть
org-bookings, потому что:

- billing идёт через organization, не через client;
- cancellation logic другая (нет 30-day personal block);
- signature на отдельной form;
- driver сам ничего не бронирует.

**Согласовано с существующим cancel_own_booking**: его RPC
ownership-check `clients.profile_id = p_profile_id` **не
различает** org vs individual. Это значит текущий код
**может отменить org-booking** если передан правильный booking_id
и client имеет org-booking. Это потенциальная **отдельная уязвимость
в cancel_own_***, но она уже существующая и не блокирует Slice #3e.

**Action item (НЕ блокирует Slice #3e)**: добавить в
cancel_own_booking + cancel_own_tire_booking проверку
`v_booking.is_org = false`. Но это **другая задача** — security
hardening RPC, не RLS migration.

---

## 3. Q3 — Детальный ответ: trigger-fired INVOKER functions

### 3.1 Полные имена и тела

| # | Function | Trigger | Body summary | Vol | Owner | Public EXEC | anon EXEC |
|---|---|---|---|---|---|---|---|
| 1 | `public.update_loyalty_progress()` | `trigger_update_loyalty_progress` AFTER UPDATE ON bookings | INSERT/UPDATE public.loyalty_carwash_progress по NEW.client_id | volatile | postgres | ✓ (default PUBLIC grant) | ✓ |
| 2 | `public.create_worksheet_entry_on_booking_ready()` | `trigger_create_worksheet_entry_booking` AFTER UPDATE ON bookings (status='ГОТОВО') | INSERT public.worksheet_entries (только если NEW.is_org=true AND NEW.status='ГОТОВО') | volatile | postgres | ✓ | ✓ |
| 3 | `public.create_worksheet_entry_on_tire_booking_ready()` | `trigger_create_worksheet_entry_tire_booking` AFTER UPDATE ON tire_bookings (status='ГОТОВО') | INSERT public.worksheet_entries (только если NEW.is_org=true AND NEW.status='ГОТОВО') | volatile | postgres | ✓ | ✓ |

**Полные тела** см. в recon-slice-3e.md §1.4 и в psql \df+ выгрузке.

### 3.2 Почему они "ломаются" под Category C RLS в текущей форме

INVOKER mode = функция выполняется от имени **calling role**.
Триггер fires при UPDATE table. Кто update'ит — тот и calling role.

**Сценарии**:

| Caller | Trigger fires | Function runs as | INSERT loyalty_carwash_progress | INSERT worksheet_entries |
|---|---|---|---|---|
| anon (через `supabase.from('bookings').update()`) | yes | anon | RLS public_all_access → OK | RLS staff_insert → **FAIL permission denied** |
| authenticated client (anon after Phase 2.5: cannot UPDATE) | n/a | n/a | n/a | n/a |
| service_role (через admin dispatcher) | yes | service_role | service_role bypass → OK | service_role bypass → OK |
| authenticated admin (если бы был anon UPDATE RLS) | yes | admin | admin staff policy → OK | admin staff policy → OK |

**Эмпирический тест (сделан на demo 27.08.2026)**:

```
SET ROLE anon;
UPDATE public.bookings SET status='ГОТОВО', updated_at=now()
  WHERE id='7452d395-2a28-4947-9861-6aa88deb919d';
-- SUCCEEDED (public_all_access allows)
-- Trigger fires → update_loyalty_progress runs as anon
-- → INSERT loyalty_carwash_progress: PASS (public_all_access)
-- → trigger_create_worksheet_entry_booking runs as anon
-- → INSERT worksheet_entries: **permission denied** (silently fails after AFTER trigger)
-- → UPDATE bookings committed anyway
```

**То есть СЕЙЧАС anon может проставить bookings.status='ГОТОВО', и:
- loyalty row может создаться (если услуга qualifying)
- worksheet_entries INSERT молча fails (тихий bug, log в PostgreSQL warning)**

После Phase 2.5 (anon UPDATE REVOKE) эта проблема исчезает. Никакой
anon не сможет UPDATE bookings → триггер не fires от anon.

### 3.3 Альтернативы вместо SECURITY DEFINER

#### Альтернатива A: ничего не менять (status quo + Phase 2.5)

- Триггер-fired функции остаются INVOKER.
- Phase 2.5 REVOKE anon UPDATE/INSERT/DELETE на bookings/tire_bookings.
- Только service_role path (admin через `mark-staff-ready` action) может UPDATE bookings → trigger fires as service_role → все внутренние INSERTs bypasses RLS (service_role bypass).
- Trigger-as-anon сценарий **физически невозможен** (anon не имеет grant UPDATE).
- ✓ Рекомендую.

#### Альтернатива B: SECURITY DEFINER + REVOKE PUBLIC/anon

Если хочется defensive — перевод на DEFINER + явный REVOKE.
Но это создаёт риски:

- DEFINER runs as **owner (postgres)** — полный RLS bypass для всех
  операций внутри функции, не только для текущей задачи.
- Функция `update_loyalty_progress` имеет ~30 INSERT/UPDATE
  statements в loyalty_carwash_progress. Под DEFINER все они bypass RLS
  → любая будущая модификация тела функции может leak данные.
- Аналогично `create_worksheet_entry_on_*` — внутри read NEW.* из
  bookings/tire_bookings, под DEFINER это bypass RLS read.
- **Не рекомендую** — это тот же паттерн, который создал
  `add_tire_worker_earnings` breach.

#### Альтернатива C: переписать trigger logic в SECURITY DEFINER wrapper

Создать новую DEF wrapper `wrapper_update_loyalty_progress()` который
внутри делает role-switching через SET LOCAL ROLE ... — но это
излишне для нашего use-case.

### 3.4 Рекомендация (явно)

**Применяем Альтернативу A**:

- **НЕ переводить 3 trigger-fired функции на DEFINER**.
- **Phase 2.5** (REVOKE anon INSERT/UPDATE/DELETE) **уничтожает**
  единственный trigger-as-anon сценарий.
- Trigger path остаётся INVOKER, но т.к. anon UPDATE больше невозможен,
  trigger fires только под service_role (admin dispatcher) или под
  authenticated staff (через их staff policy).
- **Дополнительно**: миграция `022` явный **REVOKE EXECUTE FROM PUBLIC
  / anon / authenticated** на 3 функции — defensive, т.к. anon
  EXECUTE сейчас granted, и нельзя вызвать `.rpc('update_loyalty_progress')`
  напрямую (это trigger-only, но defense in depth).

### 3.5 REVOKE plan для миграции 022

```sql
-- 022_revoke_trigger_fired_functions_defense_in_depth.sql

-- 1. Verify current grants (для forensики)
-- has_function_privilege('PUBLIC', 'public.update_loyalty_progress(...)', 'EXECUTE') = true
-- has_function_privilege('anon', 'public.update_loyalty_progress(...)', 'EXECUTE') = true

-- 2. REVOKE EXECUTE FROM PUBLIC на 3 функции
REVOKE EXECUTE ON FUNCTION public.update_loyalty_progress() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_worksheet_entry_on_booking_ready() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_worksheet_entry_on_tire_booking_ready() FROM PUBLIC;

-- 3. REVOKE EXECUTE FROM anon (явно, не полагаясь на PUBLIC)
REVOKE EXECUTE ON FUNCTION public.update_loyalty_progress() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_worksheet_entry_on_booking_ready() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_worksheet_entry_on_tire_booking_ready() FROM anon;

-- 4. REVOKE EXECUTE FROM authenticated (явно)
REVOKE EXECUTE ON FUNCTION public.update_loyalty_progress() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_worksheet_entry_on_booking_ready() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_worksheet_entry_on_tire_booking_ready() FROM authenticated;

-- 5. GRANT EXECUTE TO service_role (для trigger path через admin dispatcher)
GRANT EXECUTE ON FUNCTION public.update_loyalty_progress() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_worksheet_entry_on_booking_ready() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_worksheet_entry_on_tire_booking_ready() TO service_role;

-- 6. Verify 4-step §20d: SET ROLE anon → попытка вызова должна быть permission_denied
-- (rpc call невозможен, т.к. functions не имеют in-args, но границы проверены)
```

### 3.6 Что НЕ открывает перевод на DEFINER (или НЕ перевод, наш случай)

Так как **не** переводим на DEFINER, нет рисков bypass RLS для
future-modified тел. **Текущее состояние INVOKER остаётся**:
- Функция работает от calling role (после Phase 2.5 — только
  service_role или authenticated staff).
- service_role bypass RLS (через superuser-эквивалент) — это OK,
  service_role доверен.
- staff authenticated видит всё через Path B policy — функция
  работает корректно.

---

## 4. Итоговый план Slice #3e — Phase A → F

### Phase A — admin-side ports

| Step | Что | Где | Verify |
|---|---|---|---|
| A1 | Add `list-clients` action в `api/staff.ts` | `api/staff.ts` + `lib/api/staff-actions.ts` + `lib/api/clients.ts` rewire | unit test |
| A2 | Add `list-clients-with-cars` action | same | unit test |
| A3 | Add `get-client-cars-by-client-id` action (admin override) | same | unit test |
| A4 | Frontend rewire: `App.tsx:282, 883, 919` `getClients()` → `listClientsAction()` | App.tsx | manual smoke admin |
| A5 | Frontend rewire: `ClientDatabaseAccordion.tsx:56` `getClientsWithCars()` → `listClientsWithCarsAction()` | ClientDatabaseAccordion | manual smoke |
| A6 | Frontend rewire: `BookingWizard.tsx:738, 1106, 1357`, `TireBookingWizard.tsx` (3 hits) `getClientCars(clientId)` → `getClientCarsByClientIdAction(clientId)` | both wizards | manual smoke |
| A7 | Optional cleanup: `lib/api/clients.ts` dead code (`findClientByPhone`, `linkClientToProfile`, `getClientByProfileId`, `getClientCarsByProfileId`, `deleteClientCar` уже unused, `createClient`, `updateClient` уже covered by dispatcher) | file cleanup | n/a |

### Phase B — client-side cancellation/loyalty ports

| Step | Что | Где | Verify |
|---|---|---|---|
| B1 | Add `get-my-cancellation-count` в `api/client.ts` | `api/client.ts` + `lib/api/client-actions.ts` | unit test |
| B2 | Add `get-my-block-status` в `api/client.ts` | same | unit test |
| B3 | Frontend rewire: `ActiveBookingCard.tsx:56` `getCancellationCountByProfileId(profileId, 30)` → `getMyCancellationCountAction()` | ActiveBookingCard | manual smoke client |
| B4 | Frontend rewire: `ClientTireBookingWrapper.tsx`, `OnlineBookingWizard.tsx` `isProfileBlockedForOnlineBooking(profileId)` → `getMyBlockStatusAction()` | both | manual smoke client |
| B5 | Frontend rewire: `lib/api/loyalty.ts` — все 4 anon reads → new dispatcher actions `get-my-loyalty-progress`, `get-my-free-wash-status`, `get-my-washes-until-next-free-wash` | `api/client.ts` + components | unit test |
| B6 | Frontend rewire: `MyGarage.tsx` (anon SELECT profiles+clients + UPDATE client_cars soft-delete) → use existing `delete-car` dispatcher for delete; for SELECT use new `get-my-profile`, `get-my-client` actions | MyGarage | manual smoke client |
| B7 | Frontend rewire: `BankSelectionStep.tsx` (anon SELECT clients.email) → new `get-my-client-email` action | BankSelectionStep | manual smoke |

### Phase C — REVOKE trigger-fired INVOKER functions (defensive)

| Step | Что |
|---|---|
| C1 | Migration `022_revoke_trigger_fired_functions_defense_in_depth.sql`: REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role на 3 функции |
| C2 | 4-step verify: SET ROLE anon + SELECT has_function_privilege = false |

### Phase D — Category C RLS migrations (8 файлов)

| # | File | Что |
|---|---|---|
| 023 | `023_category_c_clients_own_row_rls.sql` | DROP public_all_access, service_role_all_access; ADD client_select_own (USING `profile_id = (auth.jwt()->>'profile_id')::uuid`), client_insert_own, client_update_own (WITH CHECK то же); ADD staff_select_clients, staff_update_clients (Path B: `app_role IN ('admin','owner')`); ADD owner_delete_clients (только owner); ADD service_role_all_clients; REVOKE ALL FROM anon; GRANT SELECT TO authenticated |
| 024 | `024_category_c_client_cars_own_row_rls.sql` | DROP public + service_role; ADD client_select_own_cars (USING EXISTS subquery к clients.profile_id), client_insert_own_cars, client_update_own_cars, client_delete_own_cars; ADD staff_*_client_cars (Path B 4 policies); REVOKE ALL FROM anon; GRANT SELECT TO authenticated |
| 025 | `025_category_c_bookings_own_row_rls.sql` | DROP public + service_role; ADD client_select_own_bookings (USING `is_org = false AND client_id IS NOT NULL AND EXISTS subquery`), client_insert_own_bookings (server sets client_id from claims.profile_id), client_update_own_bookings (только cancelable fields, не status); ADD staff_*_bookings; REVOKE ALL FROM anon; GRANT SELECT TO authenticated |
| 026 | `026_category_c_tire_bookings_own_row_rls.sql` | same as bookings |
| 027 | `027_category_c_loyalty_own_row_rls.sql` | DROP public + service_role; ADD client_select_own_loyalty (USING EXISTS subquery); ADD staff_*_loyalty; REVOKE ALL FROM anon; GRANT SELECT TO authenticated; **НЕТ** client INSERT/UPDATE/DELETE — server-managed only |
| 028 | `028_category_c_booking_cancellations_own_row_rls.sql` | DROP public_all_access (нет service_role_all_access — Path B уже); ADD client_select_own_cancellations (USING EXISTS subquery); ADD staff_*_cancellations (Path B 4); REVOKE ALL FROM anon; GRANT SELECT TO authenticated |
| 029 | `029_views_security_invoker.sql` | `ALTER VIEW public.bookings_timeline SET (security_invoker = true);` ALTER VIEW public.tire_bookings_timeline SET (security_invoker = true); REVOKE SELECT ON both FROM anon, authenticated; GRANT SELECT TO service_role |

**Critical edge в D policies**:
- `clients.profile_id IS NULL` (3 unlinked): own-row сравнение NULL = UUID → false → невидимы. **OK** per Q1.
- `bookings.client_id IS NULL`: own-row requires `client_id IS NOT NULL` → невидимы. Staff sees. **OK**.
- `is_org = true` bookings: own-row `is_org = false` → невидимы. Staff sees. **OK** per Q2.
- Subquery perf: `idx_clients_profile_id` exists. <100k bookings OK.

### Phase E — tests (9 шт, добавляем E5b/E6b для Q1 + Q2 edge)

| # | Test |
|---|---|
| E1 | Two test_clients (A и B) — каждый видит только свои bookings. |
| E2 | test_client A создаёт booking — B не видит. |
| E3 | Staff sees all bookings. |
| E4 | test_client A INSERT пытается поставить client_id=B — INSERT policy deny. |
| E5 | cancel_own_booking: A отменяет свой, B ничего не меняется. |
| **E5b (NEW per Q1)** | client с profile_id=NULL невидим для admin через anon-key, видим через service_role. |
| **E6b (NEW per Q2)** | is_org=true booking: client (даже linked) не видит. Staff видит. |
| E7 | loyalty progress: 10 washes → free_wash_pending = true. |
| E8 | booking_cancellations: 3 cancels за 30 days → online_booking_blocked_until set. |
| E9 | views: bookings_timeline SELECT post-RLS — respects base RLS. |

### Phase F — browser smoke

- Login as demo_admin → видит всех клиентов, все bookings, все loyalty.
- Login as demo_owner → то же + может DELETE (rare).
- Login as test client → видит только свои.
- Anon (no token) → видит 0 из Category C.
- Trigger loyalty fires correctly при cancel/createOnlineBooking flow.

### Phase 2.5 (final, в этом же цикле per Q4)

`migrations/030_phase25_revoke_anon_category_c.sql`:
```sql
REVOKE ALL ON public.clients FROM anon;
REVOKE ALL ON public.client_cars FROM anon;
REVOKE ALL ON public.bookings FROM anon;
REVOKE ALL ON public.tire_bookings FROM anon;
REVOKE ALL ON public.loyalty_carwash_progress FROM anon;
REVOKE ALL ON public.booking_cancellations FROM anon;
-- payments уже закрыт в Phase 1
```

**Note**: `clients` anon SELECT после REVOKE ALL исчезает. Admin UI
**не должен** полагаться на anon read для clients — Phase A1/A2/A3
уже это покрывают. **Test**: после 030 admin UI должен работать.

---

## 5. Production carry-over notes (для будущего rollout)

| Item | Demo state | Prod state | Migration strategy |
|---|---|---|---|
| 022 trigger-fired functions REVOKE | to apply | **migration 012 NOT applied** — `add_tire_worker_earnings` ещё доступна | apply on prod после Slice #3e deploy |
| 023-029 RLS | to apply | 8 prod breach vectors ещё активны | apply after demo stable for 7 days |
| 030 Phase 2.5 | to apply | n/a | apply last |
| drivers still exist on prod (12) | n/a | real data | RLS filter `is_org = false` скроет их org-bookings от client. **Безопасно** для prod (org-bookings через staff UI) |
| 3 unlinked clients (profile_id=NULL) | demo | n/a | same — admin UI не сломается (Path B), client не сможет login |

---

## 6. Vercel function count invariant

- api/client.ts: +3 actions (B1, B2, B5) → **внутри dispatcher**, function count не меняется (12/12)
- api/staff.ts: +3 actions (A1, A2, A3) → **внутри dispatcher**, function count не меняется (12/12)
- ✓ Сохраняем invariant

---

## 7. Открытые риски (финальные)

| Risk | Mitigation |
|---|---|
| Subquery perf в policy на 100k+ bookings | Index `idx_clients_profile_id` уже есть. Если >100k — denormalize `cached_profile_id` колонка в bookings. Не сейчас. |
| 3 unlinked clients на demo + потенциально N на prod | Per Q1 — оставляем, staff видит через Path B. Если они попытаются login — не увидят свои bookings (acceptable). |
| bookings_timeline view + SECURITY INVOKER | PG15+ supports. Supabase PG15. Verify на demo что ALTER VIEW SET (security_invoker = true) компилируется. |
| `find_tire_booking_overlap` (SECURITY DEFINER, anon=X) | Уже закрыт в миграции 012. На prod — не применён (per entry 22). Per-overload apply после Slice #3e. |
| `cancel_own_*` — потенциальный bypass: клиент с org-booking может его отменить | Action item (НЕ блокирует Slice #3e): добавить `IF v_booking.is_org THEN RAISE 'cannot cancel org booking'` в cancel_own_booking + cancel_own_tire_booking. Делается отдельной миграцией `031_*.sql` после Slice #3e deploy. |
| Migration ordering — 022 перед 023, иначе тестирование триггеров после RLS даст ложные результаты | Plan строго: 022 → 023-029 → 030. Каждая миграция с regression test между ними. |

---

## 8. Action items вне Slice #3e (фиксирую, не делаю сейчас)

1. `031_harden_cancel_own_for_org.sql` — добавить `is_org = false` check в cancel_own_booking + cancel_own_tire_booking. Низкий приоритет (org-bookings редки, клиент-владелец org вряд ли есть).
2. Dead code cleanup в `lib/api/clients.ts` (5 функций без callers).
3. Phase 3 — public views для slots (`get_public_booking_slots` уже есть, см. §1.3 recon-slice-3e).

---

## 9. Что НЕ делаем

- Не трогаем prod (entry 22).
- Не переводим 3 trigger-fired INVOKER functions на DEFINER (per §3.4).
- Не трогаем RPC grants (cancel_own_*, find_tire_booking_overlap, atomic_create_* — уже закрыты).
- Не меняем Vercel function count.
- Не делаем deleteClientCar port (callsite уже удалён, Q5 resolved).