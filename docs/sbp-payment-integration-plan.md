# 📋 План реализации интеграции СБП (YooKassa) в Telegram Mini App

## 🎯 Обзор

Интеграция оплаты через Систему быстрых платежей (СБП) в Telegram Mini App для автомойки.

## 📊 Схема работы

```
┌─────────────────────────────────────────────────────────────────┐
│  ШАГ 1: Выбор услуг и даты (сохраняем в state!)       │
│  ↓                                                  │
│  ШАГ 2: Выбор способа оплаты                           │
│  ├─ Наличка → кнопка "Подтвердить" → запись в БД      │
│  ├─ Безнал → кнопка "Подтвердить" → запись в БД      │
│  └─ СБП → кнопка "Далее" → ШАГ 3                 │
│  ↓                                                  │
│  ШАГ 3: Выбор банка (только для СБП)                  │
│  ├─ Загрузка списка банков                             │
│  ├─ Выбор банка → открытие банковского приложения         │
│  └─ Возможность вернуться на ШАГ 2                  │
│  ↓                                                  │
│  ШАГ 4: Создание платежа СБП (НЕ записи!)             │
│  └─ POST /api/create-payment-sbp → metadata из state!  │
│  ↓                                                  │
│  Оплата через банковское приложение                          │
│  ↓                                                  │
│  Возврат в мини-апп                                     │
│  ↓                                                  │
│  Webhook: payment.succeeded → СОЗДАЁМ запись в БД!     │
│  ↓                                                  │
│  Перенаправляем на /booking-success                      │
└─────────────────────────────────────────────────────────────────┘
```

**ВАЖНО:** При оплате через СБП запись создаётся ТОЛЬКО после успешной оплаты через webhook!

## 🔑 Ключевые принципы

### 1. АВТОМАТИЧЕСКОЕ создание записи
- Запись создается через **Webhook** от YooKassa
- НЕЛЬЗЯ просить пользователя нажимать "Подтвердить"
- Пользователь уже ОПЛАТИЛ через банковское приложение

### 2. Список банков загружается на ШАГЕ 2
- При выборе "СБП" сразу загружаем список банков
- Список сохраняется в state, НЕ пересоздается при возврате
- Deep Links открывают банковские приложения

### 3. Возврат пользователя обрабатывается
- Пользователь возвращается из банковского приложения
- Мини-апп проверяет статус платежа
- Если `succeeded` → запись уже создана (webhook)
- Если `pending` → показываем ошибку

## 📁 Структура файлов

```
docs/
└── sbp-payment-integration-plan.md (этот файл)

lib/api/
├── yookassa.ts              # API функции для YooKassa
├── payments.ts              # CRUD для таблицы payments
└── bookings.ts              # существующий файл

lib/
└── logger.ts               # Структурированное логирование

api/
├── get-sbp-banks.ts         # GET список банков
├── create-payment-sbp.ts      # POST создание платежа
├── yookassa-webhook.ts       # Webhook от YooKassa
└── check-payment-status.ts    # Проверка статуса

components/client/
├── BookingWizard.tsx          # Мастер записи
├── PaymentMethodStep.tsx      # Шаг 2: выбор способа оплаты
├── BankSelectionStep.tsx      # Шаг 3: выбор банка (СБП)
└── ConfirmationStep.tsx        # Шаг 4: подтверждение записи

types.ts
└── Добавить типы для payments
```

## 🗄️ База данных

### Таблица `pending_bookings`

```sql
CREATE TABLE pending_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id BIGINT NOT NULL,
  client_name VARCHAR NOT NULL,
  phone VARCHAR NOT NULL,
  car_model VARCHAR NOT NULL,
  plate_number VARCHAR NOT NULL,
  booking_date DATE NOT NULL,
  start_time VARCHAR NOT NULL,
  end_time VARCHAR NOT NULL,
  services TEXT[] NOT NULL,
  post INTEGER NOT NULL,
  total_price NUMERIC NOT NULL,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pending_bookings_telegram_user ON pending_bookings(telegram_user_id);
CREATE INDEX idx_pending_bookings_expires_at ON pending_bookings(expires_at);
```

### Таблица `payments`

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  pending_booking_id UUID REFERENCES pending_bookings(id) ON DELETE CASCADE,
  yookassa_payment_id VARCHAR UNIQUE NOT NULL,
  amount NUMERIC NOT NULL,
  currency VARCHAR DEFAULT 'RUB',
  status VARCHAR NOT NULL CHECK (status IN ('pending', 'succeeded', 'canceled', 'waiting_for_capture')),
  payment_method VARCHAR CHECK (payment_method IN ('sbp', 'bank_card', 'yoo_money', 'cash', 'cashless')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payments_booking_id ON payments(booking_id);
CREATE INDEX idx_payments_pending_booking_id ON payments(pending_booking_id);
CREATE INDEX idx_payments_yookassa_id ON payments(yookassa_payment_id);
CREATE INDEX idx_payments_status ON payments(status);
```

### Изменения в таблице `bookings`

```sql
-- Добавить поле для связи с YooKassa (если нет):
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS yookassa_payment_id VARCHAR UNIQUE;
```

## 🔐 Переменные окружения

```env
# .env
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=test_secret_xxx
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
CRON_SECRET=your_random_secret_key_here
```

## 📝 API Endpoints

### 1. GET /api/get-sbp-banks

**Описание:** Получение списка банков СБП из кэша (Supabase) с автоматическим обновлением каждые 7 дней (168 часов)

**ВАЖНО:** Список банков загружается СРАЗУ при выборе СБП, затем пользователь выбирает банк → создается платеж!

**Запрос:**
```typescript
GET /api/get-sbp-banks
```

**Реализация:**
```typescript
// api/get-sbp-banks.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ШАГ 1: Читаем банки из Supabase (кэш) - БЫСТРО!
    const { data: banks, error } = await supabase
      .from('sbp_banks')
      .select('*')
      .order('name');

    if (error) {
      console.error('[GET-SBP-BANKS] Error:', error);
      return res.status(500).json({ error: 'Failed to get banks' });
    }

    if (!banks || banks.length === 0) {
      // Если кэш пуст - обновляем из YooKassa
      console.log('[GET-SBP-BANKS] Cache empty, updating...');
      
      const response = await fetch('https://api.yookassa.ru/v3/sbp_banks', {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(
            `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
          ).toString('base64')}`,
        },
      });
      
      const banksFromYooKassa = await response.json();
      
      // Сохраняем в кэш
      const banksToInsert = banksFromYooKassa.items.map((bank: any) => ({
        id: bank.id,
        name: bank.name,
        code: bank.code,
        logo: bank.logo,
        scheme: bank.scheme || '',
        deep_link: bank.deepLink || '',
        updated_at: new Date().toISOString(),
      }));
      
      await supabase.from('sbp_banks').insert(banksToInsert);
      
      return res.status(200).json({ banks: banksToInsert });
    }

    // ШАГ 2: Проверяем, нужно ли обновить кэш (старше 168 часов = 7 дней)
    const { data: lastUpdate } = await supabase
      .from('sbp_banks')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    const hoursSinceUpdate = lastUpdate
      ? (Date.now() - new Date(lastUpdate.updated_at).getTime()) / 3600000
      : 999;

    if (hoursSinceUpdate > 168) { // 7 дней = 168 часов
      // ШАГ 3: Асинхронно обновляем кэш (не ждем завершения)
      console.log('[GET-SBP-BANKS] Cache expired, updating...');
      
      fetch('https://api.yookassa.ru/v3/sbp_banks', {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(
            `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
          ).toString('base64')}`,
        },
      })
      .then(res => res.json())
      .then(banksFromYooKassa => {
        const banksToUpsert = banksFromYooKassa.items.map((bank: any) => ({
          id: bank.id,
          name: bank.name,
          code: bank.code,
          logo: bank.logo,
          scheme: bank.scheme || '',
          deep_link: bank.deepLink || '',
          updated_at: new Date().toISOString(),
        }));
        
        supabase.from('sbp_banks').upsert(banksToUpsert);
      })
      .catch(console.error);
    }

    // ШАГ 4: Возвращаем банки из кэша
    return res.status(200).json({ banks });
  } catch (error: any) {
    console.error('[GET-SBP-BANKS] Error:', error);
    return res.status(500).json({ error: 'Failed to get banks' });
  }
}
```

**Ответ:**
```json
{
  "banks": [
    {
      "id": "sberbank",
      "name": "СберБанк",
      "code": "SBERBANK",
      "logo": "https://yookassa.ru/banks/sberbank.png",
      "scheme": "sberbankonline://",
      "deepLink": "sberbankonline://payment/..."
    },
    {
      "id": "tinkoff",
      "name": "Тинькофф",
      "code": "TINKOFF",
      "logo": "https://yookassa.ru/banks/tinkoff.png",
      "scheme": "tinkoff://",
      "deepLink": "tinkoff://payment/..."
    }
    // ... еще 100+ банков
  ]
}
```

**Ключевые особенности:**
- ✅ Использует `GET /v3/sbp_banks` - НЕ создает платежи!
- ✅ Список банков загружается СРАЗУ из кэша (быстро!)
- ✅ Автоматическое обновление каждые 7 дней
- ✅ Fallback на старый кэш при ошибке API
- ✅ Асинхронное обновление без задержки для пользователя

### 2. POST /api/create-pending-booking

**Описание:** Создание временной записи в pending_bookings перед созданием платежа

**ВАЖНО:** Данные формы сохраняются в pending_bookings, в metadata платежа передается только pending_booking_id!

**Запрос:**
```typescript
POST /api/create-pending-booking
Content-Type: application/json

{
  "telegram_user_id": 123456789,
  "client_name": "Иван Иванов",
  "phone": "+79001234567",
  "car_model": "Toyota Camry",
  "plate_number": "А123БВ",
  "booking_date": "2026-02-06",
  "start_time": "10:00",
  "end_time": "11:00",
  "services": ["1", "2", "3"],
  "post": 1,
  "total_price": 1000
}
```

**Реализация:**
```typescript
// api/create-pending-booking.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const bookingData = req.body;
  
  // expires_at = 30 минут от текущего времени
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  try {
    const { data: pendingBooking, error } = await supabase
      .from('pending_bookings')
      .insert({
        ...bookingData,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[CREATE-PENDING-BOOKING] Error:', error);
      throw error;
    }

    return res.status(200).json({
      pendingBookingId: pendingBooking.id
    });
  } catch (error: any) {
    console.error('[CREATE-PENDING-BOOKING] Error:', error);
    return res.status(500).json({
      error: 'Failed to create pending booking',
      details: error.message
    });
  }
}
```

### 3. POST /api/create-payment-sbp

**Описание:** Создание платежа СБП (booking создаётся ТОЛЬКО после оплаты через webhook!)

**ВАЖНО:** В metadata передается ТОЛЬКО pending_booking_id, чтобы не превысить лимит 16 ключей!

**Запрос:**
```typescript
POST /api/create-payment-sbp
Content-Type: application/json

{
  "amount": 1000,
  "selectedBank": "sberbank", // опционально
  "pending_booking_id": "uuid"
}
```

**Реализация:**
```typescript
// api/create-payment-sbp.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { amount, selectedBank, pending_booking_id } = req.body;

  try {
    // Создаем платеж в YooKassa
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
        ).toString('base64')}`,
        'Idempotence-Key': `sbp-${Date.now()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: {
          value: amount.toString(),
          currency: 'RUB',
        },
        payment_method_data: {
          type: 'sbp',
        },
        confirmation: {
          type: 'redirect',
          return_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment-return?paymentId={PAYMENT_ID}`,
        },
        capture: true,
        description: `Оплата записи на автомойку`,
        metadata: {
          pending_booking_id, // ← ТОЛЬКО pending_booking_id!
          telegram_user_id: req.body.telegram_user_id?.toString() || 'unknown',
          source: 'telegram_mini_app',
        },
      }),
    });

    const payment = await response.json();

    // Сохраняем платеж в БД (booking_id пока NULL!)
    const { data: savedPayment, error: saveError } = await supabase
      .from('payments')
      .insert({
        yookassa_payment_id: payment.id,
        pending_booking_id,
        amount: amount,
        currency: 'RUB',
        status: payment.status,
        payment_method: 'sbp',
        metadata: {
          pending_booking_id,
          telegram_user_id: req.body.telegram_user_id?.toString() || 'unknown',
          source: 'telegram_mini_app',
        },
        booking_id: null, // ← Заполнится после оплаты через webhook
      })
      .select()
      .single();

    if (saveError) {
      console.error('[CREATE-PAYMENT-SBP] Save error:', saveError);
      
      // Если pending_booking уже создан, удаляем его при ошибке
      await supabase
        .from('pending_bookings')
        .delete()
        .eq('id', pending_booking_id);
        
      return res.status(500).json({ error: 'Failed to save payment' });
    }

    return res.status(200).json({
      paymentId: payment.id,
      confirmationUrl: payment.confirmation?.confirmation_url,
    });
  } catch (error: any) {
    console.error('[CREATE-PAYMENT-SBP] Error:', error);
    
    // Если pending_booking уже создан, удаляем его при ошибке
    if (pending_booking_id) {
      await supabase
        .from('pending_bookings')
        .delete()
        .eq('id', pending_booking_id);
    }
    
    return res.status(500).json({ error: 'Failed to create payment' });
  }
}
```

**Ответ:**
```json
{
  "paymentId": "22d6d597-000f-5000-9000-145f6df21d6f",
  "confirmationUrl": "https://yoomoney.ru/checkout/payments/sbp?orderId=..."
}
```

### 4. POST /api/yookassa-webhook

**Описание:** Webhook для автоматического создания записей с проверкой подписи и idempotency

**Запрос от YooKassa:**
```json
POST /api/yookassa-webhook
Content-Type: application/json
X-Yookassa-Signature: <sha256_hash>

{
  "event": "payment.succeeded",
  "object": {
    "id": "22d6d597-000f-5000-9000-145f6df21d6f",
    "status": "succeeded",
    "amount": { "value": "1000.00", "currency": "RUB" },
    "metadata": {
      "pending_booking_id": "uuid"
    }
  }
}
```

**Реализация:**
```typescript
// api/yookassa-webhook.ts
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Проверка подписи webhook от YooKassa
 */
function verifyWebhookSignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', process.env.YOOKASSA_SECRET_KEY!)
    .update(body)
    .digest('hex');
  
  return hash === signature;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Проверка подписи webhook
  const signature = req.headers['x-yookassa-signature'];
  if (!signature || !verifyWebhookSignature(JSON.stringify(req.body), signature)) {
    console.error('[YOOKASSA-WEBHOOK] Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body.event;
  const payment = req.body.object;

  console.log('[YOOKASSA-WEBHOOK] Event:', event, 'Payment ID:', payment.id);

  try {
    if (event === 'payment.succeeded') {
      // IDEMPOTENCY CHECK: Проверяем, не создана ли уже запись
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('id')
        .eq('yookassa_payment_id', payment.id)
        .single();

      if (existingBooking) {
        console.log('[YOOKASSA-WEBHOOK] Booking already exists, skipping');
        return res.status(200).json({ success: true });
      }

      // Получаем данные из pending_booking
      const { data: pendingBooking } = await supabase
        .from('pending_bookings')
        .select('*')
        .eq('id', payment.metadata.pending_booking_id)
        .single();

      if (!pendingBooking) {
        console.error('[YOOKASSA-WEBHOOK] Pending booking not found');
        return res.status(404).json({ error: 'Pending booking not found' });
      }

      // Обновляем статус платежа
      await supabase
        .from('payments')
        .update({ status: 'succeeded' })
        .eq('yookassa_payment_id', payment.id);

      // Создаем запись в bookings
      const { data: booking } = await supabase
        .from('bookings')
        .insert({
          client_name: pendingBooking.client_name,
          phone: pendingBooking.phone,
          car_model: pendingBooking.car_model,
          plate_number: pendingBooking.plate_number,
          booking_date: pendingBooking.booking_date,
          start_time: pendingBooking.start_time,
          end_time: pendingBooking.end_time,
          services: pendingBooking.services,
          post: pendingBooking.post,
          price: pendingBooking.total_price,
          payment_method: 'sbp',
          yookassa_payment_id: payment.id,
          is_paid: true,
          paid_at: new Date().toISOString(),
          status: 'ОЖИДАЕТ',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      console.log('[YOOKASSA-WEBHOOK] Booking created:', booking?.id);

      // Обновляем платеж с booking_id
      if (booking?.id) {
        await supabase
          .from('payments')
          .update({ booking_id: booking.id })
          .eq('yookassa_payment_id', payment.id);
      }

      // Удаляем pending_booking
      await supabase
        .from('pending_bookings')
        .delete()
        .eq('id', payment.metadata.pending_booking_id);

      // Отправляем уведомление в мини-апп (WebSocket)
      // TODO: реализовать через WebSocket
    } else if (event === 'payment.canceled') {
      console.log('[YOOKASSA-WEBHOOK] Payment canceled:', payment.id);
      
      // Проверяем, есть ли уже созданная запись
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('id')
        .eq('yookassa_payment_id', payment.id)
        .single();
      
      if (existingBooking) {
        // Если запись уже создана — удаляем (CASCADE удалит и payment)
        await supabase
          .from('bookings')
          .delete()
          .eq('id', existingBooking.id);
          
        console.log('[YOOKASSA-WEBHOOK] Deleted booking for canceled payment');
      } else {
        // Иначе просто удаляем pending_booking
        if (payment.metadata?.pending_booking_id) {
          await supabase
            .from('pending_bookings')
            .delete()
            .eq('id', payment.metadata.pending_booking_id);
        }
      }
      
      // Обновляем статус платежа
      await supabase
        .from('payments')
        .update({ status: 'canceled' })
        .eq('yookassa_payment_id', payment.id);
        
      return res.status(200).json({ success: true });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error: any) {
    console.error('[YOOKASSA-WEBHOOK] Error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
```

### 5. GET /api/check-payment-status

**Описание:** Проверка статуса платежа (fallback с интервалом 3 сек, 20 попыток)

**ВАЖНО:** Используется polling на клиенте с интервалом 3 секунды, максимум 20 попыток (1 минута)

**Запрос:**
```typescript
GET /api/check-payment-status?paymentId=xxx
```

**Реализация:**
```typescript
// api/check-payment-status.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { paymentId } = req.query;

  try {
    // Проверяем статус платежа в YooKassa
    const response = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
        ).toString('base64')}`,
      },
    });

    const payment = await response.json();

    // Обновляем статус в БД
    await supabase
      .from('payments')
      .update({ status: payment.status })
      .eq('yookassa_payment_id', paymentId);

    // Если платеж успешен и есть booking_id - создаем запись
    if (payment.status === 'succeeded') {
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('booking_id, pending_booking_id')
        .eq('yookassa_payment_id', paymentId)
        .single();

      if (existingPayment?.booking_id) {
        // Запись уже создана webhook'ом
        return res.status(200).json({ status: 'already_created' });
      }

      // Получаем данные из pending_booking
      const { data: pendingBooking } = await supabase
        .from('pending_bookings')
        .select('*')
        .eq('id', existingPayment.pending_booking_id)
        .single();

      if (!pendingBooking) {
        console.error('[CHECK-PAYMENT-STATUS] Pending booking not found');
        return res.status(404).json({ error: 'Pending booking not found' });
      }

      // Создаем запись
      const { data: booking } = await supabase
        .from('bookings')
        .insert({
          client_name: pendingBooking.client_name,
          phone: pendingBooking.phone,
          car_model: pendingBooking.car_model,
          plate_number: pendingBooking.plate_number,
          booking_date: pendingBooking.booking_date,
          start_time: pendingBooking.start_time,
          end_time: pendingBooking.end_time,
          services: pendingBooking.services,
          post: pendingBooking.post,
          price: pendingBooking.total_price,
          payment_method: 'sbp',
          yookassa_payment_id: payment.id,
          is_paid: true,
          paid_at: new Date().toISOString(),
          status: 'ОЖИДАЕТ',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      // Обновляем платеж с booking_id
      await supabase
        .from('payments')
        .update({ booking_id: booking.id })
        .eq('yookassa_payment_id', paymentId);

      // Удаляем pending_booking
      await supabase
        .from('pending_bookings')
        .delete()
        .eq('id', existingPayment.pending_booking_id);

      return res.status(200).json({
        status: 'succeeded',
        bookingId: booking.id
      });
    }

    return res.status(200).json({ status: payment.status });
  } catch (error: any) {
    console.error('[CHECK-PAYMENT-STATUS] Error:', error);
    return res.status(500).json({ error: 'Failed to check status' });
  }
}
```

### 6. POST /api/cleanup-expired-payments

**Описание:** Очистка истекших pending_bookings и отмена платежей в YooKassa

**Запрос:**
```typescript
POST /api/cleanup-expired-payments
Authorization: Bearer CRON_SECRET
```

**Реализация:**
```typescript
// api/cleanup-expired-payments.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  // Проверка авторизации (CRON_SECRET)
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[CLEANUP-EXPIRED-PAYMENTS] Starting cleanup...');

    // ШАГ 1: Находим истекшие pending_bookings по expires_at
    const { data: expiredBookings, error } = await supabase
      .from('pending_bookings')
      .select('id')
      .lt('expires_at', new Date().toISOString());

    if (error) {
      console.error('[CLEANUP-EXPIRED-PAYMENTS] Error:', error);
      return res.status(500).json({ error: 'Failed to fetch expired bookings' });
    }

    if (!expiredBookings || expiredBookings.length === 0) {
      console.log('[CLEANUP-EXPIRED-PAYMENTS] No expired bookings');
      return res.status(200).json({ cleaned: 0 });
    }

    console.log(`[CLEANUP-EXPIRED-PAYMENTS] Found ${expiredBookings.length} expired bookings`);

    const expiredIds = expiredBookings.map(b => b.id);

    // ШАГ 2: Находим связанные платежи в статусе pending
    const { data: paymentsToCancel } = await supabase
      .from('payments')
      .select('yookassa_payment_id')
      .in('pending_booking_id', expiredIds)
      .eq('status', 'pending');

    // ШАГ 3: Отменяем платежи в YooKassa
    if (paymentsToCancel && paymentsToCancel.length > 0) {
      for (const payment of paymentsToCancel) {
        try {
          await fetch(`https://api.yookassa.ru/v3/payments/${payment.yookassa_payment_id}/cancel`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${Buffer.from(
                `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
              ).toString('base64')}`,
              'Content-Type': 'application/json',
              'Idempotence-Key': `cancel-${payment.yookassa_payment_id}-${Date.now()}`,
            },
          });
          console.log(`[CLEANUP-EXPIRED-PAYMENTS] Canceled payment: ${payment.yookassa_payment_id}`);
        } catch (error) {
          console.error(`[CLEANUP-EXPIRED-PAYMENTS] Failed to cancel payment: ${payment.yookassa_payment_id}`, error);
        }

        // Обновляем статус платежа
        await supabase
          .from('payments')
          .update({ status: 'canceled' })
          .eq('yookassa_payment_id', payment.yookassa_payment_id);
      }
    }

    // ШАГ 4: Удаляем истекшие pending_bookings (payments удалятся автоматом через CASCADE)
    const { error: deleteError } = await supabase
      .from('pending_bookings')
      .delete()
      .in('id', expiredIds);

    if (deleteError) {
      console.error('[CLEANUP-EXPIRED-PAYMENTS] Delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete expired bookings' });
    }

    console.log(`[CLEANUP-EXPIRED-PAYMENTS] Cleaned ${expiredBookings.length} expired bookings`);

    return res.status(200).json({
      success: true,
      cleaned: expiredBookings.length
    });
  } catch (error: any) {
    console.error('[CLEANUP-EXPIRED-PAYMENTS] Error:', error);
    return res.status(500).json({
      error: 'Failed to cleanup expired payments',
      details: error.message
    });
  }
}
```

## 🎨 Компоненты UI

### PaymentMethodStep.tsx

```typescript
import { useState } from 'react';

interface Props {
  onSelect: (method: string) => void;
  selected: string | null;
  loading: boolean;
}

export function PaymentMethodStep({ onSelect, selected, loading }: Props) {
  return (
    <div className="payment-method-step">
      <h2>Выберите способ оплаты</h2>
      
      <div className="payment-methods">
        <button
          onClick={() => onSelect('cash')}
          className={selected === 'cash' ? 'active' : ''}
          disabled={loading}
        >
          Наличка
        </button>
        
        <button
          onClick={() => onSelect('cashless')}
          className={selected === 'cashless' ? 'active' : ''}
          disabled={loading}
        >
          Безнал
        </button>
        
        <button
          onClick={() => onSelect('sbp')}
          className={selected === 'sbp' ? 'active' : ''}
          disabled={loading}
        >
          СБП
        </button>
      </div>
    </div>
  );
}
```

**Использование в мастере записи:**
```typescript
// BookingWizard.tsx
function BookingWizard() {
  // Сохраняем данные формы в state, НЕ в БД!
  const [formData, setFormData] = useState({
    client_name: '',
    phone: '',
    car_model: '',
    plate_number: '',
    booking_date: '',
    start_time: '',
    end_time: '',
    services: [],
    post: 1,
  });
  
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  
  const handlePaymentMethodSelect = async (method: string) => {
    setPaymentMethod(method);
    
    // Для налички и безнала - создаём запись СРАЗУ!
    if (method === 'cash' || method === 'cashless') {
      await createBooking({
        ...formData,
        payment_method: method,
        is_paid: false, // Оплата на месте
        status: 'ОЖИДАЕТ',
      });
      
      // Перенаправляем на /booking-success
      router.push('/booking-success');
    }
    // Для СБП - переходим к выбору банка
  };
  
  const handleSBPPayment = async (selectedBank: string) => {
    // Создаём платеж СБП с metadata из state!
    const response = await fetch('/api/create-payment-sbp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: calculateTotalPrice(formData.services),
        selectedBank,
        metadata: formData, // ← Данные из state!
      }),
    });
    
    const { confirmationUrl } = await response.json();
    
    // Открываем банковское приложение
    window.location.href = confirmationUrl;
    // Booking создастся ТОЛЬКО после оплаты через webhook!
  };
  
  return (
    <div>
      {/* Шаг 1: Выбор услуг и даты */}
      <ServiceSelectionStep 
        formData={formData}
        onChange={setFormData}
      />
      
      {/* Шаг 2: Выбор способа оплаты */}
      <PaymentMethodStep
        onSelect={handlePaymentMethodSelect}
        selected={paymentMethod}
        loading={loading}
      />
      
      {/* Шаг 3: Выбор банка (только для СБП) */}
      {paymentMethod === 'sbp' && (
        <BankSelectionStep
          banks={banks}
          onSelect={handleSBPPayment}
          onBack={() => setPaymentMethod(null)}
        />
      )}
    </div>
  );
}
```

**ВАЖНО:**
- **Наличка/Безнал:** запись создаётся СРАЗУ при нажатии кнопки
- **СБП:** запись создаётся ТОЛЬКО после оплаты через webhook!

### BankSelectionStep.tsx

```typescript
import { useState } from 'react';

interface Bank {
  id: string;
  name: string;
  code: string;
  logo: string;
  deepLink: string;
}

interface Props {
  banks: Bank[];
  onSelect: (bank: Bank) => void;
  onBack: () => void;
}

export function BankSelectionStep({ banks, onSelect, onBack }: Props) {
  return (
    <div className="bank-selection-step">
      <div className="step-header">
        <button onClick={onBack} className="back-button">
          ← Назад
        </button>
        <h2>Выберите банк</h2>
      </div>
      
      <div className="banks-grid">
        {banks.map((bank) => (
          <button
            key={bank.id}
            onClick={() => onSelect(bank)}
            className="bank-card"
          >
            <img src={bank.logo} alt={bank.name} />
            <span>{bank.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### ConfirmationStep.tsx

```typescript
import { useState } from 'react';

interface Props {
  paymentMethod: string;
  onConfirm: () => void;
  onBack: () => void;
}

export function ConfirmationStep({ paymentMethod, onConfirm, onBack }: Props) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="confirmation-step">
      <div className="step-header">
        <button onClick={onBack} className="back-button">
          ← Назад
        </button>
        <h2>Подтверждение записи</h2>
      </div>
      
      <div className="confirmation-info">
        <p>Способ оплаты: {getPaymentMethodName(paymentMethod)}</p>
        <button 
          onClick={onConfirm}
          disabled={loading}
          className="confirm-button"
        >
          {loading ? 'Создание записи...' : 'Подтвердить'}
        </button>
      </div>
    </div>
  );
}

function getPaymentMethodName(method: string): string {
  const names: Record<string, string> = {
    cash: 'Наличка',
    cashless: 'Безнал',
    sbp: 'СБП (через приложение банка)',
  };
  return names[method] || method;
}
```

## 🔄 Поток данных

```
┌─────────────────────────────────────────────────────────────────┐
│  Пользователь (Telegram Mini App):                       │
│                                                          │
│  1. Выбирает услуги и дату → сохраняем в state       │
│  2. Выбирает способ оплаты → "СБП"                     │
│  3. Загружает список банков из Supabase (кэш!)        │
│  4. Выбирает банк                                      │
│  5. Создаёт платеж: POST /api/create-payment-sbp       │
│     {                                                   │
│       amount: 1000,                                      │
│       metadata: { ...formData из state! }                  │
│     }                                                   │
│     ↓                                                  │
│  6. API создаёт платеж в YooKassa                       │
│  7. API сохраняет платеж в БД (booking_id = NULL!)      │
│  8. API возвращает confirmationUrl                        │
│  9. Мини-апп открывает банковское приложение           │
│     ↓                                                  │
│ 10. Пользователь оплачивает в банковском приложении       │
│     ↓                                                  │
│ 11. Банк перенаправляет на return_url                    │
│                                                          │
│  ПАРАЛЛЕЛЬНО (Webhook):                             │
│  12. YooKassa отправляет webhook (payment.succeeded)      │
│     ↓                                                  │
│  13. POST /api/yookassa-webhook                        │
│     ↓                                                  │
│  14. Webhook создаёт запись в bookings из metadata!     │
│     ↓                                                  │
│  15. Webhook обновляет payment.booking_id                │
│                                                          │
│  Возврат пользователя:                                │
│  16. Мини-апп проверяет paymentId в URL               │
│  17. API: GET /api/check-payment-status?paymentId=xxx   │
│     ↓                                                  │
│  18. Если succeeded && booking_id → уже создано!        │
│  19. Перенаправляем на /booking-success                │
│                                                          │
│  Если webhook не сработал (fallback):                 │
│  20. API создаёт запись из metadata                     │
│  21. Перенаправляем на /booking-success                │
└─────────────────────────────────────────────────────────────────┘
```

**Ключевые моменты:**
- Данные формы сохраняются в state, НЕ в БД!
- Платёж создаётся с metadata, booking_id = NULL
- Booking создаётся ТОЛЬКО после оплаты через webhook
- Если webhook не сработал → fallback через polling

## 📝 Structured Logging

Для отладки и мониторинга платежных событий добавьте структурированное логирование:

```typescript
// lib/logger.ts
export interface PaymentLogData {
  timestamp: string;
  event: string;
  paymentId?: string;
  pendingBookingId?: string;
  bookingId?: string;
  userId?: string;
  amount?: number;
  status?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export function logPaymentEvent(
  event: string,
  data: Partial<PaymentLogData>
) {
  const logData: PaymentLogData = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };

  console.log(JSON.stringify(logData));
}

// Используйте в коде:
// logPaymentEvent('payment.created', {
//   paymentId: payment.id,
//   userId: telegramUserId,
//   amount: 1000
// });
```

## 🔧 API функции для YooKassa

```typescript
// lib/api/yookassa.ts

/**
 * Отмена платежа в YooKassa
 */
export async function cancelPayment(paymentId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.yookassa.ru/v3/payments/${paymentId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(
            `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
          ).toString('base64')}`,
          'Content-Type': 'application/json',
          'Idempotence-Key': `cancel-${paymentId}-${Date.now()}`,
        },
      }
    );

    if (!response.ok) {
      console.error('[YOOKASSA] Cancel failed:', await response.text());
      return false;
    }

    console.log(`[YOOKASSA] Payment ${paymentId} canceled`);
    return true;
  } catch (error) {
    console.error('[YOOKASSA] Cancel error:', error);
    return false;
  }
}
```

## 🎨 Обновленные компоненты UI

### BankSelectionStep.tsx с fallback на QR-код

```typescript
import { useState } from 'react';

interface Bank {
  id: string;
  name: string;
  code: string;
  logo: string;
  scheme: string;
  deepLink: string;
}

interface Props {
  banks: Bank[];
  onSelect: (bank: Bank) => void;
  onBack: () => void;
}

export function BankSelectionStep({ banks, onSelect, onBack }: Props) {
  const [showQRCode, setShowQRCode] = useState(false);

  const handleBankSelect = (bank: Bank) => {
    // Попытка 1: Deep link
    const deepLink = bank.deepLink || `${bank.scheme}://qr.nspk.ru/`;
    window.location.href = deepLink;

    // Попытка 2: Fallback через таймаут (если приложение не открылось)
    setTimeout(() => {
      if (!paymentCompleted) {
        setShowQRCode(true);
        setMessage('Не открылось приложение банка? Отсканируйте QR-код');
      }
    }, 10000); // 10 секунд для медленных устройств
  };

  if (showQRCode) {
    return (
      <div className="qr-code-fallback">
        <h2>QR-код для оплаты</h2>
        <p>Отсканируйте QR-код в приложении вашего банка</p>
        {/* Здесь должен быть QR-код */}
        <div className="qr-code-placeholder">
          QR-код будет здесь
        </div>
        <button onClick={() => setShowQRCode(false)}>
          ← Вернуться к выбору банка
        </button>
      </div>
    );
  }

  return (
    <div className="bank-selection-step">
      <div className="step-header">
        <button onClick={onBack} className="back-button">
          ← Назад
        </button>
        <h2>Выберите банк</h2>
      </div>
      
      <div className="banks-grid">
        {banks.map((bank) => (
          <button
            key={bank.id}
            onClick={() => handleBankSelect(bank)}
            className="bank-card"
          >
            <img src={bank.logo} alt={bank.name} />
            <span>{bank.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### BookingWizard.tsx с polling fallback

```typescript
// BookingWizard.tsx
import { useState, useEffect } from 'react';

function BookingWizard() {
  const [formData, setFormData] = useState({
    client_name: '',
    phone: '',
    car_model: '',
    plate_number: '',
    booking_date: '',
    start_time: '',
    end_time: '',
    services: [],
    post: 1,
  });
  
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  
  // Polling для проверки статуса платежа
  useEffect(() => {
    if (!paymentId || paymentStatus === 'succeeded') return;

    const pollPaymentStatus = async () => {
      if (pollingAttempts >= 20) { // 20 попыток по 3 сек = 1 минута
        setPaymentStatus('timeout');
        return;
      }

      try {
        const response = await fetch(`/api/check-payment-status?paymentId=${paymentId}`);
        const data = await response.json();

        if (data.status === 'succeeded') {
          setPaymentStatus('succeeded');
          router.push('/booking-success');
        } else if (data.status === 'canceled') {
          setPaymentStatus('canceled');
        } else {
          setPollingAttempts(prev => prev + 1);
        }
      } catch (error) {
        console.error('[POLLING] Error:', error);
        setPollingAttempts(prev => prev + 1);
      }
    };

    const interval = setInterval(pollPaymentStatus, 3000); // 3 секунды

    return () => clearInterval(interval);
  }, [paymentId, pollingAttempts, paymentStatus]);
  
  const handlePaymentMethodSelect = async (method: string) => {
    setPaymentMethod(method);
    
    // Для налички и безнала - создаём запись СРАЗУ!
    if (method === 'cash' || method === 'cashless') {
      await createBooking({
        ...formData,
        payment_method: method,
        is_paid: false,
        status: 'ОЖИДАЕТ',
      });
      
      router.push('/booking-success');
    }
  };
  
  const handleSBPPayment = async (selectedBank: string) => {
    // ШАГ 1: Создаем pending_booking
    const pendingResponse = await fetch('/api/create-pending-booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        telegram_user_id: getTelegramUserId(),
        total_price: calculateTotalPrice(formData.services),
      }),
    });
    
    const { pendingBookingId } = await pendingResponse.json();
    
    // ШАГ 2: Создаем платеж СБП
    const response = await fetch('/api/create-payment-sbp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: calculateTotalPrice(formData.services),
        selectedBank,
        pending_booking_id: pendingBookingId,
        telegram_user_id: getTelegramUserId(),
      }),
    });
    
    const { paymentId, confirmationUrl } = await response.json();
    
    setPaymentId(paymentId);
    
    // Открываем банковское приложение
    window.location.href = confirmationUrl;
  };
  
  if (paymentStatus === 'timeout') {
    return (
      <div className="payment-timeout">
        <h2>Оплата обрабатывается</h2>
        <p>Мы уведомим вас, когда запись будет подтверждена</p>
        <button onClick={() => router.push('/')}>
          На главную
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Шаг 1: Выбор услуг и даты */}
      <ServiceSelectionStep
        formData={formData}
        onChange={setFormData}
      />
      
      {/* Шаг 2: Выбор способа оплаты */}
      <PaymentMethodStep
        onSelect={handlePaymentMethodSelect}
        selected={paymentMethod}
        loading={false}
      />
      
      {/* Шаг 3: Выбор банка (только для СБП) */}
      {paymentMethod === 'sbp' && (
        <BankSelectionStep
          banks={banks}
          onSelect={handleSBPPayment}
          onBack={() => setPaymentMethod(null)}
        />
      )}
    </div>
  );
}
```

## ✅ Чеклист реализации

### Базовая интеграция:

- [ ] Создать миграцию для таблицы `pending_bookings`
- [ ] Создать миграцию для таблицы `payments`
- [ ] Добавить поле в таблицу `bookings` (yookassa_payment_id)
- [ ] Создать API endpoint `/api/create-pending-booking`
- [ ] Создать API endpoint `/api/create-payment-sbp`
- [ ] Создать API endpoint `/api/yookassa-webhook` с проверкой подписи
- [ ] Создать API endpoint `/api/check-payment-status`
- [ ] Создать API endpoint `/api/cleanup-expired-payments`
- [ ] Создать компонент `PaymentMethodStep.tsx`
- [ ] Создать компонент `BankSelectionStep.tsx` с fallback на QR-код
- [ ] Создать компонент `ConfirmationStep.tsx`
- [ ] Создать `lib/logger.ts` для структурированного логирования
- [ ] Интегрировать polling fallback в `BookingWizard.tsx` (3 сек × 20 попыток)
- [ ] Добавить переменные в `.env` (YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, NEXT_PUBLIC_APP_URL, CRON_SECRET)
- [ ] Настроить webhook в YooKassa кабинете
- [ ] Настроить cron jobs в `vercel.json`
- [ ] Тестировать в тестовом режиме YooKassa
- [ ] Тестировать возврат пользователя из банковского приложения
- [ ] Тестировать webhook (payment.succeeded, payment.canceled)
- [ ] Тестировать polling fallback
- [ ] Тестировать fallback на QR-код
- [ ] Тестировать cleanup expired payments

### Кэширование банков (РЕКОМЕНДУЕТСЯ):

- [ ] Создать миграцию для таблицы `sbp_banks`
- [ ] Создать API endpoint `/api/get-sbp-banks` (из кэша с автообновлением каждые 7 дней)
- [ ] Создать API endpoint `/api/update-sbp-banks` (CRON)
- [ ] Добавить cron job в `vercel.json` для `/api/update-sbp-banks`
- [ ] Добавить cron job в `vercel.json` для `/api/cleanup-expired-payments`
- [ ] Протестировать работу кэширования и обновления
- [ ] Протестировать cleanup expired payments

## 🚀 ЛУЧШЕЕ РЕШЕНИЕ: Кэширование списка банков в Supabase

### Почему кэширование ЛУЧШЕ:

#### Проблема текущего подхода (запрос к YooKassa):

```
Каждый пользователь при выборе СБП:
1. Делает запрос к YooKassa → создает платеж на 1 рубль
2. Получает список банков
3. Выбирает банк → оплачивает

Минус:
❌ 1000 пользователей = 1000 запросов к YooKassa
❌ Нагрузка на YooKassa API
❌ Задержка для пользователя
❌ Лимиты API YooKassa
```

#### Мое решение (кэширование в Supabase):

```
Один раз в 7 дней (cron):
1. Делает запрос к YooKassa → GET /v3/sbp_banks
2. Получает список банков
3. Сохраняет в Supabase таблицу sbp_banks
4. ВСЕ пользователи берут из Supabase

Плюсы:
✅ 1 запрос к YooKassa = ВСЕ пользователи
✅ Быстро! Данные в Supabase
✅ Надежно! Нет зависимости от YooKassa API
✅ Актуально! Обновляется каждые 7 дней
✅ Без лимитов! Нет нагрузки на YooKassa
```

### Реализация:

#### 1. Таблица `sbp_banks` в Supabase

```sql
CREATE TABLE sbp_banks (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  logo VARCHAR NOT NULL,
  scheme VARCHAR,
  deep_link VARCHAR,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sbp_banks_updated_at ON sbp_banks(updated_at);
```

#### 2. API endpoint: GET /api/get-sbp-banks (ОБНОВЛЕННЫЙ)

**Описание:** Получение списка банков СБП из кэша (Supabase)

**Реализация:**
```typescript
// api/get-sbp-banks.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Получаем банки из Supabase (кэш)
    const { data: banks, error } = await supabase
      .from('sbp_banks')
      .select('*')
      .order('name');

    if (error) {
      console.error('[GET-SBP-BANKS] Error:', error);
      return res.status(500).json({ error: 'Failed to get banks' });
    }

    if (!banks || banks.length === 0) {
      // Если кэш пуст - возвращаем ошибку
      return res.status(503).json({ 
        error: 'Banks cache is empty. Please contact administrator.' 
      });
    }

    return res.status(200).json({ banks });
  } catch (error: any) {
    console.error('[GET-SBP-BANKS] Error:', error);
    return res.status(500).json({ error: 'Failed to get banks' });
  }
}
```

#### 3. API endpoint: POST /api/update-sbp-banks (CRON)

**Описание:** Обновление списка банков в кэше (запускается раз в 7 дней)

**Реализация:**
```typescript
// api/update-sbp-banks.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  // Проверка авторизации (CRON_SECRET)
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[UPDATE-SBP-BANKS] Starting update...');

    // ШАГ 1: Получаем список банков через GET /v3/sbp_banks
    const response = await fetch('https://api.yookassa.ru/v3/sbp_banks', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(
          `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
        ).toString('base64')}`,
      },
    });

    const data = await response.json();

    if (!data?.items || data.items.length === 0) {
      console.error('[UPDATE-SBP-BANKS] No banks in response');
      return res.status(500).json({ error: 'No banks in YooKassa response' });
    }

    // ШАГ 2: Удаляем старые банки
    await supabase.from('sbp_banks').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // ШАГ 3: Вставляем новые банки
    const banksToInsert = data.items.map((bank: any) => ({
      id: bank.id,
      name: bank.name,
      code: bank.code,
      logo: bank.logo,
      scheme: bank.scheme,
      deep_link: bank.deepLink || '',
    }));

    const { error: insertError } = await supabase
      .from('sbp_banks')
      .insert(banksToInsert);

    if (insertError) {
      console.error('[UPDATE-SBP-BANKS] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[UPDATE-SBP-BANKS] Updated ${banksToInsert.length} banks`);

    return res.status(200).json({
      success: true,
      count: banksToInsert.length,
      updated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[UPDATE-SBP-BANKS] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to update banks',
      details: error.message 
    });
  }
}

// Конфигурация для Vercel Serverless Functions
export const config = {
  maxDuration: 30, // максимальное время выполнения в секундах
};
```

#### 4. Обновление `vercel.json` с cron jobs

```json
{
  "functions": {
    "api/**/*.ts": {
      "runtime": "nodejs20.x"
    }
  },
  "crons": [
    {
      "path": "/api/reset-daily",
      "schedule": "0 21 * * *"
    },
    {
      "path": "/api/update-sbp-banks",
      "schedule": "0 3 * * 0"  // Каждое воскресенье в 3:00 MSK
    },
    {
      "path": "/api/cleanup-expired-payments",
      "schedule": "*/30 * * * *"  // Каждые 30 минут
    }
  ]
}
```

#### 5. Обновленный поток данных

```
┌─────────────────────────────────────────────────────────────────┐
│  CRON (раз в 7 дней):                                    │
│  1. POST /api/update-sbp-banks                             │
│  2. YooKassa: GET /v3/sbp_banks                          │
│  3. YooKassa возвращает список банков                        │
│  4. Сохраняем в Supabase таблицу sbp_banks                  │
│                                                          │
│  Пользователь (каждый раз):                          │
│  5. Выбирает "СБП" на шаге 2                               │
│  6. API: GET /api/get-sbp-banks (из Supabase!)             │
│  7. Мини-апп показывает список банков                       │
│  8. Пользователь выбирает банк → оплачивает                │
└─────────────────────────────────────────────────────────────────┘
```

### Преимущества кэширования:

| Показатель | Без кэша | С кэшем |
|-----------|---------|---------|
| Запросов к YooKassa | 1000/день | 1/7 дней |
| Время ответа | 500-1000ms | 50-100ms |
| Зависимость от YooKassa API | Критическая | Минимальная |
| Лимиты API | Риск превышения | Нет |
| Надежность | Средняя | Высокая |

## 📚 Полезные ссылки

- [YooKassa API документация](https://yookassa.ru/developers)
- [СБП интеграция](https://yookassa.ru/developers/payment-acceptance/integration-scenarios/manual-integration/other/sbp)
- [Webhooks документация](https://yookassa.ru/developers/payment-acceptance/integration-scenarios/manual-integration/other/b2b-sberbank)
