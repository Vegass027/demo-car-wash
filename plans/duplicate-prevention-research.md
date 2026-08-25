# Отчет: Исследование мест для предотвращения дублей заказов и двойных оплат

**Дата:** 2025-01-09  
**Проект:** Carwash Admin Pro  
**Цель:** Выявить все места, где критически важна валидация для предотвращения дублей заказов, двойных оплат и нарушений целостности данных в отчетах.

---

## 📊 ИСПОЛЗОВАННЫЕ ИСТОЧНИКИ

Изучены следующие файлы:
- `lib/api/bookings.ts` - API для заказов автомойки
- `lib/api/tire-bookings.ts` - API для заказов шиномонтажа
- `lib/api/loyalty.ts` - API для лояльности
- `lib/api/salary.ts` - API для зарплаты
- `lib/api/booking-cancellations.ts` - API для отмен
- `lib/api/clients.ts` - API для клиентов
- `lib/api/worksheets.ts` - API для ведомостей
- `components/admin/BookingWizard.tsx` - Мастер создания заказов (админ)
- `components/client/OnlineBookingWizard.tsx` - Мастер онлайн-записи (клиент)
- `components/admin/BookingsList.tsx` - Список заказов
- `components/admin/Dashboard.tsx` - Главная панель админа
- `components/client/ActiveBookingCard.tsx` - Карточка активного заказа клиента
- `features/workers/calculateEarnings.ts` - Расчет зарплаты мойщиков
- `features/tire-technicians/calculateEarnings.ts` - Расчет зарплаты шиномонтажников
- `App.tsx` - Главный компонент приложения

---

## 🔴 КРИТИЧЕСКИ ВАЖНЫЕ МЕСТА (КРИТИЧНЫЕ РИСКИ)

### 1. СОЗДАНИЕ ЗАКАЗОВ АВТОМОЙКИ

#### 📍 Место: `lib/api/bookings.ts:150-181` - `createBooking()`

**Проблема:** Нет проверки на дубликаты заказов

```typescript
export async function createBooking(
  booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>
): Promise<Booking> {
  // ❌ НЕТ проверки на дубликат по (client_car_id + booking_date + start_time)
  // ❌ НЕТ проверки на пересечение временных слотов
  // ❌ НЕТ транзакционной атомарности
  
  const { data, error } = await supabase
    .from('bookings')
    .insert([bookingToInsert])
    .select()
    .single();

  if (error) throw error;
  return data as Booking;
}
```

**Риски:**
- Дублирование заказов при двойном клике
- Пересечение временных слотов для одной машины
- Нарушение целостности расписания

**Последствия:**
- Дублирование записей в БД
- Некорректные отчеты по загрузке
- Конфликты при назначении мойщиков

---

#### 📍 Место: `lib/api/bookings.ts:343-396` - `createOnlineBooking()`

**Проблема:** Нет проверки на дубликаты онлайн-записей

```typescript
export async function createOnlineBooking(
  booking: OnlineBookingInput
): Promise<Booking> {
  // ❌ НЕТ проверки на дубликат онлайн-записи
  // ❌ НЕТ проверки на пересечение слотов
  // ❌ НЕТ защиты от повторной отправки формы
  
  const { data, error } = await supabase
    .from('bookings')
    .insert([bookingToInsert])
    .select()
    .single();

  if (error) throw error;
  return data as Booking;
}
```

**Риски:**
- Дублирование онлайн-записей при повторном нажатии "Подтвердить"
- Пересечение времени с существующими заказами

---

### 2. СОЗДАНИЕ ЗАКАЗОВ ШИНОМОНТАЖА

#### 📍 Место: `lib/api/tire-bookings.ts:70-125` - `createTireBooking()`

**Проблема:** Нет проверки на дубликаты заказов шиномонтажа

```typescript
export async function createTireBooking(
  data: Omit<TireBooking, 'id' | 'created_at' | 'updated_at'>
): Promise<TireBooking> {
  // ❌ НЕТ проверки на дубликат по (client_car_id + booking_date + start_time)
  // ❌ НЕТ проверки на пересечение временных слотов
  
  const { data: booking, error } = await supabase
    .from('tire_bookings')
    .insert(bookingToInsert)
    .select()
    .single();

  if (error) throw error;
  return booking as TireBooking;
}
```

---

### 3. ОТМЕТКА КАК ОПЛАЧЕННЫЙ

#### 📍 Место: `lib/api/bookings.ts:292-297` - `markAsPaid()`

**Проблема:** Нет защиты от повторной оплаты

```typescript
export async function markAsPaid(id: string): Promise<Booking> {
  // ❌ НЕТ проверки: уже ли заказ оплачен?
  // ❌ НЕТ блокировки на время обработки
  // ❌ Можно отметить как оплаченный дважды
  
  return updateBooking(id, {
    is_paid: true,
    paid_at: new Date().toISOString()
  });
}
```

**Риски:**
- Двойная оплата одного заказа
- Некорректные финансовые отчеты
- Переплата клиента

**Последствия:**
- Искажение выручки в отчетах
- Дискредитация бизнеса

---

#### 📍 Место: `lib/api/tire-bookings.ts:229-243` - `markTireBookingAsPaid()`

**Проблема:** Нет защиты от повторной оплаты

```typescript
export async function markTireBookingAsPaid(id: string): Promise<void> {
  // ❌ НЕТ проверки: уже ли заказ оплачен?
  // ❌ Можно отметить как оплаченный дважды
  
  const { error } = await supabase
    .from('tire_bookings')
    .update({ 
      is_paid: true, 
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) throw error;
}
```

---

### 4. ЗАВЕРШЕНИЕ ЗАКАЗА И НАЧИСЛЕНИЕ ЗАРПЛАТЫ

#### 📍 Место: `App.tsx:933-1004` - `handleMarkAsReady()`

**Проблема:** Нет атомарности и защиты от повторного завершения

```typescript
const handleMarkAsReady = async (bookingId: string) => {
  try {
    const booking = [...bookings, ...quickBookings].find(b => b.id === bookingId);
    if (!booking) return;
    
    // ❌ НЕТ проверки: уже ли заказ завершен?
    // ❌ НЕТ проверки: уже ли начислена зарплата?
    
    // Начисляем зарплату первому мойщику
    if (booking.worker_id && booking.worker_name) {
      const updatedWorker = await addWorkerEarningsForBooking(
        booking.worker_id,
        bookingId,
        booking.price,
        booking.worker_name_2 || undefined
      );
      // ❌ Можно начислить зарплату дважды
    }
    
    // Начисляем зарплату второму мойщику
    if (booking.worker_id_2 && booking.worker_name_2) {
      const updatedWorker2 = await addWorkerEarningsForBooking(
        booking.worker_id_2,
        bookingId,
        booking.price,
        booking.worker_name || undefined
      );
      // ❌ Можно начислить зарплату дважды
    }
    
    // ❌ Если начисление зарплаты неуспешно, заказ все равно помечается как готовый
    await markAsReady(bookingId);
    
    await loadBookings();
    await loadQuickBookings();
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    alert('Не удалось обновить статус');
  }
};
```

**Риски:**
- Двойное начисление зарплаты за один заказ
- Несоответствие между статусом заказа и начисленной зарплатой
- Финансовые потери бизнеса

**Последствия:**
- Некорректные отчеты по зарплате
- Переплата сотрудникам
- Дискредитация бизнеса

---

#### 📍 Место: `App.tsx:1137-1173` - `handleMarkTireBookingAsReady()`

**Проблема:** Нет защиты от повторного начисления

```typescript
const handleMarkTireBookingAsReady = async (bookingId: string) => {
  try {
    const booking = tireBookings.find(b => b.id === bookingId);
    if (!booking) return;
    
    // ❌ НЕТ проверки: уже ли заказ завершен?
    // ❌ НЕТ проверки: уже ли начислена зарплата?
    
    if (booking.worker_id && booking.worker_name) {
      const updatedTechnician = await addTireWorkerEarningsForBooking(
        booking.worker_id,
        bookingId,
        booking.total_price
      );
      // ❌ Можно начислить зарплату дважды
    }
    
    // ❌ Если начисление неуспешно, заказ все равно помечается как готовый
    await updateTireBooking(bookingId, { status: 'ГОТОВО' });
    
    await loadTireBookings();
  } catch (error) {
    console.error('Ошибка обновления статуса заказа шиномонтажа:', error);
    alert('Не удалось обновить статус');
  }
};
```

---

### 5. НАЧИСЛЕНИЕ ЗАРПЛАТЫ

#### 📍 Место: `lib/api/workers.ts` - `addWorkerEarningsForBooking()`

**Проблема:** Нет проверки на повторное начисление

```typescript
// ❌ В коде нет проверки, уже ли этот booking_id в completed_bookings
// ❌ Можно добавить один и тот же booking_id несколько раз

export async function addWorkerEarningsForBooking(
  workerId: string,
  bookingId: string,
  bookingPrice: number,
  partnerName?: string
): Promise<Worker> {
  // ❌ НЕТ проверки: booking_id уже в completed_bookings?
  // ❌ НЕТ проверки: заказ уже оплачен?
  
  const worker = await getWorkerById(workerId);
  const settings = await getSalarySettings();
  
  const workingMode = worker.working_mode || 'solo';
  const percentage = workingMode === 'pair' 
    ? settings.worker_pair_commission 
    : settings.worker_solo_commission;
  const baseRate = workingMode === 'pair' 
    ? settings.worker_pair_base 
    : settings.worker_solo_base;
  
  const earnings = bookingPrice * percentage + baseRate;
  
  const updatedCompletedBookings = [...worker.completed_bookings, bookingId];
  // ❌ Можно добавить один booking_id несколько раз
  
  const updatedWorker = await updateWorker(workerId, {
    completed_bookings: updatedCompletedBookings,
    earned_today: worker.earned_today + earnings,
    current_balance: worker.current_balance + earnings,
    cars_today: worker.cars_today + (workingMode === 'pair' ? 0.5 : 1)
  });
  
  return updatedWorker;
}
```

**Риски:**
- Двойное начисление зарплаты за один заказ
- Некорректные отчеты по зарплате

---

#### 📍 Место: `lib/api/tire-workers.ts` - `addTireWorkerEarningsForBooking()`

**Проблема:** Нет проверки на повторное начисление

```typescript
// ❌ Аналогичная проблема - нет проверки на дубликаты booking_id
```

---

### 6. ОТМЕНА ЗАКАЗА

#### 📍 Место: `lib/api/booking-cancellations.ts:169-192` - `handleClientCancellation()`

**Проблема:** Нет проверки на статус заказа

```typescript
export async function handleClientCancellation(cancellationData: {
  client_id: string;
  booking_id?: string;
  tire_booking_id?: string;
  reason?: string;
}): Promise<{ success: boolean; blocked?: boolean; blockedUntil?: string }> {
  const cancellation = await createCancellation(cancellationData);
  if (!cancellation) {
    return { success: false };
  }

  // ❌ НЕТ проверки: заказ уже отменен?
  // ❌ НЕТ проверки: заказ уже завершен?
  // ❌ НЕТ проверки: заказ уже оплачен?
  
  const cancellationCount = await getClientCancellationCount(cancellationData.client_id, 30);

  if (cancellationCount >= 3) {
    const blocked = await blockClientForOnlineBooking(cancellationData.client_id, 30);
    // ...
  }

  return { success: true, blocked: false };
}
```

**Риски:**
- Отмена уже завершенного заказа
- Отмена уже оплаченного заказа
- Дублирование записей об отмене

---

### 7. СОЗДАНИЕ ЗАПИСЕЙ В ВЕДОМОСТИ

#### 📍 Место: `lib/api/worksheets.ts:28-51` - `createWorksheetEntry()`

**Проблема:** Нет проверки на дубликаты

```typescript
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
  // ❌ НЕТ проверки: уже ли есть запись для этого booking_id?
  // ❌ Можно создать несколько записей для одного заказа
  
  const { data: entry, error } = await supabase
    .from('worksheet_entries')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return entry;
}
```

**Риски:**
- Дублирование записей в ведомости
- Некорректные финансовые отчеты

---

## 🟡 ВАЖНЫЕ МЕСТА (СРЕДНИЕ РИСКИ)

### 8. ОБНОВЛЕНИЕ СТАТУСА ЗАКАЗА

#### 📍 Место: `lib/api/bookings.ts:213-218` - `updateBookingStatus()`

**Проблема:** Нет проверки на валидность перехода статусов

```typescript
export async function updateBookingStatus(
  id: string,
  status: string
): Promise<Booking> {
  // ❌ НЕТ проверки: допустим ли переход статусов?
  // ❌ Можно перейти из ГОТОВО в ОЖИДАЕТ
  // ❌ Можно перейти из ОТМЕНЕНО в В РАБОТЕ
  
  return updateBooking(id, { status });
}
```

---

### 9. ДОБАВЛЕНИЕ УСЛУГ К ЗАКАЗУ

#### 📍 Место: `lib/api/bookings.ts:238-248` - `addServicesToBooking()`

**Проблема:** Нет проверки на дубликаты услуг

```typescript
export async function addServicesToBooking(
  id: string,
  serviceIds: string[],
  currentServices: string[],
  allServices: Service[],
  carType: CarType
): Promise<Booking> {
  const newServices = [...currentServices, ...serviceIds];
  // ❌ НЕТ проверки: услуги уже есть в заказе?
  // ❌ Можно добавить одну услугу дважды
  
  const newPrice = calculateBookingPrice(newServices, allServices, carType);
  return updateBooking(id, { services: newServices, price: newPrice });
}
```

---

### 10. БЫСТРЫЕ ЗАКАЗЫ

#### 📍 Место: `App.tsx:1433-1472` - `onQuickBooking` callback

**Проблема:** Нет защиты от создания дубликатов быстрых заказов

```typescript
onQuickBooking={async (data) => {
  try {
    const bookingData = mapWizardDataToBooking({
      ...data,
      isQuickBooking: true
    });
    
    // ❌ НЕТ проверки: уже ли есть быстрый заказ для этой машины?
    // ❌ НЕТ проверки на пересечение времени
    
    const newBooking = await createBooking(bookingData);
    
    // ❌ Если создание записи в ведомости неуспешно, заказ все равно создается
    if (newBooking.organization_id && newBooking.is_org) {
      try {
        await createWorksheetEntry({ /* ... */ });
      } catch (error) {
        console.error('[App] Ошибка создания записи ведомости:', error);
        // Не прерываем создание заказа
      }
    }
    
    await refreshBookingsData();
    setCurrentView('dashboard');
  } catch (error) {
    console.error('Ошибка создания быстрого заказа:', error);
    alert('Не удалось создать быстрый заказ');
  }
}}
```

---

### 11. ЛОЯЛЬНОСТЬ

#### 📍 Место: `lib/api/loyalty.ts` - Отсутствие защиты от повторного начисления

**Проблема:** Нет защиты от повторного начисления бонусов

```typescript
// ❌ В коде нет функций для обновления прогресса лояльности
// ❌ Нет защиты от повторного начисления бонусов за один заказ
```

---

## 🟢 МЕНЕЕ ВАЖНЫЕ МЕСТА (НИЗКИЕ РИКИ)

### 12. ОБНОВЛЕНИЕ ДАННЫХ КЛИЕНТА

#### 📍 Место: `lib/api/clients.ts:86-110` - `updateClient()`

**Проблема:** Нет проверки на дубликаты телефонов

```typescript
export async function updateClient(
  id: string,
  data: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>
): Promise<Client> {
  // ❌ НЕТ проверки: новый телефон не дублируется с другим клиентом?
  
  const { data: updatedClient, error } = await supabase
    .from('clients')
    .update({
      full_name: data.full_name?.trim(),
      phone: data.phone ? normalizePhoneNumber(data.phone) : undefined,
      // ...
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return updatedClient;
}
```

---

### 13. ОБНОВЛЕНИЕ АВТОМОБИЛЯ КЛИЕНТА

#### 📍 Место: `lib/api/clients.ts:163-185` - `updateClientCar()`

**Проблема:** Нет проверки на дубликаты гос. номеров

```typescript
export async function updateClientCar(
  id: string,
  data: Partial<Omit<ClientCar, 'id' | 'created_at'>>
): Promise<ClientCar> {
  // ❌ НЕТ проверки: новый гос. номер не дублируется?
  
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

  if (error) throw error;
  return updatedCar;
}
```

---

## 📈 СВОДНАЯ ТАБЛИЦА РИСКОВ

| # | Место | Риск | Последствия | Приоритет |
|---|-------|------|-------------|----------|
| 1 | `createBooking()` | Дублирование заказов | Некорректные отчеты | 🔴 Критический |
| 2 | `createOnlineBooking()` | Дублирование онлайн-записей | Некорректные отчеты | 🔴 Критический |
| 3 | `createTireBooking()` | Дублирование заказов шиномонтажа | Некорректные отчеты | 🔴 Критический |
| 4 | `markAsPaid()` | Двойная оплата | Искажение выручки | 🔴 Критический |
| 5 | `markTireBookingAsPaid()` | Двойная оплата | Искажение выручки | 🔴 Критический |
| 6 | `handleMarkAsReady()` | Двойное начисление зарплаты | Финансовые потери | 🔴 Критический |
| 7 | `handleMarkTireBookingAsReady()` | Двойное начисление зарплаты | Финансовые потери | 🔴 Критический |
| 8 | `addWorkerEarningsForBooking()` | Двойное начисление зарплаты | Финансовые потери | 🔴 Критический |
| 9 | `addTireWorkerEarningsForBooking()` | Двойное начисление зарплаты | Финансовые потери | 🔴 Критический |
| 10 | `handleClientCancellation()` | Отмена завершенного заказа | Некорректные отчеты | 🟡 Важный |
| 11 | `createWorksheetEntry()` | Дублирование записей в ведомости | Некорректные финансовые отчеты | 🔴 Критический |
| 12 | `updateBookingStatus()` | Недопустимые переходы статусов | Некорректная логика | 🟡 Важный |
| 13 | `addServicesToBooking()` | Дублирование услуг | Некорректная цена | 🟡 Важный |
| 14 | `onQuickBooking` | Дублирование быстрых заказов | Некорректные отчеты | 🟡 Важный |
| 15 | Лояльность | Повторное начисление бонусов | Некорректные бонусы | 🟡 Важный |
| 16 | `updateClient()` | Дублирование телефонов | Путаница с клиентами | 🟢 Менее важный |
| 17 | `updateClientCar()` | Дублирование гос. номеров | Путаница с машинами | 🟢 Менее важный |

---

## 🎯 РЕКОМЕНДАЦИИ ПО ПРИОРИТЕТАМ

### ПРИОРИТЕТ 1: КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ (НЕМЕДЛЕННО)

1. **Добавить проверку на дубликаты заказов** при создании
   - Проверка по `(client_car_id + booking_date + start_time)` для физлиц
   - Проверка по `(car_id + booking_date + start_time)` для организаций
   - Проверка на пересечение временных слотов

2. **Добавить защиту от двойной оплаты**
   - Проверка `is_paid` перед отметкой как оплаченный
   - Блокировка на время обработки

3. **Добавить защиту от двойного начисления зарплаты**
   - Проверка `booking_id` в `completed_bookings` перед начислением
   - Блокировка на время обработки
   - Атомарная транзакция: статус заказа + зарплата

4. **Добавить проверку статуса перед отменой**
   - Нельзя отменить завершенный заказ
   - Нельзя отменить оплаченный заказ

5. **Добавить проверку на дубликаты записей в ведомости**
   - Проверка по `carwash_booking_id` или `tire_booking_id`

### ПРИОРИТЕТ 2: ВАЖНЫЕ ИСПРАВЛЕНИЯ (СКОРО)

1. **Добавить валидацию переходов статусов**
   - Определить допустимые переходы
   - Запретить недопустимые переходы

2. **Добавить проверку на дубликаты услуг**
   - Проверка перед добавлением услуги

3. **Добавить защиту от дубликатов быстрых заказов**
   - Проверка на пересечение времени

4. **Реализовать защиту от повторного начисления бонусов**
   - Проверка перед обновлением прогресса лояльности

### ПРИОРИТЕТ 3: МЕНЕЕ ВАЖНЫЕ ИСПРАВЛЕНИЯ (ПОЗЖЕ)

1. **Добавить проверку на дубликаты телефонов**
   - При обновлении клиента

2. **Добавить проверку на дубликаты гос. номеров**
   - При обновлении автомобиля

---

## 🔧 ТЕХНИЧЕСКИЕ РЕШЕНИЯ

### 1. УНИКАЛЬНЫЕ ИНДЕКСЫ В БАЗЕ ДАННЫХ

```sql
-- Для заказов автомойки
CREATE UNIQUE INDEX idx_bookings_unique_slot 
ON bookings(client_car_id, booking_date, start_time) 
WHERE is_org = false;

CREATE UNIQUE INDEX idx_bookings_unique_org_slot 
ON bookings(car_id, booking_date, start_time) 
WHERE is_org = true;

-- Для заказов шиномонтажа
CREATE UNIQUE INDEX idx_tire_bookings_unique_slot 
ON tire_bookings(client_car_id, booking_date, start_time) 
WHERE is_org = false;

CREATE UNIQUE INDEX idx_tire_bookings_unique_org_slot 
ON tire_bookings(car_id, booking_date, start_time) 
WHERE is_org = true;

-- Для записей в ведомости
CREATE UNIQUE INDEX idx_worksheet_entries_unique_booking 
ON worksheet_entries(carwash_booking_id) 
WHERE carwash_booking_id IS NOT NULL;

CREATE UNIQUE INDEX idx_worksheet_entries_unique_tire_booking 
ON worksheet_entries(tire_booking_id) 
WHERE tire_booking_id IS NOT NULL;
```

### 2. ВАЛИДАЦИЯ НА УРОВНЕ API

```typescript
// Пример для createBooking
export async function createBooking(
  booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>
): Promise<Booking> {
  // Проверка на дубликаты
  if (booking.client_car_id) {
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('client_car_id', booking.client_car_id)
      .eq('booking_date', booking.booking_date)
      .eq('start_time', booking.start_time)
      .eq('status', 'ОТМЕНЕНО')
      .single();
    
    if (existing) {
      throw new Error('Заказ на это время уже существует');
    }
  }
  
  // ... остальной код
}
```

### 3. АТОМАРНЫЕ ТРАНЗАКЦИИ

```typescript
// Пример для markAsReady + начисление зарплаты
export async function markAsReadyWithSalary(bookingId: string): Promise<void> {
  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single();
  
  if (!booking) throw new Error('Заказ не найден');
  if (booking.status === 'ГОТОВО') throw new Error('Заказ уже завершен');
  
  // Начисляем зарплату
  if (booking.worker_id) {
    await addWorkerEarningsForBooking(/* ... */);
  }
  
  // Помечаем как готовый
  await markAsReady(bookingId);
}
```

### 4. БЛОКИРОВКИ НА УРОВНЕ ПРИЛОЖЕНИЯ

```typescript
// Пример защиты от повторных кликов
const [isProcessing, setIsProcessing] = useState(false);

const handleMarkAsPaid = async (bookingId: string) => {
  if (isProcessing) return; // Защита от повторных кликов
  
  setIsProcessing(true);
  try {
    await markAsPaid(bookingId);
  } finally {
    setIsProcessing(false);
  }
};
```

---

## 📋 ДАЛЬНЕЙШИЕ ДЕЙСТВИЯ

1. ✅ Составить отчет о найденных местах
2. ⏳ Создать детальный план исправлений
3. ⏳ Получить согласование от пользователя
4. ⏳ Реализовать исправления по приоритетам
5. ⏳ Добавить тесты для проверки валидации
6. ⏳ Провести нагрузочное тестирование

---

**Отчет составлен:** 2025-01-09  
**Статус:** Готов к рассмотрению
