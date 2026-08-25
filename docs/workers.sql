CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  
  -- Режим работы
  working_mode TEXT DEFAULT 'solo' CHECK (working_mode IN ('solo', 'pair')),
  is_working_today BOOLEAN DEFAULT false,
  cars_today DECIMAL(10,2) DEFAULT 0,
  
  -- Финансы
  earned_today DECIMAL(10,2) DEFAULT 0,
  current_balance DECIMAL(10,2) DEFAULT 0,
  is_advance_taken BOOLEAN DEFAULT false,
  
  -- Заказы
  completed_bookings TEXT[] DEFAULT '{}',
  
  -- Системные
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Триггер для workers
CREATE OR REPLACE FUNCTION update_workers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workers_updated_at
BEFORE UPDATE ON workers
FOR EACH ROW
EXECUTE FUNCTION update_workers_updated_at();

-- Индексы для workers
CREATE INDEX IF NOT EXISTS idx_workers_active ON workers(is_active);
CREATE INDEX IF NOT EXISTS idx_workers_working_today ON workers(is_working_today);

-- ════════════════════════════════════════════════════════════
-- СОЗДАНИЕ salary_transactions (история зарплат)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS salary_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_type TEXT NOT NULL CHECK (worker_type IN ('worker', 'tire_worker')),
  worker_id UUID NOT NULL,
  worker_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('EARNING', 'PAYOUT', 'ADVANCE')),
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_salary_transactions_worker ON salary_transactions(worker_type, worker_id);
CREATE INDEX IF NOT EXISTS idx_salary_transactions_type ON salary_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_salary_transactions_date ON salary_transactions(created_at DESC);
