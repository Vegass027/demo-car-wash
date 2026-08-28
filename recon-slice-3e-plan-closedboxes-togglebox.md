# Plan — closed_boxes / tire_service_days anon-readable + toggle-box dispatcher

> **Read-only plan.** Не применяется без явного ОК.
> Цель: закрыть два confirmed gaps из recon отчёта владельца, **не**
> задевая Phase B общую последовательность (которая blocked до
> cleaned baseline arithmetic).

---

## 1. Confirmed gaps (recap)

Из retest-таблицы (Step #1 из владельца сообщения):

| Table | anon (no auth) | admin Bearer через Supabase REST | Browser path |
|---|---|---|---|
| `closed_boxes` GET | `[]` (RLS 0 rows) | **200 data** | `lib/api/available-slots.ts:41` + `lib/api/boxes.ts:22` через anon-key wrappedFetch |
| `closed_boxes` INSERT/UPDATE/DELETE | **42501 perm_denied** | **42501 perm_denied** | `lib/api/boxes.ts:toggleBox` admin UI (anon-key) |
| `tire_service_days` GET | `[]` (RLS 0 rows) | **200 data** | `lib/api/tire-service-days.ts:20/42/75/89/117` |
| `organizations/workers/salary_settings/tire_workers` GET | **42501 perm_denied** | **200 data** | `lib/api/clients.ts:getOrganizations` etc — anon-key wrappedFetch. **FIXED через wrappedFetch + admin JWT** (admin Bearer возвращает данные) |
| `admins` GET | **42501 perm_denied** | **42501 perm_denied** | `lib/api/admins.ts:getAdmins` — даже admin role не имеет SELECT grant |

**Только 2 gaps требуют fix в этом плане**:

1. **`closed_boxes` / `tire_service_days` anon SELECT** — RLS policy `staff_select_closed_boxes USING (auth.jwt() IS NULL)` не проходит для реального anon JWT (`{}`), результат = 0 rows. **Client-side booking flow не видит закрытые слоты** → может создать booking на закрытое время → race.

2. **`toggleBox` admin UI write** — `closed_boxes` INSERT/UPDATE/DELETE grant = false для authenticated. **Admin UI не может открывать/закрывать боксы** через anon-key path.

**НЕ требуют fix** (admin Bearer работает корректно через wrappedFetch):
- organizations/workers/salary_settings/tire_workers: admin JWT через apikey + wrappedFetch = 200 data. Browser-side уже работает ПОСЛЕ login (Phase A dispatchStaffCall fix + wrappedFetch).

**Отдельный маленький gap** (НЕ блокер, документирую):
- `admins` SELECT grant = false для authenticated. admin не может SELECTить других admins. **Browser-side admin UI не сломается**, потому что admin UI вызывает `getAdmins()` через anon-key apikey (без admin JWT). Anon grant = false → RLS fail. Это уже сломано. **Отдельный task** для Phase B+ или minor fix в этом же плане (см. §5).

---

## 2. Proposed fix A: anon-readable SELECT policy for closed_boxes / tire_service_days

### 2.1 Rationale

Both tables are **public reference data** (when boxes are closed, when tire service days are open). Client booking flow MUST see them for slot validation. Per Phase 1.3 entry pattern, Category D = public reference, anon-readable.

### 2.2 Migration: `022_public_reference_anon_select.sql`

```sql
-- 022_public_reference_anon_select.sql
--
-- Re-open anon SELECT for public-reference tables closed_boxes and
-- tire_service_days after Slice #3d migration 019 (A2 closed_boxes
-- split, A3 tire_service_days split) unintentionally hid them from
-- client-side booking flow.
--
-- Pre-Slice-3d: public_all_access USING(true) for ALL commands → anon
--   could read closed_boxes. Slice #3d migration 019 replaced it
--   with staff_select_closed_boxes USING (app_role IN ('admin','owner')
--   OR auth.jwt() IS NULL) — but real anon JWT is '{}', not NULL, so
--   RLS returns 0 rows. Client booking flow cannot see closed slots.
--
-- This migration:
--   (1) Drops the conflicting SELECT clause in staff_select_* policies
--   (2) Adds new anon-readable SELECT policy (client_select_closed_boxes,
--       client_select_tire_service_days) USING (true)
--   (3) Keeps staff_select_*, staff_write_*, staff_delete_* intact
--   (4) INSERT/UPDATE/DELETE remain staff-only (admin/owner via
--       service_role dispatcher)
--
-- Demo-only. Prod-only after coordinated rollout (entry 22 owner policy).

-- closed_boxes: re-open anon SELECT
DROP POLICY IF EXISTS "staff_select_closed_boxes" ON public.closed_boxes;
CREATE POLICY "client_select_closed_boxes"
  ON public.closed_boxes
  FOR SELECT
  TO anon, authenticated
  USING (true);
-- Note: grants (already in place after migration 019) — anon SELECT=true,
-- authenticated SELECT=true, anon I/U/D=false (closed), auth I/U/D=false
-- (closed). admin/owner writes go through /api/staff dispatcher with
-- service_role (bypasses RLS).

-- tire_service_days: same pattern
DROP POLICY IF EXISTS "staff_select_tire_service_days" ON public.tire_service_days;
CREATE POLICY "client_select_tire_service_days"
  ON public.tire_service_days
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- staff write/delete policies intact (per migration 019)
-- service_role_all_access intact (bypass for dispatcher)
```

### 2.3 Apply + verify (when OK)

```bash
psql "$TEST_URL" -f migrations/022_public_reference_anon_select.sql

# Verify 4-step §20d per table:
# (a) proacl::text inspection — policy USING = true
# (b) SET ROLE anon + actual query → rows returned (not empty)
# (c) SET ROLE anon + INSERT attempt → permission_denied (write still closed)
# (d) service_role bypass → still works
```

### 2.4 Risk

**Владелец должен рассмотреть**: anon-readable `closed_boxes` показывает **всем нелогиненным посетителям** когда боксы закрыты. Это information leak (можно infer "мойка не работает в эти дни"). Но это **публичная информация** для booking системы — клиенты должны её видеть для slot validation. **Acceptable trade-off**, аналогично public holidays.

### 2.5 Migration ordering

This migration MUST run BEFORE Phase 2.5 (030 anon REVOKE), потому что Phase 2.5 закрывает anon SELECT на всех Category C tables. **Если 022 не применён, Phase 2.5 сделал бы client booking flow невидимым для closed_boxes/tire_service_days**.

---

## 3. Proposed fix B: toggle-box dispatcher action

### 3.1 Rationale

`lib/api/boxes.ts:toggleBox()` — admin UI вызывает anon-key path. После Slice #3d migration 019 anon INSERT/UPDATE/DELETE = false. **Admin UI сломан**.

### 3.2 New dispatcher action: `toggle-box` в `api/staff.ts`

**New ALLOWED_ACTIONS entry**:
```ts
// Slice #3e Phase A follow-up: admin-side closed_boxes write port.
// Closes the anon-key toggleBox gap that was exposed by Slice #3d
// migration 019 (anon INSERT grant revoked).
'toggle-box',
```

**New action handler** (after existing `searchClientByPhone` at ~line 252):
```ts
// === action: toggle-box ===
//
// Phase A follow-up: ports lib/api/boxes.ts:toggleBox() anon-side
// admin operation to dispatcher with service_role bypass.
//
// Body:
//   box_number: integer 1-3
//   closed_date: string YYYY-MM-DD
//   profile_id: string UUID (admin/owner doing the action)
//
// Logic mirrors original toggleBox():
//   1. SELECT existing row WHERE box_number AND closed_date
//   2a. If exists: UPDATE is_closed (toggle), closed_at, closed_by
//   2b. If not exists: INSERT is_closed=true, closed_at=now(), closed_by=profile_id
async function toggleBoxAction(_claims: StaffClaims, body: AnyObj): Promise<ActionResult> {
  const box_number = readNumberInRange(body, 'box_number', 1, 99);
  if (box_number === null || box_number === undefined) {
    throw new ValidationError('box_number_required');
  }
  const closed_date = readISODate(body, 'closed_date');
  const profile_id = readUuidRequired(body, 'profile_id');

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('closed_boxes')
    .select('*')
    .eq('box_number', box_number)
    .eq('closed_date', closed_date)
    .maybeSingle();

  if (exErr) {
    console.error('[staff:toggle-box] lookup error:', exErr.message);
    return failAction(500, 'db_error', { detail: exErr.message });
  }

  if (existing) {
    // Toggle: flip is_closed, set/clear closed_at and closed_by
    const newIsClosed = !existing.is_closed;
    const { data, error } = await supabaseAdmin
      .from('closed_boxes')
      .update({
        is_closed: newIsClosed,
        closed_at: newIsClosed ? new Date().toISOString() : null,
        closed_by: newIsClosed ? profile_id : null,
        updated_at: new Date().toISOString(),
      })
      .eq('box_number', box_number)
      .eq('closed_date', closed_date)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[staff:toggle-box] update error:', error.message);
      return failAction(500, 'db_error', { detail: error.message });
    }
    return { status: 200, body: { data: { closedBox: data, toggled: true } } };
  } else {
    // Insert new closed=true record
    const { data, error } = await supabaseAdmin
      .from('closed_boxes')
      .insert({
        box_number,
        closed_date,
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: profile_id,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error('[staff:toggle-box] insert error:', error.message);
      return failAction(500, 'db_error', { detail: error.message });
    }
    return { status: 200, body: { data: { closedBox: data, toggled: true } } };
  }
}
```

**Switch case** (after `get-client-cars-by-client-id`):
```ts
case 'toggle-box': result = await toggleBoxAction(guard.claims, body); break;
```

### 3.3 Wrapper in `lib/api/staff-actions.ts`

```ts
// === toggle-box ===
// Replaces lib/api/boxes.ts:toggleBox() anon-side admin operation.
// Closes Slice #3d migration 019 anon INSERT/UPDATE/DELETE grant revoke gap.
export interface ToggleBoxResult {
  closedBox: {
    id: string;
    box_number: number;
    closed_date: string;
    is_closed: boolean;
    closed_at: string | null;
    closed_by: string | null;
  };
  toggled: boolean;
}
export async function toggleBoxActionDispatcher(
  boxNumber: number,
  closedDate: string,
  profileId: string,
): Promise<ToggleBoxResult> {
  const res = await dispatchStaffCall<{
    data?: ToggleBoxResult;
    error?: string;
  }>('toggle-box', {
    box_number: boxNumber,
    closed_date: closedDate,
    profile_id: profileId,
  });
  if (!res.data) throw new Error('toggle-box: no data in response');
  return res.data;
}
```

### 3.4 Frontend rewire (App.tsx or Admin UI)

**Lib/api/boxes.ts** — оставить `getBoxes` (anon-readable, no change) + mark `toggleBox` DEPRECATED with stub error:
```ts
/**
 * DEPRECATED Phase A follow-up: was anon-side INSERT/UPDATE on
 * closed_boxes via supabase. After Slice #3d migration 019 anon grants
 * revoked, this fails with 42501 permission_denied. Replaced by
 * toggleBoxActionDispatcher() (api/staff.ts) which uses service_role.
 *
 * Zero live callers after the App.tsx rewire below — kept as throw-stub
 * to avoid silent re-introduction.
 */
export async function toggleBox(_boxNumber: number, _date: string, _profileId: string): Promise<ClosedBox> {
  throw new Error('toggleBox: deprecated, use toggleBoxActionDispatcher');
}
```

**App.tsx handler** that calls `toggleBox` (around line 800 area, App.tsx context):
```bash
grep -n "toggleBox\|toggle-box" App.tsx components/admin/*.tsx | head -10
```

Replace `toggleBox(...)` calls with `toggleBoxActionDispatcher(boxNumber, date, profileId)`.

### 3.5 Tests (Phase A follow-up cluster)

| Test ID | Description |
|---|---|
| T1 | `toggle-box` no token → 401 |
| T2 | `toggle-box` admin JWT → 200, existing row toggle |
| T4 | `toggle-box` admin JWT → 200, new row insert |
| T5 | `toggle-box` missing box_number → 400 |
| T6 | `toggle-box` bad closed_date format → 400 closed_date_bad_format |
| T7 | `toggle-box` bad profile_id uuid → 400 profile_id_bad_format |
| T8 | `toggle-box` anon key (no Authorization) → 401 missing_authorization |

### 3.6 Risk

- Service_role bypass means dispatcher can write to closed_boxes без проверки RLS. **Acceptable** — dispatcher is server-side, only admin/owner can call (guard.claims.app_role).
- Same pattern as Slice #3d Path B staff-* policies + service_role bypass.

---

## 4. Bonus fix C: `admins` SELECT grant

### 4.1 Issue

`has_table_privilege('authenticated', 'public.admins', 'SELECT') = false` (per Step #1 verify). Admin role (authenticated) cannot SELECT admins. **Even admin Bearer fails**. This means even after `getAdmins()` is dispatcher-ized, if Phase 2.5 anon REVOKE is applied, anon can't read admins (OK), but **authenticated admin ALSO can't read admins through direct REST** (not OK).

### 4.2 Decision

If admin UI uses dispatcher (`getAdminsAction` going through `/api/staff` with service_role) — works fine, RLS bypassed. **Skip admins grant fix in this plan**. Document as separate gap for later.

### 4.3 Optional: minimal migration if needed

```sql
-- 023_admins_authenticated_select_grant.sql (optional)
-- If dispatcher migration is delayed and admin UI needs direct SELECT,
-- grant authenticated SELECT on admins. RLS staff_select_admins
-- USING (app_role IN ('admin','owner')) already enforces role check.
GRANT SELECT ON public.admins TO authenticated;
```

**Recommendation**: **don't add this**. Use dispatcher pattern for `getAdmins`. Add to Phase B scope.

---

##6. Demo deploy sequence (when ОК)

1. **Migration 022** (closed_boxes + tire_service_days anon-readable SELECT)
   - apply via psql
   - verify 4-step §20d on demo
   - browser smoke: client booking flow sees closed slots

2. **Code commit** (toggle-box dispatcher + rewire):
   - `api/staff.ts`: new `toggleBoxAction` + ALLOWED_ACTIONS entry + switch case
   - `lib/api/staff-actions.ts`: new wrapper
   - `lib/api/boxes.ts`: toggleBox → deprecated stub
   - `App.tsx` (or wherever `toggleBox` is called): rewire to dispatcher
   - 8 new tests in test-staff-booking-endpoints.mjs cluster

3. **Commit + push + wait for Vercel deploy + alias reassign**

4. **Run full test suite + browser smoke**

5. **Final report + commit chain + Phase B status update**

---

## 7. NOT in this plan (deferred)

- **Phase B** (client-side cancellation/loyalty ports) — still blocked per владелец messages about baseline arithmetic.
- **Realtime `setAuth()`** — Phase D/E gap (documented in recon-slice-3e-v2).
- **`admins` authenticated SELECT grant** — optional, deferred.
- **Phase 2.5 anon REVOKE** (migration 030) — needs this fix first.
- **Production rollout** — separate owner question.

---

## 8. Open questions (для ОК)

| Q | Question |
|---|---|
| Q1 | OK применить migration 022 на demo? (anon-readable closed_boxes/tire_service_days) |
| Q2 | OK добавить toggle-box dispatcher action + rewire App.tsx + 8 tests? |
| Q3 | Bonus fix C (`admins` SELECT grant) — apply now или defer to Phase B? |
| Q4 | После этого плана — продолжать Phase B как originally planned, или Phase B wait до cleaner baseline arithmetic от владельца? |