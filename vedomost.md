Отлично! Теперь у меня есть полная картина. Подготовлю подробный план добавления нового способа оплаты "Ведомость".

---

## 📋 ПЛАН ДОБАВЛЕНИЯ СПОСОБА ОПЛАТЫ "ВЕДОМОСТЬ"

### 🎯 Обзор задачи

Нужно добавить новый способ оплаты **"Ведомость"** для автомойки и шиномонтажа. Это потребует изменений в:
- Базе данных (таблицы, CHECK constraints, столбцы агрегации)
- TypeScript типах
- UI компонентах (выбор способа оплаты)
- API функциях агрегации данных
- Отчетах

---

### 📊 Текущее состояние платежных методов

**Существующие способы:**
- `Наличный` - наличные
- `Безналичный` - банковская карта
- `Перевод` - перевод на карту/счет
- `СБП` - Система быстрых платежей

**Таблицы с payment_method:**
1. [`bookings`](components/admin/BookingWizard.tsx) - CHECK constraint: `'Наличный', 'Безналичный', 'Перевод', 'СБП'`
2. [`tire_bookings`](components/admin/TireBookingWizard.tsx) - default `'Наличные'`, БЕЗ CHECK constraint
3. [`daily_reports`](components/admin/SummaryPage.tsx) - столбцы агрегации: `carwash_cash`, `carwash_card`, `carwash_transfer`, `carwash_sbp`, `tire_cash`, `tire_card`, `tire_transfer`, `tire_sbp`

---

### 🔄 Необходимые изменения

#### 1. **БАЗА ДАННЫХ** (SQL миграция)

**1.1. Обновить CHECK constraint в таблице [`bookings`](components/admin/BookingWizard.tsx)**
```sql
-- Добавить 'Ведомость' в CHECK constraint
ALTER TABLE bookings 
DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

ALTER TABLE bookings 
ADD CONSTRAINT bookings_payment_method_check 
CHECK (payment_method IS NULL OR payment_method::text = ANY (ARRAY['Наличный'::text, 'Безналичный'::text, 'Перевод'::text, 'СБП'::text, 'Ведомость'::text]));
```

**1.2. Добавить столбцы для агрегации "Ведомость" в [`daily_reports`](components/admin/SummaryPage.tsx)**
```sql
-- Добавить столбцы для автомойки
ALTER TABLE daily_reports 
ADD COLUMN carwash_vedomost numeric DEFAULT 0;

-- Добавить столбцы для шиномонтажа  
ALTER TABLE daily_reports 
ADD COLUMN tire_vedomost numeric DEFAULT 0;

-- Добавить общий столбец
ALTER TABLE daily_reports 
ADD COLUMN vedomost_revenue numeric DEFAULT 0;
```

**1.3. Обновить триггеры/функции для автоматического заполнения новых столбцов**
- Нужно проверить существующие триггеры и обновить их для агрегации `Ведомость`

---

#### 2. **TYPESCRIPT ТИПЫ**

**2.1. Обновить [`entities/report/model.ts`](entities/report/model.ts)**
```typescript
export interface CarwashReport {
  carsCount: number;
  total: number;
  cash: number;
  card: number;
  transfer: number;
  sbp: number;
  vedomost: number;  // ✅ НОВОЕ
}

export interface TireReport {
  carsCount: number;
  total: number;
  cash: number;
  card: number;
  transfer: number;
  sbp: number;
  vedomost: number;  // ✅ НОВОЕ
}

export interface PaymentsReport {
  cash: number;
  card: number;
  transfer: number;
  sbp: number;
  vedomost: number;  // ✅ НОВОЕ
  total: number;
}

export interface DailyReport {
  // ... существующие поля ...
  carwash_vedomost: number;  // ✅ НОВОЕ
  tire_vedomost: number;     // ✅ НОВОЕ
  vedomost_revenue: number;   // ✅ НОВОЕ
}
```

---

#### 3. **UI КОМПОНЕНТЫ**

**3.1. [`components/client/OnlineBookingWizard.tsx`](components/client/OnlineBookingWizard.tsx)**
```typescript
// Обновить тип
type PaymentMethod = 'Наличный' | 'Безналичный' | 'Перевод' | 'СБП' | 'Ведомость';

// Добавить кнопку для "Ведомость"
<Button 
  type="button"
  variant={paymentMethod === 'Ведомость' ? 'default' : 'outline'}
  onClick={() => setPaymentMethod('Ведомость')}
>
  <ClipboardList className="w-4 h-4 mr-2" />
  Ведомость
</Button>
```

**3.2. [`components/client/OnlineTireBookingWizard.tsx`](components/client/OnlineTireBookingWizard.tsx)**
```typescript
// Обновить тип
type PaymentMethod = 'Наличный' | 'Безналичный' | 'Перевод' | 'СБП' | 'Ведомость';

// Добавить кнопку для "Ведомость"
<Button 
  type="button"
  variant={paymentMethod === 'Ведомость' ? 'default' : 'outline'}
  onClick={() => setPaymentMethod('Ведомость')}
>
  <ClipboardList className="w-4 h-4 mr-2" />
  Ведомость
</Button>
```

**3.3. [`components/admin/BookingWizard.tsx`](components/admin/BookingWizard.tsx)**
```typescript
// Обновить тип
type PaymentType = 'Наличный' | 'Безналичный' | 'Перевод' | 'СБП' | 'Ведомость';

// Добавить кнопку для "Ведомость"
<Button 
  type="button"
  variant={paymentType === 'Ведомость' ? 'default' : 'outline'}
  onClick={() => setPaymentType('Ведомость')}
>
  <ClipboardList className="w-4 h-4 mr-2" />
  Ведомость
</Button>
```

**3.4. [`components/admin/TireBookingWizard.tsx`](components/admin/TireBookingWizard.tsx)**
```typescript
// Обновить тип
type PaymentType = 'Наличный' | 'Безналичный' | 'Перевод' | 'СБП' | 'Ведомость';

// Добавить кнопку для "Ведомость"
<Button 
  type="button"
  variant={paymentType === 'Ведомость' ? 'default' : 'outline'}
  onClick={() => setPaymentType('Ведомость')}
>
  <ClipboardList className="w-4 h-4 mr-2" />
  Ведомость
</Button>
```

**3.5. [`components/admin/CreateTireBookingModal.tsx`](components/admin/CreateTireBookingModal.tsx)**
```typescript
// Обновить PAYMENT_METHODS
const PAYMENT_METHODS = [
  'Наличный',
  'Безналичный',
  'Перевод',
  'СБП',
  'Ведомость',  // ✅ НОВОЕ
] as const;

// Обновить тип
type PaymentMethod = typeof PAYMENT_METHODS[number];
```

**3.6. [`components/admin/ChangePaymentMethodModal.tsx`](components/admin/ChangePaymentMethodModal.tsx)**
```typescript
// Обновить тип onChange
const onChange = (method: 'Наличный' | 'Безналичный' | 'Перевод' | 'СБП' | 'Ведомость') => {
  onChange(method);
};
```

---

#### 4. **API ФУНКЦИИ АГРЕГАЦИИ**

**4.1. [`lib/api/reports.ts`](lib/api/reports.ts)**
```typescript
// Обновить aggregateCarwashData
function aggregateCarwashData(bookings: any[]): CarwashReport {
  const report: CarwashReport = {
    carsCount: bookings.length,
    total: 0,
    cash: 0,
    card: 0,
    transfer: 0,
    sbp: 0,
    vedomost: 0  // ✅ НОВОЕ
  };

  bookings.forEach(booking => {
    const price = Number(booking.price) || 0;
    const paymentMethod = booking.payment_method;

    report.total += price;

    if (paymentMethod === 'Наличный') {
      report.cash += price;
    } else if (paymentMethod === 'Безналичный') {
      report.card += price;
    } else if (paymentMethod === 'Перевод') {
      report.transfer += price;
    } else if (paymentMethod === 'СБП') {
      report.sbp += price;
    } else if (paymentMethod === 'Ведомость') {  // ✅ НОВОЕ
      report.vedomost += price;
    }
  });

  return report;
}

// Обновить aggregateTireData (аналогично)
// Обновить aggregatePaymentsData (аналогично)
```

**4.2. Обновить `getReportHistoryFromDailyReports`**
```typescript
// Добавить агрегацию vedomost из daily_reports
acc.carwash.vedomost += Number(r.carwash_vedomost) || 0;
acc.tire.vedomost += Number(r.tire_vedomost) || 0;
acc.payments.vedomost += Number(r.vedomost_revenue) || 0;
```

---

#### 5. **ОТЧЕТЫ**

**5.1. [`components/admin/SummaryPage.tsx`](components/admin/SummaryPage.tsx)**
```typescript
// Добавить фильтрацию по "Ведомость"
const tireVedomost = reportData.completedTireBookings
  .filter(b => b.payment_method === 'Ведомость')
  .reduce((sum, b) => sum + (b.total_price || 0), 0);

const carwashVedomost = reportData.completedBookings
  .filter(b => b.payment_method === 'Ведомость')
  .reduce((sum, b) => sum + (b.price || 0), 0);

// Добавить отображение в UI (в секции "Итоговый отчёт")
<div className="flex justify-between items-center py-2 border-b border-slate-100">
  <span className="text-sm font-semibold text-slate-600">Ведомость</span>
  <span className="font-semibold text-slate-800">
    {formatMoney(reportData.completedBookings.filter(b => b.payment_method === 'Ведомость').reduce((sum, b) => sum + (b.price || 0), 0))}₽
  </span>
</div>
```

**5.2. [`components/admin/AnalyticsPage.tsx`](components/admin/AnalyticsPage.tsx)**
```typescript
// Добавить отображение "Ведомость" в истории отчетов
<div className="flex justify-between items-center">
  <span className="text-sm text-gray-600">Ведомость</span>
  <span className="font-semibold">{formatMoney(reportHistory.tire.vedomost)}₽</span>
</div>
```

---

### 📁 ФАЙЛЫ ДЛЯ ИЗМЕНЕНИЯ

| # | Файл | Тип изменений |
|---|------|--------------|
| 1 | `docs/add-vedomost-payment-method.sql` | ✅ СОЗДАТЬ SQL миграцию |
| 2 | `entities/report/model.ts` | 📝 Обновить TypeScript типы |
| 3 | `components/client/OnlineBookingWizard.tsx` | 📝 Добавить кнопку "Ведомость" |
| 4 | `components/client/OnlineTireBookingWizard.tsx` | 📝 Добавить кнопку "Ведомость" |
| 5 | `components/admin/BookingWizard.tsx` | 📝 Добавить кнопку "Ведомость" |
| 6 | `components/admin/TireBookingWizard.tsx` | 📝 Добавить кнопку "Ведомость" |
| 7 | `components/admin/CreateTireBookingModal.tsx` | 📝 Обновить PAYMENT_METHODS |
| 8 | `components/admin/ChangePaymentMethodModal.tsx` | 📝 Обновить тип onChange |
| 9 | `lib/api/reports.ts` | 📝 Обновить функции агрегации |
| 10 | `components/admin/SummaryPage.tsx` | 📝 Добавить отображение в отчетах |
| 11 | `components/admin/AnalyticsPage.tsx` | 📝 Добавить отображение в истории |

---

### ⚠️ ВАЖНЫЕ ЗАМЕТКИ

1. **Порядок изменений:** Сначала SQL миграция, потом TypeScript типы, потом компоненты
2. **Иконка:** Для "Ведомость" используйте `<ClipboardList />` из `lucide-react`
3. **Триггеры:** Проверьте существующие триггеры для [`daily_reports`](components/admin/SummaryPage.tsx) и обновите их
4. **Тестирование:** После изменений протестируйте:
   - Создание заказа с оплатой "Ведомость"
   - Отображение в отчетах
   - Агрегацию в [`daily_reports`](components/admin/SummaryPage.tsx)
5. **Обратная совместимость:** Существующие данные не затрагиваются

---

### 🚀 ПОРЯДОК ВЫПОЛНЕНИЯ

1. ✅ Создать SQL миграцию `docs/add-vedomost-payment-method.sql`
2. ✅ Применить миграцию через MCP Supabase
3. ✅ Обновить TypeScript типы в `entities/report/model.ts`
4. ✅ Обновить API функции в `lib/api/reports.ts`
5. ✅ Обновить UI компоненты (клиентские и админские)
6. ✅ Обновить отчеты (SummaryPage, AnalyticsPage)
7. ✅ Протестировать функционал

---

Готов приступить к реализации? Хотите, чтобы я переключился в режим **Code** для внесения этих изменений?