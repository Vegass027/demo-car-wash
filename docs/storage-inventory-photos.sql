-- ============================================
-- СОЗДАНИЕ BUCKET ЧЕРЕЗ SQL
-- ============================================

-- Создать bucket для фото накладных
INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory-photos', 'inventory-photos', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- RLS ПОЛИТИКИ ДЛЯ INVENTORY-PHOTOS BUCKET
-- ============================================

-- Политика: Админы могут загружать фото
CREATE POLICY "Admins can upload inventory photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'inventory-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Политика: Админы и владельцы могут просматривать фото
CREATE POLICY "Admins and owners can view inventory photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'inventory-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner')
  )
);

-- Политика: Админы могут удалять фото
CREATE POLICY "Admins can delete inventory photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'inventory-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Политика: Админы могут обновлять фото
CREATE POLICY "Admins can update inventory photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'inventory-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
