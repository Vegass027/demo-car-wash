# План исправлений: Предотвращение дублей заказов и двойных оплат

**Дата:** 2025-01-09  
**Проект:** Carwash Admin Pro  
**Цель:** Реализовать валидацию для предотвращения дублей заказов, двойных оплат и нарушений целостности данных.

---

## 🎯 ОБЗОР ПЛАНА

**Всего задач:** 14  
**Критических:** 6  
**Важных:** 6  
**Менее важных:** 2  

**Ожидаемый результат:**
- ✅ Полное отсутствие дублей заказов
- ✅ Защита от двойных оплат
- ✅ Корректное начисление зарплаты
- ✅ Точные финансовые отчеты
- ✅ Надежная система валидации
- ✅ Защита от race conditions
- ✅ Идемпотентные операции

---

## 🏗️ АРХИТЕКТУРА ЗАЩИТЫ ОТ ДУБЛЕЙ

### СЛОЙ 1: БАЗА ДАННЫХ (PostgreSQL + Supabase)

**Защита от дублей на уровне БД:**
```sql
-- Уникальные индексы (предотвращают дубли)
CREATE UNIQUE INDEX idx_bookings_unique_client_slot
ON bookings(client_car_id, booking_date, start_time)
WHERE is_org = false AND status NOT IN ('ОТМЕНЕНО', 'ГОТОВО');

-- RPC функции с FOR UPDATE (защита от race conditions)
CREATE OR REPLACE FUNCTION create_booking_with_lock(...)
```

**Когда использовать:**
- ✅ Уникальные индексы → для предотвращения дублей
- ✅ FOR UPDATE → для блокировки строк при создании заказов
- ✅ Advisory locks → для глобальных бизнес-операций без строк

---

### СЛОЙ 2: API ФУНКЦИИ (TypeScript)

**Все проверки и бизнес-логика здесь:**
```typescript
// ✅ ПРАВИЛЬНО: Проверки в API
export async function createBooking() {
  // Вызов RPC → защита от race conditions
  // Ошибка от индекса → понятное сообщение
}

export async function markAsPaid(id, idempotencyKey) {
  // Проверка is_paid
  // Запись в booking_payments с idempotency_key
}
```

**Когда использовать:**
- ✅ Все проверки статусов, дубликатов, условий
- ✅ Вызов RPC функций с FOR UPDATE
- ✅ Обработка ошибок от уникальных индексов
- ✅ Идемпотентные операции с idempotency keys

---

### СЛОЙ 3: UI КОМПОНЕНТЫ (React)

**Только обработка ошибок и retry:**
```typescript
// ✅ ПРАВИЛЬНО: НЕТ проверок здесь!
const handleMarkAsPaid = async () => {
  await retryWithIdempotency(() => markAsPaid(id, key));
};
```

**⚠️ ВАЖНО:** Блокировки в UI недостаточны! Защита только на бэкенде.

**💡 ПРО БЛОКИРОВКИ UI:**

ЧТО ЗНАЧИТ:
В коде часто делают так:

```typescript
const [isProcessing, setIsProcessing] = useState(false);

const handleMarkAsPaid = async () => {
  if (isProcessing) return; // ❌ Защита только в UI
  
  setIsProcessing(true);
  await markAsPaid(bookingId);
  setIsProcessing(false);
};
```

ПРОБЛЕМА: Эта защита НЕ РАБОТАЕТ если:
- Админ открыл 2 вкладки браузера → кликнул в обеих одновременно
- Два админа работают одновременно → оба нажали "Оплачено"
- Мобильный + веб одновременно → двойной клик

Почему: `isProcessing` существует только в одной вкладке/устройстве. Другая вкладка не знает что кнопка заблокирована.

**РЕШЕНИЕ:** Вся защита должна быть в БД/API:
- ✅ Уникальные индексы в БД (предотвращают дубли)
- ✅ RPC с FOR UPDATE (защита от race conditions)
- ✅ Проверки в API (is_paid, status, completed_bookings)
- ⚠️ isProcessing = косметика, реальная защита = БД + API

**Когда использовать:**
- ✅ Только retry с idempotency keys
- ✅ Показ ошибок пользователю
- ✅ isProcessing для UX (но НЕ для защиты!)
- ❌ НЕТ проверок статусов, дубликатов, условий

---

### ПРАВИЛА АРХИТЕКТУРЫ:

1. **БД** → уникальные индексы + RPC с FOR UPDATE
2. **API** → все проверки и бизнес-логика
3. **UI** → только retry и обработка ошибок

**❌ НИКОГДА НЕ ДЕЛАТЬ:**
- Проверки дубликатов в UI → только в API/БД
- Проверки статусов в UI → только в API
- Дублирование проверок в нескольких местах

---

## 📅 ПРИОРИТЕТ 1: КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ (НЕМЕДЛЕННО)

### ЗАДАЧА 1.1: Создать RPC функции для создания заказов с защитой от дублей

**Файлы:**
- Новые RPC функции в Supabase
- `lib/api/bookings.ts` - обновить `createBooking()` для вызова RPC
- `lib/api/tire-bookings.ts` - обновить `createTireBooking()` для вызова RPC

**Описание:**
Перенести проверку на дубликаты в RPC функцию с `FOR UPDATE`. Это обеспечит:
- Защиту от race conditions
- Атомарность проверки и вставки
- Понятные сообщения об ошибках

**⚠️ ВАЖНО:** Убрать все проверки дубликатов из TypeScript! Только RPC.

**Код:**
```sql
-- migrations/create_booking_with_lock.sql

-- RPC функция для создания заказа автомойки с защитой от дублей
CREATE OR REPLACE FUNCTION create_booking_with_lock(
  p_client_car_id UUID,
  p_car_id UUID,
  p_booking_date DATE,
  p_start_time TEXT,
  p_end_time TEXT,
  p_is_org BOOLEAN,
  p_booking_data JSONB
)
RETURNS bookings
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking bookings;
  v_existing_id UUID;
BEGIN
  -- Блокируем все заказы для этой машины на эту дату
  IF p_is_org = false AND p_client_car_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM bookings
    WHERE client_car_id = p_client_car_id
      AND booking_date = p_booking_date
      AND status NOT IN ('ОТМЕНЕНО', 'ГОТОВО')
      AND (
        (start_time <= p_start_time AND end_time > p_start_time)
        OR (start_time < p_end_time AND end_time >= p_end_time)
        OR (start_time >= p_start_time AND end_time <= p_end_time)
      )
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Заказ на это время уже существует';
    END IF;
  END IF;

  -- Вставляем новый заказ
  INSERT INTO bookings (
    client_id, client_car_id, organization_id, car_id, driver_id,
    booking_date, start_time, end_time, services, price, status,
    is_paid, is_org, is_quick_booking, notes, phone, car_model,
    plate_number, car_type, org_name, driver_name, worker_id,
    worker_name, worker_id_2, worker_name_2, signature_data,
    signature_obtained_at, created_at, updated_at
  )
  SELECT
    p_booking_data->>'client_id',
    p_booking_data->>'client_car_id',
    p_booking_data->>'organization_id',
    p_booking_data->>'car_id',
    p_booking_data->>'driver_id',
    p_booking_data->>'booking_date',
    p_booking_data->>'start_time',
    p_booking_data->>'end_time',
    p_booking_data->>'services',
    (p_booking_data->>'price')::NUMERIC,
    p_booking_data->>'status',
    (p_booking_data->>'is_paid')::BOOLEAN,
    (p_booking_data->>'is_org')::BOOLEAN,
    (p_booking_data->>'is_quick_booking')::BOOLEAN,
    p_booking_data->>'notes',
    p_booking_data->>'phone',
    p_booking_data->>'car_model',
    p_booking_data->>'plate_number',
    p_booking_data->>'car_type',
    p_booking_data->>'org_name',
    p_booking_data->>'driver_name',
    p_booking_data->>'worker_id',
    p_booking_data->>'worker_name',
    p_booking_data->>'worker_id_2',
    p_booking_data->>'worker_name_2',
    p_booking_data->>'signature_data',
    p_booking_data->>'signature_obtained_at',
    NOW(),
    NOW()
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

-- RPC функция для создания заказа шиномонтажа с защитой от дублей
CREATE OR REPLACE FUNCTION create_tire_booking_with_lock(
  p_client_car_id UUID,
  p_car_id UUID,
  p_booking_date DATE,
  p_start_time TEXT,
  p_estimated_duration INTEGER,
  p_is_org BOOLEAN,
  p_booking_data JSONB
)
RETURNS tire_bookings
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking tire_bookings;
  v_existing_id UUID;
  v_end_time TEXT;
BEGIN
  -- Вычисляем end_time
  v_end_time := p_start_time; -- Упрощенно, нужно добавить логику расчета

  -- Блокируем все заказы для этой машины на эту дату
  IF p_is_org = false AND p_client_car_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM tire_bookings
    WHERE client_car_id = p_client_car_id
      AND booking_date = p_booking_date
      AND status NOT IN ('ОТМЕНЕНО', 'ГОТОВО')
      AND (
        (start_time <= p_start_time AND start_time + estimated_duration > p_start_time)
        OR (start_time < v_end_time AND start_time + estimated_duration >= v_end_time)
        OR (start_time >= p_start_time AND start_time + estimated_duration <= v_end_time)
      )
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Заказ на это время уже существует';
    END IF;
  END IF;

  -- Вставляем новый заказ
  INSERT INTO tire_bookings (
    client_id, client_car_id, organization_id, car_id, driver_id,
    booking_date, start_time, estimated_duration, services, total_price,
    status, is_paid, is_org, notes, phone, car_model,
    plate_number, org_name, driver_name, worker_id,
    worker_name, signature_data, signature_obtained_at,
    created_at, updated_at
  )
  SELECT
    p_booking_data->>'client_id',
    p_booking_data->>'client_car_id',
    p_booking_data->>'organization_id',
    p_booking_data->>'car_id',
    p_booking_data->>'driver_id',
    p_booking_data->>'booking_date',
    p_booking_data->>'start_time',
    p_booking_data->>'estimated_duration',
    p_booking_data->>'services',
    (p_booking_data->>'total_price')::NUMERIC,
    p_booking_data->>'status',
    (p_booking_data->>'is_paid')::BOOLEAN,
    (p_booking_data->>'is_org')::BOOLEAN,
    p_booking_data->>'notes',
    p_booking_data->>'phone',
    p_booking_data->>'car_model',
    p_booking_data->>'plate_number',
    p_booking_data->>'org_name',
    p_booking_data->>'driver_name',
    p_booking_data->>'worker_id',
    p_booking_data->>'worker_name',
    p_booking_data->>'signature_data',
    p_booking_data->>'signature_obtained_at',
    NOW(),
    NOW()
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;
```

```typescript
// lib/api/bookings.ts

export async function createBooking(
  booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>
): Promise<Booking> {
  let bookingToInsert = { ...booking };

  // Нормализуем телефон
  if (booking.phone) {
    bookingToInsert.phone = normalizePhoneNumber(booking.phone);
  }

  // ✅ ВЫЗОВ RPC ФУНКЦИИ С БЛОКИРОВКОЙ
  const { data, error } = await supabase.rpc('create_booking_with_lock', {
    p_client_car_id: booking.client_car_id,
    p_car_id: booking.car_id,
    p_booking_date: booking.booking_date,
    p_start_time: booking.start_time,
    p_end_time: booking.end_time,
    p_is_org: booking.is_org,
    p_booking_data: bookingToInsert
  });

  if (error) {
    if (error.message.includes('Заказ на это время уже существует')) {
      throw new Error('Заказ на это время уже существует для этого автомобиля');
    }
    throw error;
  }

  return data as Booking;
}
```

```typescript
// lib/api/tire-bookings.ts

export async function createTireBooking(
  data: Omit<TireBooking, 'id' | 'created_at' | 'updated_at'>
): Promise<TireBooking> {
  let bookingToInsert = { ...data };

  // Нормализуем телефон
  if (data.phone) {
    bookingToInsert.phone = normalizePhoneNumber(data.phone);
  }

  // Заполнение org_name для организаций
  if (data.is_org && data.organization_id) {
    try {
      const organization = await getOrganizationById(data.organization_id);
      if (organization) {
        bookingToInsert = {
          ...bookingToInsert,
          org_name: organization.name
        };
      }
    } catch (error) {
      console.error('[TireBookings] Ошибка при получении названия организации:', error);
    }
  }

  // Автокопирование подписи для организаций
  if (data.is_org && data.driver_id) {
    try {
      const signature = await getDriverSignature(data.driver_id);
      if (signature) {
        bookingToInsert = {
          ...bookingToInsert,
          signature_data: signature,
          signature_obtained_at: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('[TireBookings] Ошибка при получении подписи водителя:', error);
    }
  }

  // ✅ ВЫЗОВ RPC ФУНКЦИИ С БЛОКИРОВКОЙ
  const { data: booking, error } = await supabase.rpc('create_tire_booking_with_lock', {
    p_client_car_id: data.client_car_id,
    p_car_id: data.car_id,
    p_booking_date: data.booking_date,
    p_start_time: data.start_time,
    p_estimated_duration: data.estimated_duration,
    p_is_org: data.is_org,
    p_booking_data: bookingToInsert
  });

  if (error) {
    if (error.message.includes('Заказ на это время уже существует')) {
      throw new Error('Заказ на это время уже существует для этого автомобиля');
    }
    console.error('[TireBookings] Ошибка при создании заказа:', error);
    throw new Error(`Не удалось создать заказ: ${error.message}`);
  }

  return booking as TireBooking;
}
```

**Тесты:**
1. Попытка создать дубликат заказа - должна выбросить ошибку
2. Попытка создать заказ с пересечением времени - должна выбросить ошибку
3. Создание уникального заказа - должно успешно выполниться
4. Race condition: два одновременных запроса - только один должен создать заказ

---

### ЗАДАЧА 1.3: Добавить защиту от двойной оплаты

**Файлы:**
- `lib/api/bookings.ts` - функция `markAsPaid()`
- `lib/api/tire-bookings.ts` - функция `markTireBookingAsPaid()`

**Описание:**
Добавить проверку на то, что заказ еще не оплачен перед отметкой как оплаченный.

**Код:**
```typescript
// lib/api/bookings.ts

export async function markAsPaid(id: string): Promise<Booking> {
  // ✅ НОВАЯ ПРОВЕРКА: заказ уже оплачен?
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('is_paid, paid_at')
    .eq('id', id)
    .single();

  if (!existingBooking) {
    throw new Error('Заказ не найден');
  }

  if (existingBooking.is_paid) {
    throw new Error('Заказ уже оплачен');
  }

  return updateBooking(id, {
    is_paid: true,
    paid_at: new Date().toISOString()
  });
}
```

```typescript
// lib/api/tire-bookings.ts

export async function markTireBookingAsPaid(id: string): Promise<void> {
  // ✅ НОВАЯ ПРОВЕРКА: заказ уже оплачен?
  const { data: existingBooking } = await supabase
    .from('tire_bookings')
    .select('is_paid, paid_at')
    .eq('id', id)
    .single();

  if (!existingBooking) {
    throw new Error('Заказ не найден');
  }

  if (existingBooking.is_paid) {
    throw new Error('Заказ уже оплачен');
  }

  const { error } = await supabase
    .from('tire_bookings')
    .update({ 
      is_paid: true, 
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error('[TireBookings] Ошибка при отметке заказа как оплаченного:', error);
    throw new Error(`Не удалось отметить заказ как оплаченный: ${error.message}`);
  }
}
```

---

### ЗАДАЧА 1.4: Добавить защиту от двойного начисления зарплаты

**Файлы:**
- `lib/api/workers.ts` - функция `addWorkerEarningsForBooking()`
- `lib/api/tire-workers.ts` - функция `addTireWorkerEarningsForBooking()`

**Описание:**
Добавить проверку на то, что заказ еще не был добавлен в completed_bookings.

**Код:**
```typescript
// lib/api/workers.ts

export async function addWorkerEarningsForBooking(
  workerId: string,
  bookingId: string,
  bookingPrice: number,
  partnerName?: string
): Promise<Worker> {
  // ✅ НОВАЯ ПРОВЕРКА: заказ уже в completed_bookings?
  const { data: worker } = await supabase
    .from('workers')
    .select('completed_bookings')
    .eq('id', workerId)
    .single();

  if (!worker) {
    throw new Error('Мойщик не найден');
  }

  if (worker.completed_bookings.includes(bookingId)) {
    throw new Error('Зарплата за этот заказ уже начислена');
  }

  const settings = await getSalarySettings();
  
  if (!settings) {
    console.error('[addWorkerEarningsForBooking] No settings found');
    throw new Error('Настройки зарплаты не найдены');
  }

  const workingMode = worker.working_mode || 'solo';
  const percentage = workingMode === 'pair' 
    ? settings.worker_pair_commission 
    : settings.worker_solo_commission;
  const baseRate = workingMode === 'pair' 
    ? settings.worker_pair_base 
    : settings.worker_solo_base;

  const earnings = bookingPrice * percentage + baseRate;

  const updatedCompletedBookings = [...worker.completed_bookings, bookingId];

  const { data: updatedWorker, error } = await supabase
    .from('workers')
    .update({
      completed_bookings: updatedCompletedBookings,
      earned_today: worker.earned_today + earnings,
      current_balance: worker.current_balance + earnings,
      cars_today: worker.cars_today + (workingMode === 'pair' ? 0.5 : 1)
    })
    .eq('id', workerId)
    .select()
    .single();

  if (error) throw error;
  return updatedWorker as Worker;
}
```

```typescript
// lib/api/tire-workers.ts

export async function addTireWorkerEarningsForBooking(
  technicianId: string,
  bookingId: string,
  bookingPrice: number
): Promise<TireWorker> {
  // ✅ НОВАЯ ПРОВЕРКА: заказ уже в completed_bookings?
  const { data: technician } = await supabase
    .from('tire_workers')
    .select('completed_bookings')
    .eq('id', technicianId)
    .single();

  if (!technician) {
    throw new Error('Мастер не найден');
  }

  if (technician.completed_bookings.includes(bookingId)) {
    throw new Error('Зарплата за этот заказ уже начислена');
  }

  const settings = await getSalarySettings();
  
  if (!settings) {
    console.error('[addTireWorkerEarningsForBooking] No settings found');
    throw new Error('Настройки зарплаты не найдены');
  }

  const earnings = bookingPrice * settings.tire_worker_commission;

  const updatedCompletedBookings = [...technician.completed_bookings, bookingId];

  const { data: updatedTechnician, error } = await supabase
    .from('tire_workers')
    .update({
      completed_bookings: updatedCompletedBookings,
      earned_today: technician.earned_today + earnings,
      current_balance: technician.current_balance + earnings
    })
    .eq('id', technicianId)
    .select()
    .single();

  if (error) throw error;
  return updatedTechnician as TireWorker;
}
```

---

### ЗАДАЧА 1.4: Обеспечить атомарность при завершении заказа

**Файлы:**
- `lib/api/bookings.ts` - новая функция `markAsReadyWithSalary()`
- `lib/api/tire-bookings.ts` - новая функция `markTireBookingAsReadyWithSalary()`
- `App.tsx` - обновить `handleMarkAsReady()` и `handleMarkTireBookingAsReady()` для вызова новых функций

**Описание:**
Обеспечить атомарность операции: если начисление зарплаты не удалось, заказ не должен быть отмечен как готовый. Все проверки статусов должны быть в API, НЕ в UI!

**⚠️ ВАЖНО:**
- Убрать все проверки из UI (`is_paid`, `status`, `completed_bookings`)!
- Убрать избыточную проверку `completed_bookings` из `markAsReadyWithSalary()` - она уже есть в `addWorkerEarningsForBooking()`

**Код:**
```typescript
// lib/api/bookings.ts

/**
 * ✅ НОВАЯ ФУНКЦИЯ: Отметить заказ как готовый с начислением зарплаты
 * Атомарная операция: если зарплата не начислена, статус не меняется
 */
export async function markAsReadyWithSalary(bookingId: string): Promise<void> {
  // ✅ Все проверки ЗДЕСЬ в API
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, is_paid, price, worker_id, worker_name, worker_id_2, worker_name_2')
    .eq('id', bookingId)
    .single();

  if (!booking) {
    throw new Error('Заказ не найден');
  }

  // ✅ ПРОВЕРКА: заказ уже завершен?
  if (booking.status === 'ГОТОВО') {
    throw new Error('Заказ уже завершен');
  }

  // ✅ ПРОВЕРКА: заказ оплачен?
  if (!booking.is_paid) {
    throw new Error('Сначала отметьте заказ как оплаченный');
  }

  // Начисляем зарплату первому мойщику
  if (booking.worker_id && booking.worker_name) {
    // ✅ ПРОВЕРКА completed_bookings уже ЕСТЬ в addWorkerEarningsForBooking()
    const updatedWorker = await addWorkerEarningsForBooking(
      booking.worker_id,
      bookingId,
      booking.price,
      booking.worker_name_2 || undefined
    );

    await updateWorker(booking.worker_id, {
      status: 'available',
      current_booking_id: null
    });
  }
  
  // Начисляем зарплату второму мойщику
  if (booking.worker_id_2 && booking.worker_name_2) {
    const updatedWorker2 = await addWorkerEarningsForBooking(
      booking.worker_id_2,
      bookingId,
      booking.price,
      booking.worker_name || undefined
    );

    await updateWorker(booking.worker_id_2, {
      status: 'available',
      current_booking_id: null
    });
  }
  
  // ✅ Только после успешного начисления зарплаты отмечаем заказ как готовый
  await markAsReady(bookingId);
}
```

```typescript
// lib/api/tire-bookings.ts

/**
 * ✅ НОВАЯ ФУНКЦИЯ: Отметить заказ шиномонтажа как готовый с начислением зарплаты
 * Атомарная операция: если зарплата не начислена, статус не меняется
 */
export async function markTireBookingAsReadyWithSalary(bookingId: string): Promise<void> {
  // ✅ Все проверки ЗДЕСЬ в API
  const { data: booking } = await supabase
    .from('tire_bookings')
    .select('id, status, is_paid, total_price, worker_id, worker_name')
    .eq('id', bookingId)
    .single();

  if (!booking) {
    throw new Error('Заказ не найден');
  }

  // ✅ ПРОВЕРКА: заказ уже завершен?
  if (booking.status === 'ГОТОВО') {
    throw new Error('Заказ уже завершен');
  }

  // ✅ ПРОВЕРКА: заказ оплачен?
  if (!booking.is_paid) {
    throw new Error('Сначала отметьте заказ как оплаченный');
  }

  // Начисляем зарплату мастеру
  if (booking.worker_id && booking.worker_name) {
    // ✅ ПРОВЕРКА completed_bookings уже ЕСТЬ в addTireWorkerEarningsForBooking()
    await addTireWorkerEarningsForBooking(
      booking.worker_id,
      bookingId,
      booking.total_price
    );
  }
  
  // ✅ Только после успешного начисления зарплаты обновляем статус
  await updateTireBooking(bookingId, { status: 'ГОТОВО' });
}
```

```typescript
// App.tsx

const handleMarkAsReady = async (bookingId: string) => {
  // ✅ НЕТ ПРОВЕРОК ЗДЕСЬ! Только retry и обработка ошибок
  try {
    await retryWithIdempotency(
      () => markAsReadyWithSalary(bookingId),
      { maxAttempts: 3, delayMs: 500 }
    );
    await loadBookings();
    await loadQuickBookings();
  } catch (error) {
    console.error('Ошибка завершения заказа:', error);
    alert(error.message || 'Не удалось завершить заказ');
  }
};

const handleMarkTireBookingAsReady = async (bookingId: string) => {
  // ✅ НЕТ ПРОВЕРОК ЗДЕСЬ! Только retry и обработка ошибок
  try {
    await retryWithIdempotency(
      () => markTireBookingAsReadyWithSalary(bookingId),
      { maxAttempts: 3, delayMs: 500 }
    );
    await loadTireBookings();
  } catch (error) {
    console.error('Ошибка завершения заказа шиномонтажа:', error);
    alert(error.message || 'Не удалось завершить заказ');
  }
};
```

---

## 📅 ПРИОРИТЕТ 2: ВАЖНЫЕ ИСПРАВЛЕНИЯ (СКОРО)

### ЗАДАЧА 2.1: Добавить проверку статуса перед отменой

**Файлы:**
- `lib/api/booking-cancellations.ts` - функция `handleClientCancellation()`

**Описание:**
Добавить проверку на статус заказа перед отменой в API. Нельзя отменить:
- Уже завершенный заказ (ГОТОВО)
- Уже оплаченный заказ

**Код:**
```typescript
// lib/api/booking-cancellations.ts

export async function handleClientCancellation(cancellationData: {
  client_id: string;
  booking_id?: string;
  tire_booking_id?: string;
  reason?: string;
}): Promise<{ success: boolean; blocked?: boolean; blockedUntil?: string }> {
  // ✅ ПРОВЕРКА: статус заказа
  if (cancellationData.booking_id) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('status, is_paid')
      .eq('id', cancellationData.booking_id)
      .single();

    if (booking) {
      if (booking.status === 'ГОТОВО') {
        throw new Error('Нельзя отменить завершенный заказ');
      }

      if (booking.is_paid) {
        throw new Error('Нельзя отменить оплаченный заказ');
      }
    }
  }

  if (cancellationData.tire_booking_id) {
    const { data: booking } = await supabase
      .from('tire_bookings')
      .select('status, is_paid')
      .eq('id', cancellationData.tire_booking_id)
      .single();

    if (booking) {
      if (booking.status === 'ГОТОВО') {
        throw new Error('Нельзя отменить завершенный заказ');
      }

      if (booking.is_paid) {
        throw new Error('Нельзя отменить оплаченный заказ');
      }
    }
  }

  const cancellation = await createCancellation(cancellationData);
  if (!cancellation) {
    return { success: false };
  }

  const cancellationCount = await getClientCancellationCount(cancellationData.client_id, 30);

  if (cancellationCount >= 3) {
    const blocked = await blockClientForOnlineBooking(cancellationData.client_id, 30);
    if (blocked) {
      const blockedUntil = new Date();
      blockedUntil.setTime(blockedUntil.getTime() + 30 * 24 * 60 * 60 * 1000);
      return { success: true, blocked: true, blockedUntil: blockedUntil.toISOString() };
    }
  }

  return { success: true, blocked: false };
}
```

---

### ЗАДАЧА 2.2: Обработка ошибок от уникальных индексов ведомости

**Файлы:**
- `lib/api/worksheets.ts` - функция `createWorksheetEntry()`

**Описание:**
Уникальные индексы уже защищают от дублей в ведомости. Нужно только обрабатывать ошибки от индексов.

**✅ УЖЕ ЕСТЬ В БД:**
- `idx_worksheet_entries_carwash_booking_unique`
- `idx_worksheet_entries_tire_booking_unique`

**Код:**
```typescript
// lib/api/worksheets.ts

export async function createWorksheetEntry(data: {
  carwash_booking_id?: string;
  tire_booking_id?: string;
  organization_id: string;
  driver_id?: string;
  car_id?: string;
  driver_name: string;
  car_model?: string;
  plate_number?: string;
  service_date: string;
  services_provided: any;
  total_amount: number;
  service_type: 'carwash' | 'tire';
  signature_data?: string;
}): Promise<WorksheetEntry> {
  const { data: entry, error } = await supabase
    .from('worksheet_entries')
    .insert(data)
    .select()
    .single();

  if (error) {
    // ✅ ОБРАБОТКА ОШИБКИ ОТ УНИКАЛЬНОГО ИНДЕКСА
    if (error.code === '23505') { // unique_violation
      throw new Error('Запись в ведомости для этого заказа уже существует');
    }
    throw error;
  }

  return entry;
}
```

---

### ЗАДАЧА 2.3: Добавить валидацию переходов статусов

**Файлы:**
- `lib/api/bookings.ts` - функция `updateBookingStatus()`
- `lib/api/tire-bookings.ts` - функция `updateTireBookingStatus()`

**Описание:**
Определить допустимые переходы статусов и запретить недопустимые.

**Код:**
```typescript
// lib/api/bookings.ts

// ✅ НОВЫЕ КОНСТАНТЫ: допустимые переходы статусов
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  'ОЖИДАЕТ': ['В РАБОТЕ', 'ОТМЕНЕНО'],
  'В РАБОТЕ': ['ГОТОВО', 'ОТМЕНЕНО'],
  'ГОТОВО': [], // Из ГОТОВО нельзя перейти никуда
  'ОТМЕНЕНО': [] // Из ОТМЕНЕНО нельзя перейти никуда
};

export async function updateBookingStatus(
  id: string,
  status: string
): Promise<Booking> {
  // ✅ НОВАЯ ПРОВЕРКА: допустимый ли переход?
  const { data: currentBooking } = await supabase
    .from('bookings')
    .select('status')
    .eq('id', id)
    .single();

  if (!currentBooking) {
    throw new Error('Заказ не найден');
  }

  const validTransitions = VALID_STATUS_TRANSITIONS[currentBooking.status] || [];
  if (!validTransitions.includes(status)) {
    throw new Error(`Недопустимый переход статусов: ${currentBooking.status} → ${status}`);
  }

  return updateBooking(id, { status });
}
```

```typescript
// lib/api/tire-bookings.ts

// ✅ НОВЫЕ КОНСТАНТЫ: допустимые переходы статусов
const VALID_TIRE_BOOKING_STATUS_TRANSITIONS: Record<string, string[]> = {
  'ОЖИДАЕТ': ['В РАБОТЕ', 'ОТМЕНЕНО', 'ПРОСРОЧЕН'],
  'В РАБОТЕ': ['ГОТОВО', 'ОТМЕНЕНО', 'ПРОСРОЧЕН'],
  'ГОТОВО': [], // Из ГОТОВО нельзя перейти никуда
  'ОТМЕНЕНО': [], // Из ОТМЕНЕНО нельзя перейти никуда
  'ПРОСРОЧЕН': ['ОТМЕНЕНО'] // Из ПРОСРОЧЕН можно только отменить
};

export async function updateTireBookingStatus(
  id: string,
  status: TireBookingStatus
): Promise<void> {
  // ✅ НОВАЯ ПРОВЕРКА: допустимый ли переход?
  const { data: currentBooking } = await supabase
    .from('tire_bookings')
    .select('status')
    .eq('id', id)
    .single();

  if (!currentBooking) {
    throw new Error('Заказ не найден');
  }

  const validTransitions = VALID_TIRE_BOOKING_STATUS_TRANSITIONS[currentBooking.status] || [];
  if (!validTransitions.includes(status)) {
    throw new Error(`Недопустимый переход статусов: ${currentBooking.status} → ${status}`);
  }

  const { error } = await supabase
    .from('tire_bookings')
    .update({ 
      status, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', id);

  if (error) {
    console.error('[TireBookings] Ошибка при обновлении статуса:', error);
    throw new Error(`Не удалось обновить статус: ${error.message}`);
  }
}
```

---

### ЗАДАЧА 2.4: Добавить проверку на дубликаты услуг

**Файлы:**
- `lib/api/bookings.ts` - функция `addServicesToBooking()`
- `lib/api/tire-bookings.ts` - функция `addTireServicesToBooking()`

**Описание:**
Добавить проверку на то, что услуга еще не добавлена в заказ.

**Код:**
```typescript
// lib/api/bookings.ts

export async function addServicesToBooking(
  id: string,
  serviceIds: string[],
  currentServices: string[],
  allServices: Service[],
  carType: CarType
): Promise<Booking> {
  // ✅ НОВАЯ ПРОВЕРКА: услуги уже есть в заказе?
  const duplicateServices = serviceIds.filter(id => currentServices.includes(id));
  if (duplicateServices.length > 0) {
    throw new Error(`Услуги уже добавлены в заказ: ${duplicateServices.join(', ')}`);
  }

  const newServices = [...currentServices, ...serviceIds];
  const newPrice = calculateBookingPrice(newServices, allServices, carType);
  return updateBooking(id, { services: newServices, price: newPrice });
}
```

---

### ЗАДАЧА 2.5: Использовать RPC функцию для быстрых заказов

**Файлы:**
- `App.tsx` - функция `onQuickBooking` callback

**Описание:**
Быстрые заказы должны использовать ту же RPC функцию `create_booking_with_lock`, что и обычные заказы. Никаких проверок в UI!

**⚠️ ВАЖНО:** Убрать все проверки пересечения времени из UI!

**Код:**
```typescript
// App.tsx

onQuickBooking={async (data) => {
  try {
    // ✅ НЕТ ПРОВЕРОК ЗДЕСЬ! Только retry и обработка ошибок
    const bookingData = mapWizardDataToBooking({
      ...data,
      isQuickBooking: true
    });

    // ✅ Используем createBooking() который вызывает RPC с блокировкой
    const newBooking = await retryWithIdempotency(
      () => createBooking(bookingData),
      { maxAttempts: 3, delayMs: 500 }
    );

    // Создаем запись в ведомости для организаций
    if (newBooking.organization_id && newBooking.is_org) {
      try {
        await createWorksheetEntry({
          carwash_booking_id: newBooking.id,
          organization_id: newBooking.organization_id,
          driver_id: newBooking.driver_id,
          car_id: newBooking.car_id,
          driver_name: data.clientName,
          car_model: newBooking.car_model,
          plate_number: newBooking.plate_number,
          service_date: newBooking.booking_date,
          services_provided: newBooking.services,
          total_amount: newBooking.price,
          service_type: 'carwash',
          signature_data: newBooking.signature_data,
        });
      } catch (error) {
        console.error('[App] Ошибка создания записи ведомости:', error);
        // Не прерываем создание заказа
      }
    }

    await refreshBookingsData();
    setCurrentView('dashboard');
  } catch (error) {
    console.error('Ошибка создания быстрого заказа:', error);
    alert(error.message || 'Не удалось создать быстрый заказ');
  }
}}
```

---

### ЗАДАЧА 2.6: Реализовать защиту от повторного начисления бонусов

**Файлы:**
- `lib/api/loyalty.ts` - новые функции

**Описание:**
Добавить функции для обновления прогресса лояльности с защитой от повторного начисления.

**Код:**
```typescript
// lib/api/loyalty.ts

/**
 * ✅ НОВАЯ ФУНКЦИЯ: Обновить прогресс лояльности клиента
 * Защищена от повторного начисления за один заказ
 */
export async function updateLoyaltyProgress(
  clientId: string,
  bookingId: string,
  serviceIds: string[]
): Promise<LoyaltyProgress> {
  // Проверяем, подходит ли заказ для лояльности
  if (!isBookingEligibleForLoyalty(serviceIds)) {
    // Заказ не подходит - просто возвращаем текущий прогресс
    const progress = await getClientLoyaltyProgress(clientId);
    if (progress) return progress;
    
    // Создаем запись если не существует
    const { data: newProgress } = await supabase
      .from('loyalty_carwash_progress')
      .insert({
        client_id: clientId,
        total_washes_with_body: 0,
        last_booking_id: bookingId,
        last_wash_date: new Date().toISOString()
      })
      .select()
      .single();

    return newProgress as LoyaltyProgress;
  }

  // Получаем текущий прогресс
  const currentProgress = await getClientLoyaltyProgress(clientId);
  
  // ✅ НОВАЯ ПРОВЕРКА: этот заказ уже учтен?
  if (currentProgress && currentProgress.last_booking_id === bookingId) {
    return currentProgress; // Уже учтен, возвращаем без изменений
  }

  const newTotalWashes = (currentProgress?.total_washes_with_body || 0) + 1;

  if (currentProgress) {
    // Обновляем существующую запись
    const { data: updated } = await supabase
      .from('loyalty_carwash_progress')
      .update({
        total_washes_with_body: newTotalWashes,
        last_booking_id: bookingId,
        last_wash_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', currentProgress.id)
      .select()
      .single();

    return updated as LoyaltyProgress;
  } else {
    // Создаем новую запись
    const { data: newProgress } = await supabase
      .from('loyalty_carwash_progress')
      .insert({
        client_id: clientId,
        total_washes_with_body: newTotalWashes,
        last_booking_id: bookingId,
        last_wash_date: new Date().toISOString()
      })
      .select()
      .single();

    return newProgress as LoyaltyProgress;
  }
}
```

---

### ЗАДАЧА 2.7: Реализовать retry-механизмы с idempotency keys

**Файлы:**
- Новые утилиты для retry
- Обновить компоненты для использования retry

**Описание:**
Если запрос упал из-за сети — повторная попытка не должна создавать дубль. Использовать idempotency keys.

**Код:**
```typescript
// shared/utils/retry.ts

/**
 * ✅ НОВАЯ УТИЛИТА: Retry с idempotency key
 * Гарантирует, что повторные попытки не создадут дубль
 */
export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  idempotencyKey?: string;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retryWithIdempotency<T>(
  operation: (idempotencyKey: string) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    idempotencyKey,
    onRetry
  } = options;

  const key = idempotencyKey || generateIdempotencyKey();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation(key);
    } catch (error) {
      lastError = error as Error;

      // Если это ошибка дубликата по idempotency key - это успех
      if (error instanceof Error && error.message.includes('duplicate key')) {
        // Пытаемся получить существующий результат
        try {
          return await operation(key);
        } catch {
          // Если не получается, продолжаем retry
        }
      }

      // Если это последняя попытка - выбрасываем ошибку
      if (attempt === maxAttempts) {
        break;
      }

      // Вызываем callback для логирования
      if (onRetry) {
        onRetry(attempt, lastError);
      }

      // Ждем перед следующей попыткой
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Генерировать уникальный idempotency key
 */
export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}
```

```typescript
// Пример использования в компоненте
import { retryWithIdempotency, generateIdempotencyKey } from '@/shared/utils/retry';

const handleMarkAsPaid = async (bookingId: string) => {
  if (isProcessing) return;
  
  setIsProcessing(true);
  try {
    await retryWithIdempotency(
      async (key) => await markAsPaidIdempotent(bookingId, key),
      {
        maxAttempts: 3,
        delayMs: 500,
        onRetry: (attempt, error) => {
          console.log(`Retry attempt ${attempt}:`, error.message);
        }
      }
    );
    await loadBookings();
  } catch (error) {
    console.error('Ошибка оплаты:', error);
    alert('Не удалось отметить заказ как оплаченный');
  } finally {
    setIsProcessing(false);
  }
};
```

---

### ЗАДАЧА 2.8: Усилить блокировки на бэкенде (не только UI)

**Файлы:**
- `App.tsx` - обновить функции обработки
- Все компоненты с критическими операциями

**Описание:**
Блокировки UI недостаточны. Нужны блокировки только на бэкенде (БД или Redis) для защиты от:
- Двух открытых вкладок
- Двух админов одновременно
- Мобильный клиент + веб одновременно

**✅ УЖЕ ЕСТЬ:**
- RPC функции `start_admin_shift`, `start_worker_shift`, `start_tire_worker_shift` - используют advisory locks

**❌ НУЖНО ДОБАВИТЬ:**
- RPC функции `acquire_lock`, `release_lock` - для общего механизма блокировок

**Код:**
```typescript
// lib/api/locks.ts

/**
 * ✅ НОВЫЕ ФУНКЦИИ: Блокировки на бэкенде
 * Используют PostgreSQL advisory locks
 */

/**
 * Попытаться получить блокировку для операции
 * @returns true если блокировка получена, false если занята
 */
export async function acquireLock(
  lockKey: string,
  timeoutMs: number = 5000
): Promise<boolean> {
  const { data, error } = await supabase.rpc('acquire_lock', {
    p_lock_key: lockKey,
    p_timeout_ms: timeoutMs
  });

  if (error) {
    console.error('Ошибка получения блокировки:', error);
    return false;
  }

  return data as boolean;
}

/**
 * Освободить блокировку
 */
export async function releaseLock(lockKey: string): Promise<void> {
  const { error } = await supabase.rpc('release_lock', {
    p_lock_key: lockKey
  });

  if (error) {
    console.error('Ошибка освобождения блокировки:', error);
  }
}

/**
 * Выполнить операцию с блокировкой
 */
export async function withLock<T>(
  lockKey: string,
  operation: () => Promise<T>,
  timeoutMs: number = 5000
): Promise<T> {
  const acquired = await acquireLock(lockKey, timeoutMs);

  if (!acquired) {
    throw new Error('Операция уже выполняется. Попробуйте позже.');
  }

  try {
    return await operation();
  } finally {
    await releaseLock(lockKey);
  }
}
```

```sql
-- migrations/lock_functions.sql

-- Функция получения блокировки
CREATE OR REPLACE FUNCTION acquire_lock(
  p_lock_key TEXT,
  p_timeout_ms INTEGER DEFAULT 5000
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_lock_id BIGINT;
  v_start_time TIMESTAMP := NOW();
BEGIN
  -- Генерируем ID блокировки из ключа
  v_lock_id := hashtext(p_lock_key);

  -- Пытаемся получить блокировку с таймаутом
  WHILE (NOW() - v_start_time) * 1000 < p_timeout_ms LOOP
    IF pg_try_advisory_lock(v_lock_id) THEN
      RETURN TRUE;
    END IF;

    -- Ждем 100ms перед следующей попыткой
    PERFORM pg_sleep(0.1);
  END LOOP;

  RETURN FALSE;
END;
$$;

-- Функция освобождения блокировки
CREATE OR REPLACE FUNCTION release_lock(
  p_lock_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_lock_id BIGINT;
BEGIN
  v_lock_id := hashtext(p_lock_key);
  PERFORM pg_advisory_unlock(v_lock_id);
END;
$$;
```

```typescript
// Пример использования в API функциях
import { withLock } from '@/lib/api/locks';

export async function markAsPaid(id: string): Promise<Booking> {
  // ✅ Используем блокировку на бэкенде
  return withLock(
    `booking:paid:${id}`,
    async () => {
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('is_paid, paid_at')
        .eq('id', id)
        .single();

      if (!existingBooking) {
        throw new Error('Заказ не найден');
      }

      if (existingBooking.is_paid) {
        throw new Error('Заказ уже оплачен');
      }

      return updateBooking(id, {
        is_paid: true,
        paid_at: new Date().toISOString()
      });
    },
    5000 // 5 секунд таймаут
  );
}
```

---

## 📅 ПРИОРИТЕТ 3: МЕНЕЕ ВАЖНЫЕ ИСПРАВЛЕНИЯ (ПОЗЖЕ)

### ЗАДАЧА 3.1: Добавить проверку на дубликаты телефонов

**Файлы:**
- Все API функции для критических операций
- Новые функции для блокировок

**Описание:**
Уникальные индексы решают только часть проблемы. При одновременных запросах оба могут увидеть "нет дубликата" и создать дубль. Нужно использовать `FOR UPDATE` или оптимистичные блокировки.

**✅ УЖЕ РЕАЛИЗОВАНО:**
- RPC функции `start_admin_shift`, `start_worker_shift`, `start_tire_worker_shift` - используют `FOR UPDATE` правильно для блокировки смен
- RPC функции `create_worksheet_entry_on_booking_ready`, `create_worksheet_entry_on_tire_booking_ready` - автоматическое создание записей в ведомости с проверкой дублей

**❌ НУЖНО ДОБАВИТЬ:**
- RPC функции `create_booking_with_lock`, `create_tire_booking_with_lock` - для создания заказов с защитой от race conditions
- RPC функции `acquire_lock`, `release_lock` - для общего механизма блокировок

**Код:**
```typescript
// lib/api/bookings.ts

/**
 * ✅ НОВАЯ ФУНКЦИЯ: Создать заказ с защитой от race conditions
 * Использует SELECT FOR UPDATE для блокировки строки
 */
export async function createBookingWithLock(
  booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>
): Promise<Booking> {
  let bookingToInsert = { ...booking };

  // Нормализуем телефон
  if (booking.phone) {
    bookingToInsert.phone = normalizePhoneNumber(booking.phone);
  }

  // ✅ ЗАЩИТА ОТ RACE CONDITIONS: используем RPC функцию с блокировкой
  const { data, error } = await supabase.rpc('create_booking_with_lock', {
    p_client_car_id: booking.client_car_id,
    p_car_id: booking.car_id,
    p_booking_date: booking.booking_date,
    p_start_time: booking.start_time,
    p_end_time: booking.end_time,
    p_is_org: booking.is_org,
    p_booking_data: bookingToInsert
  });

  if (error) {
    if (error.message.includes('duplicate key')) {
      throw new Error('Заказ на это время уже существует');
    }
    throw error;
  }

  return data as Booking;
}
```

```sql
-- migrations/create_booking_with_lock.sql

-- RPC функция для создания заказа с защитой от race conditions
CREATE OR REPLACE FUNCTION create_booking_with_lock(
  p_client_car_id UUID,
  p_car_id UUID,
  p_booking_date DATE,
  p_start_time TEXT,
  p_end_time TEXT,
  p_is_org BOOLEAN,
  p_booking_data JSONB
)
RETURNS bookings
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking bookings;
  v_existing_id UUID;
BEGIN
  -- Блокируем все заказы для этой машины на эту дату
  IF p_is_org = false AND p_client_car_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM bookings
    WHERE client_car_id = p_client_car_id
      AND booking_date = p_booking_date
      AND status NOT IN ('ОТМЕНЕНО', 'ГОТОВО')
      AND (
        (start_time <= p_start_time AND end_time > p_start_time)
        OR (start_time < p_end_time AND end_time >= p_end_time)
        OR (start_time >= p_start_time AND end_time <= p_end_time)
      )
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Заказ на это время уже существует';
    END IF;
  END IF;

  -- Вставляем новый заказ
  INSERT INTO bookings (
    client_id, client_car_id, organization_id, car_id, driver_id,
    booking_date, start_time, end_time, services, price, status,
    is_paid, is_org, is_quick_booking, notes, phone, car_model,
    plate_number, car_type, org_name, driver_name, worker_id,
    worker_name, worker_id_2, worker_name_2, signature_data,
    signature_obtained_at, created_at, updated_at
  )
  SELECT
    p_booking_data->>'client_id',
    p_booking_data->>'client_car_id',
    p_booking_data->>'organization_id',
    p_booking_data->>'car_id',
    p_booking_data->>'driver_id',
    p_booking_data->>'booking_date',
    p_booking_data->>'start_time',
    p_booking_data->>'end_time',
    p_booking_data->>'services',
    (p_booking_data->>'price')::NUMERIC,
    p_booking_data->>'status',
    (p_booking_data->>'is_paid')::BOOLEAN,
    (p_booking_data->>'is_org')::BOOLEAN,
    (p_booking_data->>'is_quick_booking')::BOOLEAN,
    p_booking_data->>'notes',
    p_booking_data->>'phone',
    p_booking_data->>'car_model',
    p_booking_data->>'plate_number',
    p_booking_data->>'car_type',
    p_booking_data->>'org_name',
    p_booking_data->>'driver_name',
    p_booking_data->>'worker_id',
    p_booking_data->>'worker_name',
    p_booking_data->>'worker_id_2',
    p_booking_data->>'worker_name_2',
    p_booking_data->>'signature_data',
    p_booking_data->>'signature_obtained_at',
    NOW(),
    NOW()
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;
```

---

### ЗАДАЧА 1.7: Реализовать идемпотентность критических операций

**Файлы:**
- `lib/api/bookings.ts` - обновить `markAsPaid()` для поддержки idempotency
- `lib/api/tire-bookings.ts` - обновить `markTireBookingAsPaid()` для поддержки idempotency
- Новые утилиты для retry

**Описание:**
Использовать единый подход к идемпотентности через retry утилиту. API функции принимают idempotency_key и проверяют дубликаты.

**⚠️ ВАЖНО:** Убрать отдельную функцию `markAsPaidIdempotent()`! Использовать только retry утилиту.

**Код:**
```typescript
// lib/api/bookings.ts

/**
 * ✅ ОБНОВЛЕННАЯ ФУНКЦИЯ: Отметить заказ как оплаченный (идемпотентно)
 * Повторные вызовы с тем же idempotency_key не создадут дубль
 */
export async function markAsPaid(
  id: string,
  idempotencyKey?: string
): Promise<Booking> {
  // ✅ ПРОВЕРКА: операция уже выполнена с этим idempotency_key?
  if (idempotencyKey) {
    const { data: existingPayment } = await supabase
      .from('booking_payments')
      .select('id, booking_id')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existingPayment) {
      // Операция уже выполнена, возвращаем результат
      const { data: booking } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', existingPayment.booking_id)
        .single();

      if (!booking) {
        throw new Error('Заказ не найден');
      }

      return booking as Booking;
    }
  }

  // ✅ ПРОВЕРКА: заказ уже оплачен?
  const { data: currentBooking } = await supabase
    .from('bookings')
    .select('is_paid, paid_at')
    .eq('id', id)
    .single();

  if (!currentBooking) {
    throw new Error('Заказ не найден');
  }

  if (currentBooking.is_paid) {
    // Заказ уже оплачен
    if (idempotencyKey) {
      // Создаем запись с idempotency key для согласованности
      await supabase.from('booking_payments').insert({
        booking_id: id,
        idempotency_key: idempotencyKey,
        amount: 0,
        payment_method: 'duplicate',
        created_at: new Date().toISOString()
      });
    }
    return currentBooking as Booking;
  }

  // Отмечаем заказ как оплаченный
  const { data: updatedBooking, error: updateError } = await supabase
    .from('bookings')
    .update({
      is_paid: true,
      paid_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) throw updateError;

  // Создаем запись о платеже
  if (idempotencyKey) {
    const { error: paymentError } = await supabase.from('booking_payments').insert({
      booking_id: id,
      idempotency_key: idempotencyKey,
      amount: updatedBooking.price,
      payment_method: 'cash',
      created_at: new Date().toISOString()
    });

    if (paymentError) {
      console.error('Ошибка создания записи о платеже:', paymentError);
      // Не прерываем операцию, заказ уже оплачен
    }
  }

  return updatedBooking as Booking;
}
```

```typescript
// lib/api/tire-bookings.ts

/**
 * ✅ ОБНОВЛЕННАЯ ФУНКЦИЯ: Отметить заказ шиномонтажа как оплаченный (идемпотентно)
 */
export async function markTireBookingAsPaid(
  id: string,
  idempotencyKey?: string
): Promise<void> {
  // ✅ ПРОВЕРКА: операция уже выполнена с этим idempotency_key?
  if (idempotencyKey) {
    const { data: existingPayment } = await supabase
      .from('booking_payments')
      .select('id, booking_id')
      .eq('idempotency_key', idempotencyKey)
      .single();

    if (existingPayment) {
      // Операция уже выполнена
      return;
    }
  }

  // ✅ ПРОВЕРКА: заказ уже оплачен?
  const { data: currentBooking } = await supabase
    .from('tire_bookings')
    .select('is_paid, paid_at')
    .eq('id', id)
    .single();

  if (!currentBooking) {
    throw new Error('Заказ не найден');
  }

  if (currentBooking.is_paid) {
    // Заказ уже оплачен
    if (idempotencyKey) {
      await supabase.from('booking_payments').insert({
        booking_id: id,
        idempotency_key: idempotencyKey,
        amount: 0,
        payment_method: 'duplicate',
        created_at: new Date().toISOString()
      });
    }
    return;
  }

  // Отмечаем заказ как оплаченный
  const { error: updateError } = await supabase
    .from('tire_bookings')
    .update({ 
      is_paid: true, 
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (updateError) {
    console.error('[TireBookings] Ошибка при отметке заказа как оплаченного:', updateError);
    throw new Error(`Не удалось отметить заказ как оплаченный: ${updateError.message}`);
  }

  // Создаем запись о платеже
  if (idempotencyKey) {
    const { error: paymentError } = await supabase.from('booking_payments').insert({
      booking_id: id,
      idempotency_key: idempotencyKey,
      amount: currentBooking.total_price,
      payment_method: 'cash',
      created_at: new Date().toISOString()
    });

    if (paymentError) {
      console.error('Ошибка создания записи о платеже:', paymentError);
    }
  }
}
```

```typescript
// Пример использования в компоненте
import { retryWithIdempotency, generateIdempotencyKey } from '@/shared/utils/retry';

const handleMarkAsPaid = async (bookingId: string) => {
  if (isProcessing) return;
  
  setIsProcessing(true);
  try {
    // ✅ ЕДИНЫЙ ПОДХОД: retry + idempotency key
    await retryWithIdempotency(
      (key) => markAsPaid(bookingId, key),
      {
        maxAttempts: 3,
        delayMs: 500,
        onRetry: (attempt, error) => {
          console.log(`Retry attempt ${attempt}:`, error.message);
        }
      }
    );
    await loadBookings();
  } catch (error) {
    console.error('Ошибка оплаты:', error);
    alert('Не удалось отметить заказ как оплаченный');
  } finally {
    setIsProcessing(false);
  }
};
```

---

---

## 📅 ПРИОРИТЕТ 3: МЕНЕЕ ВАЖНЫЕ ИСПРАВЛЕНИЯ (ПОЗЖЕ)

### ЗАДАЧА 3.1: Добавить проверку на дубликаты телефонов

**Файлы:**
- `lib/api/clients.ts` - функция `updateClient()`

**Описание:**
Добавить проверку на то, что новый телефон не дублируется с другим клиентом.

**Код:**
```typescript
// lib/api/clients.ts

export async function updateClient(
  id: string,
  data: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>
): Promise<Client> {
  // ✅ НОВАЯ ПРОВЕРКА: новый телефон не дублируется?
  if (data.phone) {
    const normalizedPhone = normalizePhoneNumber(data.phone);
    
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', normalizedPhone)
      .neq('id', id)
      .eq('is_active', true)
      .single();

    if (existing) {
      throw new Error('Клиент с таким номером телефона уже существует');
    }
  }

  const { data: updatedClient, error } = await supabase
    .from('clients')
    .update({
      full_name: data.full_name?.trim(),
      phone: data.phone ? normalizePhoneNumber(data.phone) : undefined,
      notes: data.notes?.trim() || null,
      is_active: data.is_active,
      profile_id: data.profile_id,
      online_booking_blocked_until: data.online_booking_blocked_until
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`Ошибка при обновлении клиента ${id}:`, error);
    throw error;
  }

  return updatedClient;
}
```

---

### ЗАДАЧА 3.2: Добавить проверку на дубликаты гос. номеров

**Файлы:**
- `lib/api/clients.ts` - функция `updateClientCar()`

**Описание:**
Добавить проверку на то, что новый гос. номер не дублируется с другим автомобилем того же клиента.

**Код:**
```typescript
// lib/api/clients.ts

export async function updateClientCar(
  id: string,
  data: Partial<Omit<ClientCar, 'id' | 'created_at'>>
): Promise<ClientCar> {
  // ✅ НОВАЯ ПРОВЕРКА: новый гос. номер не дублируется?
  if (data.plate_number) {
    const normalizedPlate = data.plate_number.trim().toUpperCase();
    
    const { data: existing } = await supabase
      .from('client_cars')
      .select('id')
      .eq('plate_number', normalizedPlate)
      .neq('id', id)
      .eq('is_active', true)
      .single();

    if (existing) {
      throw new Error('Автомобиль с таким гос. номером уже существует');
    }
  }

  const { data: updatedCar, error } = await supabase
    .from('client_cars')
    .update({
      car_model: data.car_model?.trim(),
      plate_number: data.plate_number?.trim().toUpperCase(),
      car_type: data.car_type?.trim(),
      is_active: data.is_active
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`Ошибка при обновлении автомобиля клиента ${id}:`, error);
    throw error;
  }

  return updatedCar;
}
```

---

## 🔧 ДОПОЛНИТЕЛЬНЫЕ ТЕХНИЧЕСКИЕ РЕШЕНИЯ

### 1. Добавить уникальные индексы в базе данных

Создать миграцию для добавления уникальных индексов:

```sql
-- migrations/add_unique_indexes.sql

-- ✅ УЖЕ ЕСТЬ: idx_worksheet_entries_carwash_booking_unique (защита от дубликатов в ведомости)
-- ✅ УЖЕ ЕСТЬ: idx_worksheet_entries_tire_booking_unique (защита от дубликатов в ведомости)
-- ❌ НЕТ: Уникальные индексы для bookings и tire_bookings

-- Для заказов автомойки (физлица)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_client_slot
ON bookings(client_car_id, booking_date, start_time)
WHERE is_org = false AND status NOT IN ('ОТМЕНЕНО', 'ГОТОВО');

-- Для заказов автомойки (организации)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_org_slot
ON bookings(car_id, booking_date, start_time)
WHERE is_org = true AND status NOT IN ('ОТМЕНЕНО', 'ГОТОВО');

-- Для заказов шиномонтажа (физлица)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tire_bookings_unique_client_slot
ON tire_bookings(client_car_id, booking_date, start_time)
WHERE is_org = false AND status NOT IN ('ОТМЕНЕНО', 'ГОТОВО');

-- Для заказов шиномонтажа (организации)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tire_bookings_unique_org_slot
ON tire_bookings(car_id, booking_date, start_time)
WHERE is_org = true AND status NOT IN ('ОТМЕНЕНО', 'ГОТОВО');
```

**Важно:** Условие `status NOT IN ('ОТМЕНЕНО', 'ГОТОВО')` гарантирует, что не будет дублей только для активных заказов.

**✅ Что уже есть в БД:**
- Уникальные индексы для `worksheet_entries` (защита от дубликатов в ведомости)
- RPC функции с `FOR UPDATE` для смен и ведомости

**❌ Что нужно добавить:**
- Уникальные индексы для `bookings` (автомойка)
- Уникальные индексы для `tire_bookings` (шиномонтаж)

---

### 2. Оптимизировать существующие индексы (удалить дубликаты)

**Файлы:**
- Новая миграция для оптимизации индексов

**Описание:**
В БД есть дублирующиеся индексы, которые замедляют операции INSERT/UPDATE и занимают лишнее место.

**⚠️ Обнаруженные дубликаты:**
- `bookings`: `idx_bookings_client_id` дублирует `idx_bookings_client`
- `tire_bookings`: `idx_tire_bookings_booking_date` и `idx_tire_bookings_date` дублируют друг друга

**Код:**
```sql
-- migrations/optimize_indexes.sql

-- Удаляем дублирующиеся индексы в bookings
DROP INDEX IF EXISTS idx_bookings_client_id;

-- Удаляем дублирующиеся индексы в tire_bookings
DROP INDEX IF EXISTS idx_tire_bookings_booking_date;
-- (оставляем idx_tire_bookings_date, так как он короче)
```

---

### 2. Добавить защиту от повторных кликов в компонентах

Пример для компонента:

```typescript
// components/admin/BookingsList.tsx

export const BookingCard = ({ booking, onMarkAsPaid, ... }: BookingCardProps) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleMarkAsPaidClick = async () => {
    // ✅ Защита от повторных кликов (но это НЕ достаточно!)
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      await onMarkAsPaid();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Button
      size="sm"
      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
      disabled={disabled || !booking.worker_id || isProcessing}
      onClick={handleMarkAsPaidClick}
    >
      <CheckCircle className="w-4 h-4 mr-2" />
      {isProcessing ? 'Обработка...' : 'Оплачено'}
    </Button>
  );
};
```

**⚠️ Важно:** Блокировки UI недостаточны! Нужны блокировки на бэкенде (см. задачу 2.8).

---

### 3. Добавить улучшенную обработку ошибок в UI

```typescript
// Пример для отображения ошибок
const [error, setError] = useState<string | null>(null);

const handleMarkAsReady = async (bookingId: string) => {
  setError(null);
  try {
    await markAsReady(bookingId);
  } catch (err) {
    setError(err.message || 'Не удалось завершить заказ');
    // Автоматически скрываем ошибку через 5 секунд
    setTimeout(() => setError(null), 5000);
  }
};

// В JSX:
{error && (
  <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
    <div className="flex items-center gap-2">
      <AlertCircle className="w-5 h-5" />
      <span>{error}</span>
    </div>
  </div>
)}
```

---

## 📋 ЧЕК-ЛИСТ РЕАЛИЗАЦИИ

### ПРИОРИТЕТ 1: КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ
- [ ] 1.1 Создать RPC функции для создания заказов с защитой от дублей
  - ❌ НУЖНО: create_booking_with_lock, create_tire_booking_with_lock
  - ❌ НУЖНО: Обновить createBooking() и createTireBooking() для вызова RPC
- [ ] 1.2 Добавить защиту от двойной оплаты
  - ✅ УЖЕ ЕСТЬ: markAsPaid() проверяет is_paid
  - ❌ НУЖНО: Обновить markAsPaid() для поддержки idempotency_key
- [ ] 1.3 Добавить защиту от двойного начисления зарплаты
  - ✅ УЖЕ ЕСТЬ: addWorkerEarningsForBooking() проверяет completed_bookings
  - ✅ УЖЕ ЕСТЬ: addTireWorkerEarningsForBooking() проверяет completed_bookings
- [ ] 1.4 Обеспечить атомарность при завершении заказа
  - ❌ НУЖНО: Создать markAsReadyWithSalary() и markTireBookingAsReadyWithSalary()
  - ❌ НУЖНО: Обновить UI для вызова новых функций
- [ ] 1.5 Добавить защиту от Race Conditions (SELECT FOR UPDATE)
  - ✅ УЖЕ ЕСТЬ: RPC функции смен с FOR UPDATE
  - ❌ НУЖНО: RPC функции для создания заказов с блокировкой
- [ ] 1.6 Реализовать идемпотентность критических операций
  - ❌ НУЖНО: Обновить markAsPaid() и markTireBookingAsPaid() для idempotency_key
  - ❌ НУЖНО: Создать утилиту retryWithIdempotency()

### ПРИОРИТЕТ 2: ВАЖНЫЕ ИСПРАВЛЕНИЯ
- [ ] 2.1 Добавить проверку статуса перед отменой
  - ❌ НУЖНО: Обновить handleClientCancellation() для проверки статуса
- [ ] 2.2 Обработка ошибок от уникальных индексов ведомости
  - ✅ УЖЕ ЕСТЬ: Уникальные индексы в БД
  - ❌ НУЖНО: Обновить createWorksheetEntry() для обработки ошибок
- [ ] 2.3 Добавить валидацию переходов статусов
  - ❌ НУЖНО: Создать VALID_STATUS_TRANSITIONS
  - ❌ НУЖНО: Обновить updateBookingStatus() и updateTireBookingStatus()
- [ ] 2.4 Добавить проверку на дубликаты услуг
  - ❌ НУЖНО: Обновить addServicesToBooking() для проверки дубликатов
- [ ] 2.5 Использовать RPC функцию для быстрых заказов
  - ✅ УЖЕ ЕСТЬ: createBooking() вызывает RPC
  - ❌ НУЖНО: Обновить onQuickBooking в UI для использования retry
- [ ] 2.6 Реализовать защиту от повторного начисления бонусов
  - ✅ УЖЕ ЕСТЬ: updateLoyaltyProgress() проверяет last_booking_id
  - ❌ НУЖНО: Проверить корректность реализации
- [ ] 2.7 Реализовать retry-механизмы с idempotency keys
  - ❌ НУЖНО: Создать утилиту retryWithIdempotency()
  - ❌ НУЖНО: Обновить все критические операции для использования retry
- [ ] 2.8 Усилить блокировки на бэкенде (не только UI)
  - ✅ УЖЕ ЕСТЬ: RPC функции смен используют advisory locks
  - ❌ НУЖНО: RPC функции acquire_lock, release_lock

### ПРИОРИТЕТ 3: МЕНЕЕ ВАЖНЫЕ ИСПРАВЛЕНИЯ
- [ ] 3.1 Добавить проверку на дубликаты телефонов
- [ ] 3.2 Добавить проверку на дубликаты гос. номеров

### ДОПОЛНИТЕЛЬНЫЕ ТЕХНИЧЕСКИЕ РЕШЕНИЯ
- [ ] Создать миграцию для уникальных индексов
  - ✅ УЖЕ ЕСТЬ: Индексы для worksheet_entries
  - ❌ НУЖНО: Индексы для bookings и tire_bookings
- [ ] Оптимизировать существующие индексы (удалить дубликаты)
  - ❌ НУЖНО: Удалить idx_bookings_client_id (дублирует idx_bookings_client)
  - ❌ НУЖНО: Удалить idx_tire_bookings_booking_date (дублирует idx_tire_bookings_date)
- [ ] Создать RPC функции для блокировок
  - ✅ УЖЕ ЕСТЬ: start_*_shift, create_worksheet_entry_*
  - ❌ НУЖНО: acquire_lock, release_lock, create_*_booking_with_lock
- [ ] Добавить защиту от повторных кликов в компонентах
- [ ] Добавить улучшенную обработку ошибок в UI

---

## 📈 ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ

После реализации всех исправлений:

✅ **Качество данных:**
- Полное отсутствие дублей заказов
- Корректные финансовые отчеты
- Точные данные о зарплате

✅ **Пользовательский опыт:**
- Понятные сообщения об ошибках
- Защита от повторных кликов
- Корректная работа интерфейса
- Автоматический retry при сетевых ошибках

✅ **Надежность:**
- Атомарные транзакции
- Защита от race conditions
- Идемпотентные операции
- Блокировки на бэкенде (не только UI)
- Валидация на всех уровнях

✅ **Производительность:**
- Уникальные индексы для быстрого поиска
- Оптимизированные запросы
- Минимизация лишних проверок
- Эффективные блокировки

✅ **Безопасность:**
- Защита от двойных оплат
- Защита от двойного начисления зарплаты
- Защита от некорректных переходов статусов
- Защита от отмены завершенных/оплаченных заказов

---

## 📊 МЕТРИКИ УСПЕХА

После реализации можно измерить:

1. **Количество дублей заказов** → должно быть 0
2. **Количество двойных оплат** → должно быть 0
3. **Количество двойных начислений зарплаты** → должно быть 0
4. **Количество retry попыток** → должно быть минимальным
5. **Время отклика на операции** → не должно увеличиться более чем на 20%
6. **Количество ошибок в аудите** → должно быть 0

---

## 🚀 РЕКОМЕНДАЦИИ ПО ВНЕДРЕНИЮ

### Фаза 1: Подготовка (1-2 дня)
1. Создать все миграции для БД (уникальные индексы, оптимизация)
2. Создать RPC функции для блокировок (acquire_lock, release_lock)
3. Создать RPC функции для создания заказов (create_booking_with_lock, create_tire_booking_with_lock)
4. Добавить утилиту retryWithIdempotency()

### Фаза 2: Критические исправления (3-5 дней)
1. Реализовать задачи 1.1 - 1.6 (базовая защита)
2. Обновить API функции для использования RPC с блокировками
3. Убрать все проверки дубликатов из UI
4. Тестировать на staging окружении

### Фаза 3: Важные исправления (2-3 дня)
1. Реализовать задачи 2.1 - 2.8
2. Добавить retry-механизмы во все критические операции
3. Добавить блокировки на бэкенде (acquire_lock, release_lock)

### Фаза 4: Менее важные исправления (1-2 дня)
1. Реализовать задачи 3.1 - 3.2
2. Финальное тестирование
3. Документация

**Общее время:** 7-12 дней

---

## 📊 КЛЮЧЕВЫЕ ПРИНЦИПЫ АРХИТЕКТУРЫ

### ✅ ПРАВИЛЬНО:
1. **БД** → уникальные индексы + RPC с FOR UPDATE
2. **API** → все проверки и бизнес-логика
3. **UI** → только retry и обработка ошибок

### ❌ НЕПРАВИЛЬНО:
1. Проверки дубликатов в UI → только в API/БД
2. Проверки статусов в UI → только в API
3. Дублирование проверок в нескольких местах
4. Отдельные функции для идемпотентности → использовать retry утилиту

### 🎯 ПРИОРИТЕТ ЗАЩИТЫ:
1. **Уникальные индексы** → предотвращают дубли на уровне БД
2. **RPC с FOR UPDATE** → защита от race conditions
3. **Idempotency keys** → защита от повторных попыток
4. **Retry механизмы** → обработка сетевых ошибок

---

**План составлен:** 2025-01-09  
**Статус:** Готов к реализации  
**Версия:** 4.0 (упрощенная архитектура: БД → API → UI, без мониторинга/аудита)
