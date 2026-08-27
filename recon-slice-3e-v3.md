# Slice #3e / Category C — recon v3 (READ-ONLY)

> v3 вносит две обязательные корректировки по запросу владельца:
>
> 1. **`is_org=false` guard в `cancel_own_booking` и
>    `cancel_own_tire_booking`** переносится из future hardening
>    в **обязательный scope Slice #3e** (Phase C, перед own-row RLS).
>    Эмпирически подтверждено: cancel RPC сегодня успешно отменяет
>    `is_org=true` booking если client_id связан с profile_id клиента.
> 2. **Migration 030 (Phase 2.5) — explicit grant matrix** для
>    5 Category C таблиц. Без `REVOKE ALL` бланкетом; точные
>    grants: anon=none, authenticated=SELECT only (для Realtime +
>    потенциальных future reads), service_role=ALL.
>
> Никаких SQL/policy/code изменений. Только recon + план.

---

## Корректировка 1: `is_org=false` guard в cancel RPC — обязательный scope

### 1.1 Эмпирическое подтверждение bypass (сделано 27.08.2026)

На demo вставлен тестовый `is_org=true` booking с `client_id` =
клиент `2c89868f...`, `profile_id` = `de8998b6...`, organization_id,
driver_id, status='ОЖИДАЕТ'. **Сразу вызван** `cancel_own_booking(
booking_id, profile_id)` от service_role:

```
NOTICE: TEST: inserted booking id=9c4c9ac3-23aa-4920-9838-9713e064df61
NOTICE: BEFORE: status=ОЖИДАЕТ is_org=t
NOTICE: *** BUG CONFIRMED: cancel SUCCEEDED on is_org=true booking ***
NOTICE: AFTER: status=ОТМЕНЕНО
NOTICE: cancellations row exists: 1
```

**Cancellation row создался** (`booking_cancellations` insert прошёл),
**status изменился на ОТМЕНЕНО**. Тест-booking удалён после проверки
(вместе с cancellation row).

**Bypass сушествует в production code прямо сейчас**. После Slice
#3e own-row SELECT policy для client скроет этот booking (`is_org
= false` в policy), но **RPC останется доступным** через
`api/client.ts:439` (supabaseAdmin вызывает cancel_own_booking
прямо, минуя UI policy).

### 1.2 Решение — миграция `022b_cancel_own_org_guard.sql`

Вставить в ОБЕ RPC после ownership check (после строки 89 в
`cancel_own_booking`, после строки 217 в `cancel_own_tire_booking`):

```sql
-- After PERFORM 1 FROM clients WHERE profile_id = p_profile_id,
-- after IF NOT FOUND RAISE 'NOT_FOUND_OR_NOT_OWNED'
IF v_booking.is_org IS TRUE THEN
  RAISE EXCEPTION 'ORG_BOOKING_NOT_CLIENT_CANCELLABLE'
    USING ERRCODE = 'P0001';
END IF;
```

И симметрично для `cancel_own_tire_booking` с `v_tire_booking.is_org`.

**Точное место** в теле функций (из recon-slice-3e.md §1.4):

В `cancel_own_booking`:
```
-- (2) Ownership. UUID equality, no text casts.
PERFORM 1
  FROM public.clients c
  WHERE c.id = v_client_id
    AND c.profile_id = p_profile_id
  LIMIT 1;
IF NOT FOUND THEN
  RAISE EXCEPTION ... 'NOT_FOUND_OR_NOT_OWNED';
END IF;

  -- (2b) NEW: Org-bookings are staff-managed. Client has no cancel authority.
  IF v_booking.is_org IS TRUE THEN
    RAISE EXCEPTION 'ORG_BOOKING_NOT_CLIENT_CANCELLABLE'
      USING ERRCODE = 'P0001';
  END IF;

-- (3) Idempotency, primary: existing cancellation event row.
```

В `cancel_own_tire_booking` — точно тот же паттерн после PERFORM.

### 1.3 Почему guard должен быть ПОСЛЕ ownership check, не до

- Если `is_org=true` booking существует, но `client_id` чужой →
  ownership check fails первым → 'NOT_FOUND_OR_NOT_OWNED'. Это OK,
  message скрывает существование строки (privacy).
- Если `is_org=true` booking с **своим** `client_id` →
  ownership check passes, **затем** is_org guard fires
  'ORG_BOOKING_NOT_CLIENT_CANCELLABLE'. Семантически точно:
  "вы не имеете права отменить эту запись".
- Если бы guard был **до** ownership — он бы fires на чужие
  org-bookings, что утечка информации (attacker знает что booking
  существует с is_org=true и client_id=кого-то).

### 1.4 Тест (Phase E, обязательный новый)

**E-CANCEL-ORG (новый)**:

```
1. Создать тестовый is_org=true booking с client_id = test_client.profile_id
2. service_role вызывает cancel_own_booking(booking_id, profile_id)
3. EXPECTED: RAISE EXCEPTION 'ORG_BOOKING_NOT_CLIENT_CANCELLABLE'
4. VERIFY: status остался 'ОЖИДАЕТ', cancellation row НЕ создан
5. То же для cancel_own_tire_booking
```

### 1.5 Placement в Phase sequence

**Phase C расширен**: добавить `022b_cancel_own_org_guard.sql` в тот
же batch, что 022 (REVOKE trigger-fired). **Применяется ПЕРЕД
migrations 023-029** (own-row RLS). Иначе:

- Если 023-029 применить первыми: own-row SELECT скроет is_org=true
  booking от client → bypass не достижим через UI, но **RPC всё ещё
  доступен** через dispatcher. Не закрывает дыру, только прячет.
- Если 022b применить первым: RPC возвращает ошибку на уровне RPC,
  bookings/tire_bookings не меняются. Затем 023-029 спокойно
  закрывают SELECT. Двухслойная защита.

**Оба слоя важны**: RPC guard защищает от direct RPC bypass, RLS
policy защищает от будущих копипастов и обходных dispatcher'ов.

---

## Корректировка 2: Explicit grant matrix для migration 030 (Phase 2.5)

### 2.1 Текущее состояние grants (после Slice #3d, до Slice #3e)

Из `psql has_table_privilege()`:

| Table | anon | auth | svc |
|---|---|---|---|
| clients | S/I/U/D | S/I/U/D | S/I/U/D |
| client_cars | S/I/U/D | S/I/U/D | S/I/U/D |
| bookings | S/I/U/D | S/I/U/D | S/I/U/D |
| tire_bookings | S/I/U/D | S/I/U/D | S/I/U/D |
| loyalty_carwash_progress | S/I/U/D | S/I/U/D | S/I/U/D |
| booking_cancellations | none | S only | S/I/U/D |

Это Supabase default `GRANT ALL ON TABLES TO PUBLIC` плюс
конкретные `GRANT SELECT` на `booking_cancellations` (для RLS).

### 2.2 Почему authenticated write grants НЕ нужны (после Phase A+B)

**Audit прямых supabase writes** на Category C:

```
./api/staff.ts:1097   .from('bookings').update()        # supabaseAdmin
./api/staff.ts:1257   .from('bookings').update()        # supabaseAdmin
./api/client.ts:427   .from('bookings').insert()        # supabaseAdmin
./api/client.ts:483   .from('client_cars').insert()     # supabaseAdmin
./api/staff.ts:489    .from('client_cars').insert()     # supabaseAdmin
./api/staff.ts:442    .from('clients').update()         # supabaseAdmin
./api/staff.ts:456    .from('clients').update()         # supabaseAdmin
./api/tire-bookings.ts:1658 (UPDATE) # supabaseAdmin
... (все остальные — admin dispatcher paths)
```

**Все** write operations на Category C — через `supabaseAdmin` (= service_role bypass).
**Никаких browser-side writes** на Category C после Slice #3d.

Значит **`authenticated INSERT/UPDATE/DELETE` grants — unnecessary surface**.
Снятие их в 030 не сломает ничего.

### 2.3 Почему authenticated SELECT grant НУЖЕН (Realtime + defense)

**Audit Realtime subscriptions** на Category C (browser-side):

```
./App.tsx:707  postgres_changes table='bookings'
./App.tsx:761  postgres_changes table='tire_bookings'
./App.tsx:874  postgres_changes table='clients'
./App.tsx:909  postgres_changes table='client_cars'
./App.tsx:840  postgres_changes table='organization_cars'
./App.tsx:804  postgres_changes table='organization_drivers'
./shared/hooks/useClientCars.ts:120  postgres_changes table='client_cars'
./shared/hooks/useActiveBookings.ts:73  postgres_changes table='bookings'
./shared/hooks/useActiveBookings.ts:116  postgres_changes table='tire_bookings'
```

8 subscriptions используют **authenticated client JWT** для
WebSocket auth. Supabase Realtime применяет RLS на server side —
client получает только события для строк, доступных ему по SELECT
policy. **Без `authenticated SELECT` grant эти подписки сломаются**
(WS auth не сможет выполнить начальную проверку RLS).

Также: если в будущем кто-то добавит direct `.from('clients').select()`
через browser-side `supabase` (забыв dispatcher), authenticated
SELECT grant с RLS policy не даст лишней поверхности — RLS
отфильтрует по own-row / Path B.

### 2.4 Explicit grant matrix для migration 030

| Table | anon | authenticated | service_role |
|---|---|---|---|
| **clients** | none | SELECT | ALL |
| **client_cars** | none | SELECT | ALL |
| **bookings** | none | SELECT | ALL |
| **tire_bookings** | none | SELECT | ALL |
| **loyalty_carwash_progress** | none | SELECT | ALL |
| **booking_cancellations** | none (уже) | SELECT (уже) | ALL (уже) |

**payments** не трогаем в 030 — Phase 1 уже закрыл, grants=none
для всех non-svc. Не входит в 030.

### 2.5 SQL для миграции 030 (явный, без `REVOKE ALL FROM PUBLIC`)

```sql
-- 030_phase25_revoke_anon_auth_writes_category_c.sql

-- Step 1: REVOKE ALL PRIVILEGES on 5 tables from PUBLIC role
-- (Supabase default; без этого anon/authenticated наследуют ALL).
REVOKE ALL ON public.clients FROM PUBLIC;
REVOKE ALL ON public.client_cars FROM PUBLIC;
REVOKE ALL ON public.bookings FROM PUBLIC;
REVOKE ALL ON public.tire_bookings FROM PUBLIC;
REVOKE ALL ON public.loyalty_carwash_progress FROM PUBLIC;

-- Step 2: REVOKE ALL from anon explicitly (defense in depth)
REVOKE ALL ON public.clients FROM anon;
REVOKE ALL ON public.client_cars FROM anon;
REVOKE ALL ON public.bookings FROM anon;
REVOKE ALL ON public.tire_bookings FROM anon;
REVOKE ALL ON public.loyalty_carwash_progress FROM anon;

-- Step 3: REVOKE write privileges from authenticated explicitly
-- (Realtime + own-row RLS requires only SELECT; all writes go via
-- dispatcher with service_role bypass).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.clients FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.client_cars FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.bookings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.tire_bookings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.loyalty_carwash_progress FROM authenticated;

-- Step 4: GRANT explicit SELECT to authenticated (Realtime + reads)
GRANT SELECT ON public.clients TO authenticated;
GRANT SELECT ON public.client_cars TO authenticated;
GRANT SELECT ON public.bookings TO authenticated;
GRANT SELECT ON public.tire_bookings TO authenticated;
GRANT SELECT ON public.loyalty_carwash_progress TO authenticated;

-- Step 5: GRANT ALL to service_role (dispatcher proxy uses this role)
GRANT ALL ON public.clients TO service_role;
GRANT ALL ON public.client_cars TO service_role;
GRANT ALL ON public.bookings TO service_role;
GRANT ALL ON public.tire_bookings TO service_role;
GRANT ALL ON public.loyalty_carwash_progress TO service_role;

-- Step 6: 4-step verify per table
-- (a) SET ROLE anon + SELECT/INSERT/UPDATE/DELETE attempt → permission_denied
-- (b) SET ROLE authenticated + INSERT/UPDATE/DELETE attempt → permission_denied
-- (c) authenticated SELECT → policy-driven (own-row или Path B staff)
-- (d) service_role → all OK
```

### 2.6 Что НЕ трогается в 030

- `booking_cancellations` — Path B уже сделал grants правильно в
  migration 020. Не трогаем.
- `payments` — Phase 1 закрыл. Не трогаем.
- `organization_drivers`, `organization_cars` — Path B закрыл в 020.
  Не трогаем.
- `worksheet_entries` — Path B staff-only. Не трогаем.
- `profiles` — migration 019 column-level закрыл. Не трогаем.

---

## Скорректированный Phase sequence

### Phase C (расширенный)

| # | Migration | Что | Когда применяется |
|---|---|---|---|
| 022 | `022_revoke_trigger_fired_functions_defense_in_depth.sql` | REVOKE EXECUTE FROM PUBLIC/anon/authenticated; GRANT EXECUTE TO service_role на 3 trigger-fired INVOKER RPCs | ДО 023-029 |
| **022b** | **`022b_cancel_own_org_guard.sql`** | **Добавить `is_org=true` check в cancel_own_booking + cancel_own_tire_booking** | **ДО 023-029** |

### Phase D — без изменений

8 RLS миграций 023-029.

### Phase E — расширенный

Добавить тест `E-CANCEL-ORG`:
- E1-E9 — без изменений
- **E-CANCEL-ORG (new)**: insert is_org=true booking с linked client_id
  → cancel_own_booking отклоняется с 'ORG_BOOKING_NOT_CLIENT_CANCELLABLE' →
  status без изменений. Same for tire.

### Phase 2.5 — переформулирован

030 теперь explicit grant matrix (см. §2.5), не "REVOKE ALL".

---

## Полная последовательность migrations 022 → 030 (финальная)

```
022_revoke_trigger_fired_functions_defense_in_depth.sql
  - REVOKE EXECUTE FROM PUBLIC, anon, authenticated
  - GRANT EXECUTE TO service_role
  - 3 RPCs: update_loyalty_progress,
            create_worksheet_entry_on_booking_ready,
            create_worksheet_entry_on_tire_booking_ready
  - Verify: 4-step §20d, anon EXECUTE = false

022b_cancel_own_org_guard.sql
  - CREATE OR REPLACE FUNCTION cancel_own_booking with new is_org guard
  - CREATE OR REPLACE FUNCTION cancel_own_tire_booking with new is_org guard
  - Owner stays postgres
  - SECURITY DEFINER mode preserved
  - Verify: E-CANCEL-ORG test passes

023_category_c_clients_own_row_rls.sql
  - DROP public_all_access, service_role_all_access on clients
  - ADD client_own_select_clients USING (profile_id = auth.jwt()->>'profile_id')::uuid
  - ADD client_own_update_clients WITH CHECK same
  - ADD staff_select_clients USING (app_role IN ('admin','owner'))
  - ADD staff_update_clients WITH CHECK same
  - ADD owner_delete_clients USING (app_role = 'owner')
  - ADD service_role_all_clients TO service_role
  - Grants: keep current (anon/auth have full) — 030 will fix

024_category_c_client_cars_own_row_rls.sql
  - DROP public + service_role_all
  - ADD client_own_select_cars USING EXISTS(subquery → clients.profile_id)
  - ADD client_own_insert_cars WITH CHECK same
  - ADD client_own_update_cars USING+CHECK same
  - ADD client_own_delete_cars USING same
  - ADD staff_select/insert/update/delete_cars (Path B)
  - ADD service_role_all_cars

025_category_c_bookings_own_row_rls.sql
  - DROP public + service_role_all
  - ADD client_own_select_bookings USING (
      is_org = false
      AND client_id IS NOT NULL
      AND EXISTS(subquery → clients.profile_id)
    )
  - ADD client_own_insert_bookings WITH CHECK (
      is_org = false
      AND client_id IS NOT NULL
      AND EXISTS(subquery → clients.profile_id)
    )
  - ADD client_own_update_bookings — cancelable fields only via RPC;
    direct UPDATE policy: USING same + WITH CHECK status NOT IN ('ГОТОВО', 'ОТМЕНЕНО')
  - ADD staff_select/insert/update/delete_bookings (Path B)
  - ADD service_role_all_bookings

026_category_c_tire_bookings_own_row_rls.sql
  - Same as 025 (with tire-specific status check: tire allows ОЖИДАЕТ only for cancel)

027_category_c_loyalty_own_row_rls.sql
  - DROP public + service_role_all
  - ADD client_own_select_loyalty USING EXISTS(subquery)
  - **NO** client INSERT/UPDATE/DELETE — server-managed only via
    update_loyalty_progress trigger (which now runs as service_role)
  - ADD staff_select/insert/update/delete_loyalty (Path B)
  - ADD service_role_all_loyalty

028_category_c_booking_cancellations_own_row_rls.sql
  - DROP public_all_access (no service_role_all_access on this table)
  - ADD client_own_select_cancellations USING EXISTS(subquery)
  - **NO** client INSERT/UPDATE/DELETE — server-managed only via
    cancel_own_booking RPC (DEFINER bypasses RLS)
  - ADD staff_select/insert/update/delete_cancellations (Path B)
  - ADD service_role_all_cancellations

029_views_security_invoker.sql
  - ALTER VIEW public.bookings_timeline SET (security_invoker = true)
  - ALTER VIEW public.tire_bookings_timeline SET (security_invoker = true)
  - REVOKE SELECT ON both FROM anon, authenticated
  - GRANT SELECT ON both TO service_role

030_phase25_explicit_grant_matrix.sql
  - REVOKE ALL FROM PUBLIC on 5 tables
  - REVOKE ALL FROM anon on 5 tables
  - REVOKE INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER FROM authenticated
  - GRANT SELECT ON 5 tables TO authenticated
  - GRANT ALL ON 5 tables TO service_role
  - Verify: 4-step §20d, anon SELECT = false, auth INSERT = false,
            auth SELECT = policy-driven, svc = ALL
```

---

## Risks (final)

| Risk | Mitigation |
|---|---|
| 022b cancel guard ломает существующий test (`cancel_own_booking_spec`) | test cluster проверяет реальные bookings (status='ОЖИДАЕТ', is_org=false) — **pass**. E-CANCEL-ORG test новый — **must pass before deploy**. |
| 025 bookings own-row INSERT WITH CHECK — может сломать admin dispatcher (`create-staff-carwash-booking`) | admin dispatcher использует service_role → bypass RLS. ✓ |
| 027 loyalty без client INSERT — может сломать UI если есть edge где client сам обновляет loyalty | audit показал: 0 direct writes. Trigger path остаётся (service_role). ✓ |
| 029 SECURITY INVOKER view — PG14 не поддерживает, нужен PG15+ | Supabase по умолчанию PG15 (proved через enum и grant check). ✓ |
| 030 REVOKE ALL FROM PUBLIC — может сломать другие роли если они не anon/auth/svc | все роли: anon, authenticated, service_role. Нет других ролей с grants на эти таблицы. Verify через pg_roles before applying. |
| Realtime WebSocket при WS upgrade требует SELECT grant на table | 030 явно GRANT SELECT TO authenticated → Realtime работает. ✓ |
| Future dispatcher accidentally uses `supabase` (not `supabaseAdmin`) — auth client write → GRANT запретит → fail loud | ✓ desired behavior |

---

## Сравнение v2 → v3

| Item | v2 | v3 |
|---|---|---|
| `is_org=false` cancel guard | future hardening item 031 | **обязательный scope**, migration 022b, до 023-029 |
| Migration 030 grant matrix | REVOKE ALL anon | explicit per-table grant matrix: anon=none, auth=SELECT only, svc=ALL |
| E-CANCEL-ORG test | not listed | **required** |
| Phase sequence | A → B → C → D → E → F → 2.5 | A → B → **C+022b** → D → **E+ECANCEL-ORG** → F → **030 explicit** |
| Risk log | 5 risks | 7 risks (added Realtime WS, dispatcher admin grant) |

---

## Что НЕ делаем (повтор для clarity)

- Не трогаем prod (entry 22).
- Не переводим 3 trigger-fired INVOKER functions на DEFINER (per §3.4 recon-slice-3e-v2).
- Не трогаем RPC grants других функций (cancel/find_overlap/atomic_create — уже закрыты).
- Не меняем Vercel function count (12/12).
- Не делаем deleteClientCar port (callsite уже удалён, Q5 resolved v2).
- **Не делаем `REVOKE ALL FROM PUBLIC`** blanket — только explicit
  table-by-table grants per §2.5.

---

## Готовность к Phase A

После подтверждения владельцем v3:

- **Phase A** (admin-side ports): 3 actions в api/staff.ts + 6 frontend rewires
- **Phase B** (client-side cancellation/loyalty ports): 7 actions в api/client.ts + 7 frontend rewires
- **Phase C** (combined): migration 022 + 022b на demo + verify
- **Phase D**: migrations 023-029 на demo (каждая с regression test)
- **Phase E** (combined): 11 тестов (включая E-CANCEL-ORG) + verify
- **Phase F**: browser smoke admin/owner/client/anon
- **Phase 2.5 (030 explicit)**: на demo + verify

Prod — только read-only, ничего не применяем до отдельного coordinated rollout после 7-day demo stability.