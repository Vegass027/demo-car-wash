-- ============================================================================
-- 038_create_product_sale_atomic.sql  (DEMO only)
-- ----------------------------------------------------------------------------
-- Issue 4: атомарные операции продажи/удаления товара.
--
-- Добавляет 2 SECURITY DEFINER функции:
--   * create_product_sale_atomic(...)  — списывает остаток и создаёт sale row
--                                         одной транзакцией (либо оба, либо ничего)
--   * delete_product_sale_atomic(...)  — читает qty/inventory_item_id ИЗ sale row,
--                                         восстанавливает остаток и удаляет sale
--                                         одной транзакцией
--
-- ЧТО НЕ МЕНЯЕТСЯ (read-only по существующим таблицам/политикам):
--   * Не трогаем RLS на product_sales / inventory_items / inventory_operations
--   * Не трогаем grants (dispatcher использует service_role)
--   * Не трогаем существующие RPC: inventory_usage, inventory_restock,
--     inventory_arrival (остаются для других use-cases)
--   * Не трогаем CHECK constraints
--
-- КЛЮЧЕВЫЕ ИНВАРИАНТЫ:
--   1. Если p_inventory_item_id передан — sale row создаётся ИМЕННО тогда,
--      когда current_quantity уменьшается (одна транзакция).
--   2. Если insert/update внутри функции падает — вся транзакция откатывается,
--      остаток остаётся неизменным (нет phantom-списания).
--   3. delete_product_sale_atomic читает qty/inventory_item_id ВНУТРИ функции
--      через SELECT (защита от устаревших данных на клиенте).
--   4. SELECT ... FOR UPDATE на inventory_items — лок держится до конца
--      функции (plpgsql функция = неявная транзакция).
--
-- SECURITY LOCKDOWN (паттерн идентичен существующим inventory_usage,
-- inventory_restock, atomic_modify_carwash_services на DEMO):
--   * owner = postgres
--   * ACL = {postgres=X/postgres, service_role=X/postgres}, PUBLIC revoked
--   Без REVOKE FROM PUBLIC любой anon/authenticated может вызвать функцию
--   через PostgREST RPC, обходя dispatcher/requireStaff()/RLS — это та же
--   дыра, что закрывала migration 021 для atomic_modify_carwash_services.
--
-- DEMO-ONLY НА ДАННЫЙ МОМЕНТ:
--   * quantity объявлен как integer (соответствует DEMO schema);
--     для применения на PROD (где quantity = numeric) потребуется
--     пересмотреть тип параметра и payload dispatcher'а.
--   * INSERT в product_sales БЕЗ total_price — на DEMO колонка GENERATED,
--     на PROD это NOT NULL обычная колонка → на PROD INSERT сломается.
--     Сейчас миграция предназначена только для DEMO.
-- ============================================================================

-- ============================================================================
-- 1. create_product_sale_atomic
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_product_sale_atomic(
  p_inventory_item_id uuid DEFAULT NULL,
  p_quantity          integer DEFAULT NULL,
  p_price_per_unit    numeric DEFAULT NULL,
  p_product_name      text    DEFAULT NULL,
  p_created_by        uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item_name      text;
  v_current_qty    numeric;
  v_base_qty       numeric;
  v_new_current    numeric;
  v_total          numeric;
  v_sale_id        uuid;
BEGIN
  -- Manual-mode: продажа без привязки к складу.
  IF p_inventory_item_id IS NULL THEN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_quantity');
    END IF;
    IF p_price_per_unit IS NULL OR p_price_per_unit <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_price');
    END IF;
    IF p_product_name IS NULL OR length(trim(p_product_name)) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_product_name');
    END IF;

    v_total := p_quantity::numeric * p_price_per_unit;

    INSERT INTO product_sales (
      product_name, quantity, price_per_unit,
      inventory_item_id, created_by
    ) VALUES (
      trim(p_product_name), p_quantity, p_price_per_unit,
      NULL, p_created_by
    )
    RETURNING id INTO v_sale_id;

    RETURN jsonb_build_object(
      'success', true,
      'sale_id', v_sale_id,
      'total_price', v_total,
      'inventory_item_id', NULL,
      'quantity', p_quantity,
      'new_current_quantity', NULL
    );
  END IF;

  -- Inventory-mode: SELECT ... FOR UPDATE — лок до конца транзакции.
  SELECT name, current_quantity, base_quantity
  INTO   v_item_name, v_current_qty, v_base_qty
  FROM   inventory_items
  WHERE  id = p_inventory_item_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'inventory_item_not_found',
      'inventory_item_id', p_inventory_item_id
    );
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_quantity');
  END IF;
  IF p_price_per_unit IS NULL OR p_price_per_unit <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_price');
  END IF;

  -- Insufficient stock — явная проверка ДО UPDATE.
  IF p_quantity > v_current_qty THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_stock',
      'available', v_current_qty,
      'requested', p_quantity
    );
  END IF;

  v_new_current := v_current_qty - p_quantity;
  v_total := p_quantity::numeric * p_price_per_unit;

  UPDATE inventory_items
  SET    current_quantity = v_new_current,
         updated_at = now()
  WHERE  id = p_inventory_item_id;

  INSERT INTO inventory_operations (
    item_id, item_name, operation_type,
    quantity_before, quantity_change, quantity_after,
    base_quantity_before, base_quantity_after,
    notes, created_by
  ) VALUES (
    p_inventory_item_id, v_item_name, 'usage',
    v_current_qty, -p_quantity, v_new_current,
    v_base_qty, v_base_qty,
    format('Продажа товара: %s × %s₽', p_quantity, p_price_per_unit),
    p_created_by
  );

  -- INSERT без total_price — на DEMO GENERATED посчитает сама.
  INSERT INTO product_sales (
    product_name, quantity, price_per_unit,
    inventory_item_id, created_by
  ) VALUES (
    v_item_name, p_quantity, p_price_per_unit,
    p_inventory_item_id, p_created_by
  )
  RETURNING id INTO v_sale_id;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'total_price', v_total,
    'inventory_item_id', p_inventory_item_id,
    'quantity', p_quantity,
    'new_current_quantity', v_new_current
  );
END;
$$;

-- ============================================================================
-- 2. delete_product_sale_atomic
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_product_sale_atomic(
  p_sale_id     uuid,
  p_restored_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inventory_item_id uuid;
  v_quantity          integer;
  v_item_name         text;
  v_current_qty       numeric;
  v_base_qty          numeric;
  v_new_current       numeric;
BEGIN
  -- Source-of-truth: читаем qty/inventory_item_id из самой sale row.
  SELECT inventory_item_id, quantity
  INTO   v_inventory_item_id, v_quantity
  FROM   product_sales
  WHERE  id = p_sale_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'sale_not_found',
      'sale_id', p_sale_id
    );
  END IF;

  -- Manual-mode: просто удаляем, остаток не трогаем.
  IF v_inventory_item_id IS NULL THEN
    DELETE FROM product_sales WHERE id = p_sale_id;
    RETURN jsonb_build_object(
      'success', true,
      'deleted', true,
      'restocked', false,
      'inventory_item_id', NULL,
      'quantity', v_quantity
    );
  END IF;

  -- Inventory-mode: lock and restock.
  SELECT name, current_quantity, base_quantity
  INTO   v_item_name, v_current_qty, v_base_qty
  FROM   inventory_items
  WHERE  id = v_inventory_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Orphan edge case: inventory item удалён, FK ещё не nulled.
    -- Безопасно: удаляем sale row, остаток не восстанавливаем (нечего).
    DELETE FROM product_sales WHERE id = p_sale_id;
    RETURN jsonb_build_object(
      'success', true,
      'deleted', true,
      'restocked', false,
      'inventory_item_id', v_inventory_item_id,
      'warning', 'inventory_item_missing'
    );
  END IF;

  v_new_current := v_current_qty + v_quantity;

  UPDATE inventory_items
  SET    current_quantity = v_new_current,
         updated_at = now()
  WHERE  id = v_inventory_item_id;

  INSERT INTO inventory_operations (
    item_id, item_name, operation_type,
    quantity_before, quantity_change, quantity_after,
    base_quantity_before, base_quantity_after,
    notes, created_by
  ) VALUES (
    v_inventory_item_id, v_item_name, 'restock',
    v_current_qty, v_quantity, v_new_current,
    v_base_qty, v_base_qty,
    'Восстановление остатка после удаления продажи',
    p_restored_by
  );

  DELETE FROM product_sales WHERE id = p_sale_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', true,
    'restocked', true,
    'inventory_item_id', v_inventory_item_id,
    'quantity', v_quantity,
    'new_current_quantity', v_new_current
  );
END;
$$;

-- ============================================================================
-- Комментарии к функциям
-- ============================================================================
COMMENT ON FUNCTION public.create_product_sale_atomic(uuid, integer, numeric, text, uuid)
  IS 'Issue 4: атомарное создание продажи товара — списание остатка (если привязан) + INSERT в product_sales одной транзакцией. SECURITY DEFINER для обхода RLS при записи от service_role dispatcher.';

COMMENT ON FUNCTION public.delete_product_sale_atomic(uuid, uuid)
  IS 'Issue 4: атомарное удаление продажи — читает qty/inventory_item_id из самой sale row, восстанавливает остаток (если был привязан) + DELETE одной транзакцией. SECURITY DEFINER.';

-- ============================================================================
-- Security lockdown (паттерн как у inventory_usage / inventory_restock /
-- atomic_modify_carwash_services на DEMO).
--
-- Фактический ACL существующих функций (проверено через pg_proc.proacl):
--   {postgres=X/postgres, service_role=X/postgres}
-- Это значит PUBLIC уже REVOKED (нет =X/...), и EXECUTE дан только
-- service_role (плюс owner postgres).
--
-- Postgres после REVOKE FROM PUBLIC сохраняет EXECUTE для owner.
-- ============================================================================

ALTER FUNCTION public.create_product_sale_atomic(uuid, integer, numeric, text, uuid) OWNER TO postgres;
ALTER FUNCTION public.delete_product_sale_atomic(uuid, uuid) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.create_product_sale_atomic(uuid, integer, numeric, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_product_sale_atomic(uuid, integer, numeric, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_product_sale_atomic(uuid, integer, numeric, text, uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.create_product_sale_atomic(uuid, integer, numeric, text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_product_sale_atomic(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_product_sale_atomic(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_product_sale_atomic(uuid, uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_product_sale_atomic(uuid, uuid) TO service_role;
