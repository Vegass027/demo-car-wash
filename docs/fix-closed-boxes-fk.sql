-- Исправление внешнего ключа closed_by в таблице closed_boxes
-- Проблема: closed_by ссылается на admins(id), но в App.tsx используется userId из profiles
-- Решение: изменить внешний ключ на ссылку на profiles(id)

-- 1. Удаляем существующий внешний ключ
ALTER TABLE closed_boxes
DROP CONSTRAINT IF EXISTS closed_boxes_closed_by_fkey;

-- 2. Добавляем новый внешний ключ на profiles
ALTER TABLE closed_boxes
ADD CONSTRAINT closed_boxes_closed_by_fkey
FOREIGN KEY (closed_by)
REFERENCES profiles(id)
ON DELETE SET NULL;
