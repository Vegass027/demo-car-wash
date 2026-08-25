-- Добавление тестовых услуг для СБП платежей (по 1 рублю)

-- Тестовые услуги автомойки (категория 'basic' для совместимости с фронтендом)
INSERT INTO services (service_id, name, service_type, category, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan, is_active, sort_order) VALUES
('test_sbp_wash', 'Тестовая мойка (СБП)', 'wash', 'basic', 1.00, 1.00, 1.00, 1.00, 1.00, true, 1),
('test_sbp_wax', 'Тестовый воск (СБП)', 'wax', 'basic', 1.00, 1.00, 1.00, 1.00, 1.00, true, 2),
('test_sbp_polish', 'Тестовая полировка (СБП)', 'polish', 'basic', 1.00, 1.00, 1.00, 1.00, 1.00, true, 3);

-- Тестовые услуги шиномонтажа (категория 'ТЕСТ' для отображения в UI)
INSERT INTO tire_services (category, name, price, description, is_active, duration_minutes) VALUES
('ТЕСТ', 'Тестовая шиномонтаж (СБП)', 1, 'Тестовая услуга для проверки СБП платежей', true, 30),
('ТЕСТ', 'Тестовый балансировка (СБП)', 1, 'Тестовая услуга для проверки СБП платежей', true, 15),
('ТЕСТ', 'Тестовый ремонт (СБП)', 1, 'Тестовая услуга для проверки СБП платежей', true, 20);
