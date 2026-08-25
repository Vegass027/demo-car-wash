-- ============================================
-- FIX STORAGE RLS POLICIES FOR CUSTOM AUTH
-- ============================================
-- Проблема: Storage RLS политики используют auth.uid()
-- Решение: Удаляем старые политики и создаем новые, разрешающие все операции
-- ============================================

-- ============================================
-- BUCKET: expense-receipts
-- ============================================
-- Удаляем все старые политики для bucket expense-receipts
DROP POLICY IF EXISTS "Users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete receipts" ON storage.objects;

-- Создаем политики, разрешающие все операции
CREATE POLICY "Allow all operations on expense-receipts"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'expense-receipts')
WITH CHECK (bucket_id = 'expense-receipts');

-- ============================================
-- BUCKET: inventory-photos
-- ============================================
-- Удаляем все старые политики для bucket inventory-photos
DROP POLICY IF EXISTS "Users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete photos" ON storage.objects;

-- Создаем политики, разрешающие все операции
CREATE POLICY "Allow all operations on inventory-photos"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'inventory-photos')
WITH CHECK (bucket_id = 'inventory-photos');

-- ============================================
-- ПРИМЕЧАНИЕ
-- ============================================
-- В реальном приложении нужно использовать более строгие политики
-- на основе user_id в пути к файлу
-- ============================================
