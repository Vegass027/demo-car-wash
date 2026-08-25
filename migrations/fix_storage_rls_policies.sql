-- Fix Storage RLS policies to work without Supabase Auth
-- Remove policies using auth.uid() and auth.role() (they don't work with custom auth)

-- Удаляем политики для inventory-photos которые используют auth.uid()
DROP POLICY IF EXISTS "Admins can delete inventory photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update inventory photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload inventory photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from inventory-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to inventory-photos" ON storage.objects;

-- Удаляем политики для expense-receipts которые используют auth.uid() и get_user_role()
DROP POLICY IF EXISTS "Staff can delete receipts" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view receipts" ON storage.objects;

-- Примечание: Правильные политики уже существуют и работают:
-- - "Allow all operations on expense-receipts" (разрешает всё для чеков)
-- - "Allow all operations on inventory-photos" (разрешает всё для фото)
-- - "Public Access to inventory-photos" (публичный доступ на чтение)
