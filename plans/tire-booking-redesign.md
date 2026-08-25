# План редизайна карточек для шиномонтажа

## Обзор

Интегрировать дизайн карточек из [`plans/wheels.md`](plans/wheels.md:1) в компонент [`BookingsList.tsx`](components/admin/BookingsList.tsx:1). Использовать иконки lucide-react вместо эмодзи.

## Ключевые отличия от автомойки

1. **Один шиномонтажник** - НЕ нужна функция выбора мойщика
2. **Другие услуги** - услуги шиномонтажа (не услуги автомойки)
3. **Механика услуг** - аналогична автомойке (добавление/отображение)

## Файлы для изменения

### 1. Обновить `types.ts`

**Что сделать:**
- Добавить тип для услуг шиномонтажа
- Добавить enum для статусов шиномонтажа

```typescript
// Услуги шиномонтажа
export enum TireService {
  TIRE_CHANGE_4 = 'tire-change-4',      // Шиномонтаж 4 колеса
  TIRE_CHANGE_2 = 'tire-change-2',      // Шиномонтаж 2 колеса
  BALANCING = 'balancing',               // Балансировка
  STORAGE = 'storage',                    // Хранение
  REPAIR = 'tire-repair',                // Ремонт шины
  VALVE = 'valve',                      // Вентиль
}

// Цены услуг шиномонтажа
export const TIRE_SERVICE_PRICES: Record<TireService, number> = {
  [TireService.TIRE_CHANGE_4]: 2500,
  [TireService.TIRE_CHANGE_2]: 800,
  [TireService.BALANCING]: 600,
  [TireService.STORAGE]: 500,
  [TireService.REPAIR]: 1000,
  [TireService.VALVE]: 200,
};

// Лейблы услуг шиномонтажа
export const TIRE_SERVICE_LABELS: Record<TireService, string> = {
  [TireService.TIRE_CHANGE_4]: 'Шиномонтаж 4 колеса',
  [TireService.TIRE_CHANGE_2]: 'Шиномонтаж 2 колеса',
  [TireService.BALANCING]: 'Балансировка',
  [TireService.STORAGE]: 'Хранение',
  [TireService.REPAIR]: 'Ремонт шины',
  [TireService.VALVE]: 'Вентиль',
};
```

---

### 2. Создать `components/admin/TireBookingCard.tsx` - НОВЫЙ ФАЙЛ

**Что сделать:**
- Создать компонент карточки записи для шиномонтажа
- Использовать дизайн из `TireWheel` из wheels.md (круглая карточка)
- Использовать иконки lucide-react

**Пропсы:**
```typescript
interface TireBookingCardProps {
  booking: Booking;
  onClick: () => void;
}
```

**Логика:**
- Круглая карточка с визуальным изображением колеса
- Цвета статусов:
  - 'ОЖИДАЕТ' → желтый (bg-yellow-500)
  - 'В РАБОТЕ' → зеленый (bg-green-500)
  - 'ГОТОВО' → серый (bg-gray-400)
  - 'ОТМЕНЕНО' → красный (bg-red-500)
- Под карточкой: имя клиента, модель авто, статус

**Дизайн карточки:**
```tsx
import React from 'react';
import { Plus } from 'lucide-react';
import { Booking } from '../../types';

interface TireBookingCardProps {
  booking: Booking;
  onClick: () => void;
}

export const TireBookingCard: React.FC<TireBookingCardProps> = ({ booking, onClick }) => {
  const statusColors = {
    'ОЖИДАЕТ': 'bg-yellow-500 border-yellow-600',
    'В РАБОТЕ': 'bg-green-500 border-green-600',
    'ГОТОВО': 'bg-gray-400 border-gray-500',
    'ОТМЕНЕНО': 'bg-red-500 border-red-600'
  };

  const statusText = {
    'ОЖИДАЕТ': 'Ожидает',
    'В РАБОТЕ': 'В работе',
    'ГОТОВО': 'Готово',
    'ОТМЕНЕНО': 'Отменен'
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className={`relative w-24 h-24 rounded-full ${statusColors[booking.status as keyof typeof statusColors]} border-4 shadow-lg hover:scale-105 transition-all flex flex-col items-center justify-center text-white cursor-pointer`}
      >
        {/* Диск (внутренний круг) */}
        <div className="absolute inset-3 bg-white/20 rounded-full flex items-center justify-center">
          <div className="w-3 h-3 bg-white rounded-full"></div>
        </div>
        
        {/* Протектор (линии по краям) */}
        <div className="absolute inset-0">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-4 bg-black/20 left-1/2 top-0 origin-bottom rounded-sm"
              style={{
                transform: `translateX(-50%) rotate(${i * 30}deg) translateY(-100%)`
              }}
            />
          ))}
        </div>

        {/* Время */}
        <div className="relative z-10 text-xs font-bold">
          {booking.startTime}
        </div>
      </button>

      {/* Информация под колесом */}
      <div className="text-center">
        <div className="text-sm font-semibold text-gray-800 truncate max-w-[120px]">
          {booking.clientName}
        </div>
        <div className="text-xs text-gray-500 truncate max-w-[120px]">
          {booking.carModel}
        </div>
        <div className="text-xs font-medium text-gray-600 mt-1">
          {statusText[booking.status as keyof typeof statusText]}
        </div>
      </div>
    </div>
  );
};
```

---

### 3. Обновить `components/admin/BookingsList.tsx`

**Что сделать:**
- Заменить текущий дизайн на новый с круговыми карточками
- Добавить статистику (в работе, в очереди, выполнено, отменено)
- Группировать записи по статусам
- Убрать функцию выбора мойщика
- Добавить услуги шиномонтажа

**Логика:**
- Группировка bookings по статусам:
  - `inProgress`: status === 'В РАБОТЕ'
  - `waiting`: status === 'ОЖИДАЕТ'
  - `done`: status === 'ГОТОВО'
  - `cancelled`: status === 'ОТМЕНЕНО'
- Отображать статистику вверху страницы
- Отображать группы записей с использованием `TireBookingCard`
- НЕ показывать кнопки выбора мойщика

**Структура страницы:**
```tsx
import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Booking } from '../../types';
import { Clock, User, CarFront, Banknote, X, CreditCard, Plus, CircleX, RefreshCw, List, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AddServiceModal } from './AddServiceModal';
import { TireBookingCard } from './TireBookingCard';
import { TireService, TIRE_SERVICE_PRICES, TIRE_SERVICE_LABELS } from '../../types';

// Услуги шиномонтажа
const TIRE_SERVICES = [
  { id: TireService.TIRE_CHANGE_4, label: 'Шиномонтаж 4 колеса', price: 2500 },
  { id: TireService.TIRE_CHANGE_2, label: 'Шиномонтаж 2 колеса', price: 800 },
  { id: TireService.BALANCING, label: 'Балансировка', price: 600 },
  { id: TireService.STORAGE, label: 'Хранение', price: 500 },
  { id: TireService.REPAIR, label: 'Ремонт шины', price: 1000 },
  { id: TireService.VALVE, label: 'Вентиль', price: 200 },
];

interface BookingsListProps {
  bookings: Booking[];
  onCancelBooking: (bookingId: string) => void;
  onChangePaymentMethod: (bookingId: string) => void;
  onNavigate: (view: string) => void;
  initialTab?: string;
}

export const BookingsList: React.FC<BookingsListProps> = ({ 
  bookings, 
  onCancelBooking, 
  onChangePaymentMethod, 
  onNavigate, 
  initialTab = 'waiting' 
}) => {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  
  // Группируем по статусам
  const inProgress = bookings.filter(b => b.status === 'В РАБОТЕ');
  const waiting = bookings.filter(b => b.status === 'ОЖИДАЕТ');
  const done = bookings.filter(b => b.status === 'ГОТОВО');
  const cancelled = bookings.filter(b => b.status === 'ОТМЕНЕНО');
  
  // Находим актуальный booking из bookings prop по ID
  const selectedBooking = React.useMemo(() => {
    if (!selectedBookingId) return null;
    return bookings.find(b => b.id === selectedBookingId) || null;
  }, [bookings, selectedBookingId]);

  return (
    <div className="h-full flex flex-col pb-20 animate-in fade-in">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Шиномонтаж</h2>
        <Button onClick={() => onNavigate('booking-wizard')}>+ Добавить</Button>
      </div>
    
      {/* Статистика */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard count={inProgress.length} label="В работе" color="green" />
        <StatCard count={waiting.length} label="В очереди" color="yellow" />
        <StatCard count={done.length} label="Выполнено" color="gray" />
        <StatCard count={cancelled.length} label="Отменено" color="red" />
      </div>
    
      {/* В работе */}
      {inProgress.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            Сейчас в работе
          </h2>
          <div className="flex flex-wrap gap-4">
            {inProgress.map(booking => (
              <TireBookingCard
                key={booking.id}
                booking={booking}
                onClick={() => setSelectedBookingId(booking.id)}
              />
            ))}
          </div>
        </div>
      )}
    
      {/* Очередь */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-3">Очередь</h2>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-wrap gap-4">
            {waiting.map(booking => (
              <TireBookingCard
                key={booking.id}
                booking={booking}
                onClick={() => setSelectedBookingId(booking.id)}
              />
            ))}
            {/* Кнопка добавить */}
            <AddTireCard onClick={() => onNavigate('booking-wizard')} />
          </div>
          {waiting.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              Нет заказов в очереди
            </div>
          )}
        </div>
      </div>
    
      {/* Выполнено сегодня */}
      {done.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-3 text-gray-600">Выполнено сегодня</h2>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap gap-4 opacity-60">
              {done.map(booking => (
                <TireBookingCard
                  key={booking.id}
                  booking={booking}
                  onClick={() => setSelectedBookingId(booking.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    
      {/* Отменено */}
      {cancelled.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3 text-red-600">Отменено</h2>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <div className="flex flex-wrap gap-4 opacity-60">
              {cancelled.map(booking => (
                <TireBookingCard
                  key={booking.id}
                  booking={booking}
                  onClick={() => setSelectedBookingId(booking.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно деталей */}
      <TireBookingDetailModal
        isOpen={selectedBooking !== null}
        onClose={() => setSelectedBookingId(null)}
        booking={selectedBooking}
        onChangePaymentMethod={onChangePaymentMethod}
        onCancelBooking={(bookingId) => {
          setSelectedBookingId(null);
          onCancelBooking(bookingId);
        }}
      />
    </div>
  );
};

// Компонент статистики
interface StatCardProps {
  count: number;
  label: string;
  color: 'green' | 'yellow' | 'gray' | 'red';
}

const StatCard: React.FC<StatCardProps> = ({ count, label, color }) => {
  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-600',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-600',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
    red: 'bg-red-50 border-red-200 text-red-600',
  };
  
  return (
    <div className={`border rounded-xl p-3 ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-sm">{label}</div>
    </div>
  );
};

// Компонент кнопки добавления
const AddTireCard = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-24 h-24 rounded-full border-4 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all hover:scale-105 flex items-center justify-center group"
  >
    <Plus className="w-8 h-8 text-gray-400 group-hover:text-blue-500" />
  </button>
);
```

---

### 4. Обновить модальное окно деталей записи

**Что сделать:**
- Использовать новый дизайн из `BookingDetailModal` в wheels.md
- Использовать иконки lucide-react
- НЕ показывать кнопку выбора мойщика
- Показывать услуги шиномонтажа

**Логика:**
- Дизайн карточки с левой границей цвета статуса
- Статус-бадж в правом верхнем углу
- Иконки lucide-react для всех элементов
- Кнопки: Оплата, Стоимость, Отменить (БЕЗ Мойщика)

**Дизайн модального окна:**
```tsx
export interface TireBookingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onChangePaymentMethod?: (bookingId: string) => void;
  onCancelBooking?: (bookingId: string) => void;
  onAddService?: (bookingId: string, serviceId: string) => void;
  onRemoveService?: (bookingId: string, serviceId: string) => void;
}

export const TireBookingDetailModal: React.FC<TireBookingDetailModalProps> = ({
  isOpen,
  onClose,
  booking,
  onChangePaymentMethod,
  onCancelBooking,
  onAddService,
  onRemoveService,
}) => {
  const [isAddServiceModalOpen, setIsAddServiceModalOpen] = useState(false);

  if (!booking) return null;

  const statusText = {
    'ОЖИДАЕТ': 'ОЖИДАЕТ',
    'В РАБОТЕ': 'В РАБОТЕ',
    'ГОТОВО': 'ГОТОВО',
    'ОТМЕНЕНО': 'ОТМЕНЕН'
  };

  const statusColors = {
    'ОЖИДАЕТ': 'bg-yellow-500',
    'В РАБОТЕ': 'bg-green-500',
    'ГОТОВО': 'bg-gray-500',
    'ОТМЕНЕНО': 'bg-red-500'
  };

  const handleAddService = (serviceId: string) => {
    onAddService?.(booking.id, serviceId);
    setIsAddServiceModalOpen(false);
  };

  const handleRemoveService = (serviceId: string) => {
    onRemoveService?.(booking.id, serviceId);
  };

  return (
    <Dialog key={booking.id} open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto scroll-mobile">
        {/* Кнопка закрытия */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Заголовок */}
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Детали записи</h2>
        </div>

        {/* Карточка */}
        <div className="p-6">
          <div className="border-l-4 border-green-500 bg-white rounded-lg border shadow-sm relative">
            {/* Статус-таб */}
            <div className={`absolute -top-3 right-6 ${statusColors[booking.status as keyof typeof statusColors]} text-white px-3 py-1 rounded-md text-xs font-semibold shadow-sm`}>
              {statusText[booking.status as keyof typeof statusText]}
            </div>

            <div className="p-5">
              <div className="space-y-4">
                {/* Основная информация */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div className="bg-gray-100 px-3 py-1 rounded font-mono text-sm">
                        {booking.startTime}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-semibold">{booking.clientName}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <CarFront className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div>
                        <div>{booking.carModel}</div>
                        <div className="text-xs uppercase bg-gray-100 px-1.5 py-0.5 rounded inline-block mt-1">
                          {booking.plateNumber}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-l pl-4 space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-gray-400" />
                      <div className="bg-gray-100 px-2 py-1 rounded text-xs">
                        {booking.paymentMethod}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base bg-gray-100 px-3 py-1 rounded">
                        {booking.price} ₽
                      </span>
                    </div>
                  </div>
                </div>

                {/* Услуги */}
                {booking.services.length > 0 && (
                  <div className="border-t pt-3">
                    <div className="flex items-start gap-2 text-sm">
                      <List className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="flex flex-wrap gap-1.5">
                        {booking.services.map(serviceId => {
                          const service = TIRE_SERVICES.find(s => s.id === serviceId);
                          if (!service) return null;
                          return (
                            <span
                              key={service.id}
                              className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs"
                            >
                              {service.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Кнопки действий - БЕЗ Мойщика */}
                <div className="border-t pt-4">
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => onChangePaymentMethod?.(booking.id)}>
                      <RefreshCw className="w-4 h-4" />
                      Оплата
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1">
                      <List className="w-4 h-4" />
                      Стоимость
                    </Button>
                    <Button size="sm" variant="destructive" className="gap-1" onClick={() => onCancelBooking?.(booking.id)}>
                      <CircleX className="w-4 h-4" />
                      Отменить
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      <AddServiceModal
        isOpen={isAddServiceModalOpen}
        onClose={() => setIsAddServiceModalOpen(false)}
        onAdd={handleAddService}
        existingServices={booking.services}
        services={TIRE_SERVICES}
      />
    </Dialog>
  );
};
```

---

## Поток данных

```
1. Пользователь открывает страницу шиномонтажа
   ↓
2. BookingsList группирует bookings по статусам
   ↓
3. Отображается статистика и группы карточек
   ↓
4. Пользователь кликает на карточку
   ↓
5. Открывается модальное окно с деталями
   ↓
6. Пользователь выполняет действия (смена оплаты, отмена, добавление услуг)
   ↓
7. БЕЗ выбора мойщика (один шиномонтажник)
```

## Проверка

После реализации проверить:
1. ✅ Круглые карточки отображаются корректно
2. ✅ Цвета статусов соответствуют дизайну
3. ✅ Статистика отображается корректно
4. ✅ Группировка по статусам работает
5. ✅ Модальное окно открывается с деталями
6. ✅ Все иконки lucide-react отображаются
7. ✅ Кнопки действий работают (Оплата, Стоимость, Отменить)
8. ✅ НЕ отображается кнопка выбора мойщика
9. ✅ Услуги шиномонтажа отображаются корректно
10. ✅ Механика добавления/удаления услуг работает
