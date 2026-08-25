ALTER TABLE public.daily_reports 
ADD COLUMN carwash_cash numeric DEFAULT 0,
ADD COLUMN carwash_card numeric DEFAULT 0,
ADD COLUMN carwash_transfer numeric DEFAULT 0,
ADD COLUMN tire_cash numeric DEFAULT 0,
ADD COLUMN tire_card numeric DEFAULT 0,
ADD COLUMN tire_transfer numeric DEFAULT 0;

COMMENT ON COLUMN daily_reports.carwash_cash IS 'Автомойка - наличные';
COMMENT ON COLUMN daily_reports.carwash_card IS 'Автомойка - карта';
COMMENT ON COLUMN daily_reports.carwash_transfer IS 'Автомойка - перевод';
COMMENT ON COLUMN daily_reports.tire_cash IS 'Шиномонтаж - наличные';
COMMENT ON COLUMN daily_reports.tire_card IS 'Шиномонтаж - карта';
COMMENT ON COLUMN daily_reports.tire_transfer IS 'Шиномонтаж - перевод';
