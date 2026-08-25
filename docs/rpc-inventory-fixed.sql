-- ============================================
-- RPC ФУНКЦИЯ: Приход товара
-- ============================================
CREATE OR REPLACE FUNCTION inventory_arrival(
  p_item_id uuid,
  p_quantity numeric,
  p_total_price numeric,
  p_delivery_date date,
  p_photos text[] DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_name text;
  v_current_qty numeric;
  v_base_qty numeric;
  v_new_current numeric;
  v_new_base numeric;
  v_price_per_unit numeric;
  v_arrival_id uuid;
BEGIN
  -- Получаем текущее состояние товара
  SELECT name, current_quantity, base_quantity
  INTO v_item_name, v_current_qty, v_base_qty
  FROM inventory_items
  WHERE id = p_item_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Item not found'
    );
  END IF;
  
  -- Рассчитываем новые значения
  v_new_current := v_current_qty + p_quantity;
  v_new_base := v_new_current; -- новый максимум!
  v_price_per_unit := p_total_price / p_quantity;
  
  -- Обновляем товар
  UPDATE inventory_items
  SET 
    current_quantity = v_new_current,
    base_quantity = v_new_base,
    last_price_per_unit = v_price_per_unit,
    updated_at = now()
  WHERE id = p_item_id;
  
  -- Создаем запись прихода
  INSERT INTO inventory_arrivals (
    item_id, item_name, quantity, total_price, price_per_unit,
    delivery_date, photos, notes, created_by
  ) VALUES (
    p_item_id, v_item_name, p_quantity, p_total_price, v_price_per_unit,
    p_delivery_date, p_photos, p_notes, p_created_by
  ) RETURNING id INTO v_arrival_id;
  
  -- Логируем операцию
  INSERT INTO inventory_operations (
    item_id, item_name, operation_type,
    quantity_before, quantity_change, quantity_after,
    base_quantity_before, base_quantity_after,
    notes, created_by
  ) VALUES (
    p_item_id, v_item_name, 'arrival',
    v_current_qty, p_quantity, v_new_current,
    v_base_qty, v_new_base,
    format('Приход: %s, сумма: %s₽', p_quantity, p_total_price),
    p_created_by
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'arrival_id', v_arrival_id,
    'new_current_quantity', v_new_current,
    'new_base_quantity', v_new_base,
    'price_per_unit', v_price_per_unit
  );
END;
$$;

-- ============================================
-- RPC ФУНКЦИЯ: Инвентаризация/Остаток (УСТАНАВЛИВАЕТ абсолютное значение)
-- ============================================
CREATE OR REPLACE FUNCTION inventory_restock(
  p_item_id uuid,
  p_quantity numeric,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_name text;
  v_current_qty numeric;
  v_base_qty numeric;
  v_qty_change numeric;
BEGIN
  -- Получаем текущее состояние
  SELECT name, current_quantity, base_quantity
  INTO v_item_name, v_current_qty, v_base_qty
  FROM inventory_items
  WHERE id = p_item_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Item not found'
    );
  END IF;
  
  -- ✅ УСТАНАВЛИВАЕМ абсолютное значение (для инвентаризации)
  -- Пример: было 15, ввели 13 → стало 13
  v_qty_change := p_quantity - v_current_qty;
  
  -- Обновляем current_quantity (base_quantity НЕ трогаем!)
  UPDATE inventory_items
  SET 
    current_quantity = p_quantity,
    updated_at = now()
  WHERE id = p_item_id;
  
  -- Логируем операцию
  INSERT INTO inventory_operations (
    item_id, item_name, operation_type,
    quantity_before, quantity_change, quantity_after,
    base_quantity_before, base_quantity_after,
    notes, created_by
  ) VALUES (
    p_item_id, v_item_name, 'restock',
    v_current_qty, v_qty_change, p_quantity,
    v_base_qty, v_base_qty,
    COALESCE(p_notes, 'Инвентаризация/Остаток'),
    p_created_by
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'new_current_quantity', p_quantity,
    'base_quantity', v_base_qty,
    'quantity_change', v_qty_change
  );
END;
$$;

-- ============================================
-- RPC ФУНКЦИЯ: Добавление категории с товаром
-- ============================================
CREATE OR REPLACE FUNCTION add_inventory_category(
  p_name text,
  p_unit text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_id uuid;
  v_item_id uuid;
BEGIN
  -- Создаём категорию
  INSERT INTO inventory_categories (name, unit)
  VALUES (p_name, p_unit)
  RETURNING id INTO v_category_id;
  
  -- Автоматически создаём товар для этой категории
  INSERT INTO inventory_items (
    category_id, name, unit,
    current_quantity, base_quantity, min_threshold
  ) VALUES (
    v_category_id, p_name, p_unit,
    0, 0, 5
  ) RETURNING id INTO v_item_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'category_id', v_category_id,
    'item_id', v_item_id
  );
END;
$$;
