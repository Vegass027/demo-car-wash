-- СОЗДАНИЕ ТАБЛИЦЫ АДМИНИСТРАТОРОВ
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  card_number TEXT,
  payment_phone TEXT,
  is_active BOOLEAN DEFAULT true,
  fixed_salary DECIMAL(10,2) DEFAULT 2000,
  earned_today DECIMAL(10,2) DEFAULT 0,
  current_balance DECIMAL(10,2) DEFAULT 0,
  is_advance_taken BOOLEAN DEFAULT false,
  is_working_today BOOLEAN DEFAULT false,
  days_worked_this_month INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_admins_active ON admins(is_active);
CREATE INDEX idx_admins_working_today ON admins(is_working_today);

CREATE OR REPLACE FUNCTION update_admins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admins_updated_at
BEFORE UPDATE ON admins
FOR EACH ROW
EXECUTE FUNCTION update_admins_updated_at();


-- СОЗДАНИЕ ТАБЛИЦЫ РАБОЧИХ ДНЕЙ АДМИНОВ
CREATE TABLE admin_work_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  admin_name TEXT NOT NULL,
  work_date DATE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  earnings DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'working' CHECK (status IN ('working', 'finished')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_admin_work_days_admin ON admin_work_days(admin_id);
CREATE INDEX idx_admin_work_days_date ON admin_work_days(work_date DESC);
CREATE INDEX idx_admin_work_days_status ON admin_work_days(status);
CREATE UNIQUE INDEX idx_admin_work_days_unique ON admin_work_days(admin_id, work_date);


-- ОБНОВИТЬ salary_transactions
ALTER TABLE salary_transactions 
DROP CONSTRAINT IF EXISTS salary_transactions_worker_type_check;

ALTER TABLE salary_transactions 
ADD CONSTRAINT salary_transactions_worker_type_check 
CHECK (worker_type IN ('worker', 'tire_worker', 'admin'));


-- ДОБАВИТЬ ПЕРВОГО АДМИНА (ПРИМЕР)
INSERT INTO admins (full_name, phone, fixed_salary, is_active)
VALUES ('Администратор', '+79001234567', 2000, true);
