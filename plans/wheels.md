import React, { useState } from 'react';
import { Clock, Car, User, CreditCard, X, Plus } from 'lucide-react';

// Типы данных
interface TireBooking {
  id: string;
  time: string; // Примерное время или порядковый номер
  clientName: string;
  carModel: string;
  plateNumber: string;
  status: 'waiting' | 'in-progress' | 'done' | 'cancelled';
  services: string[];
  price: number;
  paymentMethod: string;
}

// Компонент колеса
const TireWheel = ({ 
  booking, 
  onClick
}: { 
  booking?: TireBooking; 
  onClick: () => void;
}) => {
  if (!booking) {
    // Пустое колесо - добавить запись
    return (
      <button
        onClick={onClick}
        className="w-24 h-24 rounded-full border-4 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all hover:scale-105 flex items-center justify-center group"
      >
        <Plus className="w-8 h-8 text-gray-400 group-hover:text-blue-500" />
      </button>
    );
  }

  // Колесо с записью
  const statusColors = {
    'waiting': 'bg-yellow-500 border-yellow-600',
    'in-progress': 'bg-green-500 border-green-600',
    'done': 'bg-gray-400 border-gray-500',
    'cancelled': 'bg-red-500 border-red-600'
  };

  const statusText = {
    'waiting': 'Ожидает',
    'in-progress': 'В работе',
    'done': 'Готово',
    'cancelled': 'Отменен'
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className={`relative w-24 h-24 rounded-full ${statusColors[booking.status]} border-4 shadow-lg hover:scale-105 transition-all flex flex-col items-center justify-center text-white cursor-pointer`}
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
          {booking.time}
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
          {statusText[booking.status]}
        </div>
      </div>
    </div>
  );
};

// Модальное окно с деталями
const BookingDetailModal = ({ 
  booking, 
  onClose 
}: { 
  booking: TireBooking; 
  onClose: () => void;
}) => {
  const statusText = {
    'waiting': 'ОЖИДАЕТ',
    'in-progress': 'В РАБОТЕ',
    'done': 'ГОТОВО',
    'cancelled': 'ОТМЕНЕН'
  };

  const statusColors = {
    'waiting': 'bg-yellow-500',
    'in-progress': 'bg-green-500',
    'done': 'bg-gray-500',
    'cancelled': 'bg-red-500'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
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
            <div className={`absolute -top-3 right-6 ${statusColors[booking.status]} text-white px-3 py-1 rounded-md text-xs font-semibold shadow-sm`}>
              {statusText[booking.status]}
            </div>

            <div className="p-5">
              <div className="space-y-4">
                {/* Основная информация */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div className="bg-gray-100 px-3 py-1 rounded font-mono text-sm">
                        {booking.time}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-semibold">{booking.clientName}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Car className="w-4 h-4 text-gray-400 mt-0.5" />
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
                      <span className="text-gray-600 font-medium">📋 Услуги:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {booking.services.map((service, idx) => (
                          <span
                            key={idx}
                            className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs"
                          >
                            {service}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Кнопки действий */}
                <div className="border-t pt-4">
                  <div className="flex gap-2 flex-wrap">
                    <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center gap-2">
                      🔄 Оплата
                    </button>
                    <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center gap-2">
                      🔄 Стоимость
                    </button>
                    <button className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 transition-colors flex items-center gap-2">
                      ❌ Отменить
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Главный компонент
export default function TireServiceSchedule() {
  const [selectedBooking, setSelectedBooking] = useState<TireBooking | null>(null);

  // Мок данные - просто список заказов в очереди
  const mockBookings: TireBooking[] = [
    {
      id: '1',
      time: '09:00',
      clientName: 'Анна Петрова',
      carModel: 'Audi A3',
      plateNumber: 'A333AA',
      status: 'in-progress',
      services: ['Шиномонтаж 4 колеса', 'Балансировка'],
      price: 2500,
      paymentMethod: 'Безналичный'
    },
    {
      id: '2',
      time: '10:00',
      clientName: 'Петр Сидоров',
      carModel: 'Lada Granta',
      plateNumber: 'К111КК',
      status: 'waiting',
      services: ['Шиномонтаж 2 колеса'],
      price: 800,
      paymentMethod: 'Наличный'
    },
    {
      id: '3',
      time: '11:00',
      clientName: 'Иван Иванов',
      carModel: 'BMW X5',
      plateNumber: 'B111BB',
      status: 'waiting',
      services: ['Шиномонтаж', 'Балансировка', 'Хранение'],
      price: 3500,
      paymentMethod: 'Безналичный'
    },
    {
      id: '4',
      time: '~12:00',
      clientName: 'Сергей (с улицы)',
      carModel: 'Toyota Camry',
      plateNumber: 'Т777ТТ',
      status: 'waiting',
      services: ['Балансировка'],
      price: 600,
      paymentMethod: 'Наличный'
    },
    {
      id: '5',
      time: '14:00',
      clientName: 'Мария Волкова',
      carModel: 'Mercedes E-class',
      plateNumber: 'М999ММ',
      status: 'waiting',
      services: ['Шиномонтаж 4 колеса', 'Балансировка'],
      price: 3000,
      paymentMethod: 'Безналичный'
    },
    {
      id: '6',
      time: '13:30',
      clientName: 'Алексей',
      carModel: 'Kia Rio',
      plateNumber: 'К555КК',
      status: 'done',
      services: ['Шиномонтаж 2 колеса'],
      price: 1000,
      paymentMethod: 'Наличный'
    },
    {
      id: '7',
      time: '15:00',
      clientName: 'Дмитрий',
      carModel: 'Ford Focus',
      plateNumber: 'Ф123ФФ',
      status: 'cancelled',
      services: ['Шиномонтаж 4 колеса'],
      price: 2000,
      paymentMethod: 'Безналичный'
    },
    {
      id: '8',
      time: '~16:00',
      clientName: 'Олег (не приехал)',
      carModel: 'Renault Logan',
      plateNumber: 'Р777РР',
      status: 'cancelled',
      services: ['Балансировка'],
      price: 500,
      paymentMethod: 'Наличный'
    }
  ];

  const handleWheelClick = (booking?: TireBooking) => {
    if (booking) {
      setSelectedBooking(booking);
    } else {
      alert('Добавить новую запись');
    }
  };

  // Группируем по статусам для удобства
  const inProgress = mockBookings.filter(b => b.status === 'in-progress');
  const waiting = mockBookings.filter(b => b.status === 'waiting');
  const done = mockBookings.filter(b => b.status === 'done');
  const cancelled = mockBookings.filter(b => b.status === 'cancelled');

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Заголовок */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Шиномонтаж</h1>
          <p className="text-gray-600">
            Очередь заказов • Один мастер
          </p>
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-green-600">{inProgress.length}</div>
            <div className="text-sm text-green-700">В работе</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-yellow-600">{waiting.length}</div>
            <div className="text-sm text-yellow-700">В очереди</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-gray-600">{done.length}</div>
            <div className="text-sm text-gray-700">Выполнено</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-2xl font-bold text-red-600">{cancelled.length}</div>
            <div className="text-sm text-red-700">Отменено</div>
          </div>
        </div>

        {/* В работе */}
        {inProgress.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
              Сейчас в работе
            </h2>
            <div className="flex flex-wrap gap-6">
              {inProgress.map(booking => (
                <TireWheel
                  key={booking.id}
                  booking={booking}
                  onClick={() => handleWheelClick(booking)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Очередь */}
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Очередь</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex flex-wrap gap-6">
              {waiting.map(booking => (
                <TireWheel
                  key={booking.id}
                  booking={booking}
                  onClick={() => handleWheelClick(booking)}
                />
              ))}
              {/* Кнопка добавить */}
              <TireWheel onClick={() => handleWheelClick()} />
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
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4 text-gray-600">Выполнено сегодня</h2>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
              <div className="flex flex-wrap gap-6 opacity-60">
                {done.map(booking => (
                  <TireWheel
                    key={booking.id}
                    booking={booking}
                    onClick={() => handleWheelClick(booking)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Отменено */}
        {cancelled.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4 text-red-600">Отменено</h2>
            <div className="bg-red-50 rounded-xl border border-red-200 p-6">
              <div className="flex flex-wrap gap-6 opacity-60">
                {cancelled.map(booking => (
                  <TireWheel
                    key={booking.id}
                    booking={booking}
                    onClick={() => handleWheelClick(booking)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}
    </div>
  );
}