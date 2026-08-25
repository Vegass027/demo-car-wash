-- 1. Таблица услуг шиномонтажа
CREATE TABLE tire_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  price INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Таблица заказов шиномонтажа
CREATE TABLE tire_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Клиент
  client_name VARCHAR NOT NULL,
  phone VARCHAR NOT NULL,
  
  -- Машина
  car_model VARCHAR NOT NULL,
  plate_number VARCHAR NOT NULL,
  
  -- Дата и время
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  estimated_duration INTEGER NOT NULL, -- минуты (30, 60, 120, 300...)
  
  -- Услуги и цена
  services JSONB NOT NULL DEFAULT '[]', -- массив ID услуг
  total_price INTEGER NOT NULL DEFAULT 0,
  
  -- Оплата
  payment_method VARCHAR DEFAULT 'Наличные',
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMP,
  
  -- Статус
  status VARCHAR DEFAULT 'ОЖИДАЕТ', -- ОЖИДАЕТ, В РАБОТЕ, ГОТОВО, ОТМЕНЕН
  
  -- Организация (если это не физик)
  is_org BOOLEAN DEFAULT false,
  organization_id UUID REFERENCES organizations(id),
  driver_id UUID REFERENCES organization_drivers(id),
  car_id UUID REFERENCES organization_cars(id),
  org_name VARCHAR,
  
  -- Клиент физик (если не организация)
  client_id UUID REFERENCES clients(id),
  client_car_id UUID REFERENCES client_cars(id),
  
  -- Работник
  worker_id UUID,
  
  -- Подпись водителя (для организаций)
  signature_data TEXT,
  signature_obtained_at TIMESTAMP,
  
  -- Служебные поля
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Таблица шиномонтажников
CREATE TABLE tire_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  phone VARCHAR,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Индексы для быстрого поиска
CREATE INDEX idx_tire_bookings_date ON tire_bookings(booking_date);
CREATE INDEX idx_tire_bookings_phone ON tire_bookings(phone);
CREATE INDEX idx_tire_bookings_status ON tire_bookings(status);
CREATE INDEX idx_tire_services_category ON tire_services(category);

-- 5. Вставка всех услуг из прайса
INSERT INTO tire_services (category, name, price) VALUES
-- ШИНОМОНТАЖ
('ШИНОМОНТАЖ', 'Легковой R-13, 14', 150),
('ШИНОМОНТАЖ', 'Легковой R-15, 16', 200),
('ШИНОМОНТАЖ', 'Легковой R-17, 18, 19', 250),
('ШИНОМОНТАЖ', 'Кроссовер R-15, 16', 250),
('ШИНОМОНТАЖ', 'Кроссовер R-17, 18', 300),
('ШИНОМОНТАЖ', 'ДЖИП R-15, 16, 17', 300),
('ШИНОМОНТАЖ', 'ДЖИП R-18, 19', 300),
('ШИНОМОНТАЖ', 'ДЖИП R-20, R-21', 350),
('ШИНОМОНТАЖ', 'Микроавтобус', 300),
('ШИНОМОНТАЖ', 'ГАЗЕЛЬ', 350),
('ШИНОМОНТАЖ', 'Шины категории Run Flat (комплект 4 шт.) R-16 — R-19', 4000),
('ШИНОМОНТАЖ', 'Шины категории Run Flat (комплект 4 шт.) R-20 и выше', 5000),

-- БАЛАНСИРОВКА
('БАЛАНСИРОВКА', 'Легковой R-13, 14', 150),
('БАЛАНСИРОВКА', 'Легковой R-15, 16', 200),
('БАЛАНСИРОВКА', 'Легковой R-17, 18, 19', 250),
('БАЛАНСИРОВКА', 'Кроссовер R-15, 16', 300),
('БАЛАНСИРОВКА', 'Кроссовер R-17, 18', 350),
('БАЛАНСИРОВКА', 'ДЖИП R-15, 16, 17', 300),
('БАЛАНСИРОВКА', 'ДЖИП R-18, 19', 350),
('БАЛАНСИРОВКА', 'ДЖИП R-20, R-21', 350),
('БАЛАНСИРОВКА', 'Микроавтобус', 350),
('БАЛАНСИРОВКА', 'ГАЗЕЛЬ', 350),

-- РЕМОНТ
('РЕМОНТ', 'Установка латки (без камерной покрышки) прокол', 200),
('РЕМОНТ', 'Установка латки (малый размер) боковой порез', 400),
('РЕМОНТ', 'Установка латки (средний размер) боковой порез', 600),
('РЕМОНТ', 'Установка латки (большой размер) боковой порез', 800),
('РЕМОНТ', 'Латка (камера)', 200),
('РЕМОНТ', 'Замена вентиля Б/К', 150),

-- СЪЁМ-ПОСТАНОВКА КОЛЕСА
('СЪЁМ-ПОСТАНОВКА КОЛЕСА', 'Съём-постановка R-13 — R-16', 150),
('СЪЁМ-ПОСТАНОВКА КОЛЕСА', 'Съём-постановка R-17, R-18', 200),
('СЪЁМ-ПОСТАНОВКА КОЛЕСА', 'Съём-постановка R-19, R-20', 300),
('СЪЁМ-ПОСТАНОВКА КОЛЕСА', 'ДЖИП R-15 — R-20', 350),
('СЪЁМ-ПОСТАНОВКА КОЛЕСА', 'ГАЗЕЛЬ (1 место)', 400),
('СЪЁМ-ПОСТАНОВКА КОЛЕСА', 'Снять фаркоп', 500),

-- СЕЗОННАЯ СМЕНА РЕЗИНЫ
('СЕЗОННАЯ СМЕНА РЕЗИНЫ', 'Легковая R-13, R-14', 1600),
('СЕЗОННАЯ СМЕНА РЕЗИНЫ', 'Легковая R-15, R-16', 2000),
('СЕЗОННАЯ СМЕНА РЕЗИНЫ', 'Легковая R-17, R-18', 2200),
('СЕЗОННАЯ СМЕНА РЕЗИНЫ', 'Легковая R-19, R-20', 2600),
('СЕЗОННАЯ СМЕНА РЕЗИНЫ', 'Кроссовер, Джип R-16, R-17', 2400),
('СЕЗОННАЯ СМЕНА РЕЗИНЫ', 'Кроссовер, Джип R-18, R-19', 2600),
('СЕЗОННАЯ СМЕНА РЕЗИНЫ', 'Кроссовер, Джип R-20, R-21, R-22', 3600),
('СЕЗОННАЯ СМЕНА РЕЗИНЫ', 'Газель', 4000),
('СЕЗОННАЯ СМЕНА РЕЗИНЫ', 'Внедорожники АТ/МТ', 4000);

-- 6. Вставка тестового шиномонтажника
INSERT INTO tire_workers (name, phone) VALUES
('Шиномонтажник Тест', '+7 (999) 999-99-99');
