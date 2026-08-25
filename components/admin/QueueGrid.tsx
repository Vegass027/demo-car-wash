import React from 'react';
import { TireBooking } from '../../lib/api/tire-bookings';
import { TireBookingCard } from './TireBookingCard';
import { AddBookingButton } from './AddBookingButton';

interface QueueGridProps {
  bookings: TireBooking[];
  onBookingClick: (bookingId: string) => void;
  onAddBooking: () => void;
}

export const QueueGrid: React.FC<QueueGridProps> = ({
  bookings,
  onBookingClick,
  onAddBooking
}) => {
  return (
    <div>
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
        ОЧЕРЕДЬ ({bookings.length} заказа)
      </h2>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        {/* Grid layout для колёс */}
        <div className="grid grid-cols-2 gap-4">
          {bookings.map(booking => (
            <TireBookingCard
              key={booking.id}
              booking={booking}
              onClick={() => onBookingClick(booking.id)}
              variant="compact"
            />
          ))}
        </div>

        {/* Кнопка добавления */}
        <div className="mt-4">
          <AddBookingButton onClick={onAddBooking} />
        </div>

        {bookings.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            Нет заказов в очереди
          </div>
        )}
      </div>
    </div>
  );
};
