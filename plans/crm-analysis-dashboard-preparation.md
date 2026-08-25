# 📊 Анализ CRM-системы для автомойки - Подготовка к дашборду владельца

**Дата создания:** 2024  
**Проект:** carwash-admin-pro  
**Назначение:** Общее понимание функционала и логики расчетов для создания дашборда владельца

---

## 📋 Оглавление

1. [Обзор системы](#обзор-системы)
2. [Реализованный функционал](#реализованный-функционал)
3. [Логика расчетов по разделам](#логика-расчетов-по-разделам)
4. [Последовательность сбора данных для дашборда владельца](#последовательность-сбора-данных-для-дашборда-владельца)
5. [Рекомендации по структуре БД](#рекомендации-по-структуре-бд)
6. [Сводная таблица метрик](#сводная-таблица-метрик)

---

## 🎯 Обзор системы

### Типы пользователей

| Роль | Описание | Права доступа |
|------|-----------|---------------|
| **Админ** | Управляет ежедневными операциями | Создание заказов, управление персоналом, расходы, сводка |
| **Владелец** | Анализирует бизнес-показатели | Дашборд с аналитикой (в разработке) |
| **Мойщик** | Выполняет мойку автомобилей | Режимы работы (solo/pair), просмотр своих заказов |
| **Шиномонтажник** | Выполняет шиномонтажные работы | Просмотр своих заказов, управление балансом |

### Основные направления бизнеса

1. **Автомойка** - мойка автомобилей с различными услугами
2. **Шиномонтаж** - услуги по шинам (переобувка, балансировка и др.)
3. **Склад** - управление расходными материалами

---

## 🔧 Реализованный функционал

### 1. Автомойка (Carwash)

#### 1.1 Управление заказами

**Типы заказов:**
- **Обычные заказы** - запланированные на конкретное время и бокс
- **Быстрые заказы** - 30 минут, создаются в реальном времени

**Статусы заказов:**
- `ОЖИДАЕТ` - заказ ожидает начала работы
- `В РАБОТЕ` - мойщик начал работу
- `ГОТОВО` - работа завершена
- `ОТМЕНЕНО` - заказ отменен

**Поля заказа:**
```typescript
interface Booking {
  id: string;
  clientName: string;
  phone?: string;
  carModel: string;
  carType: 'SEDAN' | 'CROSSOVER' | 'JEEP' | 'BUS';
  plateNumber: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: 'ОЖИДАЕТ' | 'В РАБОТЕ' | 'ГОТОВО' | 'ОТМЕНЕНО';
  workerId?: string;
  price: number;
  services: string[];
  isOrg: boolean;
  orgName?: string;
  boxNumber?: number; // 1, 2, 3
  paymentMethod?: 'Наличный' | 'Безналичный' | 'Перевод';
  completedAt?: string; // ISO timestamp
  date: string; // ISO: "2024-11-12"
  workingModeAtCompletion?: 'solo' | 'pair';
  cancelComment?: string;
}
```

**Услуги автомойки:**
| ID услуги | Название | Цена |
|----------|----------|------|
| body | Кузов | 500₽ |
| salon | Салон | 400₽ |
| trunk | Багажник | 300₽ |
| wax | Воск | 300₽ |
| nano-wax | Нано воск | 500₽ |
| plastic-polish | Полироль пластика | 400₽ |
| leather-care | Уход за кожей | 600₽ |
| salon-cleaning | Химчистка салона | 800₽ |

**Типы автомобилей:**
- `SEDAN` - Седан
- `CROSSOVER` - Кроссовер
- `JEEP` - Внедорожник
- `BUS` - Автобус/Грузовой

#### 1.2 Управление персоналом (Мойщики)

**Режимы работы:**
- **Solo** - мойщик работает один
- **Pair** - мойщик работает в паре с другим мойщиком

**Поля мойщика:**
```typescript
interface Worker {
  id: string;
  name: string;
  phone: string;
  carsToday: number; // Всего машин за сегодня
  carsSoloToday: number; // Машин помытых solo
  carsPairToday: number; // Машин помытых в паре (0.5 для каждой)
  earnedToday: number; // Заработок за сегодня
  completedBookings: string[]; // ID выполненных заказов
  isActive: boolean;
  status: 'FREE' | 'BUSY';
  cardDetails?: string; // Реквизиты для выплат
  isWorkingToday: boolean; // Работает ли сегодня
  workingMode: 'solo' | 'pair';
  partnerId?: string; // ID партнёра
  baseSalaryPaid: number; // Зафиксированная базовая ставка
  modeSelected: boolean; // Выбран ли режим
  currentBalance: number; // Актуальный баланс
  isAdvanceTaken: boolean; // Взят ли аванс
  salaryTransactions: SalaryTransaction[]; // История выплат
}
```

**Статус мойщика:**
- `FREE` - свободен
- `BUSY` - занят

---

### 2. Шиномонтаж (Tire Service)

#### 2.1 Управление заказами шиномонтажа

**Гибридная система статусов:**
Заказ считается активным, если ЛЮБОЕ из условий выполнено:
- Админ нажал кнопку "В работу" ИЛИ
- Наступило время заказа

**Статусы заказов:**
- `ОЖИДАЕТ` - заказ ожидает начала работы
- `В РАБОТЕ` - мастер начал работу
- `ГОТОВО` - работа завершена
- `ОТМЕНЕНО` - заказ отменен

**Услуги шиномонтажа:**
| ID услуги | Название | Цена |
|----------|----------|------|
| tire-change-4 | Шиномонтаж 4 колеса | 2500₽ |
| tire-change-2 | Шиномонтаж 2 колеса | 800₽ |
| balancing | Балансировка | 600₽ |
| storage | Хранение | 500₽ |
| tire-repair | Ремонт шины | 1000₽ |
| valve | Вентиль | 200₽ |

**Варианты длительности заказа:**
- 30 минут
- 1 час
- 1.5 часа
- 2 часа

#### 2.2 Управление персоналом (Шиномонтажники)

**Поля шиномонтажника:**
```typescript
interface TireTechnician {
  id: string;
  name: string;
  phone: string;
  jobsToday: number; // Количество выполненных заказов
  earnedToday: number; // Заработок за сегодня
  completedBookings: string[]; // ID выполненных заказов
  isActive: boolean;
  status: 'FREE' | 'BUSY';
  cardDetails?: string;
  isWorkingToday: boolean;
  baseSalaryPaid: number; // Зафиксированная базовая ставка
  currentBalance: number; // Актуальный баланс
  isAdvanceTaken: boolean; // Взят ли аванс
  salaryTransactions: SalaryTransaction[]; // История выплат
}
```

---

### 3. Склад (Inventory)

**Категории товаров:**
- Шампуни
- Воски
- Полироли
- и др.

**Поля товара:**
```typescript
interface InventoryItem {
  id: string;
  name: string;
  categoryId: string;
  unit: string; // канистра, литр, упаковка
  currentQuantity: number; // Текущее количество
  baseQuantity: number; // Базовое значение (100%)
  minThreshold: number; // Минимальный порог
  lastPricePerUnit?: number; // Последняя цена за единицу
  createdAt: Date;
  updatedAt: Date;
}
```

**Статусы остатков:**
- `good` (≥70%) - норма
- `normal` (40-69%) - приемлемо
- `low` (15-39%) - мало
- `critical` (<15%) - критически мало

**Операции с товарами:**
- `arrival` - приход товара
- `restock` - пересчет остатков

---

### 4. Финансы и расходы

#### 4.1 Категории расходов

| Категория | Описание | Обязателен комментарий |
|-----------|----------|----------------------|
| tea | Чай/Кофе | Нет |
| repair | Ремонт | Да |
| utilities | Коммуналка | Да |
| stationery | Канцелярия | Нет |
| other | Прочее | Да |

#### 4.2 Способы оплаты

- `Наличный` - наличные
- `Безналичный` - банковская карта
- `Перевод` - банковский перевод

---

## 💰 Логика расчетов по разделам

### 1. Расчет зарплаты мойщиков

#### 1.1 Конфигурация

```typescript
WORKER_CONFIG = {
  BASE_SALARY: 500,           // Базовая ставка (solo)
  BASE_SALARY_PAIR: 250,      // Базовая ставка (пара)
  PERCENTAGE: 0.4,            // 40% от заказа (solo)
  PERCENTAGE_PAIR: 0.2,       // 20% от заказа (пара)
}
```

#### 1.2 Логика начисления

**Шаг 1: Начало дня**
- Сбрасываются все дневные показатели (`carsToday`, `earnedToday`, `completedBookings`)
- Сохраняются: `currentBalance`, `isAdvanceTaken`, `salaryTransactions`
- `isWorkingToday = false`
- `modeSelected = false`

**Шаг 2: Выбор режима работы**
- Админ отмечает мойщика "Работает сегодня"
- Выбирает режим: **Solo** или **Pair**
- При ПЕРВОМ выборе режима начисляется базовая ставка:
  - Solo: 500₽
  - Pair: 250₽
- При последующих переключениях базовая ставка НЕ меняется

**Шаг 3: Выполнение заказа**
- Solo: 1 машина = 1 заказ
- Pair: 1 машина = 0.5 заказа для каждого мойщика
- Начисление процентов:
  - Solo: `orderPrice × 40%`
  - Pair: `orderPrice × 20%` каждому

**Шаг 4: Перенос заработка на баланс**
- В конце дня или по кнопке "Перевести на итоговый баланс"
- `earnedToday` переносится в `currentBalance`
- Создается транзакция типа `EARNING`

**Шаг 5: Выплата зарплаты**
- Выплата вычитается из `currentBalance`
- Если `currentBalance ≤ 0` → это аванс (`ADVANCE`)
- Если `currentBalance > 0` → обычная выплата (`PAYOUT`)
- Создается транзакция с отрицательной суммой

#### 1.3 Формула расчета дневного заработка

```
earnedToday = baseSalaryPaid + Σ(orderPrice × percentage)

где:
- baseSalaryPaid: 500 (solo) или 250 (pair)
- percentage: 0.4 (solo) или 0.2 (pair)
```

**Пример:**
- Мойщик работает solo
- База: 500₽
- Выполнено 3 заказа по 1500₽ каждый
- Заработок: 500 + (1500 × 0.4) × 3 = 500 + 1800 = 2300₽

---

### 2. Расчет зарплаты шиномонтажников

#### 2.1 Конфигурация

```typescript
TIRE_TECHNICIAN_CONFIG = {
  PERCENTAGE: 0.5,  // 50% от заказа
}
```

#### 2.2 Логика начисления

**Шаг 1: Начало дня**
- Сбрасываются все дневные показатели
- Сохраняются: `currentBalance`, `isAdvanceTaken`, `salaryTransactions`
- `isWorkingToday = false`

**Шаг 2: Начало работы**
- Админ отмечает "Работает сегодня"
- Базовая ставка НЕ начисляется (в отличие от мойщиков)

**Шаг 3: Выполнение заказа**
- Начисление: `orderPrice × 50%`
- Увеличивается `jobsToday` на 1

**Шаг 4: Перенос заработка на баланс**
- Аналогично мойщикам

**Шаг 5: Выплата зарплаты**
- Аналогично мойщикам

#### 2.3 Формула расчета дневного заработка

```
earnedToday = Σ(orderPrice × 0.5)
```

**Пример:**
- Выполнено 4 заказа: 2500₽, 800₽, 600₽, 1000₽
- Заработок: (2500 + 800 + 600 + 1000) × 0.5 = 4900 × 0.5 = 2450₽

---

### 3. Расчет финансовой сводки за день

#### 3.1 Выручка по типам оплаты

```
cashRevenue = Σ(booking.price) WHERE booking.paymentMethod = 'Наличный'
cardRevenue = Σ(booking.price) WHERE booking.paymentMethod = 'Безналичный'
transferRevenue = Σ(booking.price) WHERE booking.paymentMethod = 'Перевод'
totalRevenue = cashRevenue + cardRevenue + transferRevenue
```

#### 3.2 Выручка по направлениям бизнеса

```
carwashRevenue = Σ(booking.price) WHERE booking.status = 'ГОТОВО' AND booking.type = 'carwash'
tireRevenue = Σ(booking.price) WHERE booking.status = 'ГОТОВО' AND booking.type = 'tire'
```

#### 3.3 Количество выполненных заказов

```
totalCars = carwashCars + tireCars
carwashCars = COUNT(booking) WHERE booking.status = 'ГОТОВО' AND booking.type = 'carwash'
tireCars = COUNT(booking) WHERE booking.status = 'ГОТОВО' AND booking.type = 'tire'
```

#### 3.4 Расходы

```
totalExpenses = Σ(expense.amount) WHERE expense.date = selectedDate
```

#### 3.5 Зарплаты

```
totalWorkersSalary = Σ(worker.paidToday) WHERE worker.type = 'worker'
totalTechniciansSalary = Σ(technician.paidToday) WHERE technician.type = 'technician'
adminBaseSalary = 2000
totalSalaryExpenses = totalWorkersSalary + totalTechniciansSalary + adminBaseSalary
```

#### 3.6 Чистая прибыль

```
netProfit = totalRevenue - totalExpenses - totalSalaryExpenses
```

---

### 4. Расчет статистики склада

#### 4.1 Процент заполненности

```
percentage = (currentQuantity / baseQuantity) × 100
```

#### 4.2 Статус остатков

```
IF percentage >= 70 THEN status = 'good'
ELSE IF percentage >= 40 THEN status = 'normal'
ELSE IF percentage >= 15 THEN status = 'low'
ELSE status = 'critical'
```

#### 4.3 Стоимость остатков

```
totalValue = currentQuantity × lastPricePerUnit
```

---

## 📊 Последовательность сбора данных для дашборда владельца

### Этап 1: Базовые данные (ежедневно)

1. **Заказы за день**
   - Все заказы со статусом `ГОТОВО`
   - Фильтр по выбранной дате
   - Разделение на автомойку и шиномонтаж

2. **Персонал**
   - Список всех мойщиков и шиномонтажников
   - Статус работы на сегодня
   - Дневной заработок

3. **Расходы**
   - Все расходы за день
   - По категориям

### Этап 2: Финансовые метрики (ежедневно)

1. **Выручка**
   - По типам оплаты (наличные/безнал/переводы)
   - По направлениям бизнеса (автомойка/шиномонтаж)
   - Общая выручка

2. **Расходы**
   - Общая сумма расходов
   - По категориям

3. **Зарплаты**
   - Выданные суммы мойщикам
   - Выданные суммы шиномонтажникам
   - Зарплата админа

4. **Чистая прибыль**
   - Выручка - Расходы - Зарплаты

### Этап 3: Аналитика по периодам (неделя/месяц)

1. **Динамика выручки**
   - Выручка по дням
   - Сравнение с предыдущим периодом

2. **Популярность услуг**
   - Количество заказов по услугам
   - Выручка по услугам

3. **Эффективность персонала**
   - Количество заказов на сотрудника
   - Средний чек на сотрудника
   - Заработок сотрудника

4. **Распределение по типам оплаты**
   - Доля наличных/безнала/переводов

5. **Распределение по типам клиентов**
   - Физические лица vs Организации

### Этап 4: Прогнозирование и рекомендации

1. **Прогноз выручки**
   - На основе исторических данных
   - С учетом сезонности

2. **Рекомендации по персоналу**
   - Оптимизация расписания
   - Эффективные пары

3. **Рекомендации по складу**
   - Товары на заказ
   - Оптимизация запасов

---

## 🗄️ Рекомендации по структуре БД

### Основные таблицы

#### 1. Users (Пользователи)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'admin', 'owner', 'worker', 'technician'
  card_details TEXT, -- Реквизиты для выплат
  current_balance DECIMAL(10, 2) DEFAULT 0,
  is_advance_taken BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. Bookings (Заказы)

```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  car_model VARCHAR(255) NOT NULL,
  car_type VARCHAR(50) NOT NULL, -- 'SEDAN', 'CROSSOVER', 'JEEP', 'BUS'
  plate_number VARCHAR(20) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status VARCHAR(50) NOT NULL, -- 'ОЖИДАЕТ', 'В РАБОТЕ', 'ГОТОВО', 'ОТМЕНЕНО'
  worker_id UUID REFERENCES users(id),
  technician_id UUID REFERENCES users(id),
  price DECIMAL(10, 2) NOT NULL,
  services JSONB NOT NULL, -- Массив услуг
  is_org BOOLEAN DEFAULT false,
  org_name VARCHAR(255),
  box_number INTEGER,
  payment_method VARCHAR(50), -- 'Наличный', 'Безналичный', 'Перевод'
  completed_at TIMESTAMP,
  booking_date DATE NOT NULL,
  working_mode_at_completion VARCHAR(50), -- 'solo', 'pair'
  cancel_comment TEXT,
  booking_type VARCHAR(50) NOT NULL, -- 'carwash', 'tire', 'quick'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 3. Services (Услуги)

```sql
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  service_type VARCHAR(50) NOT NULL, -- 'carwash', 'tire'
  price DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 4. Expenses (Расходы)

```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL, -- 'tea', 'repair', 'utilities', 'stationery', 'other'
  amount DECIMAL(10, 2) NOT NULL,
  expense_date DATE NOT NULL,
  time TIME,
  check_file_url TEXT,
  comment TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 5. SalaryTransactions (Транзакции зарплаты)

```sql
CREATE TABLE salary_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  transaction_type VARCHAR(50) NOT NULL, -- 'EARNING', 'PAYOUT', 'ADVANCE'
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  transaction_date TIMESTAMP NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 6. DailyWorkerStats (Дневная статистика мойщиков)

```sql
CREATE TABLE daily_worker_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES users(id),
  stat_date DATE NOT NULL,
  is_working_today BOOLEAN DEFAULT false,
  working_mode VARCHAR(50), -- 'solo', 'pair'
  partner_id UUID REFERENCES users(id),
  base_salary_paid DECIMAL(10, 2) DEFAULT 0,
  mode_selected BOOLEAN DEFAULT false,
  cars_today INTEGER DEFAULT 0,
  cars_solo_today INTEGER DEFAULT 0,
  cars_pair_today INTEGER DEFAULT 0,
  earned_today DECIMAL(10, 2) DEFAULT 0,
  completed_bookings UUID[], -- Массив ID заказов
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(worker_id, stat_date)
);
```

#### 7. DailyTechnicianStats (Дневная статистика шиномонтажников)

```sql
CREATE TABLE daily_technician_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES users(id),
  stat_date DATE NOT NULL,
  is_working_today BOOLEAN DEFAULT false,
  base_salary_paid DECIMAL(10, 2) DEFAULT 0,
  jobs_today INTEGER DEFAULT 0,
  earned_today DECIMAL(10, 2) DEFAULT 0,
  completed_bookings UUID[], -- Массив ID заказов
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(technician_id, stat_date)
);
```

#### 8. InventoryCategories (Категории склада)

```sql
CREATE TABLE inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) NOT NULL, -- 'штуки', 'литры', 'канистры'
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 9. InventoryItems (Товары склада)

```sql
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category_id UUID NOT NULL REFERENCES inventory_categories(id),
  unit VARCHAR(50) NOT NULL,
  current_quantity DECIMAL(10, 2) NOT NULL,
  base_quantity DECIMAL(10, 2) NOT NULL,
  min_threshold DECIMAL(10, 2) NOT NULL,
  last_price_per_unit DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 10. InventoryTransactions (Транзакции склада)

```sql
CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  action VARCHAR(50) NOT NULL, -- 'arrival', 'restock'
  quantity DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2),
  photos TEXT[], -- Массив URLs
  delivery_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 11. DailyFinancialSummary (Ежедневная финансовая сводка)

```sql
CREATE TABLE daily_financial_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE NOT NULL UNIQUE,
  
  -- Выручка
  carwash_revenue DECIMAL(10, 2) DEFAULT 0,
  tire_revenue DECIMAL(10, 2) DEFAULT 0,
  total_revenue DECIMAL(10, 2) DEFAULT 0,
  
  -- По типам оплаты
  cash_revenue DECIMAL(10, 2) DEFAULT 0,
  card_revenue DECIMAL(10, 2) DEFAULT 0,
  transfer_revenue DECIMAL(10, 2) DEFAULT 0,
  
  -- Заказы
  carwash_cars INTEGER DEFAULT 0,
  tire_cars INTEGER DEFAULT 0,
  total_cars INTEGER DEFAULT 0,
  
  -- Расходы
  total_expenses DECIMAL(10, 2) DEFAULT 0,
  
  -- Зарплаты
  workers_salary DECIMAL(10, 2) DEFAULT 0,
  technicians_salary DECIMAL(10, 2) DEFAULT 0,
  admin_salary DECIMAL(10, 2) DEFAULT 0,
  total_salary_expenses DECIMAL(10, 2) DEFAULT 0,
  
  -- Прибыль
  net_profit DECIMAL(10, 2) DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Индексы для оптимизации

```sql
-- Индексы для заказов
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_type ON bookings(booking_type);
CREATE INDEX idx_bookings_worker ON bookings(worker_id);
CREATE INDEX idx_bookings_technician ON bookings(technician_id);

-- Индексы для расходов
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);

-- Индексы для транзакций зарплаты
CREATE INDEX idx_salary_transactions_user ON salary_transactions(user_id);
CREATE INDEX idx_salary_transactions_date ON salary_transactions(transaction_date);

-- Индексы для статистики
CREATE INDEX idx_daily_worker_stats_date ON daily_worker_stats(stat_date);
CREATE INDEX idx_daily_worker_stats_worker ON daily_worker_stats(worker_id);
CREATE INDEX idx_daily_technician_stats_date ON daily_technician_stats(stat_date);
CREATE INDEX idx_daily_technician_stats_technician ON daily_technician_stats(technician_id);

-- Индексы для склада
CREATE INDEX idx_inventory_items_category ON inventory_items(category_id);
CREATE INDEX idx_inventory_transactions_item ON inventory_transactions(item_id);
CREATE INDEX idx_inventory_transactions_date ON inventory_transactions(created_at);

-- Индексы для финансовой сводки
CREATE INDEX idx_daily_financial_summary_date ON daily_financial_summary(summary_date);
```

---

## 📈 Сводная таблица метрик для дашборда владельца

### Метрики за день

| Категория | Метрика | Формула расчета | Источник данных |
|-----------|---------|-----------------|----------------|
| **Выручка** | Общая выручка | `Σ(booking.price)` | bookings |
| | Выручка автомойки | `Σ(booking.price) WHERE type='carwash'` | bookings |
| | Выручка шиномонтажа | `Σ(booking.price) WHERE type='tire'` | bookings |
| | Наличные | `Σ(booking.price) WHERE paymentMethod='Наличный'` | bookings |
| | Безналичные | `Σ(booking.price) WHERE paymentMethod='Безналичный'` | bookings |
| | Переводы | `Σ(booking.price) WHERE paymentMethod='Перевод'` | bookings |
| **Заказы** | Всего машин | `COUNT(booking) WHERE status='ГОТОВО'` | bookings |
| | Машин (автомойка) | `COUNT(booking) WHERE type='carwash' AND status='ГОТОВО'` | bookings |
| | Машин (шиномонтаж) | `COUNT(booking) WHERE type='tire' AND status='ГОТОВО'` | bookings |
| **Расходы** | Общие расходы | `Σ(expense.amount)` | expenses |
| | Чай/Кофе | `Σ(expense.amount) WHERE category='tea'` | expenses |
| | Ремонт | `Σ(expense.amount) WHERE category='repair'` | expenses |
| | Коммуналка | `Σ(expense.amount) WHERE category='utilities'` | expenses |
| | Канцелярия | `Σ(expense.amount) WHERE category='stationery'` | expenses |
| | Прочее | `Σ(expense.amount) WHERE category='other'` | expenses |
| **Зарплаты** | Зарплаты мойщиков | `Σ(worker.paidToday)` | salary_transactions |
| | Зарплаты шиномонтажников | `Σ(technician.paidToday)` | salary_transactions |
| | Зарплата админа | `2000` (фиксировано) | - |
| | Всего зарплаты | `workers + technicians + admin` | - |
| **Прибыль** | Чистая прибыль | `revenue - expenses - salaries` | - |

### Метрики за неделю/месяц

| Категория | Метрика | Описание |
|-----------|---------|----------|
| **Динамика** | Выручка по дням | График выручки за период |
| | Средняя выручка в день | `Σ(revenue) / COUNT(days)` |
| | Рост/падение | Сравнение с предыдущим периодом |
| **Услуги** | Популярные услуги | Топ-5 услуг по количеству заказов |
| | Выручка по услугам | Топ-5 услуг по выручке |
| **Персонал** | Эффективность мойщиков | Количество заказов / заработок |
| | Эффективность шиномонтажников | Количество заказов / заработок |
| | Лучшие пары | Самые эффективные пары мойщиков |
| **Клиенты** | Типы клиентов | Физлица vs Организация |
| | Повторные заказы | Клиенты с несколькими заказами |
| **Склад** | Товары на заказ | Товары со статусом 'critical' |
| | Стоимость остатков | Общая стоимость всех товаров |

---

## 🎯 Ключевые выводы для дашборда владельца

### Приоритетные метрики (MVP)

1. **Финансовые метрики за сегодня**
   - Общая выручка
   - Расходы
   - Зарплаты
   - Чистая прибыль

2. **Операционные метрики**
   - Количество заказов (автомойка + шиномонтаж)
   - Средний чек
   - Распределение по типам оплаты

3. **Эффективность персонала**
   - Заработок сотрудников
   - Количество заказов на сотрудника

### Второстепенные метрики (Phase 2)

1. **Аналитика по периодам**
   - Динамика выручки
   - Сравнение с предыдущим периодом

2. **Популярность услуг**
   - Топ услуг по количеству
   - Топ услуг по выручке

3. **Склад**
   - Товары на заказ
   - Стоимость остатков

### Расширенные метрики (Phase 3)

1. **Прогнозирование**
   - Прогноз выручки
   - Сезонность

2. **Рекомендации**
   - Оптимизация персонала
   - Оптимизация склада

---

## 📝 Дополнительные замечания

### Особенности текущей реализации

1. **Данные хранятся в localStorage**
   - Необходимо мигрировать в Supabase
   - Реализовать синхронизацию

2. **Автоматический сброс в 00:00**
   - Проверка каждую минуту
   - Перенос заработка на баланс
   - Сброс дневной статистики

3. **Гибридная система статусов (шиномонтаж)**
   - Ручной статус + автоматический флаг по времени
   - Обеспечивает надежность работы

4. **Система выплат**
   - Поддержка авансов
   - История транзакций
   - Возможность ухода в минус

### Рекомендации по разработке

1. **Сначала создайте структуру БД**
   - Используйте предложенные таблицы
   - Настройте RLS политики
   - Создайте индексы

2. **Мигрируйте данные из localStorage**
   - Экспорт текущих данных
   - Импорт в Supabase
   - Проверка целостности

3. **Реализуйте API слой**
   - Создайте функции для CRUD операций
   - Обработка ошибок
   - Валидация данных

4. **Разработайте дашборд владельца**
   - Начните с MVP метрик
   - Добавьте визуализацию (графики, диаграммы)
   - Расширяйте функционал постепенно

---

*Документ создан для анализа текущего состояния CRM-системы и подготовки к разработке дашборда владельца.*
