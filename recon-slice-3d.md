# Slice #3d — Phase 2 RLS Category B (staff dashboard reads) — RECON + PLAN

## Что такое Category B (из плана, line 616)

22 таблицы, читаемые staff dashboard (admin + owner через фронтенд):

```
bookings, bookings_timeline, workers, expenses, inventory_arrivals,
inventory_categories, inventory_items, inventory_operations, tire_workers,
tire_bookings_timeline, work_shifts, worksheet_entries, worksheets,
product_sales, document_numbers, daily_reports, booking_cancellations,
closed_boxes (запись), organizations, organization_cars, organization_drivers,
profiles (запись)
```

Из них **15 имеют прямые `.from('tablename').select()` callsite'ы** в admin/owner frontend. **7 — нет прямых reads**, только writes через dispatcher или derived/trigger tables.

---

## Текущее RLS состояние (verified через psql)

**Все 22 таблицы** имеют:
- Policy `public_all_access USING (true)` на `cmd=ALL` (anon + authenticated могут всё)
- Policy `service_role_all_access USING (true)` (service_role bypass)
- GRANTs: anon+authenticated+service_role = full DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE

**Исключения** (уже закрыто в Phase 2):
- `bookings_timeline` (migration 014): только service_role, anon+authenticated REVOKEd
- `tire_bookings_timeline` ← **ANOMALY**: НЕ REVOKEd, anon видит 43 rows (security gap)

---

## Callsite inventory (per-table summary)

| Таблица | SELECT callsites | Realtime | В dispatcher (writes) | Назначение |
|---|---|---|---|---|
| bookings | 20 | 0 | YES (11 Slice #3b actions) | основная таблица заявок |
| bookings_timeline | 0 | 0 | NO | trigger-only (Category E ✓) |
| workers | 8 | 0 | partial (lookup) | staff roster carwash |
| tire_workers | 6 | 0 | partial (lookup) | staff roster tire |
| tire_bookings_timeline | 0 | 0 | NO | trigger-only ← **должна быть Category E** |
| expenses | 2 | 0 | NO | финансы |
| inventory_categories | 1 | 0 | NO | справочник |
| inventory_items | 2 | 0 | NO | склад |
| inventory_arrivals | 3 | 0 | NO | поступления |
| inventory_operations | 1 | 0 | NO | журнал операций |
| work_shifts | 2 | 0 | NO | смены |
| worksheet_entries | 3 | 0 | YES (deletes only) | путевые листы |
| worksheets | 0 | 0 | NO (только через worksheet_entries) | сводный |
| product_sales | 3 | 0 | NO | продажи товаров |
| document_numbers | 2 | 0 | NO | нумерация документов |
| daily_reports | 1 | 0 | NO | ежедневные отчёты |
| booking_cancellations | 1 | 0 | NO | лог отмен |
| closed_boxes | 1 | 0 | NO | боксы (anon SELECT нужен клиенту — Category D) |
| organizations | 7 | 0 | YES (writes) | юрлица |
| organization_cars | 4 | 0 | YES (writes) | машины юрлиц |
| organization_drivers | 5 | 0 | YES (writes) | водители юрлиц |
| profiles | 2 | 0 | NO (admin/owner читают через ChangePasswordWizard) | staff auth profile |

**Итого прямых SELECT reads: ~50 callsites** (это и есть "~50 callsites" из запроса).

**Realtime подписок на Category B — 0** (verified grep по admin/owner/feature paths).

---

## RPC inventory (staff frontend)

36 RPC callsites найдено. Из них **15 уже server-only** (dispatcher uses service_role, REVOKEd в Phase 2.0/2.1a). Из staff-direct (browser anon вызывает):

| RPC | Callsite | Caller | SECURITY | Slice #3d решение |
|---|---|---|---|---|
| `start_admin_shift` | lib/api/admins.ts:253 | browser anon | INVOKER | **REVOKE EXECUTE** + dispatcher proxy (как start-admin-shift в Slice #3c) |
| `start_worker_shift` | lib/api/workers.ts:523 | browser anon | INVOKER | **REVOKE EXECUTE** + dispatcher proxy |
| `start_tire_worker_shift` | lib/api/tire-workers.ts:411 | browser anon | INVOKER | **REVOKE EXECUTE** + dispatcher proxy |
| `add_tire_worker_earnings` | lib/api/tire-workers.ts:353 | browser anon | INVOKER | **REVOKE EXECUTE** (если ещё не) + dispatcher proxy |
| `add_worker_earnings` | api/_lib/earnings.ts:125 | browser anon | INVOKER | **уже REVOKEd в migration 015 (OD#11)** |
| `inventory_usage` | lib/api/product-sales.ts:207 | browser anon | ? | **investigate + REVOKE + proxy** |
| `inventory_restock` | lib/api/product-sales.ts:233 + lib/api/inventory.ts:158 | browser anon | ? | **investigate + REVOKE + proxy** |
| `add_inventory_category` | lib/api/inventory.ts:24 | browser anon | ? | **investigate + REVOKE + proxy** |
| `delete_inventory_category` | lib/api/inventory.ts:34 | browser anon | ? | **investigate + REVOKE + proxy** |
| `inventory_arrival` | lib/api/inventory.ts:122 | browser anon | ? | **investigate + REVOKE + proxy** |
| `get_next_document_number` | lib/api/document-numbers.ts:27 | browser anon | ? | **investigate + REVOKE + proxy** |
| `search_profile_by_phone` | lib/api/expenses.ts:386 | browser anon | ? | **уже REVOKEd в migration 012 (Phase 2.0)** |

Остальные 23 RPC — public/category D (services/tire_services/closed_boxes/etc) — не трогаем.

---

## Auth эксперимент (verified — как в Slice #3c)

```sql
-- anon (no JWT) → auth.jwt() returns {"role":"anon"}
-- staff JWT    → auth.jwt() returns {"role":"authenticated","app_role":"admin","profile_id":"<uuid>"}
-- staff JWT owner → app_role='owner'
```

**Path B (RLS-based filtering) валиден** для Category B reads — staff JWT корректно проставляет `auth.jwt()->>'app_role'` в PostgREST. Это значит: **НЕ нужно портить 50 callsites на dispatcher-proxy**. Достаточно RLS policies с фильтром `app_role IN ('admin','owner')`.

---

## ANOMALIES (recon findings — нужны pre-Slice #3d fixes)

### A1. `tire_bookings_timeline` — security gap (Category E missed)
- **Migration 014** REVOKEd `bookings_timeline` от anon+authenticated, но **забыл** `tire_bookings_timeline`
- Сейчас: anon SELECT возвращает 43 rows (включая client_name, phone, total_price)
- Таблица заполняется только через trigger `tire_bookings_table_changes_broadcast`, 0 frontend reads
- **Fix (cheap, no risk)**: добавить в отдельную миграцию `019_tire_bookings_timeline_revoke_anon.sql` — REVOKE ALL FROM anon, authenticated + новая RLS policy `service_role_all_access USING(true)` only (как bookings_timeline)

### A2. `closed_boxes` — split treatment needed
- Plan: Category D (anon SELECT only) + Category B WRITE (staff INSERT/UPDATE/DELETE)
- Сейчас: `public_all_access USING(true)` — anon может всё (но нет UI для этого, так что эксплуатация низкая)
- **Fix**: anon SELECT через `closed_boxes_read USING(true) TO anon,authenticated` + REVOKE INSERT/UPDATE/DELETE/TRUNCATE FROM anon + staff policy `staff_write_closed_boxes FOR INSERT/UPDATE/DELETE TO authenticated USING (app_role IN ('admin','owner')) WITH CHECK (app_role IN ('admin','owner'))`

### A3. `tire_service_days` — only anon SELECT, no writes
- Plan: Category D (anon SELECT only)
- Сейчас: `public_all_access USING(true)` — anon может INSERT/UPDATE/DELETE
- `lib/api/tire-service-days.ts` имеет `setTireServiceDayStatus` (admin write) — staff INSERT/UPDATE/DELETE policy needed
- **Fix**: anon SELECT policy + staff write policy

### A4. `profiles` — ChangePasswordWizard direct SELECT
- Plan: "запись" (write only for staff)
- Сейчас: `ChangePasswordWizard.tsx:272,283` делает прямой `.from('profiles').select('id, login')` для admin и owner
- **Fix**: добавить staff SELECT policy (или split: client sees own + staff sees all). В Slice #3e (Category C own-row) логичнее закрыть.

### A5. `worksheets` — 0 callsites (only via worksheet_entries)
- Не нужно policy для worksheets (derived/composite)
- Можно оставить `public_all_access` или REVOKE — но т.к. 0 callers, ничего не сломается. **Оставить как есть** для safety (no frontend, no risk).

---

## Path B design для 17 Category B таблиц

Все 17 используют один паттерн (подтверждено эмпирически):

```sql
-- DROP old
DROP POLICY IF EXISTS public_all_access ON public.<table>;
DROP POLICY IF EXISTS service_role_all_access ON public.<table>;
-- KEEP service_role working
CREATE POLICY service_role_all_access ON public.<table>
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- STAFF access
CREATE POLICY staff_select_<table> ON public.<table>
  FOR SELECT TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY staff_write_<table> ON public.<table>
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY staff_update_<table> ON public.<table>
  FOR UPDATE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'))
  WITH CHECK ((auth.jwt()->>'app_role') IN ('admin','owner'));

CREATE POLICY staff_delete_<table> ON public.<table>
  FOR DELETE TO authenticated
  USING ((auth.jwt()->>'app_role') IN ('admin','owner'));

-- REVOKE anon, restrict authenticated to SELECT only at GRANT level
REVOKE ALL ON public.<table> FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.<table> FROM authenticated;
GRANT SELECT ON public.<table> TO authenticated;
```

**Исключения из паттерна** (нужна отдельная per-table логика):

| Таблица | Особенность | Slice |
|---|---|---|
| bookings | + Category C client-own-row policy | #3e |
| expenses | has `creator:profiles!, updater:profiles!` join — profiles SELECT policy must be staff or this join breaks | #3d (нужна profiles policy одновременно) |
| profiles | ChangePasswordWizard reads; + staff SELECT policy | #3d + #3e |
| closed_boxes | split: anon SELECT + staff WRITE | #3d (A2) |
| tire_service_days | split: anon SELECT + staff WRITE | #3d (A3) |
| tire_bookings_timeline | Category E (server-only, 0 callers) | #3d (A1) |
| organizations / organization_cars / organization_drivers | dispatcher writes уже есть, но reads идут через browser | #3d (Path B для reads, dispatcher для writes — без конфликта) |

---

## Что НЕ ломается при enable

- **50 reads staff frontend** — продолжают работать через wrappedFetch (anon JWT → staff JWT через `injectAuth` в `_supabase-wrapper.ts`, Slice #3c уже подтвердил). После enable RLS фильтрует через `app_role`.
- **Dispatcher writes** — используют `supabaseAdmin` (service_role) → bypass RLS.
- **Triggers** — работают под postgres role, не затрагиваются.

**Что МОЖЕТ сломаться** (нужно проверить):

1. `lib/api/bookings.ts` функции с `created_by_profile_id` filter — это для client (Category C), не Category B. После #3d они продолжат работать (anon → 0 rows из-за `auth.jwt()->>'app_role'='client'` не подпадает под staff policy; client sees own = Slice #3e).
2. `lib/api/expenses.ts` has `creator:profiles!, updater:profiles!` join — **if profiles RLS becomes restrictive and staff policy isn't applied yet, this join fails**. Mitigation: добавить profiles staff SELECT в той же миграции что и expenses.
3. `lib/api/workers.ts` функции могут вызываться из **client** для отображения "какой работник обслуживает" (например, в ClientBookingWrapper) — но recon не нашёл таких callsites. Если найдутся в Slice #3e — нужно будет отдельное client-read policy.

---

## Зависимости (что блокирует что)

```
Slice #3d prep (миграция 019):
  - A1: tire_bookings_timeline REVOKE ← cheap, no callers
  - A2: closed_boxes split (anon SELECT + staff WRITE)
  - A3: tire_service_days split (anon SELECT + staff WRITE)

Slice #3d main (миграция 020):
  - 17 Category B tables: Path B staff policies
  - profiles: staff SELECT (для ChangePasswordWizard + expenses join)

Slice #3d staff-shifts RPCs (миграция 021):
  - REVOKE EXECUTE on start_worker_shift, start_tire_worker_shift
  - REVOKE EXECUTE on start_admin_shift (уже в 017 — verify)
  - REVOKE EXECUTE on add_tire_worker_earnings (если ещё не)
  - INVESTIGATE: inventory_usage, inventory_restock, add/delete_inventory_category, inventory_arrival, get_next_document_number
  - Dispatcher proxy actions для каждого (если нужны — отдельные actions в api/staff.ts)

Slice #3e (Category C own-row): blocked until Slice #3d done.
Phase 2.5 (REVOKE clients INSERT/UPDATE): blocked until Phase 1.5 link-client-profile в проде.
Phase 3 (public views для slots): blocked until Slice #3d done.
```

---

## Test cluster plan (3 числа + Slice #3d = 4-й)

Существующий кластер: **133 PASS / 0 FAIL** (80 baseline + 31 admin-rejection + 21 owner-path + 1 PRE auth). Все они продолжат работать после #3d потому что:
- service_role write paths (dispatcher) — bypass RLS
- staff JWT read paths — Path B passes through staff policy
- anon reads (client) — будут filtered out, но в текущем кластере нет client anon reads (всё через tire client JWT или staff JWT)

**Slice #3d тесты**:

1. **E1: anon SELECT on each table → permission_denied** (после enable). 17+2+2=21 asserts.
2. **E2: anon INSERT/UPDATE/DELETE on each table → permission_denied** (после enable). 17+2+2=21 asserts.
3. **E3: anon RPC calls (start_worker_shift etc) → permission_denied**. 5+ asserts.
4. **E4: staff JWT SELECT on each table → 200 with rows**. 17+2+2+2 (profiles) = 23 asserts.
5. **E5: staff JWT INSERT/UPDATE/DELETE on each table → 200 success**. 17+2+2=21 asserts.
6. **E6: anon SELECT on closed_boxes/tire_service_days → 200 with rows** (Category D split). 2 asserts.
7. **E7: service_role SELECT/INSERT/UPDATE/DELETE → 200** (bypass verify). 17+ asserts (subset).
8. **E8: dispatcher write actions (existing 51) → still 200** (regression). 51 asserts (already in 133 baseline, but re-run with new RLS).

**Total Slice #3d adds**: ~120 asserts → ~253 PASS / 0 FAIL final.

---

## Authorization matrix для staff RPCs (для миграции 021)

| RPC | Browser caller | Current | Slice #3d |
|---|---|---|---|
| `start_admin_shift` | lib/api/admins.ts | anon direct | REVOKE + dispatcher proxy (already done in Slice #3c) |
| `start_worker_shift` | lib/api/workers.ts:523 | anon direct | REVOKE + dispatcher proxy (new) |
| `start_tire_worker_shift` | lib/api/tire-workers.ts:411 | anon direct | REVOKE + dispatcher proxy (new) |
| `add_tire_worker_earnings` | lib/api/tire-workers.ts:353 | anon direct | already REVOKEd in 012? **verify** |
| `inventory_usage` | lib/api/product-sales.ts:207 | anon direct | INVESTIGATE + REVOKE + proxy |
| `inventory_restock` | lib/api/product-sales.ts:233 | anon direct | INVESTIGATE + REVOKE + proxy |
| `inventory_restock` (inventory.ts) | lib/api/inventory.ts:158 | anon direct | same RPC, same action |
| `add_inventory_category` | lib/api/inventory.ts:24 | anon direct | INVESTIGATE + REVOKE + proxy |
| `delete_inventory_category` | lib/api/inventory.ts:34 | anon direct | INVESTIGATE + REVOKE + proxy |
| `inventory_arrival` | lib/api/inventory.ts:122 | anon direct | INVESTIGATE + REVOKE + proxy |
| `get_next_document_number` | lib/api/document-numbers.ts:27 | anon direct | INVESTIGATE + REVOKE + proxy |

Каждый из них → новый dispatcher action в `api/staff.ts` с auth check (admin/owner) + service_role call.

---

## Что я НЕ сделаю в этом recon (нужен отдельный research)

1. **Per-table column-level sensitivity** — например, `expenses.amount` vs `expenses.description`. Category B policies row-level, не column-level. Если нужно column-level, нужен отдельный slice с grants на specific columns.
2. **Composite key joins** — `expenses.creator:profiles!`, `worksheet_entries.booking:tire_bookings!`. Если RLS на parent (`profiles`, `tire_bookings`) уже restrictive, join может не работать. Mitigation: проверить в browser smoke после enable.
3. **Storage bucket reads** — recon показал 0 callsites, но Storage uses different auth path. Это отдельный Slice (Phase 1.8 уже в плане).
4. **RPC SECURITY DEFINER vs INVOKER** — subagent не смог проверить. Нужно `pg_get_functiondef` для каждого. Запланировано в Phase исследования (перед миграцией 021).

---

## Plan для OK (отдельный цикл, без кода сейчас)

Перед написанием кода / миграции / deploy, жду ОК. Подтверждение должно включать:

1. **Anomaly fixes в миграции 019** — все 4 anomalies (A1-A4) принимаются как prep?
2. **Path B design для 17 таблиц** — admin-SELECT/owner-ALL policy без dispatcher proxy для reads?
3. **Split design для closed_boxes + tire_service_days** — anon SELECT + staff WRITE?
4. **RPC dispatcher proxy список** (5-10 actions) — добавляем в api/staff.ts?
5. **profiles staff SELECT policy** в той же миграции что expenses (для join)?
6. **Order of migrations**: 019 (prep) → 020 (Path B) → 021 (RPC revokes+proxies)?

---

## Vercel function count

- Сейчас: 12/12 (slice #3c достиг лимита)
- Slice #3d добавит 0 новых serverless файлов (всё идёт в `api/staff.ts` dispatcher)
- Лимит сохранится 12/12 ✓

---

## Production deployment

**Не в этом цикле.** Отдельный вопрос (как Slice #3c).
