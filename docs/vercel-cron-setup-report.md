# 📋 Отчет: Настройка Cron Jobs в Vercel

## 🎯 Обзор

Настройка автоматических задач (cron jobs) для интеграции СБП (YooKassa) в проекте `carwash-admin-pro`.

## 📊 Cron Jobs

### 1. `/api/reset-daily` (СУЩЕСТВУЮЩИЙ)

**Описание:** Сброс ежедневных данных

**Расписание:** `0 21 * * *` - каждый день в 21:00 MSK

```json
{
  "path": "/api/reset-daily",
  "schedule": "0 21 * * *"
}
```

### 2. `/api/update-sbp-banks` (НОВЫЙ)

**Описание:** Обновление списка банков СБП из YooKassa API

**Расписание:** `0 3 * * 0` - каждое воскресенье в 3:00 MSK

**Логика:**
1. Делает запрос к YooKassa API: `GET /v3/sbp_banks`
2. Получает список банков
3. Удаляет старые банки из Supabase
4. Вставляет новые банки в таблицу `sbp_banks`
5. Логирует результат в консоль

**Файл:** [`api/update-sbp-banks.ts`](../api/update-sbp-banks.ts:1)

```json
{
  "path": "/api/update-sbp-banks",
  "schedule": "0 3 * * 0"
}
```

### 3. `/api/cleanup-expired-payments` (НОВЫЙ)

**Описание:** Очистка истекших pending_bookings и отмена платежей в YooKassa

**Расписание:** `*/30 * * * *` - каждые 30 минут

**Логика:**
1. Находит истекшие `pending_bookings` (expires_at < NOW)
2. Находит связанные платежи в статусе `pending`
3. Отменяет платежи в YooKassa API: `POST /v3/payments/{id}/cancel`
4. Обновляет статус платежей в БД на `canceled`
5. Удаляет истекшие `pending_bookings` (payments удаляются через CASCADE)

**Файл:** [`api/cleanup-expired-payments.ts`](../api/cleanup-expired-payments.ts:1)

```json
{
  "path": "/api/cleanup-expired-payments",
  "schedule": "*/30 * * * *"
}
```

## 🔐 Безопасность Cron Jobs

### Защита через CRON_SECRET

Оба новых cron jobs защищены через `CRON_SECRET`:

```typescript
// api/update-sbp-banks.ts
export default async function handler(req: any, res: any) {
  // Проверка авторизации (CRON_SECRET)
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ... код обновления банков
}
```

```typescript
// api/cleanup-expired-payments.ts
export default async function handler(req: any, res: any) {
  // Проверка авторизации (CRON_SECRET)
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ... код очистки
}
```

**CRON_SECRET** - это защита для ваших собственных CRON endpoints, НЕ для YooKassa!

## 📁 Обновленный файл: vercel.json

```json
{
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 60
    }
  },
  "crons": [
    {
      "path": "/api/reset-daily",
      "schedule": "0 21 * * *"
    },
    {
      "path": "/api/update-sbp-banks",
      "schedule": "0 3 * * 0"
    },
    {
      "path": "/api/cleanup-expired-payments",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

## 📋 Формат расписания Cron

Vercel использует стандартный формат cron:

```
* * * * *
│ │ │ │ │
│ │ │ │ └─ День недели (0-6, 0 = воскресенье)
│ │ │ └─── Месяц (1-12)
│ │ └───── День месяца (1-31)
│ └─────── Час (0-23)
└────────── Минута (0-59)
```

### Примеры:

| Расписание | Описание |
|-----------|----------|
| `0 21 * * *` | Каждый день в 21:00 |
| `0 3 * * 0` | Каждое воскресенье в 3:00 |
| `*/30 * * * *` | Каждые 30 минут |
| `0 */2 * * *` | Каждые 2 часа |
| `0 0 * * 1` | Каждый понедельник в 0:00 |

## ✅ Проверки

- [x] Проверено текущее содержание [`vercel.json`](../vercel.json:1)
- [x] Добавлен cron job для `/api/update-sbp-banks`
- [x] Добавлен cron job для `/api/cleanup-expired-payments`
- [x] Проверено расписание cron jobs
- [x] Проверена защита через CRON_SECRET
- [x] Проверены связанные API endpoints

## 🚀 Следующие шаги

### 1. Развертывание на Vercel

После коммита изменений в [`vercel.json`](../vercel.json:1):

```bash
git add vercel.json
git commit -m "Add cron jobs for SBP integration"
git push
```

Vercel автоматически обнаружит изменения в `vercel.json` и настроит cron jobs.

### 2. Проверка cron jobs в Vercel Dashboard

1. Зайдите в [Vercel Dashboard](https://vercel.com/dashboard)
2. Выберите проект `carwash-admin-pro`
3. Перейдите в **Settings → Cron Jobs**
4. Проверьте, что все 3 cron jobs отображаются:
   - `/api/reset-daily` - 0 21 * * *
   - `/api/update-sbp-banks` - 0 3 * * 0
   - `/api/cleanup-expired-payments` - */30 * * * *

### 3. Мониторинг выполнения

Vercel автоматически логирует выполнение cron jobs. Вы можете проверить логи:

1. Vercel Dashboard → **Functions → Logs**
2. Фильтр по function name:
   - `api/update-sbp-banks`
   - `api/cleanup-expired-payments`
3. Проверьте успешность выполнения

### 4. Тестирование cron jobs

Для тестирования cron jobs можно:

1. **Ручной запуск через curl:**
   ```bash
   curl -X POST https://avtomoika-crm-dovatora-prod.vercel.app/api/update-sbp-banks \
     -H "Authorization: Bearer carwash-cron-secret-6592-secure-gen-639727539"
   ```

2. **Логи в Vercel Dashboard:**
   - Проверьте логи выполнения
   - Убедитесь, что нет ошибок

## 📝 Заметки

- Cron jobs выполняются в UTC timezone, а не в MSK!
- Учитывайте разницу во времени при настройке расписания
- Vercel автоматически перезапускает cron jobs при изменении `vercel.json`
- Логи выполнения cron jobs доступны в Vercel Dashboard → Functions → Logs
- Максимальное время выполнения API functions: 60 секунд (настроено в `maxDuration`)

## 🔗 Связанные файлы

1. [`vercel.json`](../vercel.json:1) - конфигурация cron jobs
2. [`api/update-sbp-banks.ts`](../api/update-sbp-banks.ts:1) - обновление списка банков
3. [`api/cleanup-expired-payments.ts`](../api/cleanup-expired-payments.ts:1) - очистка истекших платежей
4. [`.env`](../.env:4) - CRON_SECRET для защиты endpoints

## 📚 Полезные ссылки

- [Vercel Cron Jobs Documentation](https://vercel.com/docs/cron-jobs)
- [Cron Schedule Examples](https://crontab.guru/)
- [Vercel Dashboard](https://vercel.com/dashboard)
