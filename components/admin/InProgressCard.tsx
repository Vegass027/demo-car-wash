import React from 'react';
import { TireBooking } from '../../lib/api/tire-bookings';
import { Phone, CarFront, Bandage, Building2, User } from 'lucide-react';
import type { TireServiceItem } from '../../lib/api/tire-bookings';

interface InProgressCardProps {
  booking: TireBooking;
  onClick: () => void;
  isNextBooking?: boolean;
}

export const InProgressCard: React.FC<InProgressCardProps> = ({ booking, onClick, isNextBooking = false }) => {
  const serviceText = booking.services && booking.services.length > 0
    ? (booking.services as TireServiceItem[])
        .map(service => `${service.name} × ${service.quantity}`)
        .join(', ')
    : 'Не указано';

  return (
    <button
      onClick={onClick}
      className={`w-full bg-white rounded-xl border-2 shadow-sm hover:shadow-md transition-all p-4 text-left cursor-pointer ${
        isNextBooking ? 'border-orange-500' : 'border-green-500'
      }`}
    >
      <div className="flex items-center gap-4">
        {/* Левая сторона: Марка авто, Гос номер */}
        <div className="flex-1 space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <CarFront className="w-5 h-5 text-gray-700 font-semibold" />
            <span className="text-sm text-gray-800 font-semibold">{booking.car_model}</span>
          </div>
          <div className="w-full border-t border-gray-200"></div>
          <div className="flex items-center justify-center gap-2">
            <Bandage className="w-5 h-5 text-gray-700 font-semibold" />
            <span className="text-sm text-gray-700 font-semibold">{booking.plate_number}</span>
          </div>
        </div>

        {/* Вертикальный разделитель */}
        <div className="w-px h-16 bg-gray-200"></div>

        {/* Правая сторона: Имя, Телефон, Организация */}
        <div className="flex-1 space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            {booking.is_org ? (
              <Building2 className="w-4 h-4 text-gray-700 font-semibold" />
            ) : (
              <User className="w-4 h-4 text-gray-700 font-semibold" />
            )}
            <span className="text-sm font-semibold text-gray-800">{booking.client_name}</span>
          </div>
          <div className="w-full border-t border-gray-200"></div>
          <div className="flex items-center justify-center gap-2">
            <Phone className="w-4 h-4 text-gray-700 font-semibold" />
            <span className="text-sm text-gray-700 font-semibold">{booking.phone || 'Не указан'}</span>
          </div>
        </div>
      </div>
    </button>
  );
};
