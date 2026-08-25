-- Добавление CHECK constraint для payment_method в таблице bookings
-- Ограничивает возможные значения способа оплаты

-- Добавляем CHECK constraint
ALTER TABLE bookings
ADD CONSTRAINT bookings_payment_method_check
CHECK (
  (payment_method IS NULL) OR
  (payment_method)::text = ANY (ARRAY['Наличный', 'Безналичный', 'Перевод', 'СБП']::text[])
);

-- Добавляем комментарий к constraint
COMMENT ON CONSTRAINT bookings_payment_method_check ON bookings IS 'Ограничение возможных значений способа оплаты: Наличный, Безналичный, Перевод, СБП';
