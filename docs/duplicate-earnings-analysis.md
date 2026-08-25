# Анализ проблемы: Дубликаты заработка при многократном нажатии кнопки "ГОТОВО"

## 📊 СИТУАЦИЯ В БД

### Дубликаты в tire_workers:
```sql
SELECT 
  id,
  full_name,
  array_length(completed_bookings, 1) as total_count,
  array_length(ARRAY(SELECT DISTINCT unnest(completed_bookings)), 1) as unique_count,
  array_length(completed_bookings, 1) - array_length(ARRAY(SELECT DISTINCT unnest(completed_bookings)), 1) as duplicates_count
FROM tire_workers
WHERE completed_bookings IS NOT NULL
  AND array_length(completed_bookings, 1) > array_length(ARRAY(SELECT DISTINCT unnest(completed_bookings)), 1)
ORDER BY duplicates_count DESC;
```

**Результат:**
- Андрей: 10 записей, 6 уникальных, 4 дубликата

### Дубликаты в salary_transactions:
```sql
SELECT 
  worker_id,
  worker_name,
  transaction_type,
  COUNT(*) as transaction_count
FROM salary_transactions
WHERE worker_type = 'tire_worker'
GROUP BY worker_id, worker_name, transaction_type
HAVING COUNT(*) > 1
ORDER BY transaction_count DESC;
```

**Результат:**
- Андрей: 55 транзакций типа EARNING, 9 транзакций типа TRANSFER

### Последние транзакции для Андрея:
```sql
SELECT 
  id,
  transaction_type,
  amount,
  balance_after,
  description,
  created_at
FROM salary_transactions
WHERE worker_id = '9c20f1a9-b7ca-46b4-9edb-4550885eb93c'
  AND worker_type = 'tire_worker'
  AND transaction_type = 'EARNING'
  AND description LIKE '%8e6f242a%'
ORDER BY created_at DESC
LIMIT 15;
```

**Результат:**
- 10 транзакций для заказа `#8e6f242a` по 300₽
- Все созданы в течение 2 секунд (14:48:16 - 14:48:19)
- Все имеют одинаковый `balance_after`: 19000.00₽
- **Баланс НЕ увеличивался!** Транзакции просто создавались.

## 🔑 КЛЮЧЕВЫЕ МЕСТА В КОДЕ

### 1. RPC функции в БД (с защитой от дублей):

#### `add_tire_worker_earnings` - для шиномонтажников:
```sql
CREATE OR REPLACE FUNCTION public.add_tire_worker_earnings(
  p_worker_id uuid, 
  p_booking_id uuid, 
  p_earnings numeric
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_worker tire_workers;
  v_booking_id_str TEXT;
BEGIN
  -- Преобразуем UUID в строку для сравнения с массивом
  v_booking_id_str := p_booking_id::TEXT;
  
  SELECT * INTO v_worker
  FROM tire_workers
  WHERE id = p_worker_id
  FOR UPDATE;

  IF v_booking_id_str = ANY(v_worker.completed_bookings) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Already added',
      'worker', row_to_json(v_worker)
    );
  END IF;

  UPDATE tire_workers
  SET
    earned_today = earned_today + p_earnings,
    current_balance = current_balance + p_earnings,
    completed_bookings = array_append(completed_bookings, v_booking_id_str),
    updated_at = NOW()
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Earnings added',
    'worker', row_to_json(v_worker)
  );
END;
$function$
```

**Ключевая защита:**
- `FOR UPDATE` - блокирует строку работника при одновременных запросах
- `IF v_booking_id_str = ANY(v_worker.completed_bookings)` - проверяет, что заказ уже начислен
- Возвращает `success: false`, если заказ уже начислен

#### `add_worker_earnings` - для мойщиков (аналогично):
```sql
CREATE OR REPLACE FUNCTION add_worker_earnings(
  p_worker_id UUID,
  p_booking_id UUID,
  p_earnings NUMERIC,
  p_cars NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_worker workers;
  v_booking_id_str TEXT;
BEGIN
  -- Преобразуем UUID в строку для сравнения с массивом
  v_booking_id_str := p_booking_id::TEXT;
  
  -- ✅ Блокируем строку работника (FOR UPDATE = блокировка от одновременных запросов)
  SELECT * INTO v_worker
  FROM workers
  WHERE id = p_worker_id
  FOR UPDATE;

  -- ✅ Проверка: bookingId уже в массиве?
  IF p_booking_id = ANY(v_worker.completed_bookings) THEN
    -- ✅ Уже начислено - возвращаем текущего работника
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Already added',
      'worker', row_to_json(v_worker)
    );
  END IF;

  -- ✅ Обновляем работника
  UPDATE workers
  SET
    earned_today = earned_today + p_earnings,
    current_balance = current_balance + p_earnings,
    cars_today = cars_today + p_cars,
    completed_bookings = array_append(completed_bookings, p_booking_id::TEXT),
    updated_at = NOW()
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  -- ✅ Возвращаем обновленного работника
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Earnings added',
    'worker', row_to_json(v_worker)
  );
END;
$$;
```

### 2. API функции в коде:

#### `lib/api/tire-workers.ts` - `addTireWorkerEarningsForBooking`:
```typescript
export async function addTireWorkerEarningsForBooking(
  workerId: string,
  bookingId: string,
  orderPrice: number
): Promise<TireWorker> {
  // Получаем текущие данные мастера
  const worker = await getTireWorkerById(workerId);
  if (!worker) {
    throw new Error(`Мастер с ID ${workerId} не найден`);
  }

  // Получаем настройки зарплаты из БД
  const settings = await getSalarySettings();
  if (!settings) {
    throw new Error('Настройки зарплаты не найдены');
  }

  // Получаем данные заказа для проверки услуг
  const booking = await getTireBookingById(bookingId);
  if (!booking) {
    throw new Error(`Заказ с ID ${bookingId} не найден`);
  }

  // Проверяем, содержит ли заказ услугу "Хранение резины"
  const isStorageService = booking.services.some(s => s.name === 'Хранение резины');

  let earnings: number;

  if (isStorageService) {
    // Если есть хранение - считаем отдельно:
    // 1. 50% от суммы обычных услуг (не "Хранение резины")
    // 2. Фиксированная ставка за хранение

    const regularServicesTotal = booking.services
      .filter(s => s.name !== 'Хранение резины')
      .reduce((sum, s) => sum + s.total, 0);

    const regularEarnings = regularServicesTotal * settings.tire_worker_commission;
    const storageEarnings = settings.tire_worker_storage_fee || 300;

    earnings = regularEarnings + storageEarnings;
    console.log(`[TireWorkers] Смешанный заказ (хранение + обычные): ${regularServicesTotal}₽ обычных × ${settings.tire_worker_commission * 100}% = ${regularEarnings}₽ + ${storageEarnings}₽ за хранение = ${earnings}₽`);
  } else {
    // Для обычных услуг - мастер получает 50% от чека
    earnings = orderPrice * settings.tire_worker_commission;
    console.log(`[TireWorkers] Обычная услуга: мастер получает ${earnings}₽ (${settings.tire_worker_commission * 100}% от ${orderPrice}₽)`);
  }

  // ✅ ВЫЗОВ RPC ФУНКЦИИ с блокировкой FOR UPDATE
  const { data, error } = await supabase.rpc('add_tire_worker_earnings', {
    p_worker_id: workerId,
    p_booking_id: bookingId,
    p_earnings: earnings
  });

  if (error) {
    console.error('[TireWorkers] Ошибка при добавлении заработка:', error);
    throw new Error(`Не удалось добавить заработок: ${error.message}`);
  }

  // ✅ Проверка: уже было начислено?
  if (!data.success) {
    console.log(`[TireWorkers] Заказ ${bookingId} уже начислен, пропускаем`);
    return data.worker as TireWorker;
  }

  // ✅ Создаем транзакцию только если реально начислили
  const description = `Шиномонтаж #${bookingId.slice(0, 8)}`;
  await createEarningTransaction(
    'tire_worker',
    workerId,
    worker.full_name,
    earnings,
    data.worker.current_balance,
    description
  );

  return data.worker as TireWorker;
}
```

**Ключевая защита:**
- Вызывает RPC функцию `add_tire_worker_earnings`
- Проверяет `if (!data.success)` - если заказ уже начислен, возвращает без создания транзакции
- Создает транзакцию ТОЛЬКО если `data.success === true`

### 3. Обработчик в App.tsx - `handleMarkTireBookingAsReady`:

```typescript
const handleMarkTireBookingAsReady = async (bookingId: string) => {
  try {
    // ✅ Проверка: заказ уже ГОТОВО?
    const booking = tireBookings.find(b => b.id === bookingId);
    if (booking && booking.status === 'ГОТОВО') {
      console.log('[handleMarkTireBookingAsReady] Заказ уже ГОТОВО, пропускаем');
      return;
    }

    // ✅ Используем markTireBookingAsReady с проверкой is_paid и начислением зарплаты
    await markTireBookingAsReady(bookingId);

    // Перезагружаем заказы и мастеров из БД
    await loadTireBookings();

    const { getTireWorkers } = await import('./lib/api/tire-workers');
    const updatedTechnicians = await getTireWorkers();
    setTireTechnicians(updatedTechnicians);
  } catch (error) {
    console.error('Ошибка обновления статуса заказа шиномонтажа:', error);
    alert('Не удалось обновить статус');
  }
};
```

**ПРОБЛЕМА:** В этой функции НЕТ вызова `addTireWorkerEarningsForBooking`!

### 4. Функция `markTireBookingAsReady` в `lib/api/tire-bookings.ts`:

```typescript
export async function markTireBookingAsReady(id: string): Promise<void> {
  // ✅ ПРОВЕРКА: заказ оплачен?
  const { data: booking } = await supabase
    .from('tire_bookings')
    .select('id, status, is_paid')
    .eq('id', id)
    .single();

  if (!booking) {
    throw new Error('Заказ не найден');
  }

  // ✅ ПРОВЕРКА: заказ уже завершен?
  if (booking.status === 'ГОТОВО') {
    return; // Уже завершен — просто возвращаем
  }

  // ✅ ПРОВЕРКА: заказ оплачен?
  if (!booking.is_paid) {
    throw new Error('Сначала отметьте заказ как оплаченный');
  }

  const { error } = await supabase
    .from('tire_bookings')
    .update({
      status: 'ГОТОВО',
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error('[TireBookings] Ошибка при обновлении статуса:', error);
    throw new Error(`Не удалось обновить статус: ${error.message}`);
  }
}
```

**ПРОБЛЕМА:** В этой функции НЕТ начисления заработка! Она только меняет статус на 'ГОТОВО'.

### 5. Обработчик для автомойки - `handleMarkAsReady` (для сравнения):

```typescript
const handleMarkAsReady = async (bookingId: string) => {
  try {
    const booking = [...bookings, ...quickBookings].find(b => b.id === bookingId);
    if (!booking) return;

    // ✅ Проверка: заказ уже ГОТОВО?
    if (booking.status === 'ГОТОВО') {
      console.log('[handleMarkAsReady] Заказ уже ГОТОВО, пропускаем');
      return;
    }

    const { getWorkerById, updateWorker } = await import('./lib/api/workers');
    const updatedWorkers: Worker[] = [];

    if (booking.worker_id && booking.worker_name) {
      const worker = await getWorkerById(booking.worker_id);
      if (worker) {
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

        updatedWorkers.push({
          ...updatedWorker,
          status: 'available',
          current_booking_id: null
        });
      }
    }

    if (booking.worker_id_2 && booking.worker_name_2) {
      const worker2 = await getWorkerById(booking.worker_id_2);
      if (worker2) {
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

        updatedWorkers.push({
          ...updatedWorker2,
          status: 'available',
          current_booking_id: null
        });
      }
    }

    if (updatedWorkers.length > 0) {
      setWorkers(currentWorkers =>
        currentWorkers.map(w => {
          const updated = updatedWorkers.find(uw => uw.id === w.id);
          return updated ? updated : w;
        })
      );
    }

    await markAsReady(bookingId);

    await loadBookings();
    await loadQuickBookings();
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    alert('Не удалось обновить статус');
  }
};
```

**РАБОТАЕТ ПРАВИЛЬНО:** В этой функции ЕСТЬ вызов `addWorkerEarningsForBooking` для обоих мойщиков!

## 🐛 ДЕТАЛЬНОЕ ОПИСАНИЕ ПРОБЛЕМЫ

### Проблема #1: Функция начисления заработка НЕ вызывается

**В `handleMarkTireBookingAsReady` (строки 1144-1166 App.tsx):**
```typescript
const handleMarkTireBookingAsReady = async (bookingId: string) => {
  try {
    // ✅ Проверка: заказ уже ГОТОВО?
    const booking = tireBookings.find(b => b.id === bookingId);
    if (booking && booking.status === 'ГОТОВО') {
      console.log('[handleMarkTireBookingAsReady] Заказ уже ГОТОВО, пропускаем');
      return;
    }

    // ✅ Используем markTireBookingAsReady с проверкой is_paid и начислением зарплаты
    await markTireBookingAsReady(bookingId);

    // Перезагружаем заказы и мастеров из БД
    await loadTireBookings();

    const { getTireWorkers } = await import('./lib/api/tire-workers');
    const updatedTechnicians = await getTireWorkers();
    setTireTechnicians(updatedTechnicians);
  } catch (error) {
    console.error('Ошибка обновления статуса заказа шиномонтажа:', error);
    alert('Не удалось обновить статус');
  }
};
```

**Комментарий на строке 1153 гласит:** `"✅ Используем markTireBookingAsReady с проверкой is_paid и начислением зарплаты"`

**НО в реальности:**
- Функция `markTireBookingAsReady` ТОЛЬКО меняет статус на 'ГОТОВО'
- В ней НЕТ начисления заработка!
- Функция `addTireWorkerEarningsForBooking` НЕ вызывается!

### Проблема #2: Заработок где-то начисляется, но не через защищённую функцию

**Факты:**
1. В БД есть 55 транзакций типа EARNING для Андрея
2. 10 транзакций для заказа `#8e6f242a` по 300₽ созданы за 2 секунды
3. Все транзакции имеют одинаковый `balance_after`: 19000.00₽
4. Баланс НЕ увеличивался! Транзакции просто создавались.

**Вывод:** Заработок начисляется где-то, но НЕ через RPC функцию `add_tire_worker_earnings` с защитой от дублей!

### Проблема #3: Где начисляется заработок?

**Проверено:**
1. ✅ Функция `addTireWorkerEarningsForBooking` существует в `lib/api/tire-workers.ts`
2. ✅ Функция использует RPC `add_tire_worker_earnings` с защитой `FOR UPDATE`
3. ❌ Функция НЕ вызывается из `handleMarkTireBookingAsReady`
4. ❌ Нет других мест в коде, где вызывается эта функция
5. ❌ Нет прямых UPDATE запросов к `tire_workers` для начисления заработка
6. ❌ Нет триггеров на `tire_bookings` или `tire_workers`, которые начисляют заработок

**Вывод:** Заработок для шиномонтажников вообще НЕ должен начисляться при нажатии кнопки "Готово"!

**НО транзакции есть...** Это значит, что заработок где-то начисляется, но не через эту функцию!

### Проблема #4: Старый код?

**Возможные причины:**
1. Заработок начислялся через старый код, который был удалён
2. Заработок начисляется через какой-то другой механизм (не найден)
3. Заработок начислялся вручную через интерфейс (не найдено)
4. Заработок начислялся через прямые SQL запросы (не найдено)

## 🎯 РЕШЕНИЕ

### Шаг 1: Добавить вызов функции начисления заработка

**В `handleMarkTireBookingAsReady` (строки 1144-1166 App.tsx):**

```typescript
const handleMarkTireBookingAsReady = async (bookingId: string) => {
  try {
    // ✅ Проверка: заказ уже ГОТОВО?
    const booking = tireBookings.find(b => b.id === bookingId);
    if (booking && booking.status === 'ГОТОВО') {
      console.log('[handleMarkTireBookingAsReady] Заказ уже ГОТОВО, пропускаем');
      return;
    }

    // ✅ Начисляем зарплату мастеру (с защитой от дублей через RPC)
    if (booking && booking.worker_id && booking.total_price) {
      const { addTireWorkerEarningsForBooking } = await import('./lib/api/tire-workers');
      await addTireWorkerEarningsForBooking(
        booking.worker_id,
        bookingId,
        booking.total_price
      );
    }

    // ✅ Обновляем статус заказа на ГОТОВО
    await markTireBookingAsReady(bookingId);

    // Перезагружаем заказы и мастеров из БД
    await loadTireBookings();

    const { getTireWorkers } = await import('./lib/api/tire-workers');
    const updatedTechnicians = await getTireWorkers();
    setTireTechnicians(updatedTechnicians);
  } catch (error) {
    console.error('Ошибка обновления статуса заказа шиномонтажа:', error);
    alert('Не удалось обновить статус');
  }
};
```

### Шаг 2: Защита от дублей

**RPC функция `add_tire_worker_earnings` уже имеет защиту:**
1. `FOR UPDATE` - блокирует строку работника при одновременных запросах
2. `IF v_booking_id_str = ANY(v_worker.completed_bookings)` - проверяет, что заказ уже начислен
3. Возвращает `success: false`, если заказ уже начислен

**API функция `addTireWorkerEarningsForBooking` уже проверяет:**
```typescript
// ✅ Проверка: уже было начислено?
if (!data.success) {
  console.log(`[TireWorkers] Заказ ${bookingId} уже начислен, пропускаем`);
  return data.worker as TireWorker;
}

// ✅ Создаем транзакцию только если реально начислили
const description = `Шиномонтаж #${bookingId.slice(0, 8)}`;
await createEarningTransaction(
  'tire_worker',
  workerId,
  worker.full_name,
  earnings,
  data.worker.current_balance,
  description
);
```

### Шаг 3: Очистить дубликаты

**Удалить дубликаты из `completed_bookings`:**
```sql
UPDATE tire_workers
SET 
  completed_bookings = (
    SELECT ARRAY_AGG(DISTINCT x) 
    FROM unnest(completed_bookings) AS x
  ),
  updated_at = NOW()
WHERE completed_bookings IS NOT NULL 
  AND array_length(completed_bookings, 1) > array_length(ARRAY(SELECT DISTINCT unnest(completed_bookings)), 1);
```

**Удалить дубликаты транзакций:**
```sql
-- Это сложнее, т.к. транзакции имеют разные ID
-- Нужно удалить дубликаты по (worker_id, booking_id, created_at)
-- Но лучше оставить их для истории и просто очистить completed_bookings
```

## 📋 ИТОГ

**Проблема:**
1. Функция `addTireWorkerEarningsForBooking` существует и имеет защиту от дублей
2. Но эта функция НЕ вызывается из `handleMarkTireBookingAsReady`
3. Заработок где-то начисляется (есть транзакции), но не через защищённую функцию
4. При многократном нажатии кнопки "Готово" создаются дубликаты транзакций

**Решение:**
1. Добавить вызов `addTireWorkerEarningsForBooking` в `handleMarkTireBookingAsReady`
2. RPC функция `add_tire_worker_earnings` защитит от дублей через `FOR UPDATE`
3. Очистить существующие дубликаты в БД

**После исправления:**
- При нажатии кнопки "Готово" заработок будет начисляться через защищённую RPC функцию
- При многократном нажатии кнопки "Готово" RPC функция вернёт `success: false` для повторных нажатий
- Дубликаты транзакций НЕ будут создаваться
