# 📊 Отчет о подготовке базы данных для интеграции СБП (YooKassa)

**Дата:** 2025-01-20  
**Проект:** carwash-admin-pro  
**Проект Supabase:** avajtwihzjfpytimfbaw

---

## ✅ Выполненные задачи

### 1. Изучение плана интеграции
- ✅ Прочитан файл [`docs/sbp-payment-integration-plan.md`](docs/sbp-payment-integration-plan.md)
- ✅ Изучена схема работы СБП
- ✅ Понят поток данных (pending_booking → payment → booking)

### 2. Проверка официальной документации YooKassa
- ✅ Проверена документация через Context7
- ✅ Подтвержден эндпоинт `GET /v3/sbp_banks` для получения списка банков
- ✅ Подтверждена логика webhook (payment.succeeded, payment.canceled)
- ✅ Проверены требования к metadata (16 ключей × 512 символов)

### 3. Анализ текущей схемы базы данных
- ✅ Получен список всех таблиц через Supabase MCP
- ✅ Проверены типы полей в существующих таблицах
- ✅ Подтвержден формат `TIMESTAMP WITHOUT TIME ZONE` (как в существующей схеме)

### 4. Создание миграции
- ✅ Создан файл [`supabase/migrations/20250120_add_yookassa_payment_integration.sql`](supabase/migrations/20250120_add_yookassa_payment_integration.sql)
- ✅ Реализована таблица `pending_bookings` с полями:
  - `id` (UUID PRIMARY KEY)
  - `telegram_user_id` (BIGINT)
  - `client_name`, `phone`, `car_model`, `plate_number` (VARCHAR)
  - `booking_date` (DATE)
  - `start_time`, `end_time` (VARCHAR)
  - `services` (JSONB) - консистентно с bookings
  - `post` (INTEGER)
  - `total_price` (NUMERIC)
  - `expires_at` (TIMESTAMP WITHOUT TIME ZONE)
  - `created_at` (TIMESTAMP WITHOUT TIME ZONE)
- ✅ Созданы индексы:
  - `idx_pending_bookings_telegram_user`
  - `idx_pending_bookings_expires_at`

### 5. Создание таблицы payments
- ✅ Реализована таблица `payments` с полями:
  - `id` (UUID PRIMARY KEY)
  - `booking_id` (UUID REFERENCES bookings ON DELETE CASCADE)
  - `pending_booking_id` (UUID REFERENCES pending_bookings ON DELETE SET NULL) - **сохраняет историю платежей**
  - `tire_booking_id` (UUID REFERENCES tire_bookings ON DELETE CASCADE)
  - `yookassa_payment_id` (VARCHAR UNIQUE)
  - `amount` (NUMERIC)
  - `currency` (VARCHAR DEFAULT 'RUB')
  - `status` (VARCHAR CHECK IN ('pending', 'succeeded', 'canceled', 'waiting_for_capture'))
  - `payment_method` (VARCHAR CHECK IN ('sbp', 'bank_card', 'yoo_money', 'cash', 'cashless'))
  - `metadata` (JSONB DEFAULT '{}')
  - `created_at`, `updated_at` (TIMESTAMP WITHOUT TIME ZONE)
- ✅ Созданы индексы:
  - `idx_payments_booking_id`
  - `idx_payments_pending_booking_id`
  - `idx_payments_tire_booking_id`
  - `idx_payments_yookassa_id`
  - `idx_payments_status`

### 6. Создание таблицы sbp_banks
- ✅ Реализована таблица `sbp_banks` с полями:
  - `id` (VARCHAR PRIMARY KEY)
  - `name`, `code`, `logo` (VARCHAR)
  - `scheme` (VARCHAR) - схема deep link
  - `deep_link` (VARCHAR) - полный deep link
  - `updated_at` (TIMESTAMP WITHOUT TIME ZONE)
- ✅ Создан индекс:
  - `idx_sbp_banks_updated_at`

### 7. Добавление полей в существующие таблицы
- ✅ Добавлено поле `yookassa_payment_id` в таблицу `bookings`
  - Тип: VARCHAR UNIQUE
  - Комментарий: "ID платежа в YooKassa для онлайн-оплаты"
- ✅ Добавлено поле `yookassa_payment_id` в таблицу `tire_bookings`
  - Тип: VARCHAR UNIQUE
  - Комментарий: "ID платежа в YooKassa для онлайн-оплаты"

### 8. Добавление комментариев к таблицам и полям
- ✅ Добавлены комментарии ко всем таблицам
- ✅ Добавлены комментарии ко всем ключевым полям
- ✅ Добавлен комментарий к `payments.pending_booking_id`: "Ссылка на временную запись (становится NULL после успешной оплаты)"

### 9. Создание триггера для автоматического обновления updated_at
- ✅ Создана функция `update_updated_at_column()`
- ✅ Создан триггер `update_payments_updated_at` для таблицы `payments`
- ✅ Создан триггер `update_sbp_banks_updated_at` для таблицы `sbp_banks`

### 10. Применение миграции к базе данных
- ✅ Миграция успешно применена через Supabase MCP
- ✅ Все таблицы созданы корректно
- ✅ Все индексы созданы
- ✅ Все триггеры созданы
- ✅ Поля добавлены в bookings и tire_bookings

### 11. Исправление логики CASCADE на SET NULL
- ✅ Изменен `pending_booking_id` с `ON DELETE CASCADE` на `ON DELETE SET NULL`
  - **Причина:** Сохранение полной истории платежей
  - **Логика:** При удалении pending_booking → payment.pending_booking_id = NULL, но payment.booking_id остается заполненным
- ✅ Добавлен комментарий к полю `pending_booking_id` объясняющий логику

---

## 📊 Структура созданных таблиц

### pending_bookings (0 строк)
| Поле | Тип | Описание |
|-------|------|----------|
| id | UUID | Primary Key |
| telegram_user_id | BIGINT | ID пользователя в Telegram |
| client_name | VARCHAR | Имя клиента |
| phone | VARCHAR | Телефон |
| car_model | VARCHAR | Модель авто |
| plate_number | VARCHAR | Гос. номер |
| booking_date | DATE | Дата записи |
| start_time | VARCHAR | Время начала |
| end_time | VARCHAR | Время окончания |
| services | JSONB | Услуги (консистентно с bookings) |
| post | INTEGER | Номер поста |
| total_price | NUMERIC | Общая цена |
| expires_at | TIMESTAMP | Время истечения (30 минут) |
| created_at | TIMESTAMP | Дата создания |

### payments (0 строк)
| Поле | Тип | Описание |
|-------|------|----------|
| id | UUID | Primary Key |
| booking_id | UUID | FK bookings (CASCADE) |
| pending_booking_id | UUID | FK pending_bookings (SET NULL) |
| tire_booking_id | UUID | FK tire_bookings (CASCADE) |
| yookassa_payment_id | VARCHAR | ID в YooKassa (UNIQUE) |
| amount | NUMERIC | Сумма |
| currency | VARCHAR | Валюта (RUB) |
| status | VARCHAR | Статус платежа |
| payment_method | VARCHAR | Способ оплаты |
| metadata | JSONB | Дополнительные данные |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

### sbp_banks (0 строк)
| Поле | Тип | Описание |
|-------|------|----------|
| id | VARCHAR | ID банка (PK) |
| name | VARCHAR | Название |
| code | VARCHAR | Код |
| logo | VARCHAR | Логотип |
| scheme | VARCHAR | Схема deep link |
| deep_link | VARCHAR | Полный deep link |
| updated_at | TIMESTAMP | Дата обновления |

---

## 🔑 Ключевые решения

### 1. ON DELETE SET NULL для pending_booking_id
**Проблема:** При CASCADE удаляется история платежей  
**Решение:** SET NULL сохраняет payment, даже если pending_booking удален  
**Результат:** Полная история платежей сохраняется

### 2. JSONB для services в pending_bookings
**Решение:** Использован JSONB для консистентности с таблицей bookings  
**Причина:** В bookings.services уже JSONB

### 3. Триггер updated_at для sbp_banks
**Решение:** Добавлен триггер для автоматического обновления updated_at  
**Причина:** Для отслеживания времени обновления кэша банков

### 4. TIMESTAMP WITHOUT TIME ZONE
**Решение:** Использован формат TIMESTAMP WITHOUT TIME ZONE  
**Причина:** Консистентность с существующей схемой базы данных

---

## 📋 Следующие шаги

### Базовая интеграция:
- [ ] Создать API endpoint `/api/create-pending-booking`
- [ ] Создать API endpoint `/api/create-payment-sbp`
- [ ] Создать API endpoint `/api/yookassa-webhook` с проверкой подписи
- [ ] Создать API endpoint `/api/check-payment-status`
- [ ] Создать API endpoint `/api/cleanup-expired-payments`
- [ ] Создать API endpoint `/api/get-sbp-banks` (из кэша)
- [ ] Создать API endpoint `/api/update-sbp-banks` (CRON)
- [ ] Создать компонент `PaymentMethodStep.tsx`
- [ ] Создать компонент `BankSelectionStep.tsx` с fallback на QR-код
- [ ] Создать компонент `ConfirmationStep.tsx`
- [ ] Создать `lib/logger.ts` для структурированного логирования
- [ ] Создать `lib/api/yookassa.ts` с функцией cancelPayment()
- [ ] Интегрировать polling fallback в `BookingWizard.tsx` (3 сек × 20 попыток)
- [ ] Добавить переменные в `.env` (YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, NEXT_PUBLIC_APP_URL, CRON_SECRET)
- [ ] Настроить webhook в YooKassa кабинете
- [ ] Настроить cron jobs в `vercel.json`
- [ ] Тестировать в тестовом режиме YooKassa

---

## 🎯 Итог

**База данных полностью готова для интеграции СБП!**

✅ Все таблицы созданы  
✅ Все индексы созданы  
✅ Все триггеры созданы  
✅ Все foreign keys настроены  
✅ История платежей сохраняется (ON DELETE SET NULL)  
✅ Консистентность с существующей схемой соблюдена  

**Следующий этап:** Реализация API endpoints и UI компонентов
