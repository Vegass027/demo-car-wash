-- Создаем правильную таблицу
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  service_type VARCHAR(50) NOT NULL,
  category VARCHAR(50),
  price_sedan NUMERIC(10, 2),
  price_crossover NUMERIC(10, 2),
  price_jeep NUMERIC(10, 2),
  price_large_suv NUMERIC(10, 2),
  price_minivan NUMERIC(10, 2),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_services_type ON services(service_type);

-- Загружаем услуги ИЗ ФОТО
INSERT INTO services (service_id, name, service_type, category, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan, sort_order) VALUES
('body-wash', 'Бесконтактная мойка кузова', 'carwash', 'basic', 550, 600, 700, 900, 900, 1),
('salon-vacuum', 'Чистка/уборка салона', 'carwash', 'basic', 350, 400, 500, 600, 600, 2),
('full-wash', 'Полная мойка (кузов + салон)', 'carwash', 'basic', 900, 1000, 1200, 1500, 1500, 3),
('trunk-clean', 'Чистка багажника', 'carwash', 'basic', 150, 200, 200, 300, 150, 4),
('rubber-mats-wash', 'Мойка резиновых ковриков', 'carwash', 'basic', 150, 150, 150, 150, 200, 5),
('textile-mats-shampoo', 'Мойка ворсовых ковр. с шампунем', 'carwash', 'basic', 200, 200, 200, 200, 300, 6),
('salon-vacuum-only', 'Уборка салона пылесосом', 'carwash', 'basic', 200, 200, 300, 300, 300, 7),
('salon-wet-cleaning', 'Влажная уборка салона', 'carwash', 'basic', 200, 200, 200, 300, 300, 8),
('tech-wash-no-wipe', 'Техническая мойка (не вытираем)', 'carwash', 'basic', 450, 500, 550, 700, 700, 9),
('tech-wash-with-wipe', 'Техническая мойка (без шампуня)', 'carwash', 'basic', 350, 400, 450, 600, 600, 10),
('plastic-polish', 'Полировка пластика панели', 'carwash', 'additional', 200, 200, 200, 200, 200, 20),
('panel-plastic-polish', 'Полировка панели и пластика', 'carwash', 'additional', 300, 300, 300, 300, 400, 21),
('rubber-blackening', 'Чернение резины', 'carwash', 'additional', 200, 200, 200, 300, 200, 22),
('wax-coating', 'Покрытие воском', 'carwash', 'additional', 300, 300, 350, 400, 400, 23),
('nano-wax', 'Покрытие НАНО воском', 'carwash', 'additional', 500, 500, 700, 700, 700, 24),
('engine-wash-start', 'Мойка двигателя', 'carwash', 'additional', 500, 600, 700, 700, 600, 25),
('engine-wash-no-start', 'Тех. мойка двигателя', 'carwash', 'additional', 300, 350, 400, 400, 400, 26),
('stain-removal', 'Снятие битума', 'carwash', 'additional', 150, 150, 150, 150, 150, 27),
('headlight-clean', 'Удаление мошек с фомаров', 'carwash', 'additional', 200, 200, 200, 200, 200, 28),
('silicone-rubber', 'Смазать резиновые уплотнители', 'carwash', 'additional', 200, 200, 200, 200, 200, 29),
('air-conditioning', 'Кондиционер кожи салона', 'carwash', 'additional', 300, 300, 400, 400, 500, 30),
('full-dry-clean', 'Химчистка всех сидений', 'carwash', 'additional', 3500, 3500, 4500, 4500, 5000, 31),
('salon-dry-clean', 'Химчистка салона', 'carwash', 'additional', 8000, 9000, 10000, 10000, 11000, 32),
('glass-clean', 'Уход за стеклами изнутри', 'carwash', 'additional', 100, 150, 200, 200, 300, 33),
('wheel-clean', 'Чистка дисков от нагара', 'carwash', 'additional', 400, 500, 500, 500, 500, 34);
