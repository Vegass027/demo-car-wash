# Slice #3d — Phase 2 RLS Category B (staff dashboard reads) — RECON + PLAN v2

## Что изменилось относительно v1

| Изменение | Источник |
|---|---|
| Полный инвентарь: **41 объект** (39 tables + 2 views), не 39 | Проблема 1 (views были пропущены) |
| Anomaly **A1 — REAL**: `tire_bookings_timeline` view доступен anon | Подтверждено `SET ROLE anon; SELECT count(*) FROM public.tire_bookings_timeline` — возвращает реальные rows |
| Anomaly **A6 — NEW**: `profiles.password_hash` доступен anon для SELECT | Подтверждено `SET ROLE anon; SELECT password_hash FROM public.profiles` возвращает bcrypt hash |
| Anomaly **A7 — NEW**: `admins.card_number`, `admins.payment_phone`, `workers.card_number`, `workers.payment_phone`, `tire_workers.card_number`, `tire_workers.payment_phone` доступны anon для SELECT | Подтверждено `information_schema.column_privileges` показывает полные grants, plan говорит "Phase 0.1 отложена в 2.5" → **никогда не применено** |
| **Порядок изменён**: Step 0 (code, без миграций) → Step 1 (миграции 019→020→021) | Проблема 2 — повторение ошибки Slice #3c с INVOKER RPC |

---

## Проблема 1: полный инвентарь

### Fresh complete inventory (psql `pg_class`):

```
39 tables + 2 views = 41 objects in public schema.

Tables (39):
  _legacy_link_audit, admins, auth_logs, booking_cancellations,
  booking_settings, bookings, client_cars, clients, closed_boxes,
  company_settings, daily_reports, document_numbers, expenses,
  inventory_arrivals, inventory_categories, inventory_items,
  inventory_operations, loyalty_carwash_progress, organization_cars,
  organization_drivers, organizations, otp_codes, payments,
  pending_bookings, product_sales, profiles, salary_settings,
  salary_transactions, sbp_banks, services, sms_logs, sms_rate_limits,
  tire_bookings, tire_service_days, tire_services, tire_workers,
  work_shifts, workers, worksheet_entries.

Views (2):
  bookings_timeline, tire_bookings_timeline.
```

### Сравнение с оригиналом (Phase 2 recon, 39 tables):

**2 объекта отсутствовали**: `bookings_timeline` + `tire_bookings_timeline` (это VIEW, не table — `pg_tables` их не возвращает). Это объясняет anomaly A1: оригинальный список не имел views → migration 014 REVOKE для views написан вслепую (через `grant` discovery или `pg_policies` для views). Эмпирически:
- `bookings_timeline` → `SET ROLE anon; SELECT count(*)` → **permission denied** ✓ (REVOKE работает)
- `tire_bookings_timeline` → `SET ROLE anon; SELECT count(*)` → **ACCESSIBLE** ✗ (REVOKE пропущен!)

A1 — **REAL security gap**. Anon читает ~43 rows с `total_price`, `worker_id`, `organization_id`, `is_paid` для ВСЕХ tire bookings.

### Anon access matrix (verified):

```
BLOCKED (Category E, REVOKEd by migration 014):
  _legacy_link_audit, auth_logs, otp_codes, payments, pending_bookings,
  sms_logs, sms_rate_limits, bookings_timeline

BLOCKED (Category A, REVOKEd by migration 017):
  admins, company_settings, salary_settings, salary_transactions

ACCESSIBLE (Category B/D, NO RLS restrictions yet):
  booking_cancellations, booking_settings, bookings, client_cars,
  clients, closed_boxes, daily_reports, document_numbers, expenses,
  inventory_arrivals, inventory_categories, inventory_items,
  inventory_operations, loyalty_carwash_progress, organization_cars,
  organization_drivers, organizations, product_sales, profiles,
  sbp_banks, services, tire_bookings, tire_bookings_timeline ⚠,
  tire_service_days, tire_services, tire_workers, work_shifts,
  workers, worksheet_entries
```

⚠ = view, реальный security gap

### Дополнительные column-level security gaps (Phase 0.1 не применён):

План (line 183-185) говорит:
```sql
revoke select (password_hash) on public.profiles from anon, authenticated;
revoke select (card_number, payment_phone) on public.admins from anon, authenticated;
revoke select (card_number, payment_phone) on public.workers from anon, authenticated;
```

**Фактически**: `information_schema.column_privileges` показывает полные grants на эти колонки для anon + authenticated. Эти REVOKE **никогда не были применены в test DB** (Phase 0.1 отложена в Фазу 2.5 по плану line 773).

**Эмпирически подтверждено**:
```sql
SET ROLE anon;
SELECT password_hash FROM public.profiles LIMIT 1;
-- → 1 row returned (bcrypt hash $2a$06$...)
RESET ROLE;
```

| Column | Table | anon SELECT | risk |
|---|---|---|---|
| `password_hash` | profiles | REAL | HIGH — bcrypt hash утекает |
| `card_number` | admins | REAL | HIGH — банковские карты |
| `payment_phone` | admins | REAL | MED — СБП телефон |
| `card_number` | workers | REAL | HIGH — банковские карты |
| `payment_phone` | workers | REAL | MED — СБП телефон |
| `card_number` | tire_workers | REAL | HIGH — банковские карты |
| `payment_phone` | tire_workers | REAL | MED — СБП телефон |

**Это критично — нужно добавить в migration 019.**

---

## Проблема 2: исправленный порядок миграций

### Slice #3c правило (entry 20e / 21):

> Для INVOKER RPC (`start_admin_shift`): сначала dispatcher proxy + переключение фронтенда + deploy, потом REVOKE EXECUTE. Без dispatcher proxy до REVOKE — ломается «начать смену» для staff.

### Slice #3d та же проблема для ~10 RPC:

| RPC | Caller | SECURITY | Dispatcher proxy нужен |
|---|---|---|---|
| `start_worker_shift` | lib/api/workers.ts:523 | INVOKER | YES (Step 0) |
| `start_tire_worker_shift` | lib/api/tire-workers.ts:411 | INVOKER | YES (Step 0) |
| `start_admin_shift` | lib/api/admins.ts:253 | INVOKER | **already done** (Slice #3c) |
| `add_tire_worker_earnings` | lib/api/tire-workers.ts:353 | INVOKER | verify state |
| `inventory_usage` | lib/api/product-sales.ts:207 | ? | YES (Step 0) |
| `inventory_restock` | lib/api/product-sales.ts:233 + lib/api/inventory.ts:158 | ? | YES (Step 0) |
| `add_inventory_category` | lib/api/inventory.ts:24 | ? | YES (Step 0) |
| `delete_inventory_category` | lib/api/inventory.ts:34 | ? | YES (Step 0) |
| `inventory_arrival` | lib/api/inventory.ts:122 | ? | YES (Step 0) |
| `get_next_document_number` | lib/api/document-numbers.ts:27 | ? | YES (Step 0) |

**Правильный порядок**:

```
Step 0 (CODE ONLY, no migrations):
  - Add 9 new dispatcher actions in api/staff.ts:
    start-worker-shift, start-tire-worker-shift,
    inventory-usage, inventory-restock, add-inventory-category,
    delete-inventory-category, inventory-arrival,
    get-next-document-number
  - Update frontend callsites: replace `.rpc(...)` with `dispatchStaffCall(...)`
  - Deploy → test cluster regression (133 PASS / 0 FAIL still)
  - Browser smoke: confirm shift-start, inventory ops work via dispatcher
  - OLD RPC grant STILL alive — old direct path still works in parallel
  - Commit + push

Step 1 (MIGRATIONS):
  - 019_prep_anomalies.sql:
    - A1: REVOKE ALL FROM anon, authenticated ON view tire_bookings_timeline
    - A2: closed_boxes split (REVOKE INSERT/UPDATE/DELETE/TRUNCATE FROM anon,
         + staff WRITE policy)
    - A3: tire_service_days split (same pattern)
    - A6: REVOKE SELECT (password_hash) FROM anon, authenticated ON profiles
    - A7: REVOKE SELECT (card_number, payment_phone) FROM anon, authenticated
         ON admins, workers, tire_workers
    - Verify: anon SET ROLE anon → permission denied on all of the above
  - 020_path_b_category_b.sql:
    - For 17 Category B tables: DROP public_all_access,
      CREATE staff_select/insert/update/delete (app_role IN admin/owner),
      REVOKE ALL FROM anon, GRANT SELECT to authenticated (or per-table)
    - profiles: staff SELECT (full row, column-level REVOKE из 019 остаётся)
    - Verify: anon SET ROLE anon → permission_denied на всех 17
    - Verify: staff JWT SELECT → 200
    - Verify: dispatcher writes (51 actions) → 200 (bypass RLS)
  - 021_revoke_staff_direct_rpcs.sql:
    - REVOKE EXECUTE FROM PUBLIC+anon+authenticated on 9 RPCs (per §20d 4-step)
    - Verify: anon call → permission_denied
    - Verify: service_role call → 200
    - Dispatcher actions use service_role → 200 (regression)
```

**Критическая гарантия**: на каждом Step между миграциями, фронтенд НЕ теряет функциональности. Между 019 и 020 — anon просто теряет доступ к тому, что он не должен был иметь (closed_boxes writes, profiles.password_hash и т.д.) — UI не сломается. Между 020 и 021 — staff JWT теряет INSERT/UPDATE/DELETE на Category B tables, но все writes уже через dispatcher (service_role bypass). 021 просто закрывает прямой RPC путь — фронтенд его уже не использует.

---

## Anomaly prep (миграция 019) — итоговый список

| # | Объект | Что делаем |
|---|---|---|
| A1 | view `tire_bookings_timeline` | REVOKE ALL FROM anon, authenticated (как bookings_timeline в 014) |
| A2 | table `closed_boxes` | REVOKE INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER FROM anon + staff WRITE policy (admin/owner) + anon SELECT остаётся через `closed_boxes_read` |
| A3 | table `tire_service_days` | То же что A2 |
| A6 | table `profiles` | REVOKE SELECT (password_hash) FROM anon, authenticated |
| A7 | tables `admins`, `workers`, `tire_workers` | REVOKE SELECT (card_number, payment_phone) FROM anon, authenticated |

**Применяется к test DB через psql `\i` после commit, verify через 4-step checklist из §20d.**

---

## Path B для 17 Category B таблиц (миграция 020)

```sql
-- Шаблон для каждой таблицы:
DROP POLICY IF EXISTS public_all_access ON public.<table>;
DROP POLICY IF EXISTS service_role_all_access ON public.<table>;
CREATE POLICY service_role_all_access ON public.<table>
  FOR ALL TO service_role USING (true) WITH CHECK (true);
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
REVOKE ALL ON public.<table> FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.<table> FROM authenticated;
GRANT SELECT ON public.<table> TO authenticated;
```

### Per-table особенности:

| Таблица | Особенность | Дополнительно |
|---|---|---|
| `profiles` | staff SELECT policy | + `auth.jwt()->>'app_role' IN ('admin','owner')` — НЕ own-row (client SELECT own через link-client-profile уже есть). column-level REVOKE из A6 остаётся. |
| `expenses` | has `creator:profiles!, updater:profiles!` join | profiles policy из этой же миграции покрывает join |
| `bookings` | + Category C (client own) — Slice #3e | В 020 — только staff SELECT; client SELECT own = отдельная policy в #3e |
| `tire_bookings` | + Category C (client own) — Slice #3e | То же |
| `organizations` / `organization_cars` / `organization_drivers` | dispatcher writes уже есть | reads теперь через RLS staff |
| `closed_boxes` | A2 уже сделал split | дополнительно — staff SELECT policy |
| `tire_service_days` | A3 уже сделал split | дополнительно — staff SELECT policy |
| `worksheet_entries` | dispatcher DELETE only | RLS полная (read+write для staff) |
| `worksheets` | 0 callsites | оставить public_all_access (no risk, no callers) |
| `loyalty_carwash_progress` | not in Category B list (Category C) | not in this slice |

---

## RPC REVOKE (миграция 021) — 4-step checklist

Каждый из 9 RPCs:
1. `proacl::text` inspection → ожидаем PUBLIC grant EXECUTE
2. `has_function_privilege('anon', ...)` → false после REVOKE
3. `has_function_privilege('authenticated', ...)` → false после REVOKE
4. `SET ROLE anon; SELECT * FROM rpc(...)` → permission_denied

+ `service_role` EXECUTE preserved (для dispatcher proxy).

Шаблон:
```sql
REVOKE EXECUTE ON FUNCTION public.<rpc>(args) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.<rpc>(args) TO service_role;
```

---

## Frontend dispatcher proxy actions (Step 0)

Каждое действие в `api/staff.ts`:

```typescript
// start-worker-shift
async function startWorkerShift(claims: StaffClaims, body: { worker_id: string }) {
  requireStaff(claims); // admin or owner
  const today = formatDate(new Date());
  const settings = await supabaseAdmin.from('salary_settings').select('*').single();
  const rpc = 'start_worker_shift'; // already exists
  const { data, error } = await supabaseAdmin.rpc(rpc, {
    p_worker_id: body.worker_id,
    p_today: today,
    // other params from settings
  });
  if (error) throw new RpcError(rpc, error);
  return { worker_id: body.worker_id, success: true };
}
```

Frontend changes (lib/api/workers.ts):
```typescript
// BEFORE:
export async function startWorkerShift(workerId: string) {
  await supabase.rpc('start_worker_shift', { p_worker_id: workerId, ... });
}

// AFTER:
export async function startWorkerShift(workerId: string) {
  return await dispatchStaffCall('start-worker-shift', { worker_id: workerId });
}
```

То же для 8 других actions.

---

## Тестовый план (3 числа + Slice #3d = 4-й)

### Baseline (pre-Slice #3d): 133 PASS / 0 FAIL

### Slice #3d — Step 0 (dispatcher proxies) tests:
- **D1**: каждый из 9 dispatcher proxy actions → 200 success с правильными DB effects (regression smoke)
- **D2**: каждый из 9 dispatcher proxy actions → 403 owner_only_required для client JWT (negative)
- **D3**: каждый из 9 dispatcher proxy actions → 401 no_token (negative)
- **D4**: старый прямой `.rpc(...)` путь всё ещё работает (параллельно, до 021)
- **Total Step 0**: ~30-45 asserts

### Slice #3d — Step 1 migration 019 tests:
- **M19-A1**: anon SELECT tire_bookings_timeline → permission_denied
- **M19-A2**: anon INSERT closed_boxes → permission_denied
- **M19-A2b**: staff INSERT closed_boxes → 200 success
- **M19-A3**: anon INSERT tire_service_days → permission_denied
- **M19-A3b**: staff INSERT tire_service_days → 200 success
- **M19-A6**: anon SELECT password_hash → permission_denied
- **M19-A7**: anon SELECT card_number/payment_phone → permission_denied
- **Total M19**: ~10 asserts

### Slice #3d — Step 1 migration 020 tests:
- **M20-E1**: anon SELECT each of 17 Category B tables → permission_denied
- **M20-E2**: anon INSERT/UPDATE/DELETE each → permission_denied
- **M20-E4**: staff JWT SELECT each → 200 with rows
- **M20-E5**: staff JWT INSERT/UPDATE/DELETE each → 200
- **M20-R**: dispatcher writes (51 actions baseline regression) → still 200
- **Total M20**: ~70 asserts

### Slice #3d — Step 1 migration 021 tests:
- **M21-E1**: anon call each of 9 RPCs → permission_denied
- **M21-E2**: authenticated call each → permission_denied
- **M21-R**: dispatcher proxy for each → still 200 (service_role works)
- **Total M21**: ~30 asserts

### Total Slice #3d adds: ~140-150 asserts → ~280 PASS / 0 FAIL final

---

## Vercel function count invariant

- Сейчас: 12/12 (slice #3c достиг лимита)
- Slice #3d добавит 0 новых serverless файлов (всё идёт в `api/staff.ts` dispatcher)
- Лимит сохранится 12/12 ✓

---

## Authorization matrix (полный, для верификации)

| Action | admin | owner | anon | service_role (dispatcher) |
|---|---|---|---|---|
| Step 0 dispatcher actions (×9) | ✓ | ✓ | ✗ (401) | ✓ |
| Migration 020 staff reads | ✓ | ✓ | ✗ | ✓ |
| Migration 020 staff writes | ✓ | ✓ | ✗ | ✓ |
| Migration 021 RPC REVOKE | n/a (no caller) | n/a | ✗ | ✓ |

---

## Что я НЕ сделаю в этом recon (нужен отдельный research)

1. **`tire_bookings_timeline` view definition** — содержит Category C логику (`WHEN client_id = auth.uid() THEN car_model ELSE NULL`). Нужно прочитать view определение перед A1 REVOKE — убедиться что view не используется staff UI (иначе REVOKE сломает).
2. **RPC SECURITY DEFINER vs INVOKER** для всех 9 RPCs — нужен `pg_get_functiondef` для каждого. Уже частично сделано в v1 recon (subagent нашёл `add_tire_worker_earnings` INVOKER). Перед 021 нужен полный список.
3. **Composite joins** — например, `worksheet_entries.booking_id → bookings` (FK). Если bookings становится staff-only через RLS, join из staff context работает (staff JWT видит). Но если есть cross-table joins из client context — сломается.
4. **Storage buckets** — вне scope этого slice (Phase 1.8 отдельно).

---

## Order of migrations (финальный):

```
1. Step 0 (CODE): dispatcher proxies + frontend switch + deploy + browser smoke
2. Migration 019: anomaly prep (A1+A2+A3+A6+A7) + verify
3. Migration 020: Path B 17 tables + profiles + verify
4. Migration 021: REVOKE 9 staff-direct RPCs + verify
```

После каждого шага: test cluster full run + browser smoke + commit + push.

---

## Production deployment

**Не в этом цикле.** Отдельный вопрос (как Slice #3c).

---

## Чек-лист перед ОК

- [ ] **Anomaly prep в миграции 019** (A1+A2+A3+A6+A7) — принимается с дополнением column-level?
- [ ] **Path B для 17 таблиц** без dispatcher-proxy для reads — принимается?
- [ ] **Split design для closed_boxes + tire_service_days** — принимается?
- [ ] **Порядок Step 0 → 019 → 020 → 021** (dispatcher proxies сначала, миграции после) — принимается?
- [ ] **`profiles` staff SELECT policy в 020** (full row, column-level REVOKE из 019 остаётся независимым слоем) — принимается?
- [ ] **9 dispatcher proxy actions в Step 0** — принимается список?
