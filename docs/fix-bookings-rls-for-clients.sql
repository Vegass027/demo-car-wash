-- Миграция: Исправление RLS политик для bookings и tire_bookings
-- Дата: 2025-02-15
-- Описание: Ограничение доступа клиентов только к своим записям

-- ============================================
-- УДАЛЯЕМ СТАРЫЕ ПОЛИТИКИ
-- ============================================

-- Bookings
DROP POLICY IF EXISTS "Allow all operations on bookings" ON bookings;

-- Tire Bookings
DROP POLICY IF EXISTS "Allow all operations on tire_bookings" ON tire_bookings;

-- ============================================
-- СОЗДАЕМ НОВЫЕ ПОЛИТИКИ С ФИЛЬТРАЦИЕЙ ПО created_by_profile_id
-- ============================================

-- Bookings: клиенты могут видеть только свои записи
-- Для этого используем подзапрос, который находит profile_id по telegram_id из JWT токена
CREATE POLICY "Clients can view own bookings"
ON bookings FOR SELECT
TO public
USING (
  created_by_profile_id IN (
    SELECT id FROM profiles 
    WHERE telegram_id = (
      SELECT (auth.jwt()->>'telegram_id')::bigint
    )
  )
);

-- Bookings: клиенты могут создавать только свои записи
CREATE POLICY "Clients can create own bookings"
ON bookings FOR INSERT
TO public
WITH CHECK (
  created_by_profile_id IN (
    SELECT id FROM profiles 
    WHERE telegram_id = (
      SELECT (auth.jwt()->>'telegram_id')::bigint
    )
  )
);

-- Bookings: клиенты могут обновлять только свои записи
CREATE POLICY "Clients can update own bookings"
ON bookings FOR UPDATE
TO public
USING (
  created_by_profile_id IN (
    SELECT id FROM profiles 
    WHERE telegram_id = (
      SELECT (auth.jwt()->>'telegram_id')::bigint
    )
  )
)
WITH CHECK (
  created_by_profile_id IN (
    SELECT id FROM profiles 
    WHERE telegram_id = (
      SELECT (auth.jwt()->>'telegram_id')::bigint
    )
  )
);

-- Bookings: клиенты могут удалять только свои записи
CREATE POLICY "Clients can delete own bookings"
ON bookings FOR DELETE
TO public
USING (
  created_by_profile_id IN (
    SELECT id FROM profiles 
    WHERE telegram_id = (
      SELECT (auth.jwt()->>'telegram_id')::bigint
    )
  )
);

-- Tire Bookings: клиенты могут видеть только свои записи
CREATE POLICY "Clients can view own tire bookings"
ON tire_bookings FOR SELECT
TO public
USING (
  created_by_profile_id IN (
    SELECT id FROM profiles 
    WHERE telegram_id = (
      SELECT (auth.jwt()->>'telegram_id')::bigint
    )
  )
);

-- Tire Bookings: клиенты могут создавать только свои записи
CREATE POLICY "Clients can create own tire bookings"
ON tire_bookings FOR INSERT
TO public
WITH CHECK (
  created_by_profile_id IN (
    SELECT id FROM profiles 
    WHERE telegram_id = (
      SELECT (auth.jwt()->>'telegram_id')::bigint
    )
  )
);

-- Tire Bookings: клиенты могут обновлять только свои записи
CREATE POLICY "Clients can update own tire bookings"
ON tire_bookings FOR UPDATE
TO public
USING (
  created_by_profile_id IN (
    SELECT id FROM profiles 
    WHERE telegram_id = (
      SELECT (auth.jwt()->>'telegram_id')::bigint
    )
  )
)
WITH CHECK (
  created_by_profile_id IN (
    SELECT id FROM profiles 
    WHERE telegram_id = (
      SELECT (auth.jwt()->>'telegram_id')::bigint
    )
  )
);

-- Tire Bookings: клиенты могут удалять только свои записи
CREATE POLICY "Clients can delete own tire bookings"
ON tire_bookings FOR DELETE
TO public
USING (
  created_by_profile_id IN (
    SELECT id FROM profiles 
    WHERE telegram_id = (
      SELECT (auth.jwt()->>'telegram_id')::bigint
    )
  )
);

-- ============================================
-- ПРИМЕЧАНИЕ
-- ============================================
-- Эти политики используют auth.jwt()->>'telegram_id' для получения telegram_id из JWT токена.
-- Если telegram_id не найден в токене, политики вернут false и доступ будет запрещен.
-- 
-- Для работы этих политик необходимо:
-- 1. Убедиться, что JWT токен содержит telegram_id в claims
-- 2. Если telegram_id отсутствует, нужно настроить кастомные claims в Supabase Auth
-- 
-- В качестве альтернативы можно использовать service_role ключ для админских операций
-- и фильтрацию на уровне приложения для клиентских операций.
