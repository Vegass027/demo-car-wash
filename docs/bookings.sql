-- Таблица заказов (для всех: обычных клиентов + организаций)
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Информация о клиенте/водителе
  client_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  car_model VARCHAR(255) NOT NULL,
  plate_number VARCHAR(20) NOT NULL,
  car_type VARCHAR(50) NOT NULL,
  
  -- Услуги и оплата
  services JSONB NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  payment_method VARCHAR(50),
  
  -- Статус и расписание
  status VARCHAR(50) NOT NULL DEFAULT 'ОЖИДАЕТ',
  booking_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  box_number INTEGER,
  
  -- Персонал
  worker_id UUID,
  working_mode VARCHAR(50),
  
  -- Для организаций (NULL для обычных клиентов)
  is_org BOOLEAN DEFAULT false,
  organization_id UUID REFERENCES organizations(id),
  driver_id UUID REFERENCES organization_drivers(id),
  car_id UUID REFERENCES organization_cars(id),
  org_name VARCHAR(255),
  
  -- Подпись водителя (только для организаций)
  signature_obtained BOOLEAN DEFAULT false,
  signed_at TIMESTAMP,
  
  -- Дополнительно
  is_quick_booking BOOLEAN DEFAULT false,
  completed_at TIMESTAMP,
  cancel_comment TEXT,
  
  -- Служебные поля
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_org ON bookings(organization_id);
CREATE INDEX idx_bookings_driver ON bookings(driver_id);
CREATE INDEX idx_bookings_worker ON bookings(worker_id);
CREATE INDEX idx_bookings_box ON bookings(box_number, booking_date);
CREATE INDEX idx_bookings_is_org ON bookings(is_org);
CREATE INDEX idx_bookings_signature ON bookings(signature_obtained);
