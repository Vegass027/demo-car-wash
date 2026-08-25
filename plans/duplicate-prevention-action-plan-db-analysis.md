# Анализ текущего состояния БД

**Дата:** 2025-01-09  
**Проект:** Carwash Admin Pro  
**ID проекта:** avajtwihzjfpytimfbaw

---

## 📊 СВОДКА ПО ТАБЛИЦАМ

### Ключевые таблицы:

| Таблица | Записей | Описание |
|----------|-----------|-----------|
| **bookings** | 85 | Заказы автомойки |
| **tire_bookings** | 46 | Заказы шиномонтажа |
| **worksheet_entries** | 39 | Записи в ведомости |
| **salary_transactions** | 104 | Транзакции зарплаты |
| **workers** | 3 | Мойщики |
| **tire_workers** | 1 | Мастера шиномонтажа |
| **clients** | 7 | Клиенты |
| **client_cars** | 13 | Автомобили клиентов |
| **organizations** | 16 | Организации |
| **organization_cars** | 19 | Автомобили организаций |
| **organization_drivers** | 16 | Водители организаций |
| **services** | 26 | Услуги автомойки |
| **tire_services** | 44 | Услуги шиномонтажа |

---

## 🔍 ИНДЕКСЫ

### bookings (автомойка)

**Существующие индексы:**
- ✅ `bookings_pkey` - PRIMARY KEY на `id`
- ✅ `idx_bookings_box` - на `(box_number, booking_date)`
- ✅ `idx_bookings_client` - на `client_id`
- ✅ `idx_bookings_client_car` - на `client_car_id`
- ⚠️ `idx_bookings_client_id` - на `client_id` (дубликат!)
- ✅ `idx_bookings_date` - на `booking_date`
- ✅ `idx_bookings_driver` - на `driver_id`
- ✅ `idx_bookings_is_org` - на `is_org`
- ✅ `idx_bookings_org` - на `organization_id`
- ✅ `idx_bookings_signature` - на `signature_obtained`
- ✅ `idx_bookings_status` - на `status`
- ✅ `idx_bookings_status_date` - на `(status, booking_date)`
- ✅ `idx_bookings_worker` - на `worker_id`

**❌ Чего НЕ ХВАТАЕТ:**
- ❌ Уникальный индекс на `(client_car_id, booking_date, start_time)` для физлиц
- ❌ Уникальный индекс на `(car_id, booking_date, start_time)` для организаций
- ❌ Уникальный индекс на `(client_car_id, booking_date)` для физлиц (без времени)

---

### tire_bookings (шиномонтаж)

**Существующие индексы:**
- ✅ `tire_bookings_pkey` - PRIMARY KEY на `id`
- ⚠️ `idx_tire_bookings_booking_date` - на `booking_date` (дубликат!)
- ✅ `idx_tire_bookings_client_id` - на `client_id`
- ⚠️ `idx_tire_bookings_date` - на `booking_date` (дубликат!)
- ✅ `idx_tire_bookings_phone` - на `phone`
- ✅ `idx_tire_bookings_start_time` - на `start_time`
- ✅ `idx_tire_bookings_status` - на `status`
- ✅ `idx_tire_bookings_status_date` - на `(status, booking_date)`

**❌ Чего НЕ ХВАТАЕТ:**
- ❌ Уникальный индекс на `(client_car_id, booking_date, start_time)` для физлиц
- ❌ Уникальный индекс на `(car_id, booking_date, start_time)` для организаций
- ❌ Уникальный индекс на `(client_car_id, booking_date)` для физлиц (без времени)

---

### worksheet_entries (ведомость)

**Существующие индексы:**
- ✅ `idx_worksheet_entries_carwash_booking_unique` - UNIQUE на `carwash_booking_id` WHERE NOT NULL 🎉
- ✅ `idx_worksheet_entries_tire_booking_unique` - UNIQUE на `tire_booking_id` WHERE NOT NULL 🎉
- ✅ `idx_worksheet_car` - на `car_id`
- ✅ `idx_worksheet_date` - на `service_date`
- ✅ `idx_worksheet_driver` - на `driver_id`
- ✅ `idx_worksheet_entries_org_date` - на `(organization_id, service_date)`
- ✅ `idx_worksheet_entries_service_type` - на `service_type`
- ✅ `idx_worksheet_org` - на `organization_id`
- ✅ `worksheet_entries_pkey` - PRIMARY KEY на `id`

**✅ Что уже ХВАТАЕТ:**
- ✅ Уникальные индексы для предотвращения дубликатов записей в ведомости

---

### salary_transactions (транзакции зарплаты)

**Существующие индексы:**
- ✅ `salary_transactions_pkey` - PRIMARY KEY на `id`
- ✅ `idx_salary_transactions_date` - на `created_at DESC`
- ✅ `idx_salary_transactions_type` - на `transaction_type`
- ✅ `idx_salary_transactions_type_date` - на `(transaction_type, created_at)`
- ✅ `idx_salary_transactions_worker` - на `(worker_type, worker_id)`
- ✅ `idx_salary_transactions_worker_date` - на `(worker_id, created_at)`

**❌ Чего НЕ ХВАТАЕТ:**
- ❌ Уникальный индекс на `(worker_id, booking_id)` для предотвращения дублей
- ❌ Поле `idempotency_key` для идемпотентности
- ❌ Поле `booking_type` для связи с заказом

---

### workers (мойщики)

**Существующие индексы:**
- ✅ `workers_pkey` - PRIMARY KEY на `id`
- ✅ `idx_workers_active` - на `is_active`
- ✅ `idx_workers_current_booking` - на `current_booking_id`
- ✅ `idx_workers_last_shift_date` - на `last_shift_date`
- ✅ `idx_workers_partner` - на `partner_id`
- ✅ `idx_workers_status` - на `status`
- ✅ `idx_workers_working_today` - на `is_working_today`

**❌ Чего НЕ ХВАТАЕТ:**
- ❌ Уникальный индекс на `completed_bookings` (ARRAY) - не может быть уникальным
- ❌ Поле `idempotency_key` для идемпотентности начислений

---

### tire_workers (мастера шиномонтажа)

**Существующие индексы:**
- ✅ `tire_workers_pkey` - PRIMARY KEY на `id`
- ✅ `idx_tire_workers_active` - на `is_active`
- ✅ `idx_tire_workers_current_booking` - на `current_booking_id`
- ✅ `idx_tire_workers_last_shift_date` - на `last_shift_date`
- ✅ `idx_tire_workers_status` - на `status`
- ✅ `idx_tire_workers_working_today` - на `is_working_today`

**❌ Чего НЕ ХВАТАЕТ:**
- ❌ Уникальный индекс на `completed_bookings` (ARRAY) - не может быть уникальным
- ❌ Поле `idempotency_key` для идемпотентности начислений

---

## 📋 RPC ФУНКЦИИ

### ✅ Что уже есть:

**Блокировки и защита от race conditions:**
- ✅ `start_admin_shift` - использует `FOR UPDATE` для блокировки админа
- ✅ `start_tire_worker_shift` - использует `FOR UPDATE` для блокировки мастера
- ✅ `start_worker_shift` - использует `FOR UPDATE` для блокировки мойщика

**Триггеры для автоматизации:**
- ✅ `create_worksheet_entry_on_booking_ready` - автоматическое создание записи в ведомости при статусе "ГОТОВО"
- ✅ `create_worksheet_entry_on_tire_booking_ready` - автоматическое создание записи в ведомости при статусе "ГОТОВО"
- ✅ `update_loyalty_progress` - автоматическое обновление прогресса лояльности
- ✅ `bookings_table_changes_broadcast` - real-time уведомления
- ✅ `tire_bookings_table_changes_broadcast` - real-time уведомления

**Вспомогательные функции:**
- ✅ `normalize_phone_number` - нормализация номеров телефонов
- ✅ `check_sms_rate_limit` - проверка лимитов SMS
- ✅ `get_next_document_number` - автонумерация документов
- ✅ `save_daily_report` - сохранение ежедневных отчетов
- ✅ `reset_daily` - ежедневный сброс статистики

### ❌ Чего НЕ ХВАТАЕТ:

**Блокировки для заказов:**
- ❌ `acquire_lock` - функция получения блокировки
- ❌ `release_lock` - функция освобождения блокировки
- ❌ `create_booking_with_lock` - создание заказа с блокировкой
- ❌ `create_tire_booking_with_lock` - создание заказа шиномонтажа с блокировкой

**Идемпотентность:**
- ❌ RPC функции для идемпотентных операций оплаты
- ❌ RPC функции для идемпотентных операций начисления зарплаты

**Аудит:**
- ❌ Таблицы для аудита финансовых операций
- ❌ RPC функции для создания записей аудита

---

## 🎯 ВЫВОДЫ

### ✅ Что уже хорошо:

1. **Защита от дубликатов в ведомости** - уникальные индексы уже есть
2. **Автоматическое создание записей в ведомости** - триггеры работают
3. **Автоматическое обновление лояльности** - триггер работает
4. **Блокировки для смен** - `FOR UPDATE` используется правильно
5. **Хорошая индексация** - большинство запросов оптимизированы

### ❌ Что критически не хватает:

1. **Уникальные индексы для заказов** - нет защиты от дубликатов заказов
2. **RPC функции для создания заказов с блокировками** - нет защиты от race conditions
3. **Таблицы аудита** - нет истории финансовых операций
4. **Idempotency keys** - нет защиты от повторных вызовов
5. **Проверки на дубликаты booking_id** - нет защиты от повторного начисления

---

## 📊 СРАВНЕНИЕ С ПЛАНОМ

| Задача | В плане | В БД | Статус |
|---------|----------|---------|---------|
| Уникальные индексы для bookings | ✅ | ❌ | Нужно создать |
| Уникальные индексы для tire_bookings | ✅ | ❌ | Нужно создать |
| Уникальные индексы для worksheet_entries | ✅ | ✅ | Уже есть! |
| RPC функции для блокировок | ✅ | ❌ | Нужно создать |
| RPC функции для создания заказов с блокировками | ✅ | ❌ | Нужно создать |
| Таблицы аудита | ✅ | ❌ | Нужно создать |
| Idempotency keys | ✅ | ❌ | Нужно добавить |
| Триггеры для ведомости | ✅ | ✅ | Уже есть! |
| Триггеры для лояльности | ✅ | ✅ | Уже есть! |

---

## 🎯 ПРИОРИТЕТЫ ДЛЯ РЕАЛИЗАЦИИ

### ПРИОРИТЕТ 1: КРИТИЧЕСКИ (создать немедленно)

1. **Создать уникальные индексы для bookings**
   - На `(client_car_id, booking_date, start_time)` для физлиц
   - На `(car_id, booking_date, start_time)` для организаций

2. **Создать уникальные индексы для tire_bookings**
   - На `(client_car_id, booking_date, start_time)` для физлиц
   - На `(car_id, booking_date, start_time)` для организаций

3. **Создать RPC функции для создания заказов с блокировками**
   - `create_booking_with_lock`
   - `create_tire_booking_with_lock`

### ПРИОРИТЕТ 2: ВАЖНЫЕ (создать скоро)

1. **Создать таблицы аудита**
   - `booking_payments`
   - `salary_transactions_audit`

2. **Добавить idempotency keys**
   - В таблицы bookings и tire_bookings
   - В таблицы workers и tire_workers

3. **Создать RPC функции для блокировок**
   - `acquire_lock`
   - `release_lock`

### ПРИОРИТЕТ 3: МЕНЕЕ ВАЖНЫЕ (создать позже)

1. **Оптимизировать существующие индексы**
   - Удалить дубликаты индексов
   - Добавить составные индексы для сложных запросов

---

**Анализ завершен:** 2025-01-09  
**Статус:** Готов к корректировке плана
