# Slice #3d Step 0 — Dispatcher proxies для staff-direct RPCs (v2 — с тремя правками)

## Что изменилось относительно v1

| # | Правка | Источник |
|---|---|---|
| 1 | `add-tire-worker-earnings` принимает **только** `booking_id` от frontend; dispatcher server-compute earnings | Security blocker — `p_earnings` от browser = подделка зарплат |
| 2 | `inventory-arrival` browser smoke проверяет только arrival row + photos metadata, не заявляет storage security | Phase 1.8 storage = отдельная незакрытая задача |
| 3 | `get-next-document-number` overload resolution verified empirical | 2 overloads на test, 4 на prod — dispatcher передаёт все 3 args, PostgREST uniquely resolves по count |

## Empirical verification (ДО кода)

### Overload resolution — `get_next_document_number` на test DB

```
1-arg overload:  (doc_type text) → integer
3-arg overload:  (doc_type text, doc_month integer, doc_year integer) → integer

arg_count_match для 3 args: 1 (uniquely matches second overload)
SELECT get_next_document_number('invoice', 8, 2026) → 100 (resolved OK)
SELECT get_next_document_number('invoice') → 100 (resolved OK)
```

**PostgREST overload resolution**: count args uniquely identifies target. Dispatcher всегда передаёт все 3 args (`document_type`, `month`, `year`) — неоднозначности нет.

### Overload resolution — `inventory_arrival` на test DB

```
7-arg overload (DEF): (p_item_id, p_quantity, p_total_price, p_delivery_date, p_photos, p_notes, p_created_by)
8-arg overload (INV): (... + p_operation_id)
```

Dispatcher всегда передаёт `p_operation_id` (8 args) — uniquely matches второй overload.

### `add_tire_worker_earnings` server-side logic — существующая функция

`api/_lib/earnings.ts:197-282 addTireWorkerEarningAndLedger` УЖЕ реализует:
1. SELECT `salary_settings.tire_worker_commission`, `tire_worker_storage_fee`
2. `calculateTireEarnings({total_price, services, tire_worker_commission, storage_fee})`
3. RPC `add_tire_worker_earnings(p_worker_id, p_booking_id, p_earnings)` через service_role
4. INSERT `salary_transactions` ledger row
5. Возвращает `{rpc_success, rpc_message, ledger_inserted}` — уже idempotent-aware

**Проблема**: caller (`lib/api/tire-workers.ts:309 addTireWorkerEarningsForBooking`) передаёт `total_price`, `services` от frontend. Это та же дыра — dispatcher должен fetch'ить `tire_bookings` сам.

---

## 9 dispatcher proxy actions — финальная спецификация

### 1. `start-worker-shift` (admin/owner)

```typescript
// Body (browser): { worker_id: string }
// Server-stamped: p_today = today, p_salary = settings.worker_solo_base
// Server flow:
//   1. readUuidRequired(body, 'worker_id')
//   2. SELECT salary_settings.worker_solo_base (service_role bypass RLS)
//   3. RPC start_worker_shift({p_worker_id, p_salary, p_today})
//   4. Return {data: {worker: row}}
```

### 2. `start-tire-worker-shift` (admin/owner)

```typescript
// Body (browser): { worker_id: string }
// Server-stamped: p_today = today, p_salary = 0
// Server flow: same as start-worker-shift but p_salary=0 (tire workers no base)
```

### 3. **`add-tire-worker-earnings` (admin/owner) — SECURITY CRITICAL**

```typescript
// Body (browser): { booking_id: string }
// NEGATIVE: {worker_id, earnings, orderPrice} → 400 field_not_allowed_*

// Server flow (server-computes EVERYTHING money-related):
//   1. readUuidRequired(body, 'booking_id')
//   2. Reject any extra body keys (worker_id/earnings/orderPrice/total_price/services
//      → 400 field_not_allowed_<name>)
//   3. SELECT tire_bookings WHERE id = booking_id (service_role)
//      Validate: status = 'ГОТОВО', worker_id IS NOT NULL, is_paid = true
//      Extract: worker_id, total_price, services (JSONB parse)
//   4. SELECT tire_workers WHERE id = worker_id → worker.full_name
//   5. SELECT salary_settings LIMIT 1 → tire_worker_commission, tire_worker_storage_fee
//   6. calculateTireEarnings({total_price, services, tire_worker_commission, storage_fee})
//      Uses api/_lib/earnings.ts:78 (already exists, includes STORAGE_SERVICE_NAMES)
//   7. addTireWorkerEarningAndLedger(supabaseAdmin, {worker_id, worker_name,
//      booking_id, total_price, services}) — existing helper
//   8. Return {data: {success, idempotent, rpc_message, ledger_inserted,
//      tire_worker: row}}
```

### 4. `inventory-usage` (admin/owner)

```typescript
// Body (browser): { item_id: string, quantity: number, notes?: string }
// Server-stamped: p_created_by = claims.profile_id
// Server flow: RPC inventory_usage({p_item_id, p_quantity, p_notes, p_created_by})
```

### 5. `inventory-restock` (admin/owner)

```typescript
// Body (browser): { item_id: string, quantity: number, notes?: string }
// Server-stamped: p_created_by = claims.profile_id
// Server flow: RPC inventory_restock(...)
```

### 6. `add-inventory-category` (admin/owner)

```typescript
// Body (browser): { name: string, unit: string }
// Server flow: RPC add_inventory_category(...)
```

### 7. `delete-inventory-category` (admin/owner)

```typescript
// Body (browser): { category_id: string }
// Server flow: RPC delete_inventory_category(...)
```

### 8. `inventory-arrival` (admin/owner) — **storage upload OUT OF SCOPE**

```typescript
// Body (browser): { item_id, quantity, total_price, delivery_date,
//                    photos: string[] | null, notes: string | null,
//                    operation_id: string }
// Server-stamped: p_created_by = claims.profile_id
// Server flow:
//   1. Validate body (allow-list fields, reject extras)
//   2. RPC inventory_arrival(..., p_operation_id) — 8-arg overload uniquely
//   3. Return {data: {arrival: row}}
//
// browser upload photos: UNCHANGED — supabase.storage.from('inventory-photos')
// continues to be called from lib/api/inventory.ts (lines 253-258).
// Storage bucket RLS = Phase 1.8 OUT OF SCOPE for Slice #3d.
//
// browser smoke verifies: arrival row created + photos metadata stored
// (string array of URLs). Does NOT verify storage bucket security.
```

### 9. `get-next-document-number` (admin/owner)

```typescript
// Body (browser): { document_type: 'invoice'|'act', month: number, year: number }
// Server flow: RPC get_next_document_number(doc_type, doc_month, doc_year)
//   3-arg overload uniquely resolved (verified empirical)
// Return {data: {number: <int>}}
```

---

## Negative test для `add-tire-worker-earnings`

Дополнительные asserts (в дополнение к D1-D5):

**D6** (3 asserts): body содержит `worker_id` → 400 `field_not_allowed_worker_id`
**D7** (3 asserts): body содержит `earnings` → 400 `field_not_allowed_earnings`
**D8** (3 asserts): body содержит `order_price` или `total_price` → 400 `field_not_allowed_<name>`

---

## Storage bucket caveat (browser smoke)

Browser smoke для `inventory-arrival`:
- ✓ Проверяет: arrival row created, `photos` column = array of URLs metadata
- � НЕ проверяет: storage bucket security, RLS on `inventory-photos` bucket

Real storage security (bucket RLS, signed URL flow) = **отдельная задача**, не закрытая в Slice #3d.

---

## Frontend porting (5 lib/api файлов)

| File:line | Function | Before | After |
|---|---|---|---|
| `lib/api/workers.ts:481` | `startWorkerShift(workerId)` | `.rpc('start_worker_shift', {p_worker_id, p_salary, p_today})` | `dispatchStaffCall('start-worker-shift', {worker_id})` |
| `lib/api/tire-workers.ts:389` | `startTireWorkerShift(workerId)` | `.rpc(...)` | `dispatchStaffCall('start-tire-worker-shift', {worker_id})` |
| `lib/api/tire-workers.ts:309` | `addTireWorkerEarningsForBooking(workerId, bookingId, orderPrice)` | `.rpc('add_tire_worker_earnings', {p_worker_id, p_booking_id, p_earnings})` где `earnings` рассчитан на frontend | `dispatchStaffCall('add-tire-worker-earnings', {booking_id})` — dispatcher server-compute |
| `lib/api/product-sales.ts:200` | `deductFromInventory(itemId, quantity, userId)` | `.rpc('inventory_usage', {..., p_created_by: userId})` | `dispatchStaffCall('inventory-usage', {item_id, quantity, notes: 'Продажа товара'})` |
| `lib/api/product-sales.ts:227` | `addToInventory(itemId, quantity)` | `.rpc('inventory_restock', ...)` | `dispatchStaffCall('inventory-restock', {item_id, quantity, notes: 'Отмена продажи товара'})` |
| `lib/api/inventory.ts:152` | `recordInventoryRestock({itemId, quantity, notes, userId})` | `.rpc('inventory_restock', ...)` | `dispatchStaffCall('inventory-restock', {item_id, quantity, notes})` |
| `lib/api/inventory.ts:23` | `addInventoryCategory(name, unit)` | `.rpc('add_inventory_category', ...)` | `dispatchStaffCall('add-inventory-category', {name, unit})` |
| `lib/api/inventory.ts:33` | `deleteInventoryCategory(categoryId)` | `.rpc('delete_inventory_category', ...)` | `dispatchStaffCall('delete-inventory-category', {category_id})` |
| `lib/api/inventory.ts:78` | `recordInventoryArrival({itemId, quantity, totalPrice, deliveryDate, photos, notes, operationId, userId})` | upload photos (unchanged) + `.rpc('inventory_arrival', ...)` | upload photos (unchanged) + `dispatchStaffCall('inventory-arrival', {item_id, quantity, total_price, delivery_date, photos, notes, operation_id})` |
| `lib/api/document-numbers.ts:22` | `getNextDocumentNumber(documentType, month, year)` | `.rpc('get_next_document_number', {doc_type, doc_month, doc_year})` | `dispatchStaffCall<number>('get-next-document-number', {document_type, month, year})` |

---

## 9 typed wrappers в `lib/api/staff-actions.ts`

Шаблон повторяет existing 51. Особый случай — `addTireWorkerEarningsForBooking`:

```typescript
// BEFORE:
export async function addTireWorkerEarningsForBooking(
  workerId: string,
  bookingId: string,
  orderPrice: number
): Promise<TireWorker> { ... }

// AFTER (server-computes earnings):
export async function addTireWorkerEarningsForBooking(
  bookingId: string  // ← workerId/orderPrice REMOVED — dispatcher knows
): Promise<{ success: boolean; idempotent: boolean; tire_worker?: TireWorker; rpc_message?: string }> {
  const res = await dispatchStaffCall<{
    data?: { success: boolean; idempotent: boolean; tire_worker?: TireWorker; rpc_message?: string };
    error?: string;
  }>('add-tire-worker-earnings', { booking_id: bookingId });
  if (!res.data) throw new Error('staff_no_response');
  return res.data;
}
```

Caller'ы `addTireWorkerEarningsForBooking` — найти и обновить сигнатуру (см. App.tsx `handleMarkAsReady` для tire path).

---

## Test cluster additions

**Baseline**: 133 PASS / 0 FAIL

**Step 0 additions**:
- D1 (9): каждый из 9 dispatcher actions → 200 success с DB effects verified
- D2 (9): каждый → 401 no_token
- D3 (9): каждый → 403 wrong_role для client JWT
- D4 (9): старый прямой `.rpc(...)` путь всё ещё работает (параллельный, до 021)
- D5 (4): idempotency — повторный start-worker-shift / add-tire-worker-earnings не дублирует
- D6 (3): add-tire-worker-earnings body с worker_id → 400 field_not_allowed_worker_id
- D7 (3): body с earnings → 400 field_not_allowed_earnings
- D8 (3): body с order_price/total_price → 400 field_not_allowed_<name>

**Total Step 0 adds**: ~49 asserts → **~182 PASS / 0 FAIL** final.

---

## Browser smoke (Step 0)

5 сценариев (без storage upload claim):
1. admin → start-worker-shift → worker появился с `is_working_today=true` ✓
2. admin → start-tire-worker-shift → tire worker `is_working_today=true` ✓
3. admin → add-inventory-category → category появилась ✓
4. admin → inventory-arrival → arrival row + photos metadata ✓ (storage upload security НЕ claim)
5. admin → get-next-document-number → возвращает число ✓

---

## Vercel / demo-prod safety

- Vercel: 12/12 preserved (всё в api/staff.ts)
- Demo only deploy
- Prod **полностью нетронут** (per entry 22)

---

## Final ОК чек-лист

- [ ] **`add-tire-worker-earnings` server-computes earnings** (только `booking_id` от frontend, dispatcher reads tire_bookings + salary_settings + tire_workers + uses calculateTireEarnings + addTireWorkerEarningAndLedger) — принимается?
- [ ] **D6/D7/D8 negative tests** для add-tire-worker-earnings (worker_id/earnings/orderPrice → 400 field_not_allowed_*) — принимается?
- [ ] **inventory-arrival browser smoke**: только arrival row + photos metadata, storage upload security = Phase 1.8 OUT OF SCOPE — принимается?
- [ ] **get-next-document-number overload resolution verified** (3-arg uniquely matches на test DB; на prod dispatcher передаёт те же 3 args → same resolution) — принимается?
- [ ] **9 dispatcher actions**, **9 typed wrappers**, **~49 test asserts (~182 PASS final)** — принимается?
- [ ] **Demo only, prod нетронут** (entry 22) — подтверждено?
