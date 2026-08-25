import React from 'react';
import { Plus } from 'lucide-react';
import { TireBooking } from '../../lib/api/tire-bookings';
import { calculateEndTime, formatTimeWithoutSeconds } from '../../shared/utils/time';

type TireCardVariant = 'full' | 'compact';

interface TireBookingCardProps {
  booking: TireBooking;
  onClick: () => void;
  variant?: TireCardVariant;
}

export const TireBookingCard: React.FC<TireBookingCardProps> = ({ booking, onClick, variant = 'full' }) => {
  const statusColors = {
    'ОЖИДАЕТ': 'bg-yellow-500 border-yellow-600',
    'В РАБОТЕ': 'bg-green-500 border-green-600',
    'ГОТОВО': 'bg-gray-400 border-gray-500',
    'ОТМЕНЕНО': 'bg-red-500 border-red-600',
    'ПРОСРОЧЕН': 'bg-purple-500 border-purple-600'
  };

  const statusText = {
    'ОЖИДАЕТ': 'Ожидает',
    'В РАБОТЕ': 'В работе',
    'ГОТОВО': 'Готово',
    'ОТМЕНЕНО': 'Отменен',
    'ПРОСРОЧЕН': 'Просрочен'
  };

  const sizeClasses = variant === 'compact'
    ? 'w-12 h-12 border-3'
    : 'w-24 h-24 border-4';

  const innerInset = variant === 'compact' ? 'inset-1.5' : 'inset-3';
  const centerDot = variant === 'compact' ? 'w-1.5 h-1.5' : 'w-3 h-3';
  const treadWidth = variant === 'compact' ? 'w-1 h-2.5' : 'w-1.5 h-4';
  const textSize = variant === 'compact' ? 'text-[10px]' : 'text-xs';

  // Вычисляем endTime из start_time и estimated_duration
  const startTime = formatTimeWithoutSeconds(booking.start_time);
  const endTime = calculateEndTime(startTime, booking.estimated_duration);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className={`relative ${sizeClasses} rounded-full ${statusColors[booking.status as keyof typeof statusColors]} shadow-lg hover:scale-105 transition-all flex flex-col items-center justify-center text-white cursor-pointer`}
      >
        {/* Диск (внутренний круг) */}
        <div className={`absolute ${innerInset} bg-white/20 rounded-full flex items-center justify-center`}>
          <div className={`${centerDot} bg-white rounded-full`}></div>
        </div>
        
        {/* Протектор (линии по краям) */}
        <div className="absolute inset-0">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className={`absolute ${treadWidth} bg-black/20 left-1/2 top-0 origin-bottom rounded-sm`}
              style={{
                transform: `translateX(-50%) rotate(${i * 30}deg) translateY(-100%)`
              }}
            />
          ))}
        </div>

        {/* Время */}
        <div className={`relative z-10 ${textSize} font-bold`}>
          {startTime}
        </div>
      </button>

      {/* Информация под колесом - только для full варианта */}
      {variant === 'full' && (
        <div className="text-center">
          {booking.is_org && (
            <div className="text-xs text-gray-500 truncate max-w-[120px]">
              {booking.org_name || 'Не указана'}
            </div>
          )}
          <div className="text-sm font-semibold text-gray-800 truncate max-w-[120px]">
            {booking.client_name}
          </div>
          <div className="text-xs text-gray-500 truncate max-w-[120px]">
            {booking.car_model}
          </div>
          <div className="text-xs font-medium text-gray-600 mt-1">
            {statusText[booking.status as keyof typeof statusText]}
          </div>
        </div>
      )}
    </div>
  );
};
