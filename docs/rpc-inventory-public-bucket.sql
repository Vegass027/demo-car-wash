-- ============================================
-- Включаем публичный доступ к bucket inventory-photos
-- ============================================

-- Обновляем bucket, делая его публичным
UPDATE storage.buckets
SET public = true
WHERE name = 'inventory-photos';

-- Добавляем политику для публичного чтения
CREATE POLICY "Public Access to inventory-photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'storage.inventory-photos'::text);

-- Добавляем политику для загрузки файлов (только для авторизованных пользователей)
CREATE POLICY "Authenticated users can upload to inventory-photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'storage.inventory-photos'::text
  AND auth.role() = 'authenticated'
);

-- Добавляем политику для удаления файлов (только для авторизованных пользователей)
CREATE POLICY "Authenticated users can delete from inventory-photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'storage.inventory-photos'::text
  AND auth.role() = 'authenticated'
);
