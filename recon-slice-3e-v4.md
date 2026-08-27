# Slice #3e / Category C — recon v4 (READ-ONLY)

> v4 вносит две **честные** корректировки по запросу владельца:
>
> 1. **Bypass proof переформулирован**: client JWT bypass **НЕ
>    существует** (RPC закрыт на anon+authenticated). То, что было
>    показано в v3 — это service-role dispatch path, не client
>    bypass. Guard остаётся обязательным как defense-in-depth и
>    read/write consistency, но формулировка "эмпирически подтверждён
>    client bypass" исправлена.
> 2. **`booking_cancellations` target matrix уточнён**: после Phase B
>    у неё **нет client-facing direct SELECT/Realtime**. Target =
>    `authenticated: none`, `anon: none`, `service_role: ALL`. Клиент
>    получает cancellation status через bookings.status, не через
>    audit table.
>
> Никаких SQL/policy/code изменений. Только recon + план.

---

## Корректировка 1: Honest bypass framing (v3 → v4)

### 1.1 Что v3 говорил неправильно

v3 написал:
> Эмпирически подтверждён client bypass: `cancel_own_booking` от
> service_role прошёл, status → 'ОТМЕНЕНО'.

**Это не client bypass** — это service-role path. Service_role имеет
bypass RLS и максимальные privileges. Моделирует dispatcher (api/client.ts:
supabaseAdmin), не браузер.

### 1.2 Честные факты (проверено 27.08.2026 на demo)

**RPC grants на `cancel_own_booking`** (literal `has_function_privilege`):

| Role | EXECUTE |
|---|---|
| anon | ✗ (закрыто в миграции 012) |
| authenticated | ✗ (закрыто в миграции 012) |
| service_role | ✓ |
| postgres | ✓ (owner) |

`proacl = {postgres=X/postgres, service_role=X/postgres}`

**Эмпирический тест** (SET ROLE authenticated + JWT claims
`{profile_id, app_role='client'}` + `cancel_own_booking(test_booking, profile_id)`):

```
NOTICE: --- SET ROLE authenticated with JWT claims
NOTICE: *** RESULT: cancel_own_booking REJECTED *** 
NOTICE: *** permission denied for function cancel_own_booking *** 
NOTICE: *** (SQLSTATE=42501) ***
NOTICE: *** status still = ОЖИДАЕТ ***
```

**Вывод**: client JWT **НЕ МОЖЕТ** вызвать `cancel_own_booking`.
Нет client-side bypass сегодня.

### 1.3 Что тогда bypass?

Service-role может вызвать RPC с любым `p_profile_id` (нет auth.uid()
проверки внутри RPC, потому что RPC видит только аргументы). Это
**insider/dispatcher trust assumption**:

- Production dispatcher `api/client.ts:439-442`:
  ```
  await supabaseAdmin.rpc('cancel_own_booking', {
    p_booking_id: booking_id,
    p_profile_id: claims.profile_id,  // ← из JWT, не из body
  });
  ```
  ✓ Берёт profile_id из JWT, **не из request body**. Нет exploit path
  через dispatcher today.

- Future risk: если кто-то добавит endpoint, который берёт
  `p_profile_id` из query/body без JWT-check, можно подставить чужой
  profile_id. Это **insider** или **dispatcher bug** risk, не
  remote attacker.

### 1.4 Зачем guard всё равно обязателен

Даже **без** client bypass сегодня guard нужен по 4 причинам:

1. **Read/write consistency** (главное): own-row SELECT policy для
   client скроет `is_org=true` bookings. Если RPC не имеет
   зеркального guard, **read и write дают разный ответ** на один
   и тот же booking. Violates Category C invariant.

2. **Defense-in-depth** против future dispatcher bugs: если в новом
   endpoint'е кто-то подставит `p_profile_id` из body, guard отклонит
   cancel до того как booking mutated.

3. **Future-proofing** против расширения: если schema добавит ещё
   поля ownership (например, organization_role) — guard становится
   первой точкой защиты.

4. **Audit signal**: при попытке отменить org booking — логируется
   EXCEPTION с ERRCODE `P0001` (наш кастомный). Даёт monitoring
   signal "попытка клиента отменить org booking" = potential bug.

### 1.5 Переформулированный bypass framing

**OLD (v3, некорректно)**:
> Эмпирически подтверждён client bypass: cancel RPC от service_role
> прошёл.

**NEW (v4, корректно)**:
> Service-role path (dispatches через api/client.ts) принимает
> `p_profile_id` без auth.uid() check и отменяет is_org=true booking
> если `p_profile_id` совпадает с clients.profile_id через booking
> client_id. Сегодня api/client.ts берёт profile_id из JWT claims
> (не body), поэтому production exploit path отсутствует. **Guard
> обязателен как defense-in-depth и read/write consistency**, не как
> закрытие реального client bypass.
>
> Client JWT bypass **НЕ подтверждён** — authenticated role получает
> SQLSTATE 42501 (permission denied for function) при попытке вызвать
> RPC напрямую.

---

## Корректировка 2: `booking_cancellations` target matrix

### 2.1 AST-aware audit (literal grep)

**Browser-side direct reads** (`lib/api/booking-cancellations.ts` —
anon-key, удаляется в Phase B):

| File:Line | Op | Table |
|---|---|---|
| `lib/api/booking-cancellations.ts:25` | INSERT | booking_cancellations |
| `lib/api/booking-cancellations.ts:51` | SELECT (count) | booking_cancellations |
| `lib/api/booking-cancellations.ts:137, 155` | UPDATE | clients (block unblock) |
| `lib/api/booking-cancellations.ts:71, 88, 113, 138, 154` | SELECT | clients |

**Server-side references** (все уже dispatcher-ized или RPC):

| File:Line | Op | Path |
|---|---|---|
| `api/client.ts:457` | comment | "caller observes existing row" (cancel_own_booking RPC) |
| `api/client.ts:830` | comment | "23505 unique_violation" |
| `api/client.ts:439` | rpc call | cancel_own_booking (service_role bypass) |
| `api/client.ts:813` | rpc call | cancel_own_tire_booking (service_role bypass) |

**Realtime subscriptions на `booking_cancellations`**: **0 hits** (verified:
`grep -rE "table:\s*['\"]booking_cancellations['\"]"` — пусто).

### 2.2 Что даёт клиентский UI сейчас vs после Phase B

**Сейчас** (Phase A не начата):
- `components/client/ActiveBookingCard.tsx:56` —
  `getCancellationCountByProfileId(profileId, 30)` для отображения
  "У вас было 2 отмены за 30 дней".
- `components/client/ClientTireBookingWrapper.tsx` —
  `isProfileBlockedForOnlineBooking(profileId)`.
- `components/client/OnlineBookingWizard.tsx:132` —
  `isProfileBlockedForOnlineBooking(profileId)`.

Все три **читают `clients.online_booking_blocked_until` через
`lib/api/booking-cancellations.ts`**, не саму таблицу
`booking_cancellations`. Direct reads таблицы — это `getClientCancellationCount`
для счётчика отмен.

**После Phase B**:
- 3 anon browser reads → 2 новых dispatcher actions
  (`get-my-cancellation-count`, `get-my-block-status`).
- `lib/api/booking-cancellations.ts` → deprecated / dead.
- 0 browser-side reads на `booking_cancellations` после deploy Phase B.

### 2.3 Target grant matrix (revised)

После Phase A+B, **до** 028 RLS migration, `booking_cancellations`
уже имеет правильные grants (из Slice #3d migration 020):

| Role | S | I | U | D |
|---|---|---|---|---|
| anon | ✗ | ✗ | ✗ | ✗ |
| authenticated | ✓ | ✗ | ✗ | ✗ |
| service_role | ✓ | ✓ | ✓ | ✓ |

Это работает для staff Path B policies (admin/owner видят все
cancellations).

**После Phase A+B** authenticated client имеет `SELECT` grant, но
**никто не использует** его (browser reads убраны в Phase B).
Grant висит как legacy — **defensive surface**.

### 2.4 Решение: убрать authenticated SELECT

Так как **нет ни одного callsite** для browser client reads
`booking_cancellations` после Phase B, и **нет Realtime subscription** —
`authenticated SELECT` grant — unnecessary surface. Убираем в
migration 028.

**Новый target matrix для `booking_cancellations`**:

| Role | S | I | U | D |
|---|---|---|---|---|
| anon | ✗ (уже) | ✗ (уже) | ✗ (уже) | ✗ (уже) |
| **authenticated** | **✗** | ✗ | ✗ | ✗ |
| service_role | ✓ | ✓ | ✓ | ✓ |

**Note**: `auth_logs`, `audit`-style tables если появятся в будущем,
должны следовать тому же паттерну (`anon:none, auth:none, svc:ALL`).

### 2.5 Изменения в migration 028

```sql
-- 028_category_c_booking_cancellations_own_row_rls.sql
-- (revised — DROP authenticated SELECT grant)

-- ... (existing: DROP public_all_access, ADD Path B policies, 
-- ADD own-row via subquery для возможных future client reads, 
-- ADD service_role_all_cancellations) ...

-- NEW: REVOKE SELECT FROM authenticated (no callers after Phase B)
REVOKE SELECT ON public.booking_cancellations FROM authenticated;

-- Verify: no client reads after Phase B + this REVOKE
-- (has_table_privilege('authenticated', 'public.booking_cancellations', 'SELECT') = false)
```

### 2.6 Обновлённая full target grant matrix (для migration 030)

| Table | anon | authenticated | service_role |
|---|---|---|---|
| **clients** | none | SELECT | ALL |
| **client_cars** | none | SELECT | ALL |
| **bookings** | none | SELECT | ALL |
| **tire_bookings** | none | SELECT | ALL |
| **loyalty_carwash_progress** | none | SELECT | ALL |
| **booking_cancellations** | none | **none** (revised) | ALL |

---

## Обновлённый Phase sequence (финальный)

```
Phase A — admin-side ports (api/staff.ts + frontend rewires)
  A1: list-clients
  A2: list-clients-with-cars
  A3: get-client-cars-by-client-id
  A4-A6: frontend rewires (App.tsx, ClientDatabaseAccordion, BookingWizard, TireBookingWizard)
  A7: optional dead code cleanup (lib/api/clients.ts: findClientByPhone, linkClientToProfile, getClientByProfileId, getClientCarsByProfileId — 4 unused functions)

Phase B — client-side cancellation/loyalty ports (api/client.ts + frontend rewires)
  B1: get-my-cancellation-count
  B2: get-my-block-status
  B3: frontend rewire ActiveBookingCard
  B4: frontend rewires ClientTireBookingWrapper + OnlineBookingWizard
  B5: loyalty actions (get-my-loyalty-progress, get-my-free-wash-status, get-my-washes-until-next-free-wash)
  B6: MyGarage.tsx rewires (use existing delete-car dispatcher + new get-my-profile/get-my-client)
  B7: BankSelectionStep.tsx (get-my-client-email)
  B-cleanup: deprecate lib/api/booking-cancellations.ts, lib/api/loyalty.ts browser-side reads
             (move to lib/api/client-actions.ts as dispatcher wrappers)

Phase C — combined migrations
  022: REVOKE trigger-fired INVOKER functions (defense-in-depth)
  022b: cancel_own_org_guard — is_org=false check (defense-in-depth + read/write consistency)

Phase D — RLS migrations
  023: clients own-row RLS
  024: client_cars own-row RLS
  025: bookings own-row RLS (is_org=false in policy)
  026: tire_bookings own-row RLS (is_org=false in policy)
  027: loyalty_carwash_progress own-row RLS
  028: booking_cancellations own-row RLS + REVOKE SELECT FROM authenticated (revised per §2.5)
  029: views SECURITY INVOKER + REVOKE anon

Phase E — tests (12 шт)
  E1:  two clients see only own bookings
  E2:  client A createBooking — B doesn't see
  E3:  staff sees all
  E4:  client A tries INSERT booking with client_id=B — INSERT policy deny
  E5:  cancel_own_booking: A cancels own — B unchanged
  E5b: client with profile_id=NULL not visible to anon (per Q1)
  E6b: is_org=true booking with linked client_id — NOT visible to that client (per Q2)
  E7:  loyalty progress 10 washes → free_wash_pending = true
  E8:  3 cancels за 30 days → online_booking_blocked_until set
  E9:  bookings_timeline view SELECT post-RLS — respects base RLS
  E-CANCEL-ORG: is_org=true booking + cancel RPC → REJECTED with P0001 'ORG_BOOKING_NOT_CLIENT_CANCELLABLE'
  E-NOREAD-CANCEL: client JWT пытается вызвать cancel_own_booking напрямую → SQLSTATE 42501 (документируем что bypass RPC закрыт grants)

Phase F — browser smoke
  - admin UI (demo_admin): list of clients, list with cars, edit, cancel bookings
  - owner UI (demo_owner): same + can delete
  - client UI (test client): sees only own bookings/cars/cancellations
  - anon: 0 access to Category C

Phase 2.5 — migration 030 explicit grants
  - REVOKE ALL FROM PUBLIC + anon on 5 tables
  - REVOKE write FROM authenticated on 5 tables
  - GRANT SELECT TO authenticated on 5 tables (clients, client_cars, bookings, tire_bookings, loyalty)
  - GRANT ALL TO service_role on 5 tables
  - booking_cancellations: REVOKE SELECT FROM authenticated + REVOKE ALL FROM anon (already), GRANT ALL TO service_role
  - 4-step §20d verify per table
```

---

## Сравнение v3 → v4

| Item | v3 | v4 |
|---|---|---|
| Bypass proof | "client bypass эмпирически подтверждён" (incorrect) | "service-role path bypass подтверждён; client JWT bypass не существует (SQLSTATE 42501)" (honest) |
| Guard justification | "закрывает bypass" | "defense-in-depth + read/write consistency + future dispatcher bugs + audit signal" (4 reasons) |
| `booking_cancellations` grant | authenticated: SELECT | **authenticated: none** (no callers after Phase B, no Realtime) |
| Migration 028 SQL | grants unchanged | **REVOKE SELECT FROM authenticated** explicitly |
| Phase E tests | 11 | **12** (added E-NOREAD-CANCEL documenting RPC grant status) |
| Risks | 7 | 8 (added dispatcher code-review invariant) |

---

## Risks (финальные, 8 шт)

| Risk | Mitigation |
|---|---|
| 022b cancel guard ломает существующий test cluster | test cluster проверяет реальные bookings (status='ОЖИДАЕТ', is_org=false) — **pass**. E-CANCEL-ORG test новый. |
| 025/026 INSERT WITH CHECK ломает admin dispatcher | admin dispatcher = service_role bypasses. ✓ |
| 027 loyalty без client INSERT ломает edge | audit 0 direct writes. Trigger path = service_role. ✓ |
| 029 SECURITY INVOKER view требует PG15+ | Supabase PG15 (verified). ✓ |
| 030 REVOKE ALL FROM PUBLIC ломает другие роли | только anon/auth/svc на этих таблицах. Verify через pg_roles before applying. |
| Realtime WS auth требует SELECT grant | 030 GRANT SELECT TO authenticated. ✓ |
| Future dispatcher accidentally uses `supabase` (not supabaseAdmin) — fail loud | ✓ desired behavior |
| **Dispatcher code bug**: future endpoint берёт `p_profile_id` из body без JWT-check → bypass | **022b cancel guard** ловит этот случай до того как booking mutated. Дополнительно: code-review invariant — все новые RPC dispatchers должны принимать `p_profile_id` ТОЛЬКО из `claims.profile_id` (= JWT). Не из body, не из query. Документирую как Phase A note. |

---

## Code-review invariant (новый, фиксирую для Phase A)

**Для всех будущих RPC dispatchers в api/client.ts и api/staff.ts**:

```ts
// CORRECT pattern (production today):
await supabaseAdmin.rpc('cancel_own_booking', {
  p_booking_id: body.booking_id,           // user-supplied UUID
  p_profile_id: claims.profile_id,        // ← from JWT, NEVER from body/query
});

// WRONG pattern (must not appear):
await supabaseAdmin.rpc('cancel_own_booking', {
  p_booking_id: body.booking_id,
  p_profile_id: body.profile_id,           // ← from body — bypass risk
});
```

Документирую как invariant в `api/_lib/CLAUDE.md` или
`PROJECT_STATE.md` entry 24 (фиксируется после Phase A demo).

---

## Что НЕ делаем (повтор для clarity)

- Не трогаем prod (entry 22).
- Не переводим 3 trigger-fired INVOKER functions на DEFINER (per §3.4 recon-slice-3e-v2).
- Не трогаем RPC grants других функций (cancel/find_overlap/atomic_create — уже закрыты).
- Не даём authenticated SELECT на `booking_cancellations` (revised target matrix).
- Не даём authenticated INSERT/UPDATE/DELETE на любые Category C таблицы.
- Не делаем blanket `REVOKE ALL FROM PUBLIC` без explicit per-table follow-up GRANT'а.
- Не делаем deleteClientCar port (callsite уже удалён, Q5 resolved v2).
- **Не утверждаем "client bypass"** в этой документации без нового proof с реальным client JWT bypass (которого нет).

---

## Готовность к Phase A

После подтверждения владельцем v4:

1. **Phase A**: 3 admin actions + 6 frontend rewires + optional dead code cleanup
2. **Phase B**: 7 client-side ports + 6 frontend rewires + deprecated file cleanup
3. **Phase C**: migrations 022 + 022b на demo + verify
4. **Phase D**: migrations 023-029 на demo (каждая с regression test)
5. **Phase E**: 12 тестов включая E-CANCEL-ORG и E-NOREAD-CANCEL + verify
6. **Phase F**: browser smoke admin/owner/client/anon + dispatcher code-review invariant check
7. **Phase 2.5 (030 explicit)**: на demo + verify

Prod — только read-only, ничего не применяем до отдельного coordinated rollout после 7-day demo stability.

---

## Открытые вопросы закрыты

| # | Q | Status |
|---|---|---|
| Q1 | 3 unlinked clients | resolved v2 — оставляем, own-row скроет, staff видит через Path B |
| Q2 | org-driver booking видимость для client | resolved v2 — driver не имеет JWT, own-row policy `is_org=false` |
| Q3 | DEFINER migration для trigger-fired functions | resolved v2 — НЕ переводим, REVOKE EXECUTE defense-in-depth |
| Q4 | Phase 2.5 в этом же цикле | resolved v2 — да, migration 030 |
| Q5 | deleteClientCar port | resolved v2 — callsite уже удалён, ничего не делаем |
| Q6 (new v4) | Bypass proof framing | **resolved v4** — честно: client bypass не существует, guard = defense-in-depth |
| Q7 (new v4) | booking_cancellations authenticated grant | **resolved v4** — нет callers после Phase B, REVOKE SELECT |