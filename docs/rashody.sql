-- 1️⃣ Создать enum для категорий
CREATE TYPE expense_category AS ENUM (
  'tea_coffee',
  'repair', 
  'utilities',
  'stationery',
  'other'
);

-- 2️⃣ Создать таблицу расходов
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category expense_category NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  comment TEXT,
  receipt_url TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Проверка: для repair/utilities/other комментарий обязателен
  CONSTRAINT check_comment_required 
    CHECK (
      (category IN ('repair', 'utilities', 'other') AND comment IS NOT NULL AND comment != '')
      OR 
      (category IN ('tea_coffee', 'stationery'))
    )
);

-- 3️⃣ Индексы
CREATE INDEX idx_expenses_created_by ON expenses(created_by);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_created_at ON expenses(created_at);

-- 4️⃣ Триггер для updated_at
CREATE OR REPLACE FUNCTION update_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expenses_updated_at
BEFORE UPDATE ON expenses
FOR EACH ROW
EXECUTE FUNCTION update_expenses_updated_at();

-- 5️⃣ RLS политики
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Админ видит только свои за сегодня
CREATE POLICY "Admin can view own today expenses"
ON expenses FOR SELECT
USING (
  auth.uid() = created_by 
  AND 
  expense_date = CURRENT_DATE
  AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Владелец видит всё
CREATE POLICY "Owner can view all expenses"
ON expenses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'owner'
  )
);

-- Админ и владелец могут добавлять
CREATE POLICY "Staff can insert expenses"
ON expenses FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner')
  )
);

-- Админ может обновлять только свои
CREATE POLICY "Admin can update own expenses"
ON expenses FOR UPDATE
USING (
  auth.uid() = created_by
  AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Владелец может обновлять любые
CREATE POLICY "Owner can update all expenses"
ON expenses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'owner'
  )
);