-- ============================================
-- ТАБЛИЦЫ ДЛЯ СКЛАДА
-- ============================================

-- 1. Категории товаров
CREATE TABLE public.inventory_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('штуки', 'литры', 'канистры')),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_categories_pkey PRIMARY KEY (id)
);

-- 2. Товары на складе
CREATE TABLE public.inventory_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  name text NOT NULL,
  unit text NOT NULL,
  current_quantity numeric DEFAULT 0 CHECK (current_quantity >= 0),
  base_quantity numeric DEFAULT 0 CHECK (base_quantity >= 0),
  min_threshold numeric DEFAULT 5,
  last_price_per_unit numeric,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_items_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) 
    REFERENCES public.inventory_categories(id) ON DELETE CASCADE
);

-- 3. История прихода товаров
CREATE TABLE public.inventory_arrivals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  item_name text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  total_price numeric NOT NULL CHECK (total_price > 0),
  price_per_unit numeric NOT NULL CHECK (price_per_unit > 0),
  delivery_date date NOT NULL,
  photos text[], -- массив URLs из Supabase Storage
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_arrivals_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_arrivals_item_id_fkey FOREIGN KEY (item_id) 
    REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  CONSTRAINT inventory_arrivals_created_by_fkey FOREIGN KEY (created_by) 
    REFERENCES public.profiles(id)
);

-- 4. Лог всех операций со складом
CREATE TABLE public.inventory_operations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  item_name text NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('arrival', 'restock', 'usage', 'revision')),
  quantity_before numeric NOT NULL,
  quantity_change numeric NOT NULL,
  quantity_after numeric NOT NULL,
  base_quantity_before numeric,
  base_quantity_after numeric,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_operations_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_operations_item_id_fkey FOREIGN KEY (item_id) 
    REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  CONSTRAINT inventory_operations_created_by_fkey FOREIGN KEY (created_by) 
    REFERENCES public.profiles(id)
);

-- 5. Индексы для производительности
CREATE INDEX idx_inventory_items_category_id ON public.inventory_items(category_id);
CREATE INDEX idx_inventory_items_active ON public.inventory_items(is_active) WHERE is_active = true;
CREATE INDEX idx_inventory_arrivals_item_id ON public.inventory_arrivals(item_id);
CREATE INDEX idx_inventory_arrivals_delivery_date ON public.inventory_arrivals(delivery_date DESC);
CREATE INDEX idx_inventory_operations_item_id ON public.inventory_operations(item_id);
CREATE INDEX idx_inventory_operations_created_at ON public.inventory_operations(created_at DESC);

-- 6. Триггер для updated_at
CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inventory_categories_updated_at
  BEFORE UPDATE ON public.inventory_categories
  FOR EACH ROW EXECUTE FUNCTION update_inventory_updated_at();

CREATE TRIGGER trigger_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_inventory_updated_at();

-- 7. Комментарии
COMMENT ON TABLE public.inventory_categories IS 'Категории товаров на складе';
COMMENT ON TABLE public.inventory_items IS 'Товары на складе с текущими остатками';
COMMENT ON TABLE public.inventory_arrivals IS 'История прихода товаров';
COMMENT ON TABLE public.inventory_operations IS 'Полный лог всех операций со складом';
COMMENT ON COLUMN public.inventory_items.base_quantity IS 'Динамический максимум (100% на прогресс-баре)';
COMMENT ON COLUMN public.inventory_items.current_quantity IS 'Текущий остаток на складе';
