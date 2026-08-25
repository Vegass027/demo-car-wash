# План реализации выбора даты для расписания

## Обзор

Добавить возможность записывать машины на 2 дня вперёд с помощью dropdown выбора даты рядом с заголовком "Расписание".

## Файлы для изменения

### 1. [`types.ts`](../types.ts)

**Что сделать:**
- Добавить поле `date: string` в интерфейс `Booking`
- Использовать ISO формат: "2024-11-12"

**Логика:**
- Все записи будут иметь дату
- По умолчанию для существующих записей использовать сегодняшнюю дату

---

### 2. [`components/admin/DateSelector.tsx`](../components/admin/DateSelector.tsx) - НОВЫЙ ФАЙЛ

**Что сделать:**
- Создать новый компонент для выбора даты
- Использовать Radix UI Select
- Показывать 3 даты: сегодня, завтра, послезавтра

**Пропсы:**
```typescript
interface DateSelectorProps {
  selectedDate: string;           // Выбранная дата (ISO формат)
  onDateChange: (date: string) => void;  // Callback при выборе даты
}
```

**Логика:**
- Генерировать массив из 3 дат:
  1. Сегодня - label: "Сегодня"
  2. Завтра - label: "12 ноября" (формат: день + месяц на русском)
  3. Послезавтра - label: "13 ноября"
- При выборе даты вызывать `onDateChange` с ISO форматом
- Использовать Radix UI Select компоненты:
  - Select
  - SelectTrigger
  - SelectContent
  - SelectItem
  - SelectValue

**Форматирование дат:**
- Для хранения: ISO формат `date.toISOString().split('T')[0]` → "2024-11-12"
- Для отображения: `date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })` → "12 ноября"

---

### 3. [`components/admin/DayTimeline.tsx`](../components/admin/DayTimeline.tsx)

**Что сделать:**
- Заменить заголовок "Расписание сегодня" (строки 52-54) на компонент DateSelector
- Добавить пропс `selectedDate?: string` в интерфейс `DayTimelineProps`

**Логика:**
- Передавать `selectedDate` в DateSelector
- Передавать `onDateChange` из Dashboard в DateSelector
- Компонент DayTimeline сам не меняет дату, только отображает

---

### 4. [`components/admin/Dashboard.tsx`](../components/admin/Dashboard.tsx)

**Что сделать:**
- Добавить состояние для выбранной даты
- Фильтровать bookings по выбранной дате
- Передавать отфильтрованные bookings и выбранную дату в DayTimeline
- Передавать выбранную дату в onNewBooking callback

**Изменения в интерфейсе DashboardProps:**
- Добавить пропс: `onNewBooking: (hour?: number, boxNumber?: number, date?: string) => void;`

**Логика:**
- Создать состояние: `const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));`
- Фильтровать bookings: `const filteredBookings = bookings.filter(b => b.date === selectedDate);`
- При создании записи вызывать `onNewBooking(hour, boxNumber, selectedDate)`
- Передавать в DayTimeline:
  ```tsx
  <DayTimeline
    bookings={filteredBookings}
    selectedDate={selectedDate}
    onDateChange={setSelectedDate}
    // ... другие пропсы
  />
  ```

---

### 5. [`App.tsx`](../App.tsx)

**Что сделать:**
- Добавить состояние для выбранной даты
- Обновить интерфейс BookingWizardData - добавить поле date
- Передавать selectedDate в Dashboard и BookingWizard
- При создании записи сохранять date в новый Booking
- Обновить моковые данные bookings с полем date

**Логика:**
- Создать состояние: `const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));`
- Обновить BookingWizardData:
  ```typescript
  export interface BookingWizardData {
    // ... существующие поля
    date: string;  // Новое поле
  }
  ```
- Передавать selectedDate в Dashboard:
  ```tsx
  <Dashboard
    selectedDate={selectedDate}
    onDateChange={setSelectedDate}
    // ... другие пропсы
  />
  ```
- Обновить onNewBooking callback в Dashboard:
  ```tsx
  onNewBooking={(hour, boxNumber, date) => {
    setInitialBookingHour(hour);
    setInitialBookingBox(boxNumber);
    setInitialBookingDate(date);
    setCurrentView('booking-wizard');
  }}
  ```
- Добавить состояние: `const [initialBookingDate, setInitialBookingDate] = useState<string | undefined>();`
- Передавать initialBookingDate в BookingWizard
- При создании записи (строки 276-292):
  ```tsx
  const newBooking: Booking = {
    // ... существующие поля
    date: data.date || initialBookingDate || selectedDate,
  };
  ```
- Обновить моковые данные bookings (строки 61-66) - добавить поле date для каждой записи

---

### 6. [`components/admin/BookingWizard.tsx`](../components/admin/BookingWizard.tsx)

**Что сделать:**
- Добавить пропс `selectedDate?: string` в BookingWizardProps
- Добавить поле `date: string` в BookingWizardData
- Передавать selectedDate в onComplete callback

**Логика:**
- Добавить в BookingWizardProps:
  ```typescript
  interface BookingWizardProps {
    // ... существующие пропсы
    selectedDate?: string;
  }
  ```
- Добавить в BookingWizardData:
  ```typescript
  export interface BookingWizardData {
    // ... существующие поля
    date: string;
  }
  ```
- При вызове onComplete передавать date:
  ```typescript
  onComplete({
    // ... существующие поля
    date: selectedDate || formatDate(new Date()),
  })
  ```

---

## Поток данных

```
1. Пользователь выбирает дату в DateSelector
   ↓
2. onDateChange вызывается в Dashboard
   ↓
3. selectedDate обновляется в Dashboard
   ↓
4. bookings фильтруются по selectedDate
   ↓
5. DayTimeline показывает отфильтрованные bookings
   ↓
6. Пользователь создаёт запись (нажимает на слот или кнопку "Новая Запись")
   ↓
7. onNewBooking вызывается с selectedDate
   ↓
8. BookingWizard открывается с selectedDate
   ↓
9. Пользователь заполняет форму и сохраняет
   ↓
10. onComplete вызывается с date
    ↓
11. App.tsx создаёт новый Booking с date
    ↓
12. Booking добавляется в массив bookings
```

## Форматирование дат

### Вспомогательные функции (можно разместить в `shared/utils/date.ts`)

```typescript
// ISO формат для хранения: "2024-11-12"
export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// Отображение в dropdown: "12 ноября"
export const formatDateLabel = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

// Добавить дни к дате
export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
```

## Пример использования

### В DateSelector.tsx

```typescript
const dates = [
  { value: formatDate(today), label: 'Сегодня' },
  { value: formatDate(addDays(today, 1)), label: formatDateLabel(addDays(today, 1)) },
  { value: formatDate(addDays(today, 2)), label: formatDateLabel(addDays(today, 2)) },
];
```

### В App.tsx (моковые данные)

```typescript
const [bookings, setBookings] = useState<Booking[]>([
  {
    id: '1',
    // ... существующие поля
    date: formatDate(new Date()),  // Сегодня
  },
  {
    id: '2',
    // ... существующие поля
    date: formatDate(addDays(new Date(), 1)),  // Завтра
  },
]);
```

## Проверка

После реализации проверить:
1. ✅ Dropdown показывает 3 даты: "Сегодня", "12 ноября", "13 ноября"
2. ✅ При выборе даты меняется расписание
3. ✅ Создание записи на выбранную дату работает
4. ✅ Записи сохраняются с правильной датой
5. ✅ Переключение между датами показывает правильные записи
