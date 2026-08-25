-- ════════════════════════════════════════════════════════════
-- ТАБЛИЦА РАБОЧИХ СМЕН (МОЙЩИКИ + МАСТЕРА)
-- ════════════════════════════════════════════════════════════

CREATE TABLE work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Тип работника и ID
  worker_type TEXT NOT NULL CHECK (worker_type IN ('worker', 'tire_worker')),
  worker_id UUID NOT NULL,
  worker_name TEXT NOT NULL,
  
  -- Дата и время смены
  work_date DATE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  
  -- Статус смены
  status TEXT DEFAULT 'working' CHECK (status IN ('working', 'finished')),
  
  -- Режим работы (только для мойщиков)
  working_mode TEXT CHECK (working_mode IN ('solo', 'pair')),
  
  -- Статистика за смену
  cars_washed DECIMAL(10,2) DEFAULT 0,
  bookings_completed INTEGER DEFAULT 0,
  earnings DECIMAL(10,2) DEFAULT 0,
  
  -- Системные поля
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индексы
CREATE INDEX idx_work_shifts_worker ON work_shifts(worker_type, worker_id);
CREATE INDEX idx_work_shifts_date ON work_shifts(work_date DESC);
CREATE INDEX idx_work_shifts_status ON work_shifts(status);
CREATE UNIQUE INDEX idx_work_shifts_unique ON work_shifts(worker_id, work_date);

COMMENT ON TABLE work_shifts IS 'История рабочих смен мойщиков и мастеров';