-- Создать bucket для чеков
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', false);

-- Политики для загрузки чеков
CREATE POLICY "Staff can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'expense-receipts' 
  AND 
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner')
  )
);

-- Политики для просмотра чеков
CREATE POLICY "Staff can view receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'expense-receipts' 
  AND 
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner')
  )
);

-- Политики для удаления чеков (если обновляют расход)
CREATE POLICY "Staff can delete receipts"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'expense-receipts' 
  AND 
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'owner')
  )
);
