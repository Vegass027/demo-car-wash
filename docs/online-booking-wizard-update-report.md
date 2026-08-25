# 📋 Отчет: Обновление OnlineBookingWizard для интеграции СБП

## 🎯 Обзор

Обновлен компонент [`OnlineBookingWizard.tsx`](../components/client/OnlineBookingWizard.tsx) для интеграции оплаты через СБП (Система быстрых платежей) с YooKassa.

## 📊 Изменения в мастере записи

### 1. Обновление типа оплаты

**До:**
```typescript
paymentMethod: 'Наличный' | 'Безналичный' | 'Перевод'
```

**После:**
```typescript
paymentMethod: 'Наличный' | 'Безналичный' | 'Перевод' | 'СБП'
```

### 2. Обновление количества шагов

**До:**
```typescript
const STEPS = 3; // 3 шага: 0-Выбор авто, 1-Услуги, 2-Подтверждение
```

**После:**
```typescript
const STEPS = 4; // 4 шага: 0-Выбор авто, 1-Услуги, 2-Выбор вида оплаты, 3-Подтверждение/Выбор банка
```

### 3. Обновление заголовка мастера записи

**До:**
```typescript
{step === 1 ? 'Выбор авто' : step === 2 ? 'Услуги' : 'Подтверждение'}
```

**После:**
```typescript
{step === 1 ? 'Выбор авто' : step === 2 ? 'Услуги' : step === 3 ? 'Выбор вида оплаты' : 'Подтверждение'}
```

### 4. Обновление кнопки на ШАГЕ 2 (Услуги)

**До:**
```typescript
<Button className="w-full h-12" onClick={nextStep} disabled={selectedServices.length === 0}>
  Далее
</Button>
```

**После:**
```typescript
<Button className="w-full h-12" onClick={() => { setPaymentMethod('Наличный'); nextStep(); }} disabled={selectedServices.length === 0}>
  Далее
</Button>
```

**Обоснование:** При переходе к ШАГУ 3 (выбор способа оплаты) устанавливаем способ оплаты по умолчанию - "Наличный".

### 5. Новый ШАГ 3: Выбор способа оплаты

```typescript
{/* Шаг 3: Выбор вида оплаты */}
{step === 3 && (
  <div className="space-y-6 animate-in slide-in-from-right duration-300">
    <h3 className="text-xl font-bold">Выберите способ оплаты</h3>

    {/* Способ оплаты */}
    <div className="space-y-3">
      <Label>Способ оплаты</Label>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setPaymentMethod('Наличный')} ...>
          <CreditCard />
          <span>Наличный</span>
        </button>
        <button onClick={() => setPaymentMethod('Безналичный')} ...>
          <CreditCard />
          <span>Безнал</span>
        </button>
        <button onClick={() => setPaymentMethod('Перевод')} ...>
          <Send />
          <span>Перевод</span>
        </button>
        <button onClick={() => setPaymentMethod('СБП')} ...>
          <Building2 />
          <span>СБП</span>
        </button>
      </div>
    </div>

    <Button
      className="w-full h-14 text-lg"
      onClick={nextStep}
      disabled={!paymentMethod}
    >
      <Check className="w-5 h-5 mr-2" />
      {paymentMethod === 'СБП' ? 'Оплатить и записаться' : 'Подтвердить'}
    </Button>
  </div>
)}
```

### 6. Обновленный ШАГ 4: Подтверждение записи / Выбор банка

```typescript
{/* Шаг 4: Подтверждение записи / Выбор банка */}
{step === 4 && (
  <div className="space-y-6 animate-in slide-in-from-right duration-300">
    {/* Если СБП - показываем выбор банка */}
    {paymentMethod === 'СБП' ? (
      <BankSelectionStep
        bookingDetails={{
          date: selectedDate,
          time: selectedSlot?.startTime || '',
          boxNumber: selectedSlot?.boxNumber || 0,
          carModel,
          plateNumber,
          services: selectedServices,
          price,
        }}
        services={services}
        onBack={() => setStep(3)}
        onPaymentComplete={() => {
          // Перенаправляем на страницу гаража/онлайн записи
          // TODO: реализовать перенаправление
        }}
      />
    ) : (
      <>
        {/* Подтверждение записи для Наличный/Безналичный/Перевод */}
        {/* Карточка с информацией о записи */}
        {/* Выбор способа оплаты (Наличный, Безналичный, Перевод) */}
        {/* Кнопка подтверждения */}
      </>
    )}
  </div>
)}
```

## 🔑 Ключевые изменения

### 1. Добавлен новый способ оплаты "СБП"

- Добавлен в тип `paymentMethod`
- Добавлена кнопка выбора СБП на ШАГЕ 3
- Используется иконка `Building2` для СБП

### 2. Разделение ШАГА 2 на ШАГИ 2 и 3

**До:**
- ШАГ 2: Услуги + кнопка "Далее"
- ШАГ 3: Подтверждение записи

**После:**
- ШАГ 2: Услуги + кнопка "Далее" (с установкой способа оплаты по умолчанию)
- ШАГ 3: Выбор способа оплаты (4 варианта: Наличный, Безналичный, Перевод, СБП)
- ШАГ 4: Подтверждение записи / Выбор банка (условный)

### 3. Условный рендеринг ШАГА 4

**Если СБП:**
- Показываем компонент [`BankSelectionStep`](../components/client/BankSelectionStep.tsx)
- Пользователь выбирает банк
- Пользователь оплачивает через банковское приложение
- Запись создается через webhook после успешной оплаты

**Если НЕ СБП (Наличный/Безналичный/Перевод):**
- Показываем карточку с информацией о записи
- Показываем выбор способа оплаты (Наличный, Безналичный, Перевод)
- Пользователь нажимает "Подтвердить"
- Запись создается немедленно (оплата на месте)

## 📁 Связанные файлы

1. [`components/client/OnlineBookingWizard.tsx`](../components/client/OnlineBookingWizard.tsx) - обновленный мастер записи
2. [`components/client/BankSelectionStep.tsx`](../components/client/BankSelectionStep.tsx) - компонент выбора банка для СБП
3. [`lib/api/yookassa.ts`](../lib/api/yookassa.ts) - API функции для YooKassa
4. [`api/create-pending-booking.ts`](../api/create-pending-booking.ts) - создание временной записи
5. [`api/create-payment-sbp.ts`](../api/create-payment-sbp.ts) - создание платежа СБП
6. [`api/yookassa-webhook.ts`](../api/yookassa-webhook.ts) - обработка webhook от YooKassa
7. [`api/check-payment-status.ts`](../api/check-payment-status.ts) - проверка статуса платежа
8. [`api/get-sbp-banks.ts`](../api/get-sbp-banks.ts) - получение списка банков
9. [`api/update-sbp-banks.ts`](../api/update-sbp-banks.ts) - обновление списка банков (CRON)

## ✅ Проверки

- [x] Тип оплаты обновлен до `'Наличный' | 'Безналичный' | 'Перевод' | 'СБП'`
- [x] Количество шагов обновлено до 4
- [x] Заголовок мастера записи обновлен
- [x] Кнопка на ШАГЕ 2 обновлена (установка способа оплаты по умолчанию)
- [x] ШАГ 3 добавлен (выбор способа оплаты)
- [x] ШАГ 4 обновлен (условный рендеринг: BankSelectionStep для СБП, подтверждение для других)
- [x] JSX ошибки исправлены
- [x] Иконки добавлены (Building2 для СБП)
- [x] Текст кнопки на ШАГЕ 3 обновлен ("Оплатить и записаться" для СБП)

## 🚀 Следующие шаги

1. Добавить переменные в `.env`:
   - `YOOKASSA_SHOP_ID`
   - `YOOKASSA_SECRET_KEY`
   - `NEXT_PUBLIC_APP_URL`

2. Настроить webhook в YooKassa кабинете:
   - URL: `https://your-app.vercel.app/api/yookassa-webhook`
   - События: `payment.succeeded`, `payment.canceled`

3. Настроить cron jobs в `vercel.json`:
   - `/api/update-sbp-banks` - каждое воскресенье в 3:00 MSK

4. Тестировать в тестовом режиме YooKassa

## 📝 Заметки

- Для СБП запись создается ТОЛЬКО после успешной оплаты через webhook
- Для других способов оплаты запись создается немедленно
- Способ оплаты "Безналичный" сохранен для оплаты картой на месте
- СБП добавлен как 4-й способ оплаты, НЕ заменяет "Безналичный"
