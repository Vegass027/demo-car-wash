-- Исправление RPC функции add_worker_earnings
-- Проблема: при закрытии заказа деньги начислялись и на earned_today (ежедневный баланс) и на current_balance (итоговый баланс)
-- Правильная логика:
-- 1. Базовая ставка (1 раз за день) → начисляется на current_balance через selectWorkerModeSolo/selectWorkerPairMode
-- 2. Процент от чека (за каждый заказ) → начисляется ТОЛЬКО на earned_today (ежедневный баланс)
-- 3. Перевод с ежедневного на итоговый баланс → вручную или через крон

-- Сначала удаляем старую функцию
DROP FUNCTION IF EXISTS add_worker_earnings;

-- Создаем новую функцию БЕЗ начисления на current_balance
CREATE OR REPLACE FUNCTION add_worker_earnings(
  p_worker_id UUID,
  p_booking_id UUID,
  p_earnings NUMERIC,
  p_cars INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_worker workers;
  v_booking_id_str TEXT;
BEGIN
  -- Преобразуем UUID в строку для сравнения с массивом
  v_booking_id_str := p_booking_id::TEXT;
  
  -- ✅ Блокируем строку работника (FOR UPDATE = блокировка от одновременных запросов)
  SELECT * INTO v_worker
  FROM workers
  WHERE id = p_worker_id
  FOR UPDATE;

  -- ✅ Проверка: bookingId уже в массиве?
  IF v_booking_id_str = ANY(v_worker.completed_bookings) THEN
    -- ✅ Уже начислено - возвращаем текущего работника
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Already added',
      'worker', row_to_json(v_worker)
    );
  END IF;

  -- ✅ Обновляем работника - ТОЛЬКО на earned_today (ежедневный баланс)
  -- ❌ НЕ начисляем на current_balance (итоговый баланс) - это делается только при переводе!
  UPDATE workers
  SET
    earned_today = earned_today + p_earnings,  -- ✅ Начисляем на ЕЖЕДНЕВНЫЙ баланс
    -- current_balance = current_balance + p_earnings,  -- ❌ УБРАНО! Не начисляем на ИТОГОВЫЙ баланс
    cars_today = cars_today + p_cars,
    completed_bookings = array_append(completed_bookings, v_booking_id_str),
    updated_at = NOW()
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  -- ✅ Возвращаем обновленного работника
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Earnings added',
    'worker', row_to_json(v_worker)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
