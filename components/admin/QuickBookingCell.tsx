import React from 'react';
import { Plus, Clock, CarFront, Check, Gauge, Bandage, History } from 'lucide-react';
import { Booking } from '../../types';
import { isBookingActive } from '../../shared/utils/time';
import { Badge } from '@/components/ui/badge';
import { cn } from '../../lib/utils';

/**
 * Форматирует время без секунд
 */
const formatTime = (time: string | undefined): string => {
  if (!time) return '';
  return time.split(':').slice(0, 2).join(':');
};

interface QuickBookingCellProps {
  onClick: () => void;
  quickBookings?: Booking[];
  onQuickBookingClick?: (booking: Booking) => void;
  onQuickHistoryClick?: () => void;
}

export const QuickBookingCell: React.FC<QuickBookingCellProps> = ({
  onClick,
  quickBookings = [],
  onQuickBookingClick,
  onQuickHistoryClick
}) => {
  // ✅ Фильтруем: исключаем отмененные заказы из UI (они видны только в истории)
  const activeBookings = quickBookings.filter(b => b.status !== 'ОТМЕНЕНО');

  // Сортируем быстрые заказы: сначала активные, потом выполненные
  const sortedBookings = [...activeBookings].sort((a, b) => {
    const aIsCompleted = a.status === 'ГОТОВО';
    const bIsCompleted = b.status === 'ГОТОВО';
    
    if (aIsCompleted && !bIsCompleted) return 1;  // a вниз
    if (!aIsCompleted && bIsCompleted) return -1; // b вниз
    return 0;
  });

  // Проверяем, нужно ли показывать кнопку "Добавить"
  const hasActiveBookings = sortedBookings.some(b => b.status !== 'ГОТОВО');
  const allBookingsCompleted = sortedBookings.length > 0 && sortedBookings.every(b => b.status === 'ГОТОВО');
  const shouldShowAddButton = !hasActiveBookings || allBookingsCompleted;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Gauge className="w-5 h-5" />
          Быстрый заказ
        </h2>
        <button
          onClick={onQuickHistoryClick}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <History className="w-4 h-4" />
          История
        </button>
      </div>
      
      {/* Кнопка "Добавить" - ПЕРЕД списком заказов */}
      {shouldShowAddButton && (
        <div className="mb-2">
          <button
            onClick={onClick}
            className="w-full h-24 rounded-xl border-2 border-dashed border-green-300 flex items-center justify-center cursor-pointer hover:scale-105 transition-all bg-green-50 hover:bg-green-100 hover:border-green-500 hover:shadow-md"
          >
            <Plus className="w-8 h-8 text-green-500" />
          </button>
        </div>
      )}
      
      {/* Отображаем все быстрые заказы */}
      <div className="space-y-2">
        {sortedBookings.map((booking) => {
          const isCompleted = booking.status === 'ГОТОВО';
          
          return (
            <div
              key={booking.id}
              onClick={() => !isCompleted && onQuickBookingClick?.(booking)}
              className={cn(
                "w-full h-24 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer hover:scale-105 transition-all",
                isCompleted 
                  ? "border-gray-300 bg-gray-100 opacity-60" 
                  : "border-green-500 bg-white"
              )}
            >
              <div className="w-full px-4 flex items-center justify-between">
                {/* Левая сторона: время - по центру между краем и разделителем */}
                <div className="flex-1 flex items-center justify-center gap-2">
                  <Clock className={cn("w-5 h-5", isCompleted ? "text-gray-400" : "text-black")} />
                  <span className={cn("text-sm font-semibold", isCompleted ? "text-gray-500" : "text-black")}>
                    {formatTime(booking.start_time) || 'Быстрый'} - {formatTime(booking.end_time) || ''}
                  </span>
                </div>

                {/* Разделитель */}
                <div className="w-px h-12 bg-gray-300" />

                {/* Правая сторона: марка и гос номер */}
                <div className="flex-1 flex flex-col items-center gap-1">
                  {/* 1 линия: значок машины и марка */}
                  <div className="flex items-center gap-2">
                    <CarFront className={cn("w-5 h-5", isCompleted ? "text-gray-400" : "text-black")} />
                    <span className={cn("font-semibold truncate max-w-[120px]", isCompleted ? "text-gray-500" : "text-black")}>
                      {booking.car_model}
                    </span>
                  </div>

                  {/* 2 линия: значок и гос номер */}
                  <div className="flex items-center gap-2">
                    <Bandage className={cn("w-5 h-5", isCompleted ? "text-gray-400" : "text-black")} />
                    <Badge variant="outline" className={cn("text-xs uppercase font-bold", isCompleted ? "text-gray-500" : "text-black")}>
                      {booking.plate_number}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
