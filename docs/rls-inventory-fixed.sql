-- ============================================
-- RLS ПОЛИТИКИ (ИСПРАВЛЕННЫЕ ДЛЯ АДМИНА И ВЛАДЕЛЬЦА)
-- ============================================

-- Сначала удаляем старые политики
DROP POLICY IF EXISTS "Admins can view categories" ON public.inventory_categories;
DROP POLICY IF EXISTS "Admins can insert categories" ON public.inventory_categories;
DROP POLICY IF EXISTS "Admins can update categories" ON public.inventory_categories;

DROP POLICY IF EXISTS "Admins can view items" ON public.inventory_items;
DROP POLICY IF EXISTS "Admins can manage items" ON public.inventory_items;

DROP POLICY IF EXISTS "Admins can view arrivals" ON public.inventory_arrivals;
DROP POLICY IF EXISTS "Admins can insert arrivals" ON public.inventory_arrivals;

DROP POLICY IF EXISTS "Admins can view operations" ON public.inventory_operations;

-- ============================================
-- ПОЛИТИКИ ДЛЯ CATEGORIES
-- ============================================

-- Админы и владельцы могут просматривать категории
CREATE POLICY "Admins and owners can view categories"
  ON public.inventory_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Админы и владельцы могут добавлять категории
CREATE POLICY "Admins and owners can insert categories"
  ON public.inventory_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Админы и владельцы могут обновлять категории
CREATE POLICY "Admins and owners can update categories"
  ON public.inventory_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Админы и владельцы могут удалять категории (мягкое удаление)
CREATE POLICY "Admins and owners can delete categories"
  ON public.inventory_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- ============================================
-- ПОЛИТИКИ ДЛЯ ITEMS
-- ============================================

-- Админы и владельцы могут просматривать товары
CREATE POLICY "Admins and owners can view items"
  ON public.inventory_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Админы и владельцы могут управлять товарами
CREATE POLICY "Admins and owners can manage items"
  ON public.inventory_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- ============================================
-- ПОЛИТИКИ ДЛЯ ARRIVALS
-- ============================================

-- Админы и владельцы могут просматривать приходы
CREATE POLICY "Admins and owners can view arrivals"
  ON public.inventory_arrivals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Админы и владельцы могут добавлять приходы
CREATE POLICY "Admins and owners can insert arrivals"
  ON public.inventory_arrivals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- ============================================
-- ПОЛИТИКИ ДЛЯ OPERATIONS
-- ============================================

-- Админы и владельцы могут просматривать операции
CREATE POLICY "Admins and owners can view operations"
  ON public.inventory_operations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );
