-- 1️⃣ Создать enum для ролей
CREATE TYPE user_role AS ENUM ('client', 'admin', 'owner');

-- 2️⃣ Создать таблицу профилей
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'client',
  full_name TEXT,
  phone TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3️⃣ Индексы
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_phone ON profiles(phone);

-- 4️⃣ Триггер для автосоздания профиля при регистрации
CREATE OR REPLACE FUNCTION create_profile_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, role, phone)
  VALUES (
    NEW.id, 
    'client', 
    NEW.phone
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_profile_for_user();

-- 5️⃣ RLS политики (МИНИМАЛЬНЫЕ)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Каждый видит свой профиль
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- Админы и владельцы видят все профили (для интерфейса)
CREATE POLICY "Staff can view all profiles"
ON profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles AS p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'owner')
  )
);