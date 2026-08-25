-- Исправление: Заработок мастера шиномонтажа должен начисляться ТОЛЬКО на earned_today
-- НЕ на current_balance! Перевод на current_balance происходит через transferDailyEarningsToBalance

-- До исправления: функция начисляла на earned_today И на current_balance
-- После исправления: функция начисляет ТОЛЬКО на earned_today

CREATE OR REPLACE FUNCTION public.add_tire_worker_earnings(
  p_worker_id uuid, 
  p_booking_id uuid, 
  p_earnings numeric
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_worker tire_workers;
  v_booking_id_str TEXT;
BEGIN
  -- Преобразуем UUID в строку для сравнения с массивом
  v_booking_id_str := p_booking_id::TEXT;
  
  SELECT * INTO v_worker
  FROM tire_workers
  WHERE id = p_worker_id
  FOR UPDATE;

  -- Проверяем, что заказ еще не начислен
  IF v_booking_id_str = ANY(v_worker.completed_bookings) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Already added',
      'worker', row_to_json(v_worker)
    );
  END IF;

  -- ✅ ИСПРАВЛЕНО: начисляем ТОЛЬКО на earned_today
  -- current_balance НЕ обновляем! Перенос будет через transferDailyEarningsToBalance
  UPDATE tire_workers
  SET
    earned_today = earned_today + p_earnings,
    cars_today = cars_today + 1,
    completed_bookings = array_append(completed_bookings, v_booking_id_str),
    updated_at = NOW()
  WHERE id = p_worker_id
  RETURNING * INTO v_worker;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Earnings added',
    'worker', row_to_json(v_worker)
  );
END;
$function$;
