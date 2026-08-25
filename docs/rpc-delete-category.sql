-- ============================================
-- RPC ФУНКЦИЯ: Удаление категории с товаром
-- ============================================

CREATE OR REPLACE FUNCTION delete_inventory_category(
  p_category_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_count integer;
BEGIN
  -- Проверяем, есть ли товары в этой категории
  SELECT COUNT(*) INTO v_item_count
  FROM inventory_items
  WHERE category_id = p_category_id AND is_active = true;

  -- Если есть товары, помечаем их как неактивные
  IF v_item_count > 0 THEN
    UPDATE inventory_items
    SET is_active = false, updated_at = now()
    WHERE category_id = p_category_id AND is_active = true;
  END IF;

  -- Помечаем категорию как неактивную
  UPDATE inventory_categories
  SET is_active = false, updated_at = now()
  WHERE id = p_category_id AND is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'items_deleted', v_item_count
  );
END;
$$;
