# План улучшений автомойки

## 📋 Обзор

Внедрить гибридную логику статусов (как в шиномонтаже) + добавить окошко с ячейкой и плюсом для быстрых заказов (30 минут).

---

## 🎯 Требования

### 1. Длительность заказа
- **Базовая длительность = 1 час** (контроль админа)
- **Химчистка = отдельная песня** (пока не трогаем)
- **Клиент может подождать** (если пришёл раньше/позже)

### 2. Быстрые заказы (30 минут)
- **Окошко с ячейкой и плюсом** ниже расписания
- **При нажатии на плюс открывается существующий BookingWizard**
- **Для случаев:** мойщик помыл машину за 30 минут + есть ещё клиент на 30 минут
- **Учитывается в отчётах** (через кассу не прошла)

### 3. Гибридная логика (как в шиномонтаже)
- Заказ активен если: `status == 'В РАБОТЕ'` **ИЛИ** `is_time_active == true`
- Автоматический флаг: `start_time <= now < end_time`
- Автообновление времени каждую минуту

### 4. Визуализация боксов (3 бокса)
- **НЕ НУЖНА секция "В работе" / "Ближайший заказ"** (некуда вставлять)
- **Цвет бокса меняется по статусу:**
  - "В РАБОТЕ" = 🟢 Зелёный
  - "ОЖИДАЕТ" = 🟠 Оранжевый
  - "ГОТОВО" = 🔵 Синий
- **Статус "ОТМЕНЕНО" НЕ отображается в UI** (хранится в БД, но не показывается)
- **Ячейки больше по высоте** чтобы поместилась инфа о машине и гос номере (по аналогии с шиномонтажем)

---

## 📊 Сравнение: Шиномонтаж vs Автомойка

| Характеристика | Шиномонтаж ✅ | Автомойка ❌ | Что нужно |
|---------------|---------------|--------------|-----------|
| Гибридная логика статусов | Есть | Нет | ✅ Добавить |
| Автоматический флаг `isTimeActive()` | Есть | Нет | ✅ Добавить |
| Функция `isBookingActive()` | Есть | Нет | ✅ Добавить |
| Автообновление времени | Каждую минуту | Нет | ✅ Добавить |
| Правильные цвета контура | Есть | Нет | ✅ Исправить |
| Быстрые заказы (30 мин) | Нет | Нет | ✅ Добавить |

---

## 🔧 Техническая реализация

### Шаг 1: Обновить `shared/utils/time.ts`

**Добавить функции (уже есть для шиномонтажа):**

```typescript
// Автоматический флаг: start_time <= now < end_time
export function isTimeActive(booking: { startTime: string; endTime: string; date: string }): boolean {
  const now = new Date();
  const today = formatDate(now);
  
  if (booking.date !== today) return false;
  
  const currentMinutesTotal = now.getHours() * 60 + now.getMinutes();
  const startMinutes = timeToMinutes(booking.startTime);
  const endMinutes = timeToMinutes(booking.endTime);
  
  return currentMinutesTotal >= startMinutes && currentMinutesTotal < endMinutes;
}

// Гибридная логика: status == 'В РАБОТЕ' ИЛИ is_time_active == true
export function isBookingActive(booking: { status: string; startTime: string; endTime: string; date: string }): boolean {
  return booking.status === 'В РАБОТЕ' || isTimeActive(booking);
}
```

---

### Шаг 2: Обновить `components/admin/Timeline.tsx`

#### 2.1. Добавить автообновление времени

```typescript
const [currentTime, setCurrentTime] = React.useState(new Date());

React.useEffect(() => {
  const interval = setInterval(() => {
    setCurrentTime(new Date());
  }, 60000); // Каждую минуту

  return () => clearInterval(interval);
}, []);
```

#### 2.2. Исправить логику активных заказов

```typescript
// Было:
const activeBookings = bookings.filter((booking) => {
  const isNotCancelled = booking.status !== 'ОТМЕНЕНО';
  const isNotCompleted = booking.status !== 'ГОТОВО';
  return isNotCancelled && isNotCompleted;
});

// Стало:
const activeBookings = bookings.filter((booking) => {
  const isNotCancelled = booking.status !== 'ОТМЕНЕНО';
  const isNotCompleted = booking.status !== 'ГОТОВО';
  const matchesDate = selectedDate ? booking.date === selectedDate : true;
  return isNotCancelled && isNotCompleted && matchesDate;
});

// Добавить гибридную логику:
const activeBookingsList = activeBookings.filter(booking =>
  isBookingActive(booking)
);
```

#### 2.3. Исправить цвета контура

```typescript
// Было:
className={`... ${
  booking?.status === 'В РАБОТЕ'
    ? 'border-green-500'
    : booking?.status === 'ОЖИДАЕТ'
    ? 'border-orange-500'
    : 'border-gray-200'
}`}

// Стало:
className={`... ${
  booking && isBookingActive(booking)
    ? 'border-green-500'  // В РАБОТЕ или is_time_active == true
    : booking?.status === 'ОЖИДАЕТ'
    ? 'border-orange-500'
    : booking?.status === 'ГОТОВО'
    ? 'border-blue-500'  // Синий для ГОТОВО
    : 'border-gray-200'
}`}
```

---

### Шаг 3: Создать компонент `QuickBookingCell.tsx`

**Назначение:** Окошко с ячейкой и плюсом для быстрых заказов

**Расположение:** Ниже расписания

**Как работает:**
- Отображает ячейку с плюсом (как в сетке расписания)
- При нажатии на плюс открывает существующий `BookingWizard`
- `BookingWizard` уже содержит все шаги для создания заказа

**Интерфейс:**

```typescript
import React from 'react';
import { Plus } from 'lucide-react';

interface QuickBookingCellProps {
  onClick: () => void;
}

export const QuickBookingCell: React.FC<QuickBookingCellProps> = ({ onClick }) => {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-gray-600 mb-2">Быстрый заказ</h3>
      <button
        onClick={onClick}
        className="w-full h-24 rounded-xl border-2 border-dashed border-green-300 flex items-center justify-center cursor-pointer hover:scale-105 transition-all bg-green-50 hover:bg-green-100 hover:border-green-500 hover:shadow-md"
      >
        <Plus className="w-8 h-8 text-green-500" />
      </button>
    </div>
  );
};
```

---

### Шаг 4: Обновить `Timeline.tsx` - добавить окошко быстрого заказа

```typescript
import { QuickBookingCell } from './QuickBookingCell';

return (
  <div>
    {/* Сетка расписания */}
    <div className="grid grid-cols-2 gap-4">
      {/* ... существующий код ... */}
    </div>

    {/* Окошко быстрого заказа (30 минут) */}
    <QuickBookingCell
      onClick={() => onNavigate('booking-wizard')}
    />
  </div>
);
```

**Примечание:** Не нужно обновлять типы - используем существующий тип `Booking`

---

## 📋 Порядок выполнения

1. ✅ Обновить `shared/utils/time.ts` - добавить `isTimeActive()` и `isBookingActive()`
2. ✅ Обновить `components/admin/Timeline.tsx`:
   - Добавить автообновление времени
   - Исправить логику активных заказов
   - Исправить цвета контура (ОЖИДАЕТ=оранжевый, В РАБОТЕ=зелёный, ГОТОВО=синий)
3. ✅ Создать `components/admin/QuickBookingCell.tsx` - окошко с ячейкой и плюсом
4. ✅ Обновить `components/admin/Timeline.tsx` - добавить окошко быстрого заказа
5. ✅ Тестирование гибридной логики
6. ✅ Тестирование быстрого заказа

---

## 🎯 Результат

### После внедрения:

1. **Гибридная логика работает:**
   - Заказ активен если админ нажал "В работу" **ИЛИ** наступило время
   - Автоматическое обновление цветов каждую минуту
   - Цвета боксов меняются по статусу (ОЖИДАЕТ=оранжевый, В РАБОТЕ=зелёный, ГОТОВО=синий)

2. **Быстрые заказы работают:**
   - Окошко с ячейкой и плюсом ниже расписания
   - При нажатии открывается существующий `BookingWizard`
   - Все шаги создания заказа уже реализованы
   - Учитывается в отчётах

3. **Удобство для админа:**
   - Не нужно переделывать дизайн под получасовики
   - Быстрые заказы доступны по кнопке
   - Всё учитывается в кассе/отчётах

---

## 📝 Примечания

- **Химчистка = отдельная песня** (пока не трогаем)
- **Длительность = 1 час** (контроль админа)
- **Быстрые заказы = 30 минут** (окошко с ячейкой и плюсом)
- **Клиент может подождать** (если пришёл раньше/позже)
- **Статус "ОТМЕНЕНО" НЕ отображается в UI** (хранится в БД)

---

*План создан: 2024*
