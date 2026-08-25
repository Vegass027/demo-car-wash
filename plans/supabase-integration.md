# План интеграции с Supabase (УПРОЩЕННЫЙ)

## Текущее состояние
- Заказы хранятся в localStorage
- Таблица `bookings` создана в Supabase со всеми необходимыми полями
- Нужно перенести хранение заказов в базу данных

## Структура таблицы bookings

### Основные поля:
- `id` (UUID, PK) - уникальный идентификатор
- `client_name` (varchar, NOT NULL) - имя клиента
- `phone` (varchar, nullable) - телефон клиента
- `car_model` (varchar, NOT NULL) - модель автомобиля
- `plate_number` (varchar, NOT NULL) - номер автомобиля
- `car_type` (varchar, NOT NULL) - тип авто (SEDAN, CROSSOVER, JEEP, BUS)
- `services` (jsonb, NOT NULL) - массив услуг
- `price` (numeric, NOT NULL) - цена
- `payment_method` (varchar, nullable) - способ оплаты (Наличный/Безналичный)
- `status` (varchar, NOT NULL, default 'ОЖИДАЕТ') - статус заказа
- `booking_date` (date, NOT NULL) - дата бронирования
- `start_time` (time, nullable) - время начала
- `end_time` (time, nullable) - время окончания
- `box_number` (integer, nullable) - номер бокса
- `worker_id` (UUID, nullable) - ID мойщика

### Организационные поля:
- `is_org` (boolean, default false) - это организация?
- `organization_id` (UUID, nullable) - ID организации
- `driver_id` (UUID, nullable) - ID водителя
- `car_id` (UUID, nullable) - ID автомобиля
- `org_name` (varchar, nullable) - название организации

### Подпись:
- `signature_obtained` (boolean, default false) - подпись получена?
- `signed_at` (timestamp, nullable) - когда подписано

### Дополнительно:
- `is_quick_booking` (boolean, default false) - быстрый заказ?
- `completed_at` (timestamp, nullable) - когда завершен
- `cancel_comment` (text, nullable) - комментарий отмены
- `created_at` (timestamp, default now()) - когда создан
- `updated_at` (timestamp, default now()) - когда обновлен

---

## ШАГ 1: Создать lib/api/bookings.ts (ОДИН файл)

**Согласно DATABASE RULES:** типы и функции в одном файле для одной таблицы.

```typescript
// lib/api/bookings.ts

import { supabase } from './supabase';

// ✅ ТИПЫ ЗДЕСЬ ЖЕ (не в отдельном файле!)
export interface Booking {
  id: string;
  client_name: string;
  phone?: string;
  car_model: string;
  plate_number: string;
  car_type: string;
  services: string[]; // JSONB в БД
  price: number;
  payment_method?: string;
  status: string;
  booking_date: string;
  start_time?: string;
  end_time?: string;
  box_number?: number;
  worker_id?: string;
  is_org: boolean;
  organization_id?: string;
  driver_id?: string;
  car_id?: string;
  org_name?: string;
  signature_obtained: boolean;
  signed_at?: string;
  is_quick_booking: boolean;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Получить заказы по дате
 */
export async function getBookingsByDate(date: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_date', date)
    .order('start_time', { ascending: true });

  if (error) throw error;
  return data as Booking[];
}

/**
 * Получить быстрые заказы по дате
 */
export async function getQuickBookings(date: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('is_quick_booking', true)
    .eq('booking_date', date)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Booking[];
}

/**
 * Создать новый заказ
 */
export async function createBooking(
  booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>
): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .insert([booking])
    .select()
    .single();

  if (error) throw error;
  return data as Booking;
}

/**
 * Обновить заказ
 */
export async function updateBooking(
  id: string,
  updates: Partial<Booking>
): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Booking;
}

/**
 * Обновить статус заказа
 */
export async function updateBookingStatus(
  id: string,
  status: string
): Promise<Booking> {
  return updateBooking(id, { status });
}

/**
 * Добавить услугу к заказу
 */
export async function addServiceToBooking(
  id: string,
  serviceId: string,
  currentServices: string[]
): Promise<Booking> {
  const newServices = [...currentServices, serviceId];
  return updateBooking(id, { services: newServices });
}

/**
 * Удалить услугу из заказа
 */
export async function removeServiceFromBooking(
  id: string,
  serviceId: string,
  currentServices: string[]
): Promise<Booking> {
  const newServices = currentServices.filter(s => s !== serviceId);
  return updateBooking(id, { services: newServices });
}

/**
 * Отменить заказ
 */
export async function cancelBooking(id: string): Promise<Booking> {
  return updateBooking(id, { status: 'ОТМЕНЕНО' });
}

/**
 * Отметить как готовый
 */
export async function markAsReady(id: string): Promise<Booking> {
  return updateBooking(id, {
    status: 'ГОТОВО',
    completed_at: new Date().toISOString()
  });
}

/**
 * Начать работу
 */
export async function startWork(id: string): Promise<Booking> {
  return updateBooking(id, { status: 'В РАБОТЕ' });
}
```

---

## ШАГ 2: Добавить функцию маппинга в BookingWizard

```typescript
// В BookingWizard.tsx добавить функцию:

import { Booking } from '../lib/api/bookings';
import { formatDate } from '../shared/utils/date';

/**
 * Преобразует данные из мастера создания заказа в формат для БД
 */
export function mapWizardDataToBooking(
  data: BookingWizardData
): Omit<Booking, 'id' | 'created_at' | 'updated_at'> {
  return {
    client_name: data.clientName,
    phone: data.phone,
    car_model: data.carModel,
    plate_number: data.carNumber, // ← маппинг!
    car_type: data.carType ?? 'SEDAN', // ← ?? вместо || (строже)
    services: data.services,
    price: data.price,
    payment_method: data.paymentType,
    status: 'ОЖИДАЕТ',
    booking_date: data.date || formatDate(new Date()),
    start_time: data.selectedHour ? `${String(data.selectedHour).padStart(2, '0')}:00` : undefined,
    end_time: data.selectedHour ? `${String(data.selectedHour + 1).padStart(2, '0')}:00` : undefined,
    box_number: data.selectedBoxNumber,
    worker_id: data.selectedWorkerId,
    is_org: data.clientType === 'ORG',
    organization_id: data.organizationId,
    driver_id: data.driverId,
    car_id: data.carId,
    org_name: data.orgName,
    signature_obtained: false,
    is_quick_booking: data.isQuickBooking || false
  };
}
```

---

## ШАГ 3: Заменить localStorage на API в App.tsx

### 3.1. Добавить импорты

```typescript
import {
  getBookingsByDate,
  getQuickBookings,
  createBooking,
  updateBooking,
  updateBookingStatus,
  markAsReady,
  startWork,
  cancelBooking,
  addServiceToBooking,
  removeServiceFromBooking
} from './lib/api/bookings';
```

### 3.2. Заменить состояние bookings

```typescript
// БЫЛО:
// const [bookings, setBookings] = useState<Booking[]>([]);
// const [quickBookings, setQuickBookings] = useState<Booking[]>([]);

// СТАЛО:
const [bookings, setBookings] = useState<Booking[]>([]);
const [quickBookings, setQuickBookings] = useState<Booking[]>([]);
const [bookingsLoading, setBookingsLoading] = useState(false);
```

### 3.3. Заменить загрузку заказов

```typescript
// БЫЛО:
// useEffect(() => {
//   const stored = localStorage.getItem('bookings');
//   if (stored) setBookings(JSON.parse(stored));
// }, []);

// СТАЛО:
const loadBookings = async () => {
  setBookingsLoading(true);
  try {
    const data = await getBookingsByDate(selectedDate);
    setBookings(data || []); // ← добавь || []
  } catch (error) {
    console.error('Ошибка загрузки заказов:', error);
    alert('Не удалось загрузить заказы');
    setBookings([]); // ← на случай ошибки
  } finally {
    setBookingsLoading(false);
  }
};

const loadQuickBookings = async () => {
  try {
    const data = await getQuickBookings(selectedDate);
    setQuickBookings(data);
  } catch (error) {
    console.error('Ошибка загрузки быстрых заказов:', error);
  }
};

useEffect(() => {
  loadBookings();
  loadQuickBookings();
}, [selectedDate]);
```

### 3.4. Заменить создание заказа

```typescript
// БЫЛО:
// const handleCreateBooking = (data: BookingWizardData) => {
//   const newBooking: Booking = { ... };
//   setBookings([...bookings, newBooking]);
// };

// СТАЛО:
const handleCreateBooking = async (data: BookingWizardData) => {
  try {
    const bookingData = mapWizardDataToBooking(data);
    await createBooking(bookingData);
    
    // Перезагрузить список
    await loadBookings();
    
    setCurrentView('dashboard');
  } catch (error) {
    console.error('Ошибка создания заказа:', error);
    alert('Не удалось создать заказ');
  }
};
```

### 3.5. Заменить быстрое создание заказа

```typescript
// БЫЛО:
// const handleQuickBooking = (data: BookingWizardData) => {
//   const newQuickBooking: Booking = { ... };
//   setQuickBookings([...quickBookings, newQuickBooking]);
// };

// СТАЛО:
const handleQuickBooking = async (data: BookingWizardData) => {
  try {
    const bookingData = mapWizardDataToBooking({
      ...data,
      isQuickBooking: true
    });
    await createBooking(bookingData);
    
    // Перезагрузить списки
    await loadBookings();
    await loadQuickBookings();
    
    setCurrentView('dashboard');
  } catch (error) {
    console.error('Ошибка создания быстрого заказа:', error);
    alert('Не удалось создать быстрый заказ');
  }
};
```

### 3.6. Заменить обновление статусов

```typescript
// БЫЛО:
// const handleMarkAsReady = (bookingId: string) => {
//   setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'ГОТОВО' } : b));
// };

// СТАЛО:
const handleMarkAsReady = async (bookingId: string) => {
  try {
    // Находим заказ
    const booking = [...bookings, ...quickBookings].find(b => b.id === bookingId);
    if (!booking) return;

    // Обновляем статистику мойщика (это остается в памяти)
    if (booking.worker_id) {
      setWorkers(currentWorkers => {
        const result = addCompletedBookingToWorker(
          currentWorkers,
          booking.worker_id!,
          bookingId,
          booking.price,
          [...bookings, ...quickBookings]
        );
        return result.workers;
      });
    }

    // Обновляем статус в БД
    await markAsReady(bookingId);

    // Перезагружаем списки
    await loadBookings();
    await loadQuickBookings();
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    alert('Не удалось обновить статус');
  }
};
```

```typescript
// БЫЛО:
// const handleStartWork = (bookingId: string) => {
//   setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'В РАБОТЕ' } : b));
// };

// СТАЛО:
const handleStartWork = async (bookingId: string) => {
  try {
    await startWork(bookingId);
    await loadBookings();
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    alert('Не удалось обновить статус');
  }
};
```

```typescript
// БЫЛО:
// const handleCancelBooking = (bookingId: string) => {
//   withPin(() => {
//     setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'ОТМЕНЕНО' } : b));
//   });
// };

// СТАЛО:
const handleCancelBooking = async (bookingId: string) => {
  withPin(async () => {
    try {
      await cancelBooking(bookingId);
      await loadBookings();
    } catch (error) {
      console.error('Ошибка отмены заказа:', error);
      alert('Не удалось отменить заказ');
    }
  });
};
```

### 3.7. Заменить добавление/удаление услуг

```typescript
// БЫЛО:
// const handleAddService = (bookingId: string, serviceId: string) => {
//   setBookings(prev => prev.map(b => {
//     if (b.id === bookingId) {
//       const newServices = [...b.services, serviceId];
//       return { ...b, services: newServices };
//     }
//     return b;
//   }));
// };

// СТАЛО:
const handleAddService = async (bookingId: string, serviceId: string) => {
  try {
    const booking = [...bookings, ...quickBookings].find(b => b.id === bookingId);
    if (!booking) return;

    await addServiceToBooking(bookingId, serviceId, booking.services);
    
    // Перезагружаем списки
    await loadBookings();
    await loadQuickBookings();
  } catch (error) {
    console.error('Ошибка добавления услуги:', error);
    alert('Не удалось добавить услугу');
  }
};
```

```typescript
// БЫЛО:
// const handleRemoveService = (bookingId: string, serviceId: string) => {
//   setBookings(prev => prev.map(b => {
//     if (b.id === bookingId) {
//       const newServices = b.services.filter(s => s !== serviceId);
//       return { ...b, services: newServices };
//     }
//     return b;
//   }));
// };

// СТАЛО:
const handleRemoveService = async (bookingId: string, serviceId: string) => {
  try {
    const booking = [...bookings, ...quickBookings].find(b => b.id === bookingId);
    if (!booking) return;

    await removeServiceFromBooking(bookingId, serviceId, booking.services);
    
    // Перезагружаем списки
    await loadBookings();
    await loadQuickBookings();
  } catch (error) {
    console.error('Ошибка удаления услуги:', error);
    alert('Не удалось удалить услугу');
  }
};
```

---

## ШАГ 4: Обновить типы

**Файл:** `types.ts`

```typescript
// Импортируем Booking из API файла
export type { Booking } from './lib/api/bookings';

// Остальные типы остаются без изменений
export type { Worker, CarType, BookingStatus, PaymentMethod, PostStatus } from './types-old';
```

---

## ШАГ 5: Обновить UI компоненты (disabled state)

**Важно:** Все кнопки которые вызывают async функции должны быть заблокированы во время загрузки.

### Примеры обновления кнопок:

```typescript
// В компонентах где используются хэндлеры:

// ❌ БЫЛО (без disabled):
<Button onClick={() => handleMarkAsReady(booking.id)}>
  Завершить
</Button>

// ✅ СТАЛО (с disabled):
<Button
  onClick={async () => await handleMarkAsReady(booking.id)}
  disabled={bookingsLoading}  // ← добавь disabled!
>
  {bookingsLoading ? 'Загрузка...' : 'Завершить'}
</Button>
```

### Где добавить disabled:

**BookingCard (используется в BookingDetailModal):**
- "Оплата" (строка221) - onChangePaymentMethod
- "Мойщик" (строка225) - onAssign
- "Отмена" (строка229) - onCancel
- "Добавить услугу" (строка280) - onAddService
- "В работу" (строка294) - onStartWork
- "Готово" (строка310) - onMarkAsReady

**InProgressCard:**
- Только onClick кнопка (без action кнопок)

**Примечание:** Dashboard не имеет кнопок заказов (только "Начать день")

---

## ЧЕГО НЕ ДЕЛАТЬ НА ПЕРВОМ ЭТАПЕ:

❌ НЕ создавать `entities/booking/model.ts` - типы в `lib/api/bookings.ts`
❌ НЕ создавать `shared/hooks/useBookings.ts` - потом
❌ НЕ настраивать RLS policies - для локальной мойки не нужно
❌ НЕ переносить workers в БД - остаются в localStorage
❌ НЕ усложнять архитектуру - минимализм сначала

---

## Порядок реализации:

1. ✅ Создать `lib/api/bookings.ts` (типы + функции)
2. ✅ Добавить `mapWizardDataToBooking()` в `BookingWizard.tsx`
3. ✅ Заменить загрузку заказов в `App.tsx`
4. ✅ Заменить создание заказов в `App.tsx`
5. ✅ Заменить обновление статусов в `App.tsx`
6. ✅ Заменить добавление/удаление услуг в `App.tsx`
7. ✅ Протестировать - создать заказ, увидеть в списке
8. ✅ Протестировать - изменить статус, увидеть изменения

---

## Преимущества:

✅ Единая таблица для всех заказов
✅ Простая фильтрация по `is_org`
✅ Простые отчеты по организациям
✅ Единый список заказов
✅ Надежное хранение в БД
✅ Возможность бэкапа
✅ Масштабируемость
✅ Поддержка подписей (уже есть поля)
✅ Минимальная сложность кода
