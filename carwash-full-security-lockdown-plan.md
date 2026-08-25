# Полный план защиты carwash-admin-pro (админка + Telegram Mini App)

Основано на двух диагностических отчётах: аудит БД/API и аудит клиентской Telegram-аутентификации. Цель — закрыть чтение/запись/удаление для всех, кроме того, кому это разрешено, включая клиентскую мини-апп.

> **Режим внедрения:** каждая фаза прогоняется на Supabase preview branch, не на проде. Перед каждой фазой — снимок текущего состояния `pg_policies` и `role_table_grants` в `rollback/<phase>_policies_before.sql` и `rollback/<phase>_grants_before.sql` для отката. Код откатывается через Vercel «Promote to Production» на предыдущий деплой.

---

## Критические находки, меняющие план

1. `telegram_id` берётся из `initDataUnsafe.user.id` **без HMAC-проверки подписи**. Любой может подставить чужой ID через DevTools и стать любым клиентом.
2. Anon-клиент может **создать запись в `clients`** без всякой авторизации (`ClientBookingWrapper.tsx:399`, `lib/api/clients.ts`).
3. `App.tsx` грузит `workers`, `admins`, `salary_settings`, весь `clients` **до разрешения authState** — потенциально видно и клиентской мини-аппе.
4. Realtime-подписки без `filter` (`bookings`, `closed_boxes`, `tire_service_days`, `loyalty_carwash_progress`) транслируют все строки всем подписчикам.
5. Часть таблиц (`services`, `tire_services`, `booking_settings`, `closed_boxes`, `tire_service_days`) должны оставаться читаемыми без авторизации — это легитимные публичные справочники для виджета записи. Их нельзя закрывать так же, как `admins`/`payments`.
6. `auth_logs`, `sms_logs`, `otp_codes` спроектированы для аудита, но **никто не пишет туда** (`count(*)` = 0 во всех трёх) — после фикса нужно заполнять.
7. `verify_password` RPC остаётся доступной anon напрямую — пока staff не переключится на `/api/login`, перебор логинов возможен.

---

## Целевая архитектура ролей

| Роль в JWT (`app_role`) | Кто | Как получает токен |
|---|---|---|
| `owner` | Владелец бизнеса | `/api/login` через `verify_password` (через service_role) |
| `admin` | Администратор/мойщик со входом | `/api/login` через `verify_password` (через service_role) |
| `client` | Клиент в Telegram Mini App | `/api/telegram-auth` через HMAC-проверенный `initData` |
| (без токена) | Анонимный посетитель | только справочники Категории D на чтение |

**Единый JWT-payload** (HS256, подписан `SUPABASE_JWT_SECRET`):
```json
{
  "sub": "<profile_id>",
  "role": "authenticated",
  "app_role": "owner" | "admin" | "client",
  "profile_id": "<uuid>",
  "telegram_id": 123456789,
  "exp": 1234567890
}
```

**TTL:** 12 часов (`exp = now + 43200`). Для клиента в Mini App — silent re-auth через `/api/telegram-auth` при истечении (initData всегда свежий). Для staff — re-login по паролю, без silent re-auth.

**Хранение токена:**
- Staff (admin, owner): только в памяти (`currentToken` — модульная переменная `lib/supabase.ts`), **без cookie и без sessionStorage**. Закрытие таба / reload = выход. Осознанный компромисс: staff логинится чаще, но окно XSS-атаки минимально.
- Client (Mini App): в памяти (`currentToken`) + `sessionStorage` backup для скорости первого рендера. **Не источник правды** — на каждом старте Mini App делается silent `/api/telegram-auth`, HMAC-проверка всегда свежая.

---

## Архитектура JWT-инъекции в supabase-js

Единый singleton `lib/supabase.ts` с кастомным `fetch`, который подставляет `Authorization: Bearer <jwt>`:

```typescript
// lib/supabase.ts
let currentToken: string | null = null;

export function setSessionToken(t: string | null) {
  currentToken = t;
}

// Восстановление из sessionStorage при загрузке модуля (для client only, ускоряет первый рендер)
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem('sb_token');
    if (stored) currentToken = stored;
  } catch (_) { /* sessionStorage недоступен */ }
}

function injectAuth(options: RequestInit = {}): RequestInit {
  const headers = new Headers(options.headers);
  if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`);
  return { ...options, headers };
}

let retried = false;
async function wrappedFetch(url: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  let res = await fetch(url, injectAuth(options));

  // 401 → максимум 1 silent re-auth (только для client-сессии)
  if (res.status === 401 && !retried && isClientSession()) {
    retried = true;
    const newToken = await silentTelegramReauth();
    if (newToken) {
      setSessionToken(newToken);
      res = await fetch(url, injectAuth(options));
    }
  }
  retried = false;
  return res;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: wrappedFetch },
});
```

**Логика 401-retry:**
- **Client**: максимум 1 попытка silent re-auth через `/api/telegram-auth`. Если retry снова 401 → отдаём ошибку наверх, UI показывает «Не удалось загрузить, откройте заново через Telegram».
- **Staff**: никакого silent re-auth. Сразу «Сессия истекла, войдите заново», `setSessionToken(null)`, очистка состояния, редирект на Login.
- **Аноним**: 401 = реальная ошибка, без retry.

**Изменения в коде:** только `lib/supabase.ts`. Все 29 файлов в `lib/api/*.ts` продолжают импортировать тот же `supabase` без правок.

---

## Жизненный цикл authState в `App.tsx`

```typescript
type AuthState =
  | { status: 'resolving' }
  | { status: 'anon' }
  | { status: 'authenticated'; app_role: 'owner' | 'admin' | 'client'; profile_id: string; telegram_id?: number };

const [authState, setAuthState] = useState<AuthState>({ status: 'resolving' });

useEffect(() => {
  (async () => {
    // 1. Очистка legacy localStorage от старой схемы
    if (localStorage.getItem('userRole') || localStorage.getItem('userId')) {
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');
      setAuthState({ status: 'anon' });
      return; // пользователь увидит Login
    }

    // 2. Для Mini App — silent /api/telegram-auth
    if (isTelegramWebApp()) {
      const r = await fetch('/api/telegram-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: window.Telegram.WebApp.initData }),
      });
      if (r.ok) {
        const { token, profile_id, telegram_id, app_role } = await r.json();
        setSessionToken(token);
        sessionStorage.setItem('sb_token', token);
        setAuthState({ status: 'authenticated', app_role, profile_id, telegram_id });
        return;
      }
    }

    // 3. Для staff — токен только в памяти, при reload придётся логиниться
    if (currentToken && !isTelegramWebApp()) {
      const claims = decodeJwtUnsafe(currentToken); // только для UI-роутинга
      setAuthState({ status: 'authenticated', app_role: claims.app_role, profile_id: claims.profile_id });
      return;
    }

    setAuthState({ status: 'anon' });
  })();
}, []);
```

**До разрешения `authState.status === 'authenticated'` App.tsx грузит ТОЛЬКО Категорию D** (справочники). Все `useEffect` для КаCategoryрии A/B/C зависят от `authState.status === 'authenticated' && authState.app_role in (...)` — не от `localStorage.userRole`.

**UI-routing по `app_role`:** декод JWT без проверки подписи допустим **только для отображения кнопок и роутинга**. Источник правды — RLS. Подделка `app_role` в памяти даёт максимум «красивую кнопку не для той роли», ни один реальный запрос не пройдёт.

---

## Фаза 0 — сегодня, до любых архитектурных правок (не ломает текущий флоу)

### 0.0 Снимок состояния для отката

```sql
-- Сохранить в rollback/phase0_policies_before.sql
\copy (select 'CREATE POLICY ' || policyname || ' ON public.' || tablename ||
       ' FOR ' || cmd || ' TO ' || roles::text ||
       ' USING (' || qual || ') WITH CHECK (' || coalesce(with_check, 'true') || ');;'
       from pg_policies where schemaname='public' order by tablename, policyname)
       to 'rollback/phase0_policies_before.sql';

-- Сохранить в rollback/phase0_grants_before.sql
\copy (select 'GRANT ' || privilege_type || ' ON public.' || table_name ||
       ' TO ' || grantee || ';' from information_schema.role_table_grants
       where table_schema='public' and grantee in ('anon','authenticated')
       order by table_name, grantee) to 'rollback/phase0_grants_before.sql';
```

### 0.1 Column-level revoke (безопасно)

```sql
revoke select (password_hash) on public.profiles from anon, authenticated;
revoke select (card_number, payment_phone) on public.admins from anon, authenticated;
revoke select (card_number, payment_phone) on public.workers from anon, authenticated;
```

### 0.2 App.tsx — обернуть staff-данные условием на userRole

Найти в `App.tsx` (строки ~230-271) вызовы `getOrganizations()`, `getOrganizationDrivers()`, `getOrganizationCars()`, `getClients()`, `getWorkers()`, `getTireWorkers()`, `getAdmins()`, `getSalarySettings()`. Обернуть:

```typescript
if (userRole === 'admin' || userRole === 'owner') {
  // текущие вызовы
}
```

Это не устраняет дыру в RLS, но убирает вызовы, которые сейчас могут срабатывать даже в клиентской сессии.

### 0.3 TRUNCATE/REFERENCES revoke + DELETE на чувствительных таблицах

```sql
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('revoke truncate, references on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke delete on public.salary_transactions, public.payments, public.profiles, public.admins, public.workers from anon, authenticated;
```

**Критерий «стоп»:** если после применения любого пункта фазы 0 хоть один реальный экран CRM или клиентского виджета не грузится — немедленный откат через `rollback/phase0_*.sql`.

---

## Фаза 1 — JWT-аутентификация (новый фундамент)

**Каждая подфаза сначала на Supabase preview branch.** Без исключений.

### 1.1 Env-переменные в Vercel

Добавить через **Vercel Dashboard → Settings → Environment Variables** руками (не через агента, не в `.env` фронта):

| Переменная | Scope | Где берётся |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Production + Preview | `@BotFather` → токен того бота, который открывает мини-апп |
| `SUPABASE_JWT_SECRET` | Production + Preview | Supabase Dashboard → Settings → API → JWT Secret |

Без префикса `VITE_`. Не попадают в JS-бандл.

### 1.2 `/api/telegram-auth.ts`

```typescript
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

function verifyTelegramInitData(initData: string, botToken: string): { valid: boolean; user?: any } {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { valid: false };
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return { valid: false };

  const authDate = Number(params.get('auth_date'));
  if (Date.now() / 1000 - authDate > 86400) return { valid: false };

  const user = JSON.parse(params.get('user') || '{}');
  return { valid: true, user };
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req, res) {
  const { initData } = req.body;
  const { valid, user } = verifyTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN!);

  // Логируем КАЖДУЮ попытку — успешную или нет
  await supabaseAdmin.from('auth_logs').insert({
    login: `tg:${user?.id || 'unknown'}`,
    success: valid && !!user?.id,
    ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    user_agent: req.headers['user-agent'],
    auth_method: 'telegram',
    created_at: new Date().toISOString(),
  });

  if (!valid || !user?.id) {
    return res.status(401).json({ error: 'Invalid Telegram signature' });
  }

  // Ищем существующий profile
  let { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, full_name, phone, telegram_id')
    .eq('telegram_id', user.id)
    .single();

  // Саморегистрация клиента: profile + clients создаются серверно, role='client' ХАРДКОД
  if (!profile) {
    const { data: created } = await supabaseAdmin
      .from('profiles')
      .insert({
        role: 'client',                                            // ← ВСЕГДА client, никогда из тела запроса
        full_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Telegram User',
        telegram_id: user.id,
        last_auth_method: 'telegram',
      })
      .select('id, role, full_name, phone, telegram_id')
      .single();

    if (created) {
      // Создаём запись в clients с profile_id (заменяет старый anon-insert)
      await supabaseAdmin.from('clients').insert({
        profile_id: created.id,
        full_name: created.full_name,
        phone: created.phone || null,
        is_active: true,
      });
    }
    profile = created;
  }

  if (!profile || (profile.role !== 'client' && profile.role !== 'admin' && profile.role !== 'owner')) {
    return res.status(403).json({ error: 'Role not permitted' });
  }

  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    {
      sub: profile.id,
      role: 'authenticated',
      app_role: profile.role,
      profile_id: profile.id,
      telegram_id: user.id,
      exp: Math.floor(Date.now() / 1000) + 43200,
    },
    process.env.SUPABASE_JWT_SECRET!,
    { algorithm: 'HS256' }
  );

  res.json({
    token,
    profile_id: profile.id,
    app_role: profile.role,
    telegram_id: user.id,
  });
}
```

**Важно:** саморегистрация работает **только** после успешной HMAC-проверки. Создание `profile` + `clients` происходит через `service_role`. `role` всегда `'client'` в коде, никогда не берётся из `initData`. Это сохраняет текущий UX (новый клиент открывает Mini App и сразу может записаться) и закрывает дыру с anon-INSERT в `clients`.

### 1.3 `/api/login.ts` (для staff)

```typescript
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req, res) {
  const { login, password } = req.body;

  const { data: rows } = await supabaseAdmin.rpc('verify_password', {
    p_login: login,
    p_password: password,
  });
  const profile = rows?.[0];

  // Логируем КАЖДУЮ попытку
  await supabaseAdmin.from('auth_logs').insert({
    login,
    success: !!profile?.success,
    ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    user_agent: req.headers['user-agent'],
    auth_method: 'password',
    created_at: new Date().toISOString(),
  });

  if (!profile?.success || !['admin', 'owner'].includes(profile.role)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  const token = jwt.sign(
    {
      sub: profile.id,
      role: 'authenticated',
      app_role: profile.role,
      profile_id: profile.id,
      exp: Math.floor(Date.now() / 1000) + 43200,
    },
    process.env.SUPABASE_JWT_SECRET!,
    { algorithm: 'HS256' }
  );

  res.json({
    token,
    profile_id: profile.id,
    app_role: profile.role,
  });
}
```

### 1.4 `lib/supabase.ts` — fetch wrapper + sessionStorage restore

См. раздел «Архитектура JWT-инъекции в supabase-js» выше. Один файл, остальные 29 `lib/api/*.ts` не меняются.

### 1.5 `Login.tsx` — переключение на `/api/login`

```typescript
const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    if (!res.ok) {
      setError('Неверный логин или пароль');
      setLoading(false);
      return;
    }
    const { token, profile_id, app_role } = await res.json();
    setSessionToken(token);
    // НЕ пишем в sessionStorage — staff токен только в памяти
    setAuthState({ status: 'authenticated', app_role, profile_id });
    onLogin(profile_id, app_role);
  } catch (err) {
    setError('Ошибка входа');
    setLoading(false);
  }
};
```

### 1.6 Клиентские компоненты — переключение на `/api/telegram-auth`

`ClientBookingWrapper.tsx`, `ClientTireBookingWrapper.tsx`, `MyGarage.tsx` заменяют прямой `supabase.from('profiles').eq('telegram_id', ...)` на:

```typescript
// В начале loadClientData():
if (isTelegramWebApp()) {
  const r = await fetch('/api/telegram-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: window.Telegram.WebApp.initData }),
  });
  if (!r.ok) {
    setError('Не удалось авторизоваться через Telegram');
    setLoading(false);
    return;
  }
  const { token, profile_id, app_role, telegram_id } = await r.json();
  setSessionToken(token);
  sessionStorage.setItem('sb_token', token);
  setProfileId(profile_id);
  setAuthState({ status: 'authenticated', app_role, profile_id, telegram_id });
  // Дальнейшие запросы идут через supabase с JWT в заголовке
}
```

### 1.7 `App.tsx` — миграция legacy localStorage + authState lifecycle

См. раздел «Жизненный цикл authState в `App.tsx`». На старте: если в `localStorage` есть `userRole` или `userId` — очистить и редирект на Login.

### 1.8 Rate-limit на `/api/telegram-auth`

Через Vercel middleware (`middleware.ts` в корне репо):
```typescript
export const config = { matcher: '/api/telegram-auth' };
export default async function middleware(req) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  // Простейший in-memory rate-limit (в проде заменить на KV/Edge Config)
  if (!rateLimiter.check(ip, 100, 60_000)) {
    return new Response('Too Many Requests', { status: 429 });
  }
}
```

---

## Фаза 1.5 — `/api/link-client-profile.ts` + миграция legacy-клиентов

**Только после того, как Фаза 1 задеплоена и протестирована на preview-ветке.**

### 1.5.1 Миграция legacy-клиентов (до RLS Категории C)

```sql
-- rollback/phase1.5_clients_before.sql: SELECT id, profile_id, phone FROM clients WHERE profile_id IS NULL
update clients c set profile_id = p.id
from profiles p
where c.profile_id is null and c.phone = p.phone and p.role = 'client';
-- Для не-сматчившихся: ручная привязка через кнопку "привязать Telegram" в админке (отдельная задача)
```

### 1.5.2 `/api/link-client-profile.ts`

Принимает JWT клиента, проверяет подпись через `jwt.verify`, делает upsert в `clients` через `service_role`. **Заменяет** `ClientBookingWrapper.tsx:399` (`createClient`) и `:405` (`update profile_id`).

```typescript
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  let claims;
  try {
    claims = jwt.verify(authHeader.slice(7), process.env.SUPABASE_JWT_SECRET!);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (claims.app_role !== 'client' || !claims.profile_id) {
    return res.status(403).json({ error: 'Not a client' });
  }

  // upsert clients с привязкой к profile_id
  const { data, error } = await supabaseAdmin
    .from('clients')
    .upsert({
      profile_id: claims.profile_id,
      // ... поля, которые приходят из тела запроса
    }, { onConflict: 'profile_id' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ client: data });
}
```

### 1.5.3 `ClientBookingWrapper.tsx` и `ClientTireBookingWrapper.tsx`

Заменяют `createClient({...})` и `update profile_id` на `fetch('/api/link-client-profile', { method: 'POST', body: {...} })`. Если 401 → silent re-auth и retry.

**Только после успешного теста этой фазы:**

---

## Фаза 1.7 — REVOKE EXECUTE на `verify_password`

```sql
revoke execute on function public.verify_password(p_login varchar, p_password text) from anon;
```

**В тот же день**, что переключение `Login.tsx` на `/api/login`. Если сделать раньше — staff не сможет залогиниться вообще. Если позже — перебор логинов через прямой RPC остаётся.

---

## Фаза 1.8 — Storage: `/api/upload-receipt.ts`

### 1.8.1 Найти реальное место загрузки

```bash
grep -rn "storage\.from\|\.upload(" --include="*.ts" --include="*.tsx" .
```

Скорее всего в `lib/api/expenses.ts` или в форме добавления расхода. Точное место фиксируется перед началом фазы.

### 1.8.2 Создать `/api/upload-receipt.ts`

Принимает `multipart/form-data`, проверяет JWT (`app_role in ('admin','owner')`), загружает через `service_role` Storage client.

### 1.8.3 Переключить фронт

```typescript
// Было: await supabase.storage.from('expense-receipts').upload(...)
// Стало:
await fetch('/api/upload-receipt', { method: 'POST', body: formData });
```

### 1.8.4 Закрыть bucket

Только после успешного теста:

```sql
drop policy if exists "Allow all operations on expense-receipts" on storage.objects;
create policy "service_role_only_receipts" on storage.objects for all
to service_role using (bucket_id = 'expense-receipts');

drop policy if exists "Allow all operations on inventory-photos" on storage.objects;
drop policy if exists "Public Access to inventory-photos" on storage.objects;
create policy "service_role_only_inventory" on storage.objects for all
to service_role using (bucket_id = 'inventory-photos');
-- Если фото инвентаря должны быть публичными — отдельная policy для SELECT to anon:
-- create policy "public_read_inventory" on storage.objects for select
--   to anon, authenticated using (bucket_id = 'inventory-photos');
```

---

## Фаза 2 — RLS: 5 категорий

**На Supabase preview branch.** Перед каждой подфазой — снимок `pg_policies` и `role_table_grants` в `rollback/phase2_*_before.sql`.

### Категория A — Owner only

`salary_settings`, `salary_transactions`, `company_settings`, `admins`

```sql
create policy "owner_only" on public.salary_transactions for all
to authenticated using ((auth.jwt()->>'app_role') = 'owner')
with check ((auth.jwt()->>'app_role') = 'owner');
revoke all on public.salary_transactions from anon, authenticated;
grant select, insert, update, delete on public.salary_transactions to authenticated;

-- Повторить для salary_settings, company_settings, admins
```

### Категория B — Staff (admin + owner)

`bookings`, `bookings_timeline`, `workers`, `expenses`, `inventory_arrivals`, `inventory_categories`, `inventory_items`, `inventory_operations`, `tire_workers`, `tire_bookings_timeline`, `work_shifts`, `worksheet_entries`, `worksheets`, `product_sales`, `document_numbers`, `daily_reports`, `booking_cancellations`, `closed_boxes` (запись), `organizations`, `organization_cars`, `organization_drivers`, `profiles` (запись)

```sql
create policy "staff_access" on public.bookings for all
to authenticated using ((auth.jwt()->>'app_role') in ('admin','owner'))
with check ((auth.jwt()->>'app_role') in ('admin','owner'));

-- Повторить для каждой таблицы Категории B
-- Для profiles: только INSERT/UPDATE/DELETE, SELECT — отдельная policy (Категория C и D)
-- Для closed_boxes: SELECT публичный (см. Категорию D), INSERT/UPDATE/DELETE — staff
```

### Категория C — Клиент видит только свои строки

`clients`, `client_cars`, `bookings` (SELECT своих), `tire_bookings` (SELECT своих), `loyalty_carwash_progress`

```sql
create policy "client_own_data" on public.clients for select
to authenticated using ((auth.jwt()->>'app_role') = 'client' and profile_id = (auth.jwt()->>'profile_id')::uuid);

create policy "client_own_bookings" on public.bookings for select
to authenticated using (
  (auth.jwt()->>'app_role') = 'client'
  and created_by_profile_id = (auth.jwt()->>'profile_id')::uuid
);

-- Клиент НЕ имеет INSERT/UPDATE/DELETE на bookings — создание только через
-- /api/create-pending-booking + yookassa-webhook с service_role
-- То же для tire_bookings, loyalty_carwash_progress
-- Повторить для client_cars (фильтр по client_id через подзапрос к clients)
```

### Категория D — Публичные справочники

`services`, `tire_services`, `booking_settings` (только SELECT), `sbp_banks`, **`closed_boxes` (только SELECT)**, **`tire_service_days` (только SELECT)**

```sql
create policy "public_read_services" on public.services for select
to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.services from anon, authenticated;
-- INSERT/UPDATE/DELETE — только через service_role или staff (вторая policy)

-- Аналогично для tire_services, booking_settings, sbp_banks
-- Для closed_boxes и tire_service_days — SELECT to anon, authenticated using (true),
-- INSERT/UPDATE/DELETE — через staff (Категория B)
```

### Категория E — Только через сервер

`payments`, `pending_bookings`, `otp_codes`, `sms_logs`, `sms_rate_limits`, `auth_logs`

```sql
revoke all on public.payments from anon, authenticated;
revoke all on public.pending_bookings from anon, authenticated;
revoke all on public.otp_codes from anon, authenticated;
revoke all on public.sms_logs from anon, authenticated;
revoke all on public.sms_rate_limits from anon, authenticated;
revoke all on public.auth_logs from anon, authenticated;
```

Все операции на этих таблицах — только через `service_role` (Vercel Functions с проверкой JWT).

### Категория E не применять к таблицам Категории D

Не путать: `closed_boxes` и `tire_service_days` — в Категории D (anon SELECT), а не E. Они нужны клиентскому виджету для отображения статуса боксов и дней.

---

## Фаза 2.5 — REVOKE INSERT/UPDATE на `clients`

**Только после того, как Фаза 1.5 (link-client-profile) задеплоена и протестирована:**

```sql
revoke insert, update, delete on public.clients from anon;
```

До этого anon-INSERT в `clients` остаётся (через `ClientBookingWrapper.tsx:399`) — но после деплоя `/api/link-client-profile.ts` этот код должен быть уже переключён.

---

## Фаза 3 — Публичные view для занятости слотов

Проблема: клиенту нужен Timeline с занятостью боксов, но RLS Категории C даёт ему только свои бронирования. Без view виджет покажет пустую занятость.

```sql
create view public.booking_slots_public as
select booking_date, start_time, end_time, box_number, status
from public.bookings;

alter view public.booking_slots_public set (security_invoker = on);

create policy "public_read_slots" on public.bookings for select
to anon, authenticated using (false);  -- запрещаем прямой SELECT из bookings для не-staff

grant select on public.booking_slots_public to anon, authenticated;

-- Аналогично для tire_bookings:
create view public.tire_booking_slots_public as
select booking_date, start_time, end_time, status
from public.tire_bookings;
alter view public.tire_booking_slots_public set (security_invoker = on);
grant select on public.tire_booking_slots_public to anon, authenticated;
```

**Фронт:** `ClientBookingWrapper.tsx`, `useActiveBookings` (для отображения занятости, не своих записей), Realtime-подписки переключаются на `booking_slots_public` / `tire_booking_slots_public` вместо прямых таблиц.

**Realtime на view:** Supabase Realtime работает на таблицах и их publication, не на view. Для трансляции событий view нужно добавить publication через триггер или использовать materialized view с ручным refresh (отдельная задача). Альтернатива: оставить Realtime на `bookings` для staff (Категория B пропускает), а клиента перевести на polling раз в N секунд.

---

## Обязательные операционные правила

### 1. Supabase preview branch

Каждая фаза (0, 1, 1.5, 1.7, 1.8, 2, 2.5, 3) — **сначала на preview branch**, не на проде. Создаётся через Supabase Dashboard → Branches → Create branch (или CLI). Все миграции применяются на ветке, тестируются 2-3 дня, потом merge.

### 2. Снимок перед каждой фазой

Перед любой миграцией — снимок текущего состояния в `rollback/<phase>_policies_before.sql` и `rollback/<phase>_grants_before.sql` (готовые `CREATE POLICY` / `GRANT` команды для восстановления).

### 3. Тест под каждой ролью

После применения каждой фазы — обязательный ручной тест:

```sql
-- Тест под anon
set local role anon;
select * from public.bookings;          -- должен быть пустым после Фазы 2
select * from public.booking_slots_public;  -- не пустой после Фазы 3
reset role;

-- Тест под staff (подменить claims через set_config для локального теста
-- или выпустить тестовый JWT с app_role='admin'):
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"<uuid>","role":"authenticated","app_role":"admin","profile_id":"<uuid>"}', true);
select * from public.bookings;          -- должны быть видны
reset role;
```

### 4. Критерий «стоп»

Если после применения любой фазы хотя бы один реальный экран CRM или клиентского виджета не грузится — **немедленный откат**:
1. `DROP POLICY` новых политик
2. `CREATE POLICY` из `rollback/<phase>_policies_before.sql`
3. Откат кода через Vercel «Promote to Production» на предыдущий деплой
4. Разбор причины отдельно, не «на живую»

### 5. Env-переменные — только руками

`TELEGRAM_BOT_TOKEN` и `SUPABASE_JWT_SECRET` добавляются **через Vercel Dashboard → Settings → Environment Variables**, scope = Production + Preview. Не через агента. Не в `.env` фронта. Не с префиксом `VITE_`.

---

## Порядок внедрения (чтобы не сломать прод)

1. **Снимок состояния** (rollback/phase0_*.sql) → Supabase preview branch
2. **Фаза 0** (низкий риск, кроме 0.1 → отложена в 2.5)
3. **Фаза 1.1** — добавить env-переменные в Vercel preview scope
4. **Фаза 1.2** — `/api/telegram-auth.ts` деплой (пока не используется клиентом — безопасно)
5. **Фаза 1.3** — `/api/login.ts` деплой (пока не используется — безопасно)
6. **Фаза 1.4** — `lib/supabase.ts` fetch wrapper (пока `setSessionToken` не вызывается — безопасно)
7. **Фаза 1.5** — `App.tsx` localStorage migration (пока только очистка, без переключения)
8. **Фаза 1.6** — клиентские компоненты переключаются на `/api/telegram-auth` + Staff Login.tsx на `/api/login`. **Это момент, когда пользователи начинают логиниться через новый путь.**
9. **Фаза 1.7** — REVOKE EXECUTE на verify_password (тот же день, что 1.6 для Login)
10. **Фаза 1.8** — Storage через `/api/upload-receipt.ts`
11. **Фаза 1.5 (link-client-profile)** — после того, как фаза 1 задеплоена и протестирована в проде хотя бы 2-3 дня
12. **Фаза 1.5.1** — миграция legacy-клиентов по phone (ДО RLS Категории C)
13. **Фаза 2** — RLS по категориям E → D → A → B → C (по одной, с тестом каждой)
14. **Фаза 2.5** — REVOKE INSERT/UPDATE на clients (после 1.5)
15. **Фаза 3** — public views для занятости (синхронно с переключением Realtime на view)
16. **Merge в prod** — только после прохождения всех тестов на preview

---

## Чек-лист

### Архитектура
- [ ] JWT подписан `SUPABASE_JWT_SECRET` (HS256), claims содержат `sub`, `app_role`, `profile_id`, `telegram_id`, `exp`
- [ ] TTL JWT — 12 часов
- [ ] Токен хранится: staff — в памяти, client — в памяти + sessionStorage backup
- [ ] fetch wrapper подставляет `Authorization: Bearer <jwt>` для всех запросов supabase-js
- [ ] 401-retry максимум 1 раз, только для client
- [ ] staff: на 401 — очистка + «Сессия истекла, войдите заново»
- [ ] Client: на 401 — silent `/api/telegram-auth` + retry

### БД/API
- [ ] `/api/telegram-auth` проверяет HMAC-SHA256 подпись initData через `TELEGRAM_BOT_TOKEN`
- [ ] initData старше 24ч отбраковывается
- [ ] `/api/telegram-auth` логирует КАЖДУЮ попытку в `auth_logs` (success и fail)
- [ ] `/api/login` логирует КАЖДУЮ попытку в `auth_logs` (success и fail)
- [ ] `/api/telegram-auth` auto-creates `profile` + `clients` через service_role, role='client' хардкод
- [ ] `/api/login` использует `verify_password` через service_role
- [ ] REVOKE EXECUTE на `verify_password` для anon (Фаза 1.7)
- [ ] `/api/link-client-profile.ts` заменил прямой `supabase.from('clients').insert()`
- [ ] `/api/upload-receipt.ts` заменил прямой `supabase.storage.upload()`
- [ ] REVOKE INSERT/UPDATE на clients для anon (Фаза 2.5)
- [ ] Legacy-клиенты мигрированы по phone до включения RLS Категории C
- [ ] Все 38 таблиц распределены по категориям A-E с RLS-политиками через `auth.jwt()->>'app_role'`
- [ ] `closed_boxes` и `tire_service_days` имеют явный anon SELECT в Категории D
- [ ] Realtime-подписки переключены на view или отфильтрованы по JWT
- [ ] Rate-limit 100 req/min на `/api/telegram-auth` через Vercel middleware

### Фронт
- [ ] `App.tsx` очищает legacy localStorage при старте
- [ ] `App.tsx` грузит Категорию D до authState resolution, A/B/C — только после
- [ ] Все useEffect для staff-данных зависят от `authState.status === 'authenticated' && app_role in (...)`
- [ ] Клиентские компоненты вызывают `/api/telegram-auth` на каждом старте Mini App
- [ ] Staff login через `/api/login`, токен в `setSessionToken`, НЕ в sessionStorage
- [ ] UI-routing по `app_role` через decode JWT без проверки подписи (осознанный компромисс)
- [ ] Storage-загрузка чеков через `fetch('/api/upload-receipt')`

### Операционные
- [ ] Supabase preview branch для каждой фазы
- [ ] Снимок `pg_policies` и `role_table_grants` перед каждой фазой в `rollback/`
- [ ] Vercel «Promote to Production» как runbook отката кода
- [ ] Тест под каждой ролью (anon, staff, client) после каждой фазы
- [ ] Env-переменные добавлены руками через Vercel Dashboard (scope Production + Preview)
- [ ] Никаких `VITE_SUPABASE_JWT_SECRET` или `VITE_TELEGRAM_BOT_TOKEN` в `.env` фронта
- [ ] Реальный Telegram-бот на preview-URL для проверки HMAC-flow до прода

---

## Открытые продуктовые вопросы (требуют отдельного решения)

1. **Что делать с клиентами, у которых разный формат phone в `clients` и `profiles`** (например, `+79991234567` vs `89991234567`) — миграция Фазы 1.5.1 их не сматчит. Возможные решения: (a) нормализация phone перед миграцией, (b) ручная привязка через кнопку «привязать Telegram» в админке, (c) принять потерю доступа. В текущем плане выбран (b) + (c) для edge-кейсов.

2. **Должны ли фото инвентаря быть публичными** — после Фазы 1.8 bucket `inventory-photos` закрыт для anon SELECT. Если клиенты должны видеть фото товаров в интерфейсе — нужна отдельная policy для SELECT to anon. По умолчанию закрыто.

3. **Нужна ли реальная публичная view для Realtime-обновлений занятости** — Supabase Realtime не подписывается на view напрямую. Варианты: (a) trigger-based materialized view с refresh, (b) polling клиента каждые N секунд, (c) оставить Realtime на `bookings` для staff, клиент на polling. По умолчанию выбран (b).

4. **Self-service смена пароля владельцем** — сейчас нет UI для смены пароля. После Фазы 1 владелец должен иметь возможность сменить пароль. План не покрывает это. Отдельная задача.

5. **Кнопка «привязать Telegram вручную» в админке** — для не-сматчившихся legacy-клиентов. План упоминает как «отдельная задача после стабилизации». Не входит в критический путь.