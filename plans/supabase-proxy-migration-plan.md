# План миграции: Прокси Supabase через Vercel Edge Functions

## 🎯 Цель
Устранить необходимость VPN для пользователей из РФ путём проксирования всех запросов к Supabase через Vercel Edge Functions.

---

## ⚠️ ВАЖНО: ПОШАГОВЫЙ ПОДХОД

**Сначала выполняем ТОЛЬКО Этап 1** (Realtime → Polling) и тестируем без VPN.

Возможно, WebSocket соединения были основной причиной блокировки, и после их удаления HTTP запросы будут работать нормально. Это сэкономит 80% работы.

**Только если Этап 1 не помог** - переходим к остальным этапам.

---

## 📊 АНАЛИЗ ТЕКУЩЕЙ АРХИТЕКТУРЫ

### Что работает сейчас

```
┌─────────────┐     прямой запрос      ┌─────────────┐
│  Браузер    │ ──────────────────────▶│  Supabase   │
│  (клиент)   │     (заблокирован)     │  (Европа)   │
└─────────────┘                        └─────────────┘
```

### Что должно работать после миграции

```
┌─────────────┐      HTTP запрос       ┌─────────────┐     прямой запрос     ┌─────────────┐
│  Браузер    │ ──────────────────────▶│   Vercel    │ ─────────────────────▶│  Supabase   │
│  (клиент)   │     (не заблокирован)  │  Edge API   │     (с сервера)       │  (Европа)   │
└─────────────┘                        └─────────────┘                       └─────────────┘
```

---

## 🔍 ИСПОЛЬЗОВАНИЕ SUPABASE В ПРОЕКТЕ

### 1. Supabase Client (прямые запросы из браузера)
| Файл | Назначение | Статус |
|------|------------|--------|
| [`lib/supabase.ts`](lib/supabase.ts) | Создание клиента | ❌ Требует изменений |
| [`lib/api/*.ts`](lib/api/) | 22 файла с API функциями | ⚠️ Централизованно - ХОРОШО |

### 2. Realtime (WebSocket подписки)
| Хук | Таблицы | Частота обновлений | Решение |
|-----|---------|-------------------|---------|
| [`useBookingHistory.ts`](shared/hooks/useBookingHistory.ts) | bookings, tire_bookings | Низкая | → Polling 30 сек |
| [`useLoyaltyProgress.ts`](shared/hooks/useLoyaltyProgress.ts) | loyalty | Низкая | → Polling 60 сек |
| [`useClientCars.ts`](shared/hooks/useClientCars.ts) | client_cars, org_cars, drivers | Очень низкая | → Polling 60 сек |
| [`useActiveBookings.ts`](shared/hooks/useActiveBookings.ts) | bookings, tire_bookings | Средняя | → Polling 15 сек |

### 3. Storage (загрузка файлов)
| Бакет | Использование | Файл |
|-------|---------------|------|
| `expense-receipts` | Чеки расходов | [`lib/api/expenses.ts`](lib/api/expenses.ts) |
| `inventory-photos` | Фото инвентаря | [`lib/api/inventory.ts`](lib/api/inventory.ts) |

### 4. Auth
| Тип | Статус |
|-----|--------|
| Supabase Auth | ❌ НЕ используется |
| Кастомная auth (RPC) | ✅ Используется - не требует изменений |

### 5. Существующие Vercel API Routes
Уже есть 7 серверных функций в [`api/`](api/):
- `create-pending-booking.ts`
- `create-payment-sbp.ts`
- `check-payment-status.ts`
- `yookassa-webhook.ts`
- `cleanup-expired-payments.ts`
- `reset-daily.ts`
- `update-sbp-banks.ts`

---

## 📋 ПЛАН МИГРАЦИИ ПО ЭТАПАМ

### ЭТАП 1: Замена Realtime на Polling
**Приоритет:** 🔴 Высокий (критично для работы в РФ)
**Сложность:** ⭐⭐ Средняя
**Файлов:** 4

#### Задачи:
1. **Модифицировать [`useActiveBookings.ts`](shared/hooks/useActiveBookings.ts)**
   - Удалить WebSocket подписки
   - Добавить `setInterval` на 15 секунд
   - Сохранить логику обработки данных

2. **Модифицировать [`useBookingHistory.ts`](shared/hooks/useBookingHistory.ts)**
   - Удалить WebSocket подписки
   - Добавить `setInterval` на 30 секунд
   - Сохранить логику обработки данных

3. **Модифицировать [`useLoyaltyProgress.ts`](shared/hooks/useLoyaltyProgress.ts)**
   - Удалить WebSocket подписки
   - Добавить `setInterval` на 60 секунд
   - Сохранить логику обработки данных

4. **Модифицировать [`useClientCars.ts`](shared/hooks/useClientCars.ts)**
   - Удалить WebSocket подписки (3 канала)
   - Добавить `setInterval` на 60 секунд
   - Сохранить логику обработки данных

#### Шаблон изменений:
```typescript
// ДО (Realtime)
useEffect(() => {
  const subscription = supabase
    .channel('channel-name')
    .on('postgres_changes', { ... }, callback)
    .subscribe();
  
  return () => subscription.unsubscribe();
}, []);

// ПОСЛЕ (Polling)
useEffect(() => {
  fetch(); // Начальная загрузка
  
  const interval = setInterval(fetch, 15000); // Каждые 15 сек
  
  return () => clearInterval(interval);
}, []);
```

---

### ЭТАП 2: Создание безопасных API эндпоинтов (по одному на сущность)
**Приоритет:** 🔴 Высокий (только если Этап 1 не помог)
**Сложность:** ⭐⭐⭐ Высокая
**Файлов:** ~10-15 новых

#### ⚠️ Почему НЕ универсальный прокси?

Универсальный `/api/db` который принимает произвольные операции - **дыра в безопасности**:
- Любой может отправить POST на `/api/db` с любой таблицей
- Нет контроля над тем какие операции разрешены
- Для CRM с клиентскими данными это критично

#### Правильный подход: Отдельный эндпоинт на сущность

Каждый эндпоинт:
1. Принимает только определённые операции
2. Валидирует входные данные
3. Ограничивает доступ на основе роли

#### Пример безопасного эндпоинта [`api/bookings.ts`](api/bookings.ts):

```typescript
// api/bookings.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Белый список разрешённых операций
type BookingAction = 'getByDate' | 'getById' | 'create' | 'update' | 'delete';

interface BookingRequest {
  action: BookingAction;
  payload: any;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, payload }: BookingRequest = req.body;

  try {
    switch (action) {
      case 'getByDate': {
        // Валидация
        if (!payload.date || typeof payload.date !== 'string') {
          return res.status(400).json({ error: 'Invalid date' });
        }
        
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('booking_date', payload.date)
          .eq('is_quick_booking', false)
          .order('start_time', { ascending: true });
        
        if (error) throw error;
        return res.status(200).json({ data });
      }

      case 'getById': {
        if (!payload.id || typeof payload.id !== 'string') {
          return res.status(400).json({ error: 'Invalid id' });
        }
        
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', payload.id)
          .single();
        
        if (error) throw error;
        return res.status(200).json({ data });
      }

      case 'create': {
        // Валидация обязательных полей
        const required = ['client_name', 'phone', 'car_model', 'booking_date'];
        for (const field of required) {
          if (!payload[field]) {
            return res.status(400).json({ error: `Missing ${field}` });
          }
        }
        
        const { data, error } = await supabase
          .from('bookings')
          .insert([payload])
          .select()
          .single();
        
        if (error) throw error;
        return res.status(201).json({ data });
      }

      case 'update': {
        if (!payload.id) {
          return res.status(400).json({ error: 'Missing id' });
        }
        
        const { id, ...updates } = payload;
        
        const { data, error } = await supabase
          .from('bookings')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();
        
        if (error) throw error;
        return res.status(200).json({ data });
      }

      case 'delete': {
        if (!payload.id) {
          return res.status(400).json({ error: 'Missing id' });
        }
        
        const { error } = await supabase
          .from('bookings')
          .delete()
          .eq('id', payload.id);
        
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error: any) {
    console.error('[api/bookings] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
```

#### Список эндпоинтов для создания:

| Эндпоинт | Сущность | Основные actions |
|----------|----------|------------------|
| `/api/bookings` | bookings | getByDate, getById, create, update, delete |
| `/api/clients` | clients | get, search, create, update |
| `/api/workers` | workers | getAll, getById, create, update |
| `/api/organizations` | organizations | getAll, getById, create, update |
| `/api/tire-bookings` | tire_bookings | getByDate, create, update |
| `/api/tire-workers` | tire_workers | getAll, create, update |
| `/api/services` | services | getAll |
| `/api/expenses` | expenses | getByDate, create, update |
| `/api/inventory` | inventory | getAll, update |
| `/api/reports` | reports | getDaily, getMonthly |

---

### ЭТАП 3: Модификация клиентского API слоя
**Приоритет:** 🔴 Высокий (только если Этап 1 не помог)
**Сложность:** ⭐⭐⭐ Высокая
**Файлов:** ~22 в [`lib/api/`](lib/api/)

#### Стратегия:
Вместо прямого использования `supabase` клиента, все функции будут делать HTTP запросы к нашим безопасным эндпоинтам.

#### Создать [`lib/apiClient.ts`](lib/apiClient.ts):
```typescript
// lib/apiClient.ts

/**
 * Типобезопасный клиент для API запросов
 * Использует наши Vercel API Routes вместо прямого Supabase
 */

export async function apiCall<T>(
  endpoint: string,
  action: string,
  payload?: any
): Promise<T> {
  const response = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `API call failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

// Удобные типизированные обёртки
export const bookingsApi = {
  getByDate: (date: string) => apiCall<Booking[]>('bookings', 'getByDate', { date }),
  getById: (id: string) => apiCall<Booking>('bookings', 'getById', { id }),
  create: (data: Partial<Booking>) => apiCall<Booking>('bookings', 'create', data),
  update: (id: string, updates: Partial<Booking>) => 
    apiCall<Booking>('bookings', 'update', { id, ...updates }),
  delete: (id: string) => apiCall<void>('bookings', 'delete', { id }),
};

export const clientsApi = {
  getAll: () => apiCall<Client[]>('clients', 'getAll'),
  search: (query: string) => apiCall<Client[]>('clients', 'search', { query }),
  create: (data: Partial<Client>) => apiCall<Client>('clients', 'create', data),
};
```

#### Пример изменения в [`lib/api/bookings.ts`](lib/api/bookings.ts):
```typescript
// ДО
import { supabase } from '../supabase';

export async function getBookingsByDate(date: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_date', date)
    .eq('is_quick_booking', false)
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data as Booking[];
}

// ПОСЛЕ
import { bookingsApi } from '../apiClient';

export async function getBookingsByDate(date: string): Promise<Booking[]> {
  return bookingsApi.getByDate(date);
}
```

#### ⚠️ Важно: Делать по одному файлу за раз!

1. Выбрать один файл из `lib/api/`
2. Переписать на использование `apiClient`
3. Протестировать без VPN
4. Только потом переходить к следующему файлу

---

### ЭТАП 4: Создание API endpoints для Storage
**Приоритет:** 🟡 Средний
**Сложность:** ⭐⭐ Средняя
**Файлов:** 2 новых

#### 4.1 Создать [`api/storage-upload.ts`](api/storage-upload.ts):
```typescript
// api/storage-upload.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = { maxDuration: 30 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bucket, filePath, fileData, contentType } = req.body;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, fileData, { contentType });

  if (error) throw error;

  // Возвращаем публичный URL
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);

  return res.status(200).json({ path: data.path, url: urlData.publicUrl });
}
```

#### 4.2 Создать [`api/storage-download.ts`](api/storage-download.ts):
```typescript
// api/storage-download.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bucket, filePath, expiresIn = 3600 } = req.body;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresIn);

  if (error) throw error;

  return res.status(200).json({ signedUrl: data.signedUrl });
}
```

#### 4.3 Изменить [`lib/api/expenses.ts`](lib/api/expenses.ts):
```typescript
// ДО
const { data, error } = await supabase.storage
  .from('expense-receipts')
  .upload(filePath, file);

// ПОСЛЕ
const response = await fetch('/api/storage-upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    bucket: 'expense-receipts',
    filePath,
    fileData: await file.arrayBuffer(),
    contentType: file.type,
  }),
});
const { url } = await response.json();
```

---

### ЭТАП 5: Тестирование и валидация
**Приоритет:** 🟢 Финальный
**Сложность:** ⭐ Низкая

#### Чек-лист тестирования:
- [ ] Загрузка страницы админа без VPN
- [ ] Создание новой записи
- [ ] Изменение статуса записи
- [ ] Загрузка фото чека (Storage)
- [ ] Просмотр истории записей
- [ ] Онлайн запись клиента
- [ ] Polling работает (данные обновляются)

---

## 📁 ИТОГОВАЯ СТРУКТУРА ФАЙЛОВ

### Этап 1 (обязательный):
```
shared/hooks/
├── useActiveBookings.ts  # Realtime → Polling (15 сек)
├── useBookingHistory.ts  # Realtime → Polling (30 сек)
├── useLoyaltyProgress.ts # Realtime → Polling (60 сек)
└── useClientCars.ts      # Realtime → Polling (60 сек)
```

### Этапы 2-4 (только если Этап 1 не помог):

#### Новые файлы:
```
api/
├── bookings.ts           # API для bookings
├── clients.ts            # API для clients
├── workers.ts            # API для workers
├── organizations.ts      # API для organizations
├── tire-bookings.ts      # API для tire_bookings
├── tire-workers.ts       # API для tire_workers
├── services.ts           # API для services
├── expenses.ts           # API для expenses
├── inventory.ts          # API для inventory
├── storage-upload.ts     # Загрузка файлов
└── storage-download.ts   # Скачивание файлов

lib/
└── apiClient.ts          # Типобезопасный клиент для API
```

#### Изменяемые файлы:
```
lib/api/
├── bookings.ts           # → apiClient
├── clients.ts            # → apiClient
├── workers.ts            # → apiClient
├── expenses.ts           # → apiClient + storage
├── inventory.ts          # → apiClient + storage
├── organizations.ts      # → apiClient
├── tire-bookings.ts      # → apiClient
├── tire-workers.ts       # → apiClient
└── ... (ещё ~14 файлов)
```

---

## ⚠️ РИСКИ И МИТИГАЦИЯ

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Realtime критичен для UX | Низкая | Среднее | Polling с адаптивным интервалом |
| Задержка +50-100мс | Высокая | Низкое | Некритично для автомойки |
| Сложность отладки | Средняя | Среднее | Логирование в API Routes |
| Превышение лимитов Vercel | Низкая | Высокое | Мониторинг usage |

---

## 🚀 ПОРЯДОК ВЫПОЛНЕНИЯ (для LLM)

### ⚠️ КРИТИЧЕСКИ ВАЖНО: Сначала только Этап 1!

**ШАГ 1: Выполняем ТОЛЬКО Этап 1 (Realtime → Polling)**

```
Промпт 1: "Замени Realtime на Polling в shared/hooks/useActiveBookings.ts. 
Интервал 15 секунд. Логику данных не менять, только механизм получения."

Промпт 2: "Замени Realtime на Polling в shared/hooks/useBookingHistory.ts. 
Интервал 30 секунд."

Промпт 3: "Замени Realtime на Polling в shared/hooks/useLoyaltyProgress.ts. 
Интервал 60 секунд."

Промпт 4: "Замени Realtime на Polling в shared/hooks/useClientCars.ts. 
Интервал 60 секунд."
```

**ШАГ 2: ДЕПЛОЙ И ТЕСТИРОВАНИЕ БЕЗ VPN**

После выполнения Шага 1:
1. Закоммитить изменения
2. Задеплоить на Vercel
3. Открыть приложение БЕЗ VPN
4. Проверить:
   - Загружаются ли данные?
   - Обновляются ли записи?
   - Работает ли онлайн-запись?

**ШАГ 3: Принятие решения**

| Результат теста | Действие |
|-----------------|----------|
| ✅ Всё работает без VPN | **МИГРАЦИЯ ЗАВЕРШЕНА!** Остальные этапы не нужны |
| ⚠️ Частично работает | Переходим к Этапу 2 для проблемных сущностей |
| ❌ Не работает | Переходим к полному плану (Этапы 2-4) |

---

### Если нужен полный план (только если Шаг 2 не помог):

**Этап 2: Создание API эндпоинтов (по одному за раз!)**

```
Промпт: "Создай api/bookings.ts - безопасный API эндпоинт для работы с bookings.
Разрешённые actions: getByDate, getById, create, update, delete.
Валидация входных данных. Используй SERVICE_ROLE_KEY."
```

**Этап 3: Модификация lib/api/ (по одному файлу за раз!)**

```
Промпт: "Перепиши lib/api/bookings.ts на использование apiClient 
вместо прямого supabase клиента. Функции остаются те же, 
меняется только способ получения данных."
```

**Этап 4: Storage (только если используется)**

```
Промпт: "Создай api/storage-upload.ts для загрузки файлов в Supabase Storage
через серверный прокси."
```

---

## 📊 ОЦЕНКА ТРУДОЗАТРАТ

### Сценарий A: Только Этап 1 (оптимистичный)
| Этап | Изменений | Риск |
|------|-----------|------|
| Этап 1 (Realtime → Polling) | 4 файла | Низкий |
| **Итого** | **4 файла** | |

Если WebSocket был основной причиной блокировки - этого достаточно!

### Сценарий B: Полный план (пессимистичный)
| Этап | Изменений | Риск |
|------|-----------|------|
| Этап 1 (Realtime → Polling) | 4 файла | Низкий |
| Этап 2 (API endpoints) | ~10 новых файлов | Средний |
| Этап 3 (apiClient + lib/api) | ~23 файла | Высокий |
| Этап 4 (Storage) | 2 новых + 2 изменения | Средний |
| **Итого** | **~40 файлов** | |

### Стратегия минимизации рисков:
1. **Сначала Этап 1** → тест без VPN → решение о продолжении
2. **По одному файлу за раз** → тест → следующий
3. **Откат возможен** - git history сохраняется

---

## ✅ КРИТЕРИИ УСПЕХА

1. Приложение работает без VPN из РФ
2. Все данные загружаются корректно
3. Записи создаются и обновляются
4. Файлы загружаются через Storage
5. Задержка не превышает 1 секунду
6. Нет ошибок в консоли браузера
