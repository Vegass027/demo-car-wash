# 🚀 План начала работы с БД (Supabase)

**Дата создания:** 2024  
**Проект:** carwash-admin-pro  
**Назначение:** Пошаговое руководство по настройке базы данных Supabase

---

## 📋 Оглавление

1. [Подготовка окружения](#подготовка-окружения)
2. [Настройка проекта Supabase](#настройка-проекта-supabase)
3. [Создание таблиц БД](#создание-таблиц-бд)
4. [Настройка RLS политик](#настройка-rls-политик)
5. [Создание индексов](#создание-индексов)
6. [Миграция данных из localStorage](#миграция-данных-из-localstorage)
7. [Интеграция с приложением](#интеграция-с-приложением)
8. [Проверка и тестирование](#проверка-и-тестирование)

---

## 🔧 Подготовка окружения

### Шаг 1: Установка Supabase CLI

```bash
# Установка через npm
npm install -g supabase

# Или через Homebrew (macOS)
brew install supabase/tap/supabase

# Проверка установки
supabase --version
```

### Шаг 2: Создание аккаунта Supabase

1. Перейдите на https://supabase.com
2. Зарегистрируйтесь или войдите
3. Создайте новый проект:
   - Название: `carwash-admin-pro`
   - Регион: выберите ближайший (например, Frankfurt)
   - Пароль базы данных: сохраните в безопасном месте

### Шаг 3: Получение учетных данных

1. Откройте созданный проект в Supabase Dashboard
2. Перейдите в **Settings → API**
3. Сохраните следующие данные:
   - **Project URL** (например: `https://xyz.supabase.co`)
   - **anon public key** (публичный ключ)
   - **service_role secret** (секретный ключ для админа)

### Шаг 4: Настройка переменных окружения

Создайте файл `.env.local` в корне проекта:

```env
VITE_SUPABASE_URL=https://xyz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**ВАЖНО:** Никогда не коммитите `.env.local` в Git!

---

## 🗄️ Настройка проекта Supabase

### Шаг 1: Инициализация Supabase в проекте

```bash
# В корне проекта
supabase init

# Это создаст структуру:
# supabase/
# ├── migrations/
# ├── functions/
# └── config.toml
```

### Шаг 2: Подключение к удаленному проектту

```bash
# Подключение к созданному проектту
supabase link --project-ref xyz

# Где xyz - это ID вашего проекта (из URL)
```

---

## 📊 Создание таблиц БД

### Шаг 1: Создание миграций

Создайте файлы миграций в папке `supabase/migrations/`:

#### Миграция 1: Основные таблицы

Создайте файл `supabase/migrations/20240101_create_main_tables.sql`:

```sql
-- ============================================
-- ТАБЛИЦА: Users (Пользователи)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'owner', 'worker', 'technician')),
  card_details TEXT,
  current_balance DECIMAL(10, 2) DEFAULT 0,
  is_advance_taken BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ТАБЛИЦА: Services (Услуги)
-- ============================================
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  service_type VARCHAR(50) NOT NULL CHECK (service_type IN ('carwash', 'tire')),
  price DECIMAL(10, 2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ТАБЛИЦА: Bookings (Заказы)
-- ============================================
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  car_model VARCHAR(255) NOT NULL,
  car_type VARCHAR(50) NOT NULL CHECK (car_type IN ('SEDAN', 'CROSSOVER', 'JEEP', 'BUS')),
  plate_number VARCHAR(20) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('ОЖИДАЕТ', 'В РАБОТЕ', 'ГОТОВО', 'ОТМЕНЕНО')),
  worker_id UUID REFERENCES users(id) ON DELETE SET NULL,
  technician_id UUID REFERENCES users(id) ON DELETE SET NULL,
  price DECIMAL(10, 2) NOT NULL,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_org BOOLEAN DEFAULT false,
  org_name VARCHAR(255),
  box_number INTEGER,
  payment_method VARCHAR(50) CHECK (payment_method IN ('Наличный', 'Безналичный', 'Перевод')),
  completed_at TIMESTAMP WITH TIME ZONE,
  booking_date DATE NOT NULL,
  working_mode_at_completion VARCHAR(50) CHECK (working_mode_at_completion IN ('solo', 'pair')),
  cancel_comment TEXT,
  booking_type VARCHAR(50) NOT NULL CHECK (booking_type IN ('carwash', 'tire', 'quick')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ТАБЛИЦА: Expenses (Расходы)
-- ============================================
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL CHECK (category IN ('tea', 'repair', 'utilities', 'stationery', 'other')),
  amount DECIMAL(10, 2) NOT NULL,
  expense_date DATE NOT NULL,
  time TIME,
  check_file_url TEXT,
  comment TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ТАБЛИЦА: SalaryTransactions (Транзакции зарплаты)
-- ============================================
CREATE TABLE salary_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('EARNING', 'PAYOUT', 'ADVANCE')),
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ТАБЛИЦА: DailyWorkerStats (Дневная статистика мойщиков)
-- ============================================
CREATE TABLE daily_worker_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  is_working_today BOOLEAN DEFAULT false,
  working_mode VARCHAR(50) CHECK (working_mode IN ('solo', 'pair')),
  partner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  base_salary_paid DECIMAL(10, 2) DEFAULT 0,
  mode_selected BOOLEAN DEFAULT false,
  cars_today INTEGER DEFAULT 0,
  cars_solo_today INTEGER DEFAULT 0,
  cars_pair_today INTEGER DEFAULT 0,
  earned_today DECIMAL(10, 2) DEFAULT 0,
  completed_bookings UUID[] DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(worker_id, stat_date)
);

-- ============================================
-- ТАБЛИЦА: DailyTechnicianStats (Дневная статистика шиномонтажников)
-- ============================================
CREATE TABLE daily_technician_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  is_working_today BOOLEAN DEFAULT false,
  base_salary_paid DECIMAL(10, 2) DEFAULT 0,
  jobs_today INTEGER DEFAULT 0,
  earned_today DECIMAL(10, 2) DEFAULT 0,
  completed_bookings UUID[] DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(technician_id, stat_date)
);

-- ============================================
-- ТАБЛИЦА: InventoryCategories (Категории склада)
-- ============================================
CREATE TABLE inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) NOT NULL CHECK (unit IN ('штуки', 'литры', 'канистры')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ТАБЛИЦА: InventoryItems (Товары склада)
-- ============================================
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category_id UUID NOT NULL REFERENCES inventory_categories(id) ON DELETE CASCADE,
  unit VARCHAR(50) NOT NULL,
  current_quantity DECIMAL(10, 2) NOT NULL,
  base_quantity DECIMAL(10, 2) NOT NULL,
  min_threshold DECIMAL(10, 2) NOT NULL,
  last_price_per_unit DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ТАБЛИЦА: InventoryTransactions (Транзакции склада)
-- ============================================
CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('arrival', 'restock')),
  quantity DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2),
  photos TEXT[] DEFAULT ARRAY[]::TEXT[],
  delivery_date DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ТАБЛИЦА: DailyFinancialSummary (Ежедневная финансовая сводка)
-- ============================================
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
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Миграция 2: Индексы

Создайте файл `supabase/migrations/20240102_create_indexes.sql`:

```sql
-- Индексы для заказов
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_type ON bookings(booking_type);
CREATE INDEX idx_bookings_worker ON bookings(worker_id);
CREATE INDEX idx_bookings_technician ON bookings(technician_id);
CREATE INDEX idx_bookings_payment_method ON bookings(payment_method);

-- Индексы для расходов
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);

-- Индексы для транзакций зарплаты
CREATE INDEX idx_salary_transactions_user ON salary_transactions(user_id);
CREATE INDEX idx_salary_transactions_date ON salary_transactions(transaction_date);
CREATE INDEX idx_salary_transactions_type ON salary_transactions(transaction_type);

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

#### Миграция 3: Начальные данные

Создайте файл `supabase/migrations/20240103_seed_data.sql`:

```sql
-- Начальные услуги автомойки
INSERT INTO services (name, service_type, price) VALUES
('Кузов', 'carwash', 500),
('Салон', 'carwash', 400),
('Багажник', 'carwash', 300),
('Воск', 'carwash', 300),
('Нано воск', 'carwash', 500),
('Полироль пластика', 'carwash', 400),
('Уход за кожей', 'carwash', 600),
('Химчистка салона', 'carwash', 800);

-- Начальные услуги шиномонтажа
INSERT INTO services (name, service_type, price) VALUES
('Шиномонтаж 4 колеса', 'tire', 2500),
('Шиномонтаж 2 колеса', 'tire', 800),
('Балансировка', 'tire', 600),
('Хранение', 'tire', 500),
('Ремонт шины', 'tire', 1000),
('Вентиль', 'tire', 200);

-- Начальная категория склада
INSERT INTO inventory_categories (name, unit) VALUES
('Шампуни и воски', 'литры');

-- Начальные товары склада
INSERT INTO inventory_items (name, category_id, unit, current_quantity, base_quantity, min_threshold, last_price_per_unit)
SELECT 
  'Шампунь KOCH',
  id,
  'канистра',
  16,
  20,
  5,
  2500
FROM inventory_categories
WHERE name = 'Шампуни и воски'
LIMIT 1;
```

### Шаг 2: Применение миграций

```bash
# Применение всех миграций к локальной базе
supabase db reset

# Применение миграций к удаленной базе
supabase db push
```

---

## 🔒 Настройка RLS политик

Создайте файл `supabase/migrations/20240104_create_rls_policies.sql`:

```sql
-- ============================================
-- Включение RLS для всех таблиц
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_worker_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_technician_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_financial_summary ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS для Users
-- ============================================
-- Админ может видеть всех пользователей
CREATE POLICY "Admins can view all users"
ON users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Владелец может видеть всех пользователей
CREATE POLICY "Owners can view all users"
ON users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'owner'
  )
);

-- Мойщик может видеть только себя
CREATE POLICY "Workers can view own profile"
ON users FOR SELECT
USING (id = auth.uid());

-- Шиномонтажник может видеть только себя
CREATE POLICY "Technicians can view own profile"
ON users FOR SELECT
USING (id = auth.uid());

-- Админ может создавать пользователей
CREATE POLICY "Admins can create users"
ON users FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Админ может обновлять пользователей
CREATE POLICY "Admins can update users"
ON users FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Мойщик может обновлять только свой профиль (баланс)
CREATE POLICY "Workers can update own profile"
ON users FOR UPDATE
USING (
  id = auth.uid()
  AND role = 'worker'
);

-- Шиномонтажник может обновлять только свой профиль (баланс)
CREATE POLICY "Technicians can update own profile"
ON users FOR UPDATE
USING (
  id = auth.uid()
  AND role = 'technician'
);

-- ============================================
-- RLS для Bookings
-- ============================================
-- Админ может видеть все заказы
CREATE POLICY "Admins can view all bookings"
ON bookings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Владелец может видеть все заказы
CREATE POLICY "Owners can view all bookings"
ON bookings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'owner'
  )
);

-- Мойщик может видеть свои заказы
CREATE POLICY "Workers can view own bookings"
ON bookings FOR SELECT
USING (worker_id = auth.uid());

-- Шиномонтажник может видеть свои заказы
CREATE POLICY "Technicians can view own bookings"
ON bookings FOR SELECT
USING (technician_id = auth.uid());

-- Админ может создавать заказы
CREATE POLICY "Admins can create bookings"
ON bookings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Админ может обновлять заказы
CREATE POLICY "Admins can update bookings"
ON bookings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================
-- RLS для Expenses
-- ============================================
-- Админ может видеть все расходы
CREATE POLICY "Admins can view all expenses"
ON expenses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Владелец может видеть все расходы
CREATE POLICY "Owners can view all expenses"
ON expenses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'owner'
  )
);

-- Админ может создавать расходы
CREATE POLICY "Admins can create expenses"
ON expenses FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================
-- RLS для SalaryTransactions
-- ============================================
-- Админ может видеть все транзакции
CREATE POLICY "Admins can view all salary transactions"
ON salary_transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Владелец может видеть все транзакции
CREATE POLICY "Owners can view all salary transactions"
ON salary_transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'owner'
  )
);

-- Пользователь может видеть свои транзакции
CREATE POLICY "Users can view own salary transactions"
ON salary_transactions FOR SELECT
USING (user_id = auth.uid());

-- Админ может создавать транзакции
CREATE POLICY "Admins can create salary transactions"
ON salary_transactions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================
-- RLS для DailyWorkerStats и DailyTechnicianStats
-- ============================================
-- Админ может видеть всю статистику
CREATE POLICY "Admins can view all worker stats"
ON daily_worker_stats FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

CREATE POLICY "Admins can view all technician stats"
ON daily_technician_stats FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Владелец может видеть всю статистику
CREATE POLICY "Owners can view all worker stats"
ON daily_worker_stats FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'owner'
  )
);

CREATE POLICY "Owners can view all technician stats"
ON daily_technician_stats FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'owner'
  )
);

-- Мойщик может видеть свою статистику
CREATE POLICY "Workers can view own stats"
ON daily_worker_stats FOR SELECT
USING (worker_id = auth.uid());

-- Шиномонтажник может видеть свою статистику
CREATE POLICY "Technicians can view own stats"
ON daily_technician_stats FOR SELECT
USING (technician_id = auth.uid());

-- ============================================
-- RLS для Inventory
-- ============================================
-- Админ может видеть все
CREATE POLICY "Admins can view all inventory"
ON inventory_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

CREATE POLICY "Admins can view all inventory categories"
ON inventory_categories FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

CREATE POLICY "Admins can view all inventory transactions"
ON inventory_transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Владелец может видеть все
CREATE POLICY "Owners can view all inventory"
ON inventory_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'owner'
  )
);

CREATE POLICY "Owners can view all inventory categories"
ON inventory_categories FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'owner'
  )
);

CREATE POLICY "Owners can view all inventory transactions"
ON inventory_transactions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'owner'
  )
);

-- Админ может управлять складом
CREATE POLICY "Admins can manage inventory"
ON inventory_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

CREATE POLICY "Admins can manage inventory categories"
ON inventory_categories FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

CREATE POLICY "Admins can manage inventory transactions"
ON inventory_transactions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================
-- RLS для DailyFinancialSummary
-- ============================================
-- Владелец может видеть все сводки
CREATE POLICY "Owners can view all financial summaries"
ON daily_financial_summary FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'owner'
  )
);

-- Админ может видеть и создавать сводки
CREATE POLICY "Admins can view all financial summaries"
ON daily_financial_summary FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

CREATE POLICY "Admins can create financial summaries"
ON daily_financial_summary FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

CREATE POLICY "Admins can update financial summaries"
ON daily_financial_summary FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);
```

---

## 🔄 Миграция данных из localStorage

### Шаг 1: Создание скрипта миграции

Создайте файл `scripts/migrate-from-localstorage.ts`:

```typescript
/**
 * Скрипт для миграции данных из localStorage в Supabase
 */

import { createClient } from '@supabase/supabase-js';

// Конфигурация Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Типы данных из localStorage
interface LocalStorageWorker {
  id: string;
  name: string;
  phone: string;
  carsToday: number;
  carsSoloToday: number;
  carsPairToday: number;
  earnedToday: number;
  completedBookings: string[];
  isActive: boolean;
  status: 'FREE' | 'BUSY';
  cardDetails?: string;
  isWorkingToday: boolean;
  workingMode: 'solo' | 'pair';
  partnerId?: string;
  baseSalaryPaid: number;
  modeSelected: boolean;
  currentBalance: number;
  isAdvanceTaken: boolean;
  salaryTransactions: any[];
}

interface LocalStorageTireTechnician {
  id: string;
  name: string;
  phone: string;
  jobsToday: number;
  earnedToday: number;
  completedBookings: string[];
  isActive: boolean;
  status: 'FREE' | 'BUSY';
  cardDetails?: string;
  isWorkingToday: boolean;
  baseSalaryPaid: number;
  currentBalance: number;
  isAdvanceTaken: boolean;
  salaryTransactions: any[];
}

interface LocalStorageBooking {
  id: string;
  clientName: string;
  phone?: string;
  carModel: string;
  carType: string;
  plateNumber: string;
  startTime: string;
  endTime: string;
  status: string;
  workerId?: string;
  technicianId?: string;
  price: number;
  services: string[];
  isOrg: boolean;
  orgName?: string;
  boxNumber?: number;
  paymentMethod?: string;
  completedAt?: string;
  date: string;
  workingModeAtCompletion?: string;
  cancelComment?: string;
}

// Функция миграции пользователей
async function migrateUsers() {
  console.log('🔄 Миграция пользователей...');
  
  // Получаем мойщиков из localStorage
  const workersData = localStorage.getItem('workersState');
  if (!workersData) {
    console.log('⚠️ Данные мойщиков не найдены');
    return;
  }
  
  const { workers } = JSON.parse(workersData) as { workers: LocalStorageWorker[] };
  
  // Мигрируем мойщиков
  for (const worker of workers) {
    const { error } = await supabase
      .from('users')
      .upsert({
        id: worker.id,
        name: worker.name,
        phone: worker.phone,
        role: 'worker',
        card_details: worker.cardDetails,
        current_balance: worker.currentBalance,
        is_advance_taken: worker.isAdvanceTaken,
      }, {
        onConflict: 'phone'
      });
    
    if (error) {
      console.error(`❌ Ошибка при миграции мойщика ${worker.name}:`, error);
    } else {
      console.log(`✅ Мойщик ${worker.name} мигрирован`);
    }
  }
  
  // Получаем шиномонтажников из localStorage
  const techniciansData = localStorage.getItem('tireTechniciansState');
  if (!techniciansData) {
    console.log('⚠️ Данные шиномонтажников не найдены');
    return;
  }
  
  const { technicians } = JSON.parse(techniciansData) as { technicians: LocalStorageTireTechnician[] };
  
  // Мигрируем шиномонтажников
  for (const technician of technicians) {
    const { error } = await supabase
      .from('users')
      .upsert({
        id: technician.id,
        name: technician.name,
        phone: technician.phone,
        role: 'technician',
        card_details: technician.cardDetails,
        current_balance: technician.currentBalance,
        is_advance_taken: technician.isAdvanceTaken,
      }, {
        onConflict: 'phone'
      });
    
    if (error) {
      console.error(`❌ Ошибка при миграции шиномонтажника ${technician.name}:`, error);
    } else {
      console.log(`✅ Шиномонтажник ${technician.name} мигрирован`);
    }
  }
}

// Функция миграции заказов
async function migrateBookings() {
  console.log('🔄 Миграция заказов...');
  
  // Получаем заказы автомойки
  const bookingsData = localStorage.getItem('bookingsState');
  if (bookingsData) {
    const { bookings } = JSON.parse(bookingsData) as { bookings: LocalStorageBooking[] };
    
    for (const booking of bookings) {
      const { error } = await supabase
        .from('bookings')
        .upsert({
          id: booking.id,
          client_name: booking.clientName,
          phone: booking.phone,
          car_model: booking.carModel,
          car_type: booking.carType,
          plate_number: booking.plateNumber,
          start_time: booking.startTime,
          end_time: booking.endTime,
          status: booking.status,
          worker_id: booking.workerId,
          price: booking.price,
          services: booking.services,
          is_org: booking.isOrg,
          org_name: booking.orgName,
          box_number: booking.boxNumber,
          payment_method: booking.paymentMethod,
          completed_at: booking.completedAt,
          booking_date: booking.date,
          working_mode_at_completion: booking.workingModeAtCompletion,
          cancel_comment: booking.cancelComment,
          booking_type: 'carwash',
        }, {
          onConflict: 'id'
        });
      
      if (error) {
        console.error(`❌ Ошибка при миграции заказа ${booking.id}:`, error);
      } else {
        console.log(`✅ Заказ ${booking.id} мигрирован`);
      }
    }
  }
  
  // Получаем быстрые заказы
  const quickBookingsData = localStorage.getItem('quickBookings');
  if (quickBookingsData) {
    const { bookings } = JSON.parse(quickBookingsData) as { bookings: LocalStorageBooking[] };
    
    for (const booking of bookings) {
      const { error } = await supabase
        .from('bookings')
        .upsert({
          id: booking.id,
          client_name: booking.clientName,
          phone: booking.phone,
          car_model: booking.carModel,
          car_type: booking.carType,
          plate_number: booking.plateNumber,
          start_time: booking.startTime,
          end_time: booking.endTime,
          status: booking.status,
          worker_id: booking.workerId,
          price: booking.price,
          services: booking.services,
          is_org: booking.isOrg,
          org_name: booking.orgName,
          box_number: booking.boxNumber,
          payment_method: booking.paymentMethod,
          completed_at: booking.completedAt,
          booking_date: booking.date,
          booking_type: 'quick',
        }, {
          onConflict: 'id'
        });
      
      if (error) {
        console.error(`❌ Ошибка при миграции быстрого заказа ${booking.id}:`, error);
      } else {
        console.log(`✅ Быстрый заказ ${booking.id} мигрирован`);
      }
    }
  }
}

// Функция миграции транзакций зарплаты
async function migrateSalaryTransactions() {
  console.log('🔄 Миграция транзакций зарплаты...');
  
  // Получаем мойщиков
  const workersData = localStorage.getItem('workersState');
  if (workersData) {
    const { workers } = JSON.parse(workersData) as { workers: LocalStorageWorker[] };
    
    for (const worker of workers) {
      for (const transaction of worker.salaryTransactions) {
        const { error } = await supabase
          .from('salary_transactions')
          .upsert({
            id: transaction.id,
            user_id: worker.id,
            transaction_type: transaction.type,
            amount: transaction.amount,
            balance_after: transaction.balanceAfter,
            transaction_date: transaction.date,
            description: transaction.description,
          }, {
            onConflict: 'id'
          });
        
        if (error) {
          console.error(`❌ Ошибка при миграции транзакции ${transaction.id}:`, error);
        }
      }
    }
  }
  
  // Получаем шиномонтажников
  const techniciansData = localStorage.getItem('tireTechniciansState');
  if (techniciansData) {
    const { technicians } = JSON.parse(techniciansData) as { technicians: LocalStorageTireTechnician[] };
    
    for (const technician of technicians) {
      for (const transaction of technician.salaryTransactions) {
        const { error } = await supabase
          .from('salary_transactions')
          .upsert({
            id: transaction.id,
            user_id: technician.id,
            transaction_type: transaction.type,
            amount: transaction.amount,
            balance_after: transaction.balanceAfter,
            transaction_date: transaction.date,
            description: transaction.description,
          }, {
            onConflict: 'id'
          });
        
        if (error) {
          console.error(`❌ Ошибка при миграции транзакции ${transaction.id}:`, error);
        }
      }
    }
  }
}

// Главная функция миграции
async function runMigration() {
  console.log('🚀 Начало миграции данных из localStorage в Supabase...');
  
  try {
    await migrateUsers();
    await migrateBookings();
    await migrateSalaryTransactions();
    
    console.log('✅ Миграция завершена успешно!');
  } catch (error) {
    console.error('❌ Ошибка при миграции:', error);
  }
}

// Запуск миграции
runMigration();
```

### Шаг 2: Запуск миграции

```bash
# Установка зависимостей (если еще не установлены)
npm install @supabase/supabase-js

# Запуск скрипта миграции
npm run migrate
```

Добавьте в `package.json`:

```json
{
  "scripts": {
    "migrate": "tsx scripts/migrate-from-localstorage.ts"
  }
}
```

---

## 🔌 Интеграция с приложением

### Шаг 1: Установка Supabase Client

```bash
npm install @supabase/supabase-js
```

### Шаг 2: Создание клиента Supabase

Создайте файл `shared/api/supabaseClient.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### Шаг 3: Создание безопасной обертки для запросов

Создайте файл `shared/api/safeQuery.ts`:

```typescript
import { supabase } from './supabaseClient';

export interface SafeQueryResult<T> {
  data: T | null;
  error: string | null;
}

/**
 * Безопасная обертка для Supabase запросов
 * Обрабатывает ошибки и возвращает унифицированный результат
 */
export async function safeQuery<T>(
  query: Promise<{ data: T | null; error: any }>
): Promise<SafeQueryResult<T>> {
  try {
    const { data, error } = await query;
    
    if (error) {
      console.error('[Supabase Error]:', error);
      return { data: null, error: error.message };
    }
    
    return { data, error: null };
  } catch (e) {
    console.error('[Unexpected Error]:', e);
    return { data: null, error: 'Неизвестная ошибка' };
  }
}
```

### Шаг 4: Обновление типов

Обновите файл `types.ts` для соответствия структуре БД:

```typescript
// Добавьте новые типы для Supabase
export interface DatabaseUser {
  id: string;
  name: string;
  phone: string;
  role: 'admin' | 'owner' | 'worker' | 'technician';
  card_details?: string;
  current_balance: number;
  is_advance_taken: boolean;
  created_at: string;
  updated_at: string;
}

export interface DatabaseBooking {
  id: string;
  client_name: string;
  phone?: string;
  car_model: string;
  car_type: 'SEDAN' | 'CROSSOVER' | 'JEEP' | 'BUS';
  plate_number: string;
  start_time: string;
  end_time: string;
  status: 'ОЖИДАЕТ' | 'В РАБОТЕ' | 'ГОТОВО' | 'ОТМЕНЕНО';
  worker_id?: string;
  technician_id?: string;
  price: number;
  services: string[];
  is_org: boolean;
  org_name?: string;
  box_number?: number;
  payment_method?: 'Наличный' | 'Безналичный' | 'Перевод';
  completed_at?: string;
  booking_date: string;
  working_mode_at_completion?: 'solo' | 'pair';
  cancel_comment?: string;
  booking_type: 'carwash' | 'tire' | 'quick';
  created_at: string;
  updated_at: string;
}
```

---

## ✅ Проверка и тестирование

### Шаг 1: Проверка структуры БД

```bash
# Просмотр всех таблиц
supabase db remote tables

# Просмотр структуры конкретной таблицы
supabase db remote columns bookings
```

### Шаг 2: Тестирование RLS политик

В Supabase Dashboard:
1. Перейдите в **Authentication**
2. Создайте тестового пользователя с ролью `admin`
3. В **SQL Editor** выполните тестовые запросы
4. Проверьте, что RLS политики работают корректно

### Шаг 3: Тестирование API

Создайте файл `tests/supabase.test.ts`:

```typescript
import { supabase } from '../shared/api/supabaseClient';
import { safeQuery } from '../shared/api/safeQuery';

async function testSupabaseConnection() {
  console.log('🧪 Тестирование подключения к Supabase...');
  
  // Тест 1: Получение пользователей
  const usersResult = await safeQuery(
    supabase.from('users').select('*').limit(5)
  );
  
  if (usersResult.error) {
    console.error('❌ Ошибка при получении пользователей:', usersResult.error);
  } else {
    console.log('✅ Пользователи получены:', usersResult.data);
  }
  
  // Тест 2: Получение заказов
  const bookingsResult = await safeQuery(
    supabase.from('bookings').select('*').limit(5)
  );
  
  if (bookingsResult.error) {
    console.error('❌ Ошибка при получении заказов:', bookingsResult.error);
  } else {
    console.log('✅ Заказы получены:', bookingsResult.data);
  }
  
  // Тест 3: Получение услуг
  const servicesResult = await safeQuery(
    supabase.from('services').select('*')
  );
  
  if (servicesResult.error) {
    console.error('❌ Ошибка при получении услуг:', servicesResult.error);
  } else {
    console.log('✅ Услуги получены:', servicesResult.data);
  }
}

testSupabaseConnection();
```

Запустите тест:

```bash
npm run test:supabase
```

---

## 📝 Чеклист перед запуском

- [x] Создан аккаунт Supabase
- [x] Создан проект Supabase
- [x] Получены учетные данные (URL, API ключи)
- [x] Настроены переменные окружения
- [x] Установлен Supabase CLI
- [x] Инициализирован Supabase в проекте
- [x] Созданы миграции для таблиц
- [x] Созданы миграции для индексов
- [x] Созданы миграции для начальных данных
- [x] Созданы RLS политики
- [x] Применены миграции к удаленной БД
- [x] Установлен Supabase Client
- [x] Создан клиент Supabase
- [x] Создана безопасная обертка для запросов
- [x] Обновлены типы TypeScript
- [x] Создан скрипт миграции из localStorage
- [x] Выполнена миграция данных
- [x] Протестировано подключение к БД
- [x] Протестированы RLS политики

---

## 🎯 Следующие шаги

1. **Замена localStorage на Supabase в компонентах**
   - Обновить `App.tsx` для использования Supabase
   - Обновить все компоненты для работы с БД

2. **Создание API функций**
   - Создать функции для CRUD операций
   - Создать функции для бизнес-логики

3. **Разработка дашборда владельца**
   - Создать компонент дашборда
   - Реализовать визуализацию метрик
   - Добавить графики и диаграммы

4. **Оптимизация производительности**
   - Добавить кэширование
   - Оптимизировать запросы
   - Добавить пагинацию

---

*Документ создан для пошагового руководства по настройке базы данных Supabase.*
