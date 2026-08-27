# Plan fix: tire shift toggle — v2 (с 4 правками)

## Что изменилось относительно v1

| # | Правка | Источник |
|---|---|---|
| 1 | Не менять signature `start_tire_worker_shift` (3 params, p_salary ignore with comment) | Backward compat для demo/prod drift и unknown bundles |
| 2 | OFF не обнуляет `last_shift_date` (только `is_working_today=false`) | Семантика поля = «когда последний раз вышел» |
| 3 | RPC возвращает `tire_workers`, dispatcher делает дополнительный SELECT для `work_shift_id` | Не обещать в ответе то, чего RPC не возвращает |
| 4 | Test cleanup через изолированный test fixture, НЕ `created_at > now() - interval` | Защита от чужой реальной записи |
| + | TireTechnicianCard ON+OFF оба на dispatcher (без обходного direct UPDATE) | Единый server-side контракт |

---

## 1. SQL/RPC diff

### `start_tire_worker_shift` (REPLACE, сохраняя 3-param signature)

```sql
CREATE OR REPLACE FUNCTION public.start_tire_worker_shift(
  p_worker_id uuid,
  p_salary numeric,            -- retained for backward-compatible RPC signature
  p_today date                 -- tire technicians have no carwash base-rate accounting
)
RETURNS public.tire_workers
LANGUAGE plpgsql SECURITY INVOKER
AS $function$
DECLARE
  v_worker tire_workers;
  v_inserted_shift_id uuid;
BEGIN
  -- 🔒 LOCK tire worker (serializes parallel calls)
  SELECT * INTO v_worker FROM tire_workers WHERE id = p_worker_id FOR UPDATE;

  -- ✅ Idempotent: already working today → return current state
  IF v_worker.is_working_today THEN
    RETURN v_worker;
  END IF;

  -- ✅ Flip the toggle. p_salary intentionally ignored.
  UPDATE tire_workers
    SET is_working_today = TRUE,
        last_shift_date  = p_today
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  -- ✅ Audit row in work_shifts (worker_type='tire_worker' allowed by CHECK)
  INSERT INTO work_shifts (
    worker_type, worker_id, worker_name, work_date,
    started_at, status, earnings
  )
  VALUES (
    'tire_worker', p_worker_id, v_worker.full_name, p_today,
    NOW(), 'working', 0
  )
  RETURNING id INTO v_inserted_shift_id;

  RETURN v_worker;
END;
$function$;
```

**Что удалено из текущего тела**:
- `IF v_worker.base_rate_taken_today THEN RETURN v_worker;` (поле не существует в `tire_workers`)
- `IF NOT v_worker.base_rate_taken_today THEN ... INSERT INTO salary_transactions ... UPDATE tire_workers SET base_rate_taken_today=TRUE` (carwash-only base-rate accounting)

**Что сохранено**:
- 3-param signature (backward compat)
- FOR UPDATE lock (race protection)
- `is_working_today` idempotency
- `INSERT work_shifts` audit row
- `p_today` для `last_shift_date`

### `stop_tire_worker_shift` (NEW RPC, atomic)

```sql
CREATE OR REPLACE FUNCTION public.stop_tire_worker_shift(
  p_worker_id uuid,
  p_today date
)
RETURNS public.tire_workers
LANGUAGE plpgsql SECURITY INVOKER
AS $function$
DECLARE
  v_worker tire_workers;
  v_active_shift_id uuid;
BEGIN
  -- 🔒 LOCK tire worker
  SELECT * INTO v_worker FROM tire_workers WHERE id = p_worker_id FOR UPDATE;

  -- ✅ Idempotent: not currently working → return current state
  IF NOT v_worker.is_working_today THEN
    RETURN v_worker;
  END IF;

  -- ✅ Flip the toggle. last_shift_date PRESERVED as history (last day worker WAS on shift).
  UPDATE tire_workers
    SET is_working_today = FALSE
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  -- ✅ Close the active work_shift row only (not historical ones).
  --    SELECT FOR UPDATE + UPDATE in same tx = no lost-update across parallel OFFs.
  SELECT id INTO v_active_shift_id
    FROM work_shifts
    WHERE worker_id = p_worker_id
      AND worker_type = 'tire_worker'
      AND status = 'working'
    ORDER BY started_at DESC
    LIMIT 1
    FOR UPDATE;

  IF v_active_shift_id IS NOT NULL THEN
    UPDATE work_shifts
      SET finished_at = NOW(),
          status = 'finished'
      WHERE id = v_active_shift_id;
  END IF;

  RETURN v_worker;
END;
$function$;
```

**Что важно**:
- `last_shift_date` НЕ обнуляется (семантика поля = «когда последний раз вышел», сохраняется для истории)
- Закрываем ТОЛЬКО активную shift row (`status='working'`, `ORDER BY started_at DESC LIMIT 1`), не все исторические

---

## 2. Migration number + rollback

**Migration `019a_fix_tire_worker_shift_remove_carwash_copy.sql`** (отдельно от будущего `019_prep_anomalies`):

- `CREATE OR REPLACE FUNCTION public.start_tire_worker_shift(...)` — перезаписать с исправлением
- `CREATE OR REPLACE FUNCTION public.stop_tire_worker_shift(...)` — создать новую
- Grants: `EXECUTE` для `service_role` (dispatcher proxy); `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` после проверки 4-step checklist из §20d

**Rollback plan**:
- Перед apply: `pg_dump --schema-only -t 'public.*tire_worker_shift' --schema-only > /tmp/backup_start_tire_worker_shift_2026_08_27.sql`
- Если что-то сломается: `CREATE OR REPLACE FUNCTION public.start_tire_worker_shift(p_worker_id uuid, p_salary numeric, p_today date) ... [original body]` + `DROP FUNCTION public.stop_tire_worker_shift(uuid, date)`

---

## 3. Dispatcher contract (обновлённый)

### `start-tire-worker-shift` (UPDATED signature path, сохраняет 3-param RPC)

```typescript
// api/staff.ts
async function startTireWorkerShiftAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const worker_id = readUuidRequired(body, 'worker_id');
  const today = new Date().toISOString().slice(0, 10);

  // p_salary=0 server-stamped (tire workers have no base rate).
  const { data: worker, error } = await supabaseAdmin.rpc('start_tire_worker_shift', {
    p_worker_id: worker_id,
    p_salary: 0,
    p_today: today,
  });
  if (error) {
    console.error('[staff:start-tire-worker-shift] rpc error:', error.message);
    return failAction(500, 'start_tire_worker_shift_failed', { detail: error.message });
  }

  // ✅ RPC returns tire_workers, but dispatcher enriches with work_shift_id
  //    by server-side SELECT of the active shift row.
  const { data: shift } = await supabaseAdmin
    .from('work_shifts')
    .select('id, started_at, status')
    .eq('worker_id', worker_id)
    .eq('worker_type', 'tire_worker')
    .eq('status', 'working')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Idempotent detection: if RPC didn't change is_working_today (already true),
  // we still return success but flag idempotent=true.
  const idempotent = !shift;
  return {
    status: 200,
    body: {
      data: {
        worker,
        work_shift_id: shift?.id ?? null,
        idempotent,
      },
    },
  };
}
```

### `stop-tire-worker-shift` (NEW dispatcher action)

```typescript
async function stopTireWorkerShiftAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const worker_id = readUuidRequired(body, 'worker_id');
  const today = new Date().toISOString().slice(0, 10);

  const { data: worker, error } = await supabaseAdmin.rpc('stop_tire_worker_shift', {
    p_worker_id: worker_id,
    p_today: today,
  });
  if (error) {
    console.error('[staff:stop-tire-worker-shift] rpc error:', error.message);
    return failAction(500, 'stop_tire_worker_shift_failed', { detail: error.message });
  }

  // ✅ Server-side SELECT of the just-closed shift row for the response.
  const { data: shift } = await supabaseAdmin
    .from('work_shifts')
    .select('id, started_at, finished_at, status')
    .eq('worker_id', worker_id)
    .eq('worker_type', 'tire_worker')
    .eq('status', 'finished')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const idempotent = !shift || shift.started_at === shift.finished_at;
  // ↑ if finished_at == started_at (closed immediately), it's idempotent.
  //   Otherwise it's the real OFF action.

  return {
    status: 200,
    body: {
      data: {
        worker,
        work_shift_id: shift?.id ?? null,
        finished_at: shift?.finished_at ?? null,
        idempotent,
      },
    },
  };
}
```

### Body schemas:
- `start-tire-worker-shift`: `{worker_id: string}` (allow-list только worker_id)
- `stop-tire-worker-shift`: `{worker_id: string}` (allow-list только worker_id)

### Auth:
- admin-or-owner (как было)

### HTTP mapping:
- 401 no_token / 403 wrong_role / 404 worker_not_found / 500 rpc_error
- Idempotency: HTTP 200 + `idempotent: true/false` в body.data (НЕ ошибка)

---

## 4. Frontend port (TireTechnicianCard ON+OFF оба на dispatcher)

```typescript
// components/admin/TireTechnicianCard.tsx:290-308
const handleToggleWorkingToday = async (isWorking: boolean) => {
  setStartingShiftTechnicianId(technician.id);
  try {
    if (!isWorking) {
      // ON: server-stamped RPC via dispatcher
      await startStaffTireWorkerShift(technician.id);
      onToggleWorking(technician.id, true);
    } else {
      // OFF: server-stamped RPC via dispatcher (was: direct UPDATE through handleToggleTechnicianWorking)
      await stopStaffTireWorkerShift(technician.id);
      onToggleWorking(technician.id, false);
    }
  } catch (error) {
    console.error('Ошибка при переключении смены:', error);
    alert('Не удалось переключить смену');
  } finally {
    setStartingShiftTechnicianId(null);
  }
};
```

### `lib/api/staff-actions.ts` (NEW wrapper):
```typescript
export async function stopStaffTireWorkerShift(workerId: string): Promise<{
  worker: TireWorker;
  work_shift_id: string | null;
  finished_at: string | null;
  idempotent: boolean;
}> {
  const res = await dispatchStaffCall<{
    data?: { worker: TireWorker; work_shift_id: string | null; finished_at: string | null; idempotent: boolean };
    error?: string;
  }>('stop-tire-worker-shift', { worker_id: workerId });
  if (!res.data) throw new Error('staff_no_response');
  return res.data;
}
```

### `App.tsx:1486 handleToggleTechnicianWorking` — оставляем как есть (он всё равно вызывается через onToggleWorking prop, но реальный toggle теперь на dispatcher level, App.tsx просто получает success callback)

---

## 5. E2E tests (изолированный test fixture)

**Подход**: создаём disposable test tire worker с уникальным `phone` через `addStaffWorker` или direct INSERT, сохраняем его ID, делаем ON/OFF/ON/OFF цикл, cleanup по конкретному ID.

```
Test setup:
  CREATE test_tire_worker with unique phone e.g. +7999000RANDOM
  Save test_tire_worker_id
  Verify initial is_working_today=false, last_shift_date=NULL

Tests:
  E1: start-tire-worker-shift admin JWT → 200, idempotent=false
      DB: test_tire_worker.is_working_today=true, last_shift_date=today
      DB: 1 work_shifts row (worker_type='tire_worker', status='working')
  E2: start-tire-worker-shift anon → 401
  E3: start-tire-worker-shift client JWT → 403 (SKIP if unavailable)
  E4: start-tire-worker-shift repeat → 200, idempotent=true
      DB: STILL 1 work_shifts row (no duplicate)
  E5: stop-tire-worker-shift admin JWT → 200, idempotent=false, finished_at set
      DB: test_tire_worker.is_working_today=false
      DB: last_shift_date UNCHANGED (still = today from E1)
      DB: that work_shifts row now status='finished', finished_at IS NOT NULL
  E6: stop-tire-worker-shift repeat → 200, idempotent=true
      DB: work_shifts row STILL status='finished', finished_at UNCHANGED
  E7: salary_transactions count for test_tire_worker_id after full ON+OFF cycle = 0
  E8: completed paid tire booking → mark-staff-tire-ready by test_tire_worker_id
      DB: salary_transactions count = 1 (EARNING for that booking, not from shift)
  E9: client JWT → 403 (both start and stop)
  E10: anon → 401 (both start and stop)

Cleanup:
  DELETE FROM public.work_shifts WHERE worker_id = $test_tire_worker_id;
  DELETE FROM public.tire_bookings WHERE worker_id = $test_tire_worker_id;
  DELETE FROM public.salary_transactions WHERE worker_id = $test_tire_worker_id;
  DELETE FROM public.tire_workers WHERE id = $test_tire_worker_id;
  -- No created_at interval filter — cleanup is scoped to test fixture only.
```

**Где взять test tire worker**: создаём через dispatcher action `create-tire-worker` (если есть) ИЛИ через прямой INSERT (если нет dispatcher). Если прямой INSERT — нужно `service_role` access через psql.

---

## 6. Browser smoke

1. admin login → TireServicePage
2. Click "Включить смену" техника (test fixture, созданный через SQL setup):
   - HTTP 200, `data.worker.is_working_today=true`, `data.work_shift_id IS NOT NULL`, `data.idempotent=false`
   - DB verify: `SELECT is_working_today, last_shift_date FROM tire_workers WHERE id=test_id` → `true, today`
   - DB verify: `SELECT count(*) FROM work_shifts WHERE worker_id=test_id AND status='working'` → 1
3. Карточка отображает gradient зелёный + `baseSalary + totalEarningsFromBookings` (где `baseSalary = 0` hardcoded)
4. Click "Выключить смену":
   - HTTP 200, `data.worker.is_working_today=false`, `data.work_shift_id IS NOT NULL` (тот же ID), `data.finished_at IS NOT NULL`
   - DB verify: `SELECT is_working_today, last_shift_date FROM tire_workers WHERE id=test_id` → `false, today` (last_shift_date сохранён!)
   - DB verify: `SELECT status, finished_at FROM work_shifts WHERE worker_id=test_id AND id=returned_work_shift_id` → `finished, NOW()≈`
5. Карточка возвращается к gradient серый
6. Salary side-effect check:
   - `SELECT count(*) FROM salary_transactions WHERE worker_id=test_id AND transaction_type='EARNING' AND description LIKE 'Начало смены%'` → **0** (не должно быть лишнего начисления)
7. Cleanup: `DELETE FROM work_shifts WHERE worker_id=test_id; DELETE FROM tire_workers WHERE id=test_id;`

---

## Что НЕ делаю

- ❌ Не пишу код / SQL / миграцию / deploy до ОК
- ❌ Не трогаю prod
- � Не правлю UI guards (assignment, mark-ready) — shift не блокирует ничего
- ❌ Не начинаю Step 1 (019→020→021) до финального отчёта по этому fix

## Жду ОК

Подтверди:
1. SQL diff для `start_tire_worker_shift` (3-param kept, base_rate block removed, p_salary ignored) — ОК?
2. `stop_tire_worker_shift` NEW RPC (atomic OFF, last_shift_date не обнуляется, SELECT active shift only) — ОК?
3. Migration `019a_fix_tire_worker_shift_remove_carwash_copy.sql` + rollback plan — ОК?
4. Dispatcher contract: 200 + `{worker, work_shift_id, idempotent}` для start; `{worker, work_shift_id, finished_at, idempotent}` для stop — ОК?
5. TireTechnicianCard ON+OFF оба на dispatcher (без direct UPDATE fallback) — ОК?
6. E2E tests на изолированном test fixture (НЕ created_at interval) — ОК?
7. Browser smoke 5-шагов сценарий — ОК?

После ОК реализую по согласованному циклу: dispatcher code → migration 019a → deploy demo → test cluster (152+10 PASS) → browser smoke → commit chain → final report. Только после финального отчёта — Step 1 (019→020→021) по плану.
