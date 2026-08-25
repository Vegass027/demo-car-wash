# 📊 АНАЛИТИЧЕСКИЙ ОТЧЁТ: Онлайн-запись

**Дата:** 2026-01-18
**Проект:** car-wash-admin-pro-dovatora
**Статус:** ✅ План реализуем с небольшими корректировками

---

## 1. ТЕКУЩАЯ СТРУКТУРА БД

### 1.1. Ключевые таблицы

| Таблица | Записей | Статус | Примечание |
|---------|---------|--------|-----------|
| `profiles` | 2 | ✅ RLS enabled | Роли: client, admin, owner |
| `clients` | 4 | ✅ | Уже имеет `client_id` FK |
| `client_cars` | 6 | ✅ | Машины клиентов |
| `bookings` | 20 | ✅ | Автомойка |
| `tire_bookings` | 15 | ✅ | Шиномонтаж |
| `services` | 25 | ✅ | Услуги автомойки |
| `tire_services` | 44 | ✅ | Услуги шиномонтажа |

### 1.2. Существующие связи

```
profiles (client role)
    ↓ (profile_id - ДОБАВИТЬ)
clients
    ↓ (client_id)
bookings / tire_bookings
    ↓ (client_car_id)
client_cars
```

**Уже работает:**
- ✅ `bookings.client_id` → `clients.id`
- ✅ `tire_bookings.client_id` → `clients.id`
- ✅ `bookings.client_car_id` → `client_cars.id`
- ✅ `tire_bookings.client_car_id` → `client_cars.id`

### 1.3. Логика шиномонтажа (уже работает!)

**Структура записи:**
```sql
booking_date: '2026-01-30'
start_time: '12:30:00'
estimated_duration: 90  -- минуты
```

**Расчёт end_time:**
```sql
end_time = start_time + estimated_duration minutes
-- 12:30:00 + 90 мин = 14:00:00
```

**Статусы:** `ОЖИДАЕТ`, `В РАБОТЕ`, `ГОТОВО`, `ОТМЕНЕНО`, `ПРОСРОЧЕН`

**Линейное расписание:**
- Один поток (один пост)
- Свободные окна = gaps между записями
- Gap = (предыдущая_запись.end_time) - (текущая_запись.start_time)

---

## 2. АНАЛИЗ SQL КОДА

### 2.1. ✅ Корректные изменения

#### 1. Расширение `bookings`
```sql
ADD COLUMN booking_source VARCHAR DEFAULT 'admin' CHECK (booking_source IN ('admin', 'online')),
ADD COLUMN created_by_profile_id UUID REFERENCES profiles(id);
```
**Статус:** ✅ **ПРИМЕНЯЕМ**
- Поле `booking_source` для фильтрации источника записи
- Поле `created_by_profile_id` для связи с профилем клиента
- CHECK constraint для валидации значений

#### 2. Расширение `tire_bookings`
```sql
ADD COLUMN booking_source VARCHAR DEFAULT 'admin' CHECK (booking_source IN ('admin', 'online')),
ADD COLUMN created_by_profile_id UUID REFERENCES profiles(id);
```
**Статус:** ✅ **ПРИМЕНЯЕМ**
- Аналогично `bookings`

#### 3. Связь `clients` → `profiles`
```sql
ADD COLUMN profile_id UUID UNIQUE REFERENCES profiles(id),
ADD COLUMN online_booking_blocked_until DATE;
```
**Статус:** ✅ **ПРИМЕНЯЕМ**
- `profile_id` для связи клиента с профилем авторизации
- `online_booking_blocked_until` для блокировки после 3+ отмен
- UNIQUE constraint = один клиент = один профиль

#### 4. Индекс на `clients.phone`
```sql
CREATE INDEX idx_clients_phone ON clients(phone);
```
**Статус:** ❌ **УЖЕ СУЩЕСТВУЕТ** - удалить из SQL

#### 5. Таблица `loyalty_carwash_progress`
```sql
CREATE TABLE loyalty_carwash_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  total_washes_with_body INTEGER DEFAULT 0,
  last_booking_id UUID REFERENCES bookings(id),
  last_wash_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```
**Статус:** ✅ **ПРИМЕНЯЕМ**
- Счётчик моек с кузовом
- Связь с клиентом
- Отслеживание последней мойки

#### 6. Таблица `booking_settings`
```sql
CREATE TABLE booking_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type VARCHAR NOT NULL CHECK (service_type IN ('carwash', 'tire')),
  work_start_time TIME NOT NULL DEFAULT '08:00',
  work_end_time TIME NOT NULL DEFAULT '17:00',
  online_booking_enabled BOOLEAN DEFAULT TRUE,
  max_days_ahead INTEGER DEFAULT 3,
  total_boxes INTEGER DEFAULT 3,
  slot_duration_minutes INTEGER DEFAULT 60,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO booking_settings (service_type, total_boxes) 
VALUES ('carwash', 3), ('tire', 1);
```
**Статус:** ✅ **ПРИМЕНЯЕМ**
- Настройки для каждого типа сервиса
- Рабочие часы: 08:00-17:00
- 3 дня вперёд
- 3 бокса для автомойки, 1 для шиномонтажа

#### 7. Таблица `booking_cancellations`
```sql
CREATE TABLE booking_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  booking_id UUID REFERENCES bookings(id),
  tire_booking_id UUID REFERENCES tire_bookings(id),
  cancelled_at TIMESTAMP DEFAULT NOW(),
  reason TEXT
);
```
**Статус:** ✅ **ПРИМЕНЯЕМ**
- Логирование всех отмен
- Связь с клиентом
- Причина отмены (опционально)

---

## 3. 🎯 ВАЖНОЕ УТОЧНЕНИЕ ПО ТАЙМЛАЙНАМ

### 3.1. Единый таймлайн для всех ролей

**Ключевое требование:**
- ✅ Таймлайн для клиентов **точно такой же**, как у админа
- ✅ Клиенты записываются через таймлайн так же, как админ
- ✅ При клике на слот клиенту показываются **его мастер записи** (история его записей)

**Различия только в доступе:**

| Роль | Видит | Может записываться |
|------|--------|-----------------|
| **Клиент** | Свободные слоты + свои записи (полностью) + чужие записи (как занятые слоты без деталей) | Только в свободные слоты |
| **Админ** | Все записи (полностью) | В любые слоты (включая занятые) |

**Компонент таймлайна:**
- Один компонент [`Timeline.tsx`](plans/online-booking-analysis-report.md:318) используется для всех ролей
- Пропсы определяют уровень доступа и отображение
- При клике на слот → форма записи + история записей клиента

**Логика отображения записей:**
```typescript
// Клиент видит только свои записи полностью
if (user.role === 'client' && booking.created_by_profile_id === user.profile_id) {
  // Показываем полную информацию
  showFullBookingDetails(booking);
} else {
  // Показываем только как занятый слот
  showSlotAsOccupied(slot);
}
```

### 3.2. Процесс онлайн-записи клиента

**Пошаговый процесс:**

1. **Клиент кликает на свободный слот** в таймлайне
2. **Открывается форма записи:**
   - Выбор машины из своего списка ([`client_cars`](plans/online-booking-analysis-report.md:25))
   - Выбор услуг из доступного прайса ([`services`](plans/online-booking-analysis-report.md:27) или [`tire_services`](plans/online-booking-analysis-report.md:28))
   
3. **Выбор способа оплаты:**
   - Наличные
   - Карта
   - Перевод
4. **Если безнал → оплата онлайн:**
   - Интеграция с платёжной системой
   - После успешной оплаты → подтверждение записи
5. **Если наличные → подтверждение сразу:**
   - Запись создаётся со статусом `ОЖИДАЕТ`
   - Оплата при посещении
6. **Запись появляется в таймлайне:**
   - Статус `ОЖИДАЕТ`
   - Видна клиенту и админу

**Компоненты формы записи:**
- [`BookingForm.tsx`](plans/online-booking-analysis-report.md:318) - основная форма
- [`CarSelector.tsx`](plans/online-booking-analysis-report.md:319) - выбор машины из списка
- [`ServiceSelector.tsx`](plans/online-booking-analysis-report.md:318) - выбор услуг
- [`PaymentMethodSelector.tsx`](plans/online-booking-analysis-report.md:318) - выбор способа оплаты
- [`PriceCalculator.tsx`](plans/online-booking-analysis-report.md:318) - автоматический расчёт цены

**API функции для формы:**
```typescript
// lib/api/online-booking.ts
export async function createOnlineBooking(data: {
  profile_id: string;
  client_car_id: string;
  services: Service[];
  payment_method: PaymentMethod;
  box_number?: number;
  start_time: string;
  booking_date: string;
}): Promise<Booking> {
  // Проверка блокировки клиента
  // Проверка свободности слота
  // Создание записи
  // Обработка оплаты (если безнал)
}
```

---

## 4. ❌ ПРОБЛЕМЫ И НЕДОСТАТКИ SQL

### 3.1. Дубликат индекса
**Проблема:** Индекс `idx_clients_phone` уже существует
**Решение:** Удалить строку `CREATE INDEX idx_clients_phone` из SQL

### 3.2. Отсутствует поле `duration` в `tire_services`
**Проблема:** Для линейного расписания нужно знать длительность каждой услуги
**Текущая структура:**
```sql
tire_services: id, category, name, price, description, is_active
```
**Решение:** Добавить поле `duration_minutes`
```sql
ALTER TABLE tire_services
ADD COLUMN duration_minutes INTEGER DEFAULT 30 CHECK (duration_minutes > 0);
```

### 3.3. Отсутствует `end_time` в `tire_bookings`
**Проблема:** Для расчёта gaps нужно `end_time`
**Текущая структура:**
```sql
tire_bookings: start_time, estimated_duration
```
**Решение:** Добавить вычисляемое поле или хранимое поле
```sql
-- Вариант 1: Вычисляемое поле (рекомендуется)
ALTER TABLE tire_bookings
ADD COLUMN end_time TIME GENERATED ALWAYS AS (
    (start_time + (estimated_duration || ' minutes')::interval)::time
) STORED;

-- Вариант 2: Хранимое поле (если нужно обновлять вручную)
ALTER TABLE tire_bookings
ADD COLUMN end_time TIME;
```

### 3.4. Нет CHECK constraint на `bookings.status`
**Проблема:** Статусы могут быть любыми строками
**Текущая ситуация:** Только статус "ГОТОВО" в БД
**Решение:** Добавить constraint
```sql
ALTER TABLE bookings
ADD CONSTRAINT bookings_status_check
CHECK (status IN ('ОЖИДАЕТ', 'В РАБОТЕ', 'ГОТОВО', 'ОТМЕНЕНО'));
```

### 3.5. Отсутствуют триггеры для лояльности
**Проблема:** Счётчик `total_washes_with_body` не обновляется автоматически
**Решение:** Создать триггер
```sql
CREATE OR REPLACE FUNCTION update_loyalty_progress()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'ГОТОВО' AND OLD.status != 'ГОТОВО' THEN
        -- Проверяем есть ли услуга кузова + салона
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(NEW.services) as service
            WHERE service->>'service_id' IN ('body-wash', 'salon-vacuum', 'full-wash')
        ) THEN
            INSERT INTO loyalty_carwash_progress (client_id, total_washes_with_body, last_booking_id, last_wash_date)
            VALUES (NEW.client_id, 1, NEW.id, NEW.booking_date)
            ON CONFLICT (client_id) DO UPDATE
            SET 
                total_washes_with_body = loyalty_carwash_progress.total_washes_with_body + 1,
                last_booking_id = EXCLUDED.last_booking_id,
                last_wash_date = EXCLUDED.last_wash_date,
                updated_at = NOW();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_loyalty_progress
AFTER UPDATE OF status ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_loyalty_progress();
```

### 3.6. Нет RLS политик для онлайн-записи
**Проблема:** Клиенты могут видеть чужие записи
**Решение:** Добавить политики
```sql
-- Клиенты видят только свои записи
CREATE POLICY "Clients can view own bookings"
ON bookings FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'client'
        AND profiles.id = (SELECT profile_id FROM clients WHERE clients.id = bookings.client_id)
    )
);

-- Клиенты могут создавать только свои записи
CREATE POLICY "Clients can create own bookings"
ON bookings FOR INSERT
WITH CHECK (
    auth.uid() = created_by_profile_id
);

-- Админы видят все записи
CREATE POLICY "Admins can view all bookings"
ON bookings FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner')
    )
);
```

---

## 4. 🎯 УСЛОВИЯ ЛОЯЛЬНОСТИ (УТОЧНЕНО)

### 4.1. Условие для бесплатного кузова

**Важно:** Для получения бесплатной мойки кузова клиент должен иметь в истории записи **кузов + салон**.

**Услуги, которые считаются:**

1. `full-wash` - "Полная мойка (кузов + салон)"

**Логика триггера:**
```sql
-- Проверяем есть ли услуга кузова И услуга салона в одной записи
IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.services) as service
    WHERE service->>'service_id' = 'body-wash'
) AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.services) as service
    WHERE service->>'service_id' IN ('salon-vacuum', 'full-wash')
) THEN
    -- Увеличиваем счётчик
END IF;
```

### 4.2. Активация бонусной услуги

**На 10, 20, 30... мойке:**
1. Добавляем услугу "Подарочная мойка кузова" в `services`
```sql
INSERT INTO services (service_id, name, category, service_type, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan, is_active)
VALUES ('free-body-wash', 'Подарочная мойка кузова', 'bonus', 'carwash', 0, 0, 0, 0, 0, true);
```

2. Клиент видит услугу в списке если `total_washes_with_body % 10 == 0`

3. После применения:
   - Счётчик обнуляется или переходит на следующий цикл
   - Услуга становится недоступной до следующего цикла

---

## 5. 📋 ИСПРАВЛЕННЫЙ SQL КОД

```sql
-- ============================================
-- Миграция для онлайн-записи
-- ============================================

-- 1. Расширяем bookings
ALTER TABLE bookings 
ADD COLUMN booking_source VARCHAR DEFAULT 'admin' CHECK (booking_source IN ('admin', 'online')),
ADD COLUMN created_by_profile_id UUID REFERENCES profiles(id);

-- 2. Расширяем tire_bookings
ALTER TABLE tire_bookings
ADD COLUMN booking_source VARCHAR DEFAULT 'admin' CHECK (booking_source IN ('admin', 'online')),
ADD COLUMN created_by_profile_id UUID REFERENCES profiles(id);

-- 3. Связь clients -> profiles
ALTER TABLE clients
ADD COLUMN profile_id UUID UNIQUE REFERENCES profiles(id),
ADD COLUMN online_booking_blocked_until DATE;

-- ❌ УДАЛЕН: Индекс уже существует
-- CREATE INDEX idx_clients_phone ON clients(phone);

-- 4. Добавляем duration для tire_services
ALTER TABLE tire_services
ADD COLUMN duration_minutes INTEGER DEFAULT 30 CHECK (duration_minutes > 0);

-- 5. Добавляем end_time для tire_bookings
ALTER TABLE tire_bookings
ADD COLUMN end_time TIME GENERATED ALWAYS AS (
    (start_time + (estimated_duration || ' minutes')::interval)::time
) STORED;

-- 6. Добавляем CHECK constraint для bookings.status
ALTER TABLE bookings
ADD CONSTRAINT bookings_status_check
CHECK (status IN ('ОЖИДАЕТ', 'В РАБОТЕ', 'ГОТОВО', 'ОТМЕНЕНО'));

-- 7. Программа лояльности
CREATE TABLE loyalty_carwash_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  total_washes_with_body INTEGER DEFAULT 0,
  last_booking_id UUID REFERENCES bookings(id),
  last_wash_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_loyalty_client ON loyalty_carwash_progress(client_id);

-- 8. Настройки онлайн-записи
CREATE TABLE booking_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type VARCHAR NOT NULL CHECK (service_type IN ('carwash', 'tire')),
  work_start_time TIME NOT NULL DEFAULT '08:00',
  work_end_time TIME NOT NULL DEFAULT '17:00',
  online_booking_enabled BOOLEAN DEFAULT TRUE,
  max_days_ahead INTEGER DEFAULT 3,
  total_boxes INTEGER DEFAULT 3,
  slot_duration_minutes INTEGER DEFAULT 60,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO booking_settings (service_type, total_boxes) 
VALUES ('carwash', 3), ('tire', 1);

-- 9. Отслеживание отмен
CREATE TABLE booking_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  booking_id UUID REFERENCES bookings(id),
  tire_booking_id UUID REFERENCES tire_bookings(id),
  cancelled_at TIMESTAMP DEFAULT NOW(),
  reason TEXT
);

CREATE INDEX idx_cancellations_client ON booking_cancellations(client_id);

-- 10. Добавляем бонусную услугу
INSERT INTO services (service_id, name, category, service_type, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan, is_active)
VALUES ('free-body-wash', 'Подарочная мойка кузова', 'bonus', 'carwash', 0, 0, 0, 0, 0, true);

-- 11. Триггер для обновления лояльности
CREATE OR REPLACE FUNCTION update_loyalty_progress()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'ГОТОВО' AND OLD.status != 'ГОТОВО' THEN
        -- Проверяем есть ли услуга кузова + салона
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(NEW.services) as service
            WHERE service->>'service_id' = 'body-wash'
        ) AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(NEW.services) as service
            WHERE service->>'service_id' IN ('salon-vacuum', 'full-wash')
        ) THEN
            INSERT INTO loyalty_carwash_progress (client_id, total_washes_with_body, last_booking_id, last_wash_date)
            VALUES (NEW.client_id, 1, NEW.id, NEW.booking_date)
            ON CONFLICT (client_id) DO UPDATE
            SET 
                total_washes_with_body = loyalty_carwash_progress.total_washes_with_body + 1,
                last_booking_id = EXCLUDED.last_booking_id,
                last_wash_date = EXCLUDED.last_wash_date,
                updated_at = NOW();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_loyalty_progress
AFTER UPDATE OF status ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_loyalty_progress();

-- 12. RLS политики для онлайн-записи
-- Включаем RLS для bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Клиенты видят только свои записи
CREATE POLICY "Clients can view own bookings"
ON bookings FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'client'
        AND profiles.id = (SELECT profile_id FROM clients WHERE clients.id = bookings.client_id)
    )
);

-- Клиенты могут создавать только свои записи
CREATE POLICY "Clients can create own bookings"
ON bookings FOR INSERT
WITH CHECK (
    auth.uid() = created_by_profile_id
);

-- Админы видят все записи
CREATE POLICY "Admins can view all bookings"
ON bookings FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner')
    )
);
```

---

## 6. 🎯 РЕКОМЕНДАЦИИ ПО РЕАЛИЗАЦИИ

### 6.1. Порядок применения миграции

1. **Создать файл миграции:** `supabase/migrations/20260118000001_online_booking.sql`
2. **Применить миграцию:** через Supabase Dashboard или CLI
3. **Проверить схему:** убедиться что все таблицы созданы
4. **Тестировать триггер:** создать тестовую запись со статусом "ГОТОВО"
5. **Проверить RLS:** протестировать доступ от лица клиента и админа

### 6.2. API функции (необходимо создать)

**Клиент:**
- `lib/api/online-booking.ts` - создание онлайн-записи
- `lib/api/available-slots.ts` - расчёт свободных слотов
- `lib/api/client-cars.ts` - управление машинами клиента
- `lib/api/loyalty.ts` - прогресс лояльности
- `lib/api/cancellations.ts` - отмена записи

**Админ:**
- Расширить существующие API фильтрацией по `booking_source`

### 6.3. Интеграция с существующими таймлайнами

**ВАЖНО:** В проекте уже есть два таймлайна:
- [`components/admin/Timeline.tsx`](components/admin/Timeline.tsx:1) - для автомойки
- [`components/admin/TireTimeline.tsx`](components/admin/TireTimeline.tsx:1) - для шиномонтажа

**Рекомендация: Расширить существующие компоненты**

Не создавать новые таймлайны! Расширить существующие:

#### Вариант 1: Расширить пропсы (рекомендуется)

```typescript
// components/admin/Timeline.tsx
interface TimelineProps {
  bookings: Booking[];
  selectedStart?: string;
  selectedEnd?: string;
  onSlotClick?: (start: string, end: string) => void;
  className?: string;
  selectedDate?: string;
  // 🆕 Новые пропсы для онлайн-записи
  userRole?: 'admin' | 'client';
  currentProfileId?: string;
}

// Внутри компонента:
const filteredBookings = userRole === 'client' && currentProfileId
  ? bookings.filter(b => b.created_by_profile_id === currentProfileId)
  : bookings;
```

**Преимущества:**
- ✅ Единый компонент для всех ролей
- ✅ Меньше дублирования кода
- ✅ Легче поддерживать
- ✅ Единая логика расчёта слотов

#### Вариант 2: Создать обёртки (альтернатива)

```typescript
// components/client/ClientCarwashTimeline.tsx
import { Timeline } from '../admin/Timeline';

export const ClientCarwashTimeline: React.FC<ClientTimelineProps> = ({
  bookings,
  currentProfileId,
  ...props
}) => {
  // Фильтруем только записи клиента
  const clientBookings = bookings.filter(b => b.created_by_profile_id === currentProfileId);

  return (
    <Timeline
      bookings={clientBookings}
      {...props}
    />
  );
};

// components/client/ClientTireTimeline.tsx
import { TireTimeline } from '../admin/TireTimeline';

export const ClientTireTimeline: React.FC<ClientTireTimelineProps> = ({
  bookings,
  currentProfileId,
  ...props
}) => {
  // Фильтруем только записи клиента
  const clientBookings = bookings.filter(b => b.created_by_profile_id === currentProfileId);

  return (
    <TireTimeline
      bookings={clientBookings}
      {...props}
    />
  );
};
```

**Преимущества:**
- ✅ Чёткое разделение по папкам
- ✅ Переиспользование всей логики
- ✅ Легче понять структуру проекта

### 6.4. Новые компоненты (необходимо создать)

**Клиент:**
- `components/client/OnlineBookingModal.tsx` - модалка формы записи (как у админа)
  - В начале: история записей клиента
  - Кнопка "Повторить" - быстрое создание из истории
  - Форма: выбор типа авто, услуг, оплата
- `components/client/ClientHistory.tsx` - история записей в модалке
- `components/client/ClientDashboard.tsx` - личный кабинет клиента
- `components/loyalty/ProgressCard.tsx` - прогресс лояльности

**ВАЖНО:**
- ✅ Мастер формы записи **как у админа** (не встроить в таймлайн)
- ✅ В начале мастр формы - история записей клиента
- ✅ Кнопка "Повторить" - переход к подтверждению заказа
  ✅ Выбор авто
- ✅ Переиспользовать существующие компоненты выбора (если есть)

**Структура модалки:**
```typescript
// components/client/OnlineBookingModal.tsx
interface OnlineBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileId: string;
  serviceType: 'carwash' | 'tire';
  selectedSlot?: {
    date: string;
    startTime: string;
    boxNumber?: number;
  };
}

export const OnlineBookingModal: React.FC<OnlineBookingModalProps> = ({
  isOpen,
  onClose,
  profileId,
  serviceType,
  selectedSlot
}) => {
  // В начале: история записей
  // Кнопка "Повторить" → переход к форме
  // Форма: тип авто, услуги, оплата

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {/* История записей */}
      <ClientHistory profileId={profileId} onRepeat={handleRepeat} />

      {/* Форма записи */}
      <BookingForm
        profileId={profileId}
        serviceType={serviceType}
        selectedSlot={selectedSlot}
        onSubmit={handleSubmit}
      />
    </Modal>
  );
};
```

### 6.4. TypeScript типы

```typescript
// entities/booking/types.ts
export type BookingSource = 'admin' | 'online';
export type BookingStatus = 'ОЖИДАЕТ' | 'В РАБОТЕ' | 'ГОТОВО' | 'ОТМЕНЕНО';

export interface Booking {
  id: string;
  client_id?: string;
  client_name: string;
  phone: string;
  car_model: string;
  plate_number: string;
  car_type: string;
  services: Service[];
  price: number;
  status: BookingStatus;
  booking_date: string;
  start_time?: string;
  end_time?: string;
  box_number?: number;
  booking_source: BookingSource;
  created_by_profile_id?: string;
  created_at: string;
  updated_at: string;
}

// entities/loyalty/types.ts
export interface LoyaltyProgress {
  id: string;
  client_id: string;
  total_washes_with_body: number;
  last_booking_id?: string;
  last_wash_date?: string;
  created_at: string;
  updated_at: string;
}

// entities/booking-settings/types.ts
export interface BookingSettings {
  id: string;
  service_type: 'carwash' | 'tire';
  work_start_time: string;
  work_end_time: string;
  online_booking_enabled: boolean;
  max_days_ahead: number;
  total_boxes: number;
  slot_duration_minutes: number;
  updated_at: string;
}
```

---

## 7. ✅ ИТОГОВЫЙ ВЫВОД

### План реализуем? **ДА** ✅

**Что нужно исправить в SQL:**
1. ❌ Удалить дубликат индекса `idx_clients_phone`
2. ✅ Добавить поле `duration_minutes` в `tire_services`
3. ✅ Добавить вычисляемое поле `end_time` в `tire_bookings`
4. ✅ Добавить CHECK constraint для `bookings.status`
5. ✅ Добавить триггер для автоматического обновления лояльности
6. ✅ Добавить RLS политики для безопасности

**Что уже работает:**
- ✅ Профили с RLS
- ✅ Клиенты и их машины
- ✅ Записи (bookings, tire_bookings)
- ✅ Услуги (services, tire_services)
- ✅ Логика шиномонтажа (start_time + estimated_duration)
- ✅ Таймлайны для админа ([`Timeline.tsx`](components/admin/Timeline.tsx:1), [`TireTimeline.tsx`](components/admin/TireTimeline.tsx:1))

**Что нужно создать:**
- ✅ 3 новые таблицы (loyalty, settings, cancellations)
- ✅ 2 расширения существующих таблиц (bookings, tire_bookings)
- ✅ 1 расширение clients (profile_id, blocked_until)
- ✅ Триггеры и RLS политики
- ✅ Модалка формы записи для клиентов ([`OnlineBookingModal.tsx`](plans/online-booking-analysis-report.md:620))
- ✅ Компонент истории записей в модалке
- ✅ Кнопка "Повторить" для быстрого создания из истории

**Архитектура таймлайнов:**
- ✅ Расширить существующие [`Timeline.tsx`](components/admin/Timeline.tsx:1) и [`TireTimeline.tsx`](components/admin/TireTimeline.tsx:1) пропсами для фильтрации по роли
- ✅ При клике на слот → открывать мастер  форму записи
- ✅ НЕ встроить форму в таймлайн (отдельная мастер форма)

---

## 8. 🚀 СЛЕДУЮЩИЕ ШАГИ

1. **Применить исправленную миграцию** (см. раздел 5)
2. **Создать API функции** для онлайн-записи
3. **Создать компоненты** таймлайна и личного кабинета
4. **Протестировать** авторизацию клиентов
5. **Протестировать** создание онлайн-записи
6. **Протестировать** программу лояльности
7. **Протестировать** систему штрафов за отмены

---

**Отчёт подготовлен:** 2026-01-18
**Статус:** ✅ Готов к реализации
