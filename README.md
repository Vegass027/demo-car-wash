# CarWash Demo

Демо-копия [carwash-admin-pro](../carwash-admin-pro) для безопасной проверки миграций, фиксов и security-локадауна **без касания прода**.

## Стек (как в проде)

- React 18 + TypeScript + Vite + Tailwind + Radix UI
- Supabase (test-проект `danobongqzbxilyvdwig` — НЕ продовый)
- Telegram Mini App (test-бот)
- Vercel (preview-деплои: `demo-car-wash.vercel.app`)

## Что здесь другое (vs прод)

| | Прод | Demo |
|---|---|---|
| Supabase project | `avajtwihzjfpytimfbaw` | `danobongqzbxilyvdwig` |
| Telegram bot | прод-токен | test-токен |
| Vercel URL | прод-домен | `demo-car-wash.vercel.app` |
| GitHub | `Vegass027/avtomoika-crm-dovatora-prod` | `Vegass027/demo-car-wash` |
| БД | реальные клиенты мойки | синтетические seed-данные |

## Локальный запуск

```bash
pnpm install
# заполнить .env.local (test-ключи Supabase + Telegram-бота)
pnpm dev
```

## Деплой

Push в `main` → авто-деплой на Vercel preview.

## Документация

Вся документация лежит локально в `docs/` (НЕ в гите — см. `.gitignore`):
- `docs/architecture/` — текущее состояние и инструкции
- `docs/security/` — планы локадауна
- `docs/business/` — бизнес-логика
- `docs/archive/` — старые планы, миграции, SQL

Прод-репо: `github.com/Vegass027/avtomoika-crm-dovatora-prod` (`/Users/dmitriy/Downloads/carwash-admin-pro`).
