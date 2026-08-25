-- ========================================
-- Миграция: Добавление связи между profiles и admins
-- ========================================
-- Цель: Решить проблему закрытия боксов путем создания связи profiles ↔ admins

-- Шаг 1: Добавляем поле profile_id в таблицу admins
ALTER TABLE admins 
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- Шаг 2: Создаем уникальный индекс для profile_id (один profile = один admin)
CREATE UNIQUE INDEX IF NOT EXISTS admins_profile_id_unique ON admins(profile_id);

-- Шаг 3: Обновляем существующие записи admins
-- Сопоставляем admins по полному имени (можно изменить логику сопоставления)
UPDATE admins a
SET profile_id = p.id
FROM profiles p
WHERE p.role = 'admin'
  AND p.full_name = a.full_name
  AND a.profile_id IS NULL;

-- Шаг 4: Делаем profile_id обязательным после обновления данных
ALTER TABLE admins 
  ALTER COLUMN profile_id SET NOT NULL;

-- Шаг 5: Обновляем foreign keys в closed_boxes и daily_reports
-- Сначала удаляем старые foreign keys
ALTER TABLE closed_boxes 
  DROP CONSTRAINT IF EXISTS closed_boxes_closed_by_fkey;

ALTER TABLE daily_reports 
  DROP CONSTRAINT IF EXISTS daily_reports_finalized_by_fkey;

-- Создаем новые foreign keys на admins(profile_id)
ALTER TABLE closed_boxes 
  ADD CONSTRAINT closed_boxes_closed_by_fkey 
  FOREIGN KEY (closed_by) REFERENCES admins(profile_id) 
  ON DELETE SET NULL;

ALTER TABLE daily_reports 
  ADD CONSTRAINT daily_reports_finalized_by_fkey 
  FOREIGN KEY (finalized_by) REFERENCES admins(profile_id) 
  ON DELETE SET NULL;

-- ========================================
-- Проверка миграции
-- ========================================
-- Проверить, что все admins имеют profile_id
-- SELECT id, full_name, profile_id FROM admins WHERE profile_id IS NULL;

-- Проверить, что foreign keys созданы правильно
-- SELECT
--   tc.table_name,
--   kcu.column_name,
--   ccu.table_name AS foreign_table_name,
--   ccu.column_name AS foreign_column_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
--   AND tc.table_schema = kcu.table_schema
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
--   AND ccu.table_schema = tc.table_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_schema = 'public'
--   AND tc.table_name IN ('closed_boxes', 'daily_reports');
