import React from 'react';
import { cn } from '@/lib/utils';
import { Clock, CarFront, Plus } from 'lucide-react';

export interface Booking {
  id: string;
  startTime: string;
  endTime: string;
  carModel?: string;
  clientName?: string;
  status?: string;
  createdByProfileId?: string;
}

export interface TimeSlot {
  start: string;
  end: string;
}

interface TimelineProps {
  bookings: Booking[];
  selectedStart?: string;
  selectedEnd?: string;
  onSlotClick?: (start: string, end: string) => void;
  className?: string;
  selectedDate?: string;
  // ✅ Новые пропсы для онлайн-записи
  userRole?: 'admin' | 'client';
  currentProfileId?: string;
}

const Timeline: React.FC<TimelineProps> = ({
  bookings,
  selectedStart,
  selectedEnd,
  onSlotClick,
  className,
  selectedDate,
  userRole = 'admin',
  currentProfileId
}) => {
  // Флаг для отладки (выключить в продакшене)
  const DEBUG = true;
  
  // Время работы: 08:00 - 20:00
  const START_HOUR = 8;
  const END_HOUR = 20;
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const TOTAL_CELLS = 10;
  const MIN_GAP_MINUTES = 30;
  
  // Получаем текущее время и дату
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentMinutesTotal = currentHour * 60 + currentMinutes;
  
  // Форматируем текущую дату для сравнения
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const today = formatDate(now);
  const isToday = selectedDate === today;
  
  // Конвертируем время в минуты от начала дня
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  if (DEBUG) {
    console.log('[Timeline] 📅 Date:', selectedDate, '| bookings:', bookings.length);
  }
  
  // Проверяем, прошел ли час (для сегодняшнего дня)
  const isHourPassed = (hour: number): boolean => {
    if (!isToday) return false;
    return hour < currentHour;
  };
  
  // Проверяем, закончилась ли запись (для сегодняшнего дня)
  const isBookingFinished = (booking: Booking): boolean => {
    if (!isToday) return false;
    const bookingEndMinutes = timeToMinutes(booking.endTime);
    return bookingEndMinutes < currentMinutesTotal;
  };

  // ✅ Фильтрация по роли для онлайн-записи
  const getFilteredBookings = (): Booking[] => {
    if (userRole === 'client' && currentProfileId) {
      // Клиент видит только свои записи полностью
      return bookings.filter(booking => {
        const isNotCancelled = booking.status !== 'ОТМЕНЕНО';
        const isNotCompleted = booking.status !== 'ГОТОВО';
        // Проверяем что это запись клиента (по создателю или по имени/телефону)
        const isOwnBooking = booking.createdByProfileId === currentProfileId;
        return isNotCancelled && isNotCompleted && isOwnBooking;
      });
    }
    // Админ видит все записи
    return bookings.filter((booking) => {
      const isNotCancelled = booking.status !== 'ОТМЕНЕНО';
      const isNotCompleted = booking.status !== 'ГОТОВО';
      return isNotCancelled && isNotCompleted;
    });
  };

  const activeBookings = getFilteredBookings();

  // Сортируем заказы по времени (хронологический порядок)
  const sortedBookings = [...activeBookings].sort((a, b) => {
    const timeA = timeToMinutes(a.startTime);
    const timeB = timeToMinutes(b.startTime);
    return timeA - timeB;
  });

  if (DEBUG) {
    console.log('[Timeline] ✅ Active bookings:', sortedBookings.length,
      sortedBookings.map(b => `${b.carModel} (${b.startTime}-${b.endTime})`));
  }

  // Создаем массив ячеек (всегда TOTAL_CELLS)
  const cells = Array.from({ length: TOTAL_CELLS }, (_, i) => i);

  // Получаем записи для отображения в ячейках
  // Ближайший заказ - в первой ячейке, остальные по очереди
  // Если между заказами есть разница во времени (30+ минут) - пустая ячейка между ними
  const getBookingsForCells = (): (Booking | null)[] => {
    const result: (Booking | null)[] = Array(TOTAL_CELLS).fill(null);
    let cellIndex = 0;
    
    sortedBookings.forEach((booking, index) => {
      // Если это не первый заказ, проверяем разницу во времени с предыдущим
      if (index > 0 && cellIndex < TOTAL_CELLS - 1) {
        const prevBooking = sortedBookings[index - 1];
        const prevEndTime = timeToMinutes(prevBooking.endTime);
        const currStartTime = timeToMinutes(booking.startTime);
        const timeDiff = currStartTime - prevEndTime;
        
        if (DEBUG) {
          console.log(`[Timeline] Gap: ${prevBooking.endTime} → ${booking.startTime} = ${timeDiff}м (need ≥${MIN_GAP_MINUTES})`);
        }
        
        // Если разница >= MIN_GAP_MINUTES, добавляем пустую ячейку
        if (timeDiff >= MIN_GAP_MINUTES) {
          if (DEBUG) console.log(`[Timeline] ➕ Empty cell at [${cellIndex}]`);
          cellIndex++;
        }
      }
      
      // Добавляем запись в ячейку, если есть место
      if (cellIndex < TOTAL_CELLS) {
        result[cellIndex] = booking;
        if (DEBUG) console.log(`[Timeline] 📦 [${cellIndex}] ${booking.carModel} (${booking.startTime}-${booking.endTime})`);
        cellIndex++;
      }
    });
    
    if (DEBUG) {
      console.log('[Timeline] Final cells:', result.map((b, i) => b ? `[${i}] ${b.carModel}` : `[${i}] ∅`).join(' | '));
    }
    
    return result;
  };

  const cellBookings = getBookingsForCells();

  // Определяем цвет статуса записи
  const getStatusColor = (status?: string): string => {
    switch (status) {
      case 'В РАБОТЕ':
        return 'border-green-500';
      case 'ГОТОВО':
        return 'border-orange-500';
      case 'ОТМЕНЕНО':
        return 'border-red-500';
      default:
        return 'border-orange-500';
    }
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Сетка расписания (grid-cols-2) */}
      <div className="grid grid-cols-2 gap-4">
        {cells.map((cellIndex) => {
          const booking = cellBookings[cellIndex];
          
          return (
            <button
              key={cellIndex}
              onClick={() => {
                // ✅ Клиент может кликать только на свободные слоты
                if (userRole === 'client' && booking) return;
                
                // Админ может кликать на свободные слоты
                if (booking) return;
                
                // При клике на пустую ячейку - создаем запись на это время
                const hour = START_HOUR + cellIndex;
                const startTime = `${hour.toString().padStart(2, '0')}:00`;
                onSlotClick?.(startTime, '');
              }}
              className={cn(
                "h-24 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer hover:scale-105 transition-all bg-white hover:border-blue-400 hover:bg-blue-50 hover:shadow-md",
                booking?.status === 'В РАБОТЕ'
                  ? 'border-green-500'
                  : booking?.status === 'ОЖИДАЕТ'
                  ? 'border-orange-500'
                  : 'border-gray-200'
              )}
            >
              {booking ? (
                <BookingCellContent booking={booking} userRole={userRole} />
              ) : (
                <EmptyCell />
              )}
            </button>
          );
        })}
      </div>

      {/* Легенда */}
      <div className="flex gap-3 mt-4 pt-3 border-t text-xs text-gray-500 flex-wrap justify-center">
      </div>
    </div>
  );
};

// Компонент для содержимого ячейки с записью
interface BookingCellContentProps {
  booking: Booking;
  userRole?: 'admin' | 'client';
}

const BookingCellContent: React.FC<BookingCellContentProps> = ({ booking, userRole = 'admin' }) => {
  // ✅ Для клиента показываем полную информацию только для своих записей
  const showFullDetails = userRole === 'admin' || booking.createdByProfileId;
  return (
    <div className="flex flex-col gap-2 px-2 w-full">
      {showFullDetails ? (
        <>
          {/* Верхняя строка: значок времени и время */}
          <div className="flex items-center justify-center gap-1 text-gray-600">
            <Clock className="w-5 h-5" />
            <span className="text-sm font-semibold">
              {booking.startTime} - {booking.endTime}
            </span>
          </div>
          
          {/* Разделитель */}
          <div className="w-full border-t border-gray-300"></div>
          
          {/* Нижняя строка: машинка и марка */}
          <div className="flex items-center justify-center gap-2 text-sm">
            <CarFront className="w-6 h-6 text-gray-600" />
            <div className="font-semibold text-gray-800 truncate max-w-full">
              {booking.carModel}
            </div>
          </div>
        </>
      ) : (
        // ✅ Для чужих записей показываем только как занятый слот
        <div className="flex items-center justify-center w-full h-full">
          <div className="text-sm font-semibold text-gray-500">
            Занято
          </div>
        </div>
      )}
    </div>
  );
};

// Компонент для ячейки со свободным интервалом
interface SlotCellContentProps {
  slot: TimeSlot;
  isSelected: boolean;
}

const SlotCellContent: React.FC<SlotCellContentProps> = ({ slot, isSelected }) => {
  const duration = getDuration(slot.start, slot.end);

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-2 w-full">
      <div className="flex items-center justify-center gap-1 text-sm font-semibold text-green-600">
        <Clock className="w-5 h-5" />
        <span>{slot.start} - {slot.end}</span>
      </div>
      
      <div className="w-full border-t border-green-300"></div>
      
      <div className="text-xs font-medium text-green-700">
        {formatDuration(duration)}
      </div>
    </div>
  );
};

// Компонент для пустой ячейки
const EmptyCell: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-2 w-full h-full">
      <Plus className="w-8 h-8 text-gray-300" />
    </div>
  );
};

// Вспомогательная функция для расчета длительности
const getDuration = (start: string, end: string): number => {
  const [startHours, startMinutes] = start.split(':').map(Number);
  const [endHours, endMinutes] = end.split(':').map(Number);
  return (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
};

// Функция для форматирования длительности в минутах в читаемый формат
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0 && mins > 0) {
    return `${hours}ч ${mins}мин`;
  } else if (hours > 0) {
    return `${hours}ч`;
  } else {
    return `${mins} мин`;
  }
};

export default Timeline;
