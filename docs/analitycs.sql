CREATE TABLE public.daily_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  
  -- Выручка по автомойке
  carwash_revenue numeric DEFAULT 0,
  carwash_orders_count integer DEFAULT 0,
  carwash_completed_count integer DEFAULT 0,
  carwash_cancelled_count integer DEFAULT 0,
  
  -- Выручка по шиномонтажу
  tire_revenue numeric DEFAULT 0,
  tire_orders_count integer DEFAULT 0,
  tire_completed_count integer DEFAULT 0,
  tire_cancelled_count integer DEFAULT 0,
  
  -- Общая выручка
  total_revenue numeric DEFAULT 0,
  total_orders_count integer DEFAULT 0,
  
  -- Выручка по способам оплаты
  cash_revenue numeric DEFAULT 0,
  card_revenue numeric DEFAULT 0,
  transfer_revenue numeric DEFAULT 0,
  cashless_revenue numeric DEFAULT 0,
  
  -- Расходы
  total_expenses numeric DEFAULT 0,
  expenses_by_category jsonb DEFAULT '{}'::jsonb,
  
  -- Зарплаты и персонал
  total_salary_paid numeric DEFAULT 0,
  workers_count integer DEFAULT 0,
  tire_workers_count integer DEFAULT 0,
  admins_count integer DEFAULT 0,
  
  -- Финансовые показатели
  gross_profit numeric DEFAULT 0, -- Выручка - расходы
  net_profit numeric DEFAULT 0,   -- Выручка - расходы - зарплаты
  
  -- Организации (корпоративные клиенты)
  org_revenue numeric DEFAULT 0,
  org_orders_count integer DEFAULT 0,
  
  -- Дополнительные метрики
  average_check numeric DEFAULT 0,
  boxes_closed integer DEFAULT 0,
  
  -- Метаданные
  is_finalized boolean DEFAULT false,
  finalized_by uuid,
  finalized_at timestamp with time zone,
  notes text,
  
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT daily_reports_pkey PRIMARY KEY (id),
  CONSTRAINT daily_reports_finalized_by_fkey FOREIGN KEY (finalized_by) REFERENCES public.admins(id)
);

-- Индексы для быстрого поиска
CREATE INDEX idx_daily_reports_date ON public.daily_reports(report_date DESC);
CREATE INDEX idx_daily_reports_finalized ON public.daily_reports(is_finalized, report_date);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_daily_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_reports_updated_at();

-- Комментарии к таблице
COMMENT ON TABLE public.daily_reports IS 'Ежедневные итоговые отчеты по работе автомойки и шиномонтажа';
COMMENT ON COLUMN public.daily_reports.is_finalized IS 'Отчет закрыт и не подлежит изменению';
COMMENT ON COLUMN public.daily_reports.expenses_by_category IS 'Расходы разбитые по категориям в формате {"category": amount}';
