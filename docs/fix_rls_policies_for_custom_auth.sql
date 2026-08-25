-- Миграция: Обновление RLS политик для кастомной аутентификации
-- Дата: 2025-01-19
-- Описание: Удаление RLS политик, использующих auth.uid(), т.к. мы перешли на кастомную аутентификацию

-- ============================================
-- УДАЛЯЕМ СТАРЫЕ ПОЛИТИКИ С auth.uid()
-- ============================================

-- Bookings
DROP POLICY IF EXISTS "Admins can manage all bookings" ON bookings;
DROP POLICY IF EXISTS "Clients can create own bookings" ON bookings;
DROP POLICY IF EXISTS "Clients can view own bookings" ON bookings;

-- Tire Bookings
DROP POLICY IF EXISTS "Admins can manage all tire bookings" ON tire_bookings;
DROP POLICY IF EXISTS "Clients can create own tire bookings" ON tire_bookings;
DROP POLICY IF EXISTS "Clients can view own tire bookings" ON tire_bookings;

-- Expenses
DROP POLICY IF EXISTS "Admin and owner can insert expenses" ON expenses;
DROP POLICY IF EXISTS "Admin can update own expenses" ON expenses;
DROP POLICY IF EXISTS "Admin can view own today expenses" ON expenses;
DROP POLICY IF EXISTS "Admins can delete own expenses, Owners can delete all" ON expenses;
DROP POLICY IF EXISTS "Admins can update own expenses, Owners can update all" ON expenses;
DROP POLICY IF EXISTS "All users can insert expenses" ON expenses;
DROP POLICY IF EXISTS "All users can view all expenses" ON expenses;
DROP POLICY IF EXISTS "Owner can update all expenses" ON expenses;
DROP POLICY IF EXISTS "Owner can view all expenses" ON expenses;

-- Inventory Arrivals
DROP POLICY IF EXISTS "Admins and owners can insert arrivals" ON inventory_arrivals;
DROP POLICY IF EXISTS "Admins and owners can view arrivals" ON inventory_arrivals;

-- Inventory Categories
DROP POLICY IF EXISTS "Admins and owners can delete categories" ON inventory_categories;
DROP POLICY IF EXISTS "Admins and owners can insert categories" ON inventory_categories;
DROP POLICY IF EXISTS "Admins and owners can update categories" ON inventory_categories;
DROP POLICY IF EXISTS "Admins and owners can view categories" ON inventory_categories;

-- Inventory Items
DROP POLICY IF EXISTS "Admins and owners can manage items" ON inventory_items;
DROP POLICY IF EXISTS "Admins and owners can view items" ON inventory_items;

-- Inventory Operations
DROP POLICY IF EXISTS "Admins and owners can insert operations" ON inventory_operations;
DROP POLICY IF EXISTS "Admins and owners can view operations" ON inventory_operations;

-- Client Cars
DROP POLICY IF EXISTS "Admins can manage all cars" ON client_cars;
DROP POLICY IF EXISTS "Clients can insert own cars" ON client_cars;
DROP POLICY IF EXISTS "Clients can view own cars" ON client_cars;

-- Auth Logs
DROP POLICY IF EXISTS "Admins can view all auth logs" ON auth_logs;
DROP POLICY IF EXISTS "Users can view own auth logs" ON auth_logs;

-- Profiles
DROP POLICY IF EXISTS "Allow profile search by phone" ON profiles;
DROP POLICY IF EXISTS "Staff can update profiles" ON profiles;
DROP POLICY IF EXISTS "Staff can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- ============================================
-- ВКЛЮЧАЕМ RLS ДЛЯ ТАБЛИЦ
-- ============================================

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tire_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- СОЗДАЕМ НОВЫЕ ПОЛИТИКИ (без auth.uid())
-- ============================================

-- Bookings: разрешаем все операции (клиенты авторизуются через Telegram)
CREATE POLICY "Allow all operations on bookings" 
ON bookings FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Tire Bookings: разрешаем все операции (клиенты авторизуются через Telegram)
CREATE POLICY "Allow all operations on tire_bookings" 
ON tire_bookings FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Expenses: разрешаем все операции
CREATE POLICY "Allow all operations on expenses" 
ON expenses FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Inventory Arrivals: разрешаем все операции
CREATE POLICY "Allow all operations on inventory_arrivals" 
ON inventory_arrivals FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Inventory Categories: разрешаем все операции
CREATE POLICY "Allow all operations on inventory_categories" 
ON inventory_categories FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Inventory Items: разрешаем все операции
CREATE POLICY "Allow all operations on inventory_items" 
ON inventory_items FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Inventory Operations: разрешаем все операции
CREATE POLICY "Allow all operations on inventory_operations" 
ON inventory_operations FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Client Cars: разрешаем все операции
CREATE POLICY "Allow all operations on client_cars" 
ON client_cars FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Auth Logs: разрешаем все операции
CREATE POLICY "Allow all operations on auth_logs" 
ON auth_logs FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- Profiles: разрешаем все операции (для кастомной аутентификации)
CREATE POLICY "Allow all operations on profiles" 
ON profiles FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- ============================================
-- ПРИМЕЧАНИЕ
-- ============================================
-- Поскольку мы перешли на кастомную аутентификацию через таблицу profiles,
-- RLS политики больше не могут использовать auth.uid() для определения текущего пользователя.
-- 
-- Безопасность обеспечивается на уровне приложения:
-- - Клиенты авторизуются через Telegram (telegram_id)
-- - Админы и владельцы авторизуются через login/password или Telegram
-- - userId передается в API функции как параметр
-- 
-- Если в будущем потребуется более строгая безопасность, можно:
-- 1. Использовать service_role ключ для обхода RLS
-- 2. Создать промежуточный API слой с проверкой прав
-- 3. Вернуться к Supabase Auth для RLS
