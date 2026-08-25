-- 1. FK constraint для worker_id
ALTER TABLE tire_bookings 
ADD CONSTRAINT tire_bookings_worker_id_fkey 
FOREIGN KEY (worker_id) REFERENCES tire_workers(id);

-- 2. Индексы (только недостающие)
CREATE INDEX idx_tire_bookings_booking_date ON tire_bookings(booking_date);
CREATE INDEX idx_tire_bookings_start_time ON tire_bookings(start_time);

-- 3. updated_at для tire_services
ALTER TABLE tire_services 
ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
