-- ==========================================
-- Миграция: Интеграция платежей YooKassa (СБП)
-- Дата: 2025-01-20
-- Описание: Добавление таблиц для работы с платежами через YooKassa
-- ==========================================

-- ==========================================
-- 1. Таблица pending_bookings
-- Хранит временные записи перед оплатой через СБП
-- ==========================================
CREATE TABLE IF NOT EXISTS pending_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL,
  client_name VARCHAR NOT NULL,
  phone VARCHAR NOT NULL,
  car_model VARCHAR NOT NULL,
  plate_number VARCHAR NOT NULL,
  booking_date DATE NOT NULL,
  start_time VARCHAR NOT NULL,
  end_time VARCHAR NOT NULL,
  services JSONB NOT NULL,
  post INTEGER NOT NULL,
  total_price NUMERIC NOT NULL,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_pending_bookings_telegram_user ON pending_bookings(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_pending_bookings_expires_at ON pending_bookings(expires_at);

-- ==========================================
-- 2. Таблица payments
-- Хранит информацию о платежах YooKassa
-- ==========================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  pending_booking_id UUID REFERENCES pending_bookings(id) ON DELETE SET NULL,
  tire_booking_id UUID REFERENCES tire_bookings(id) ON DELETE CASCADE,
  yookassa_payment_id VARCHAR UNIQUE NOT NULL,
  amount NUMERIC NOT NULL,
  currency VARCHAR DEFAULT 'RUB',
  status VARCHAR NOT NULL CHECK (status IN ('pending', 'succeeded', 'canceled', 'waiting_for_capture')),
  payment_method VARCHAR CHECK (payment_method IN ('sbp', 'bank_card', 'yoo_money', 'cash', 'cashless')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_pending_booking_id ON payments(pending_booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_tire_booking_id ON payments(tire_booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_yookassa_id ON payments(yookassa_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ==========================================
-- 3. Таблица sbp_banks
-- Кэш списка банков СБП (обновляется раз в 7 дней)
-- ==========================================
CREATE TABLE IF NOT EXISTS sbp_banks (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  logo VARCHAR NOT NULL,
  scheme VARCHAR,
  deep_link VARCHAR,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Индекс для отслеживания обновлений
CREATE INDEX IF NOT EXISTS idx_sbp_banks_updated_at ON sbp_banks(updated_at);

-- ==========================================
-- 4. Добавление поля yookassa_payment_id в bookings
-- Для связи с платежами YooKassa
-- ==========================================
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS yookassa_payment_id VARCHAR UNIQUE;

-- ==========================================
-- 5. Добавление поля yookassa_payment_id в tire_bookings
-- Для связи с платежами YooKassa
-- ==========================================
ALTER TABLE tire_bookings
ADD COLUMN IF NOT EXISTS yookassa_payment_id VARCHAR UNIQUE;

-- ==========================================
-- Комментарии к таблицам и полям
-- ==========================================

-- pending_bookings
COMMENT ON TABLE pending_bookings IS 'Временные записи перед оплатой через СБП (истекают через 30 минут)';
COMMENT ON COLUMN pending_bookings.telegram_user_id IS 'ID пользователя в Telegram';
COMMENT ON COLUMN pending_bookings.expires_at IS 'Время истечения записи (30 минут от создания)';

-- payments
COMMENT ON TABLE payments IS 'Платежи через YooKassa (СБП, банковские карты и др.)';
COMMENT ON COLUMN payments.yookassa_payment_id IS 'Уникальный ID платежа в YooKassa';
COMMENT ON COLUMN payments.status IS 'Статус платежа: pending, succeeded, canceled, waiting_for_capture';
COMMENT ON COLUMN payments.metadata IS 'Дополнительные данные платежа (включая pending_booking_id)';
COMMENT ON COLUMN payments.pending_booking_id IS 'Ссылка на временную запись (становится NULL после успешной оплаты)';

-- sbp_banks
COMMENT ON TABLE sbp_banks IS 'Кэш списка банков СБП (обновляется раз в 7 дней)';
COMMENT ON COLUMN sbp_banks.scheme IS 'Схема deep link (например, sberbankonline://)';
COMMENT ON COLUMN sbp_banks.deep_link IS 'Полный deep link для открытия приложения банка';

-- bookings
COMMENT ON COLUMN bookings.yookassa_payment_id IS 'ID платежа в YooKassa для онлайн-оплаты';

-- tire_bookings
COMMENT ON COLUMN tire_bookings.yookassa_payment_id IS 'ID платежа в YooKassa для онлайн-оплаты';

-- ==========================================
-- Триггер для автоматического обновления updated_at
-- ==========================================

-- Функция для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для payments
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Триггер для sbp_banks
DROP TRIGGER IF EXISTS update_sbp_banks_updated_at ON sbp_banks;
CREATE TRIGGER update_sbp_banks_updated_at
    BEFORE UPDATE ON sbp_banks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- Успешное завершение миграции
-- ==========================================
