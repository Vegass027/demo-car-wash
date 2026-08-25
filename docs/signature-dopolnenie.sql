-- 1. Профиль водителя (текущая активная подпись)
ALTER TABLE organization_drivers 
ADD COLUMN signature_data TEXT,  -- base64 PNG
ADD COLUMN signature_updated_at TIMESTAMP;

-- 2. Заказ (копия подписи на момент заказа)
ALTER TABLE bookings 
ADD COLUMN signature_data TEXT,  -- копия из профиля водителя
ADD COLUMN signature_obtained_at TIMESTAMP;

-- 3. Ведомости (ссылка + копия для надежности)
ALTER TABLE worksheet_entries
-- signature_data уже есть
ADD COLUMN driver_id UUID REFERENCES organization_drivers(id);
