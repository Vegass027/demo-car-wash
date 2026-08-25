import React, { useState } from 'react';
import { Booking } from '../../types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { ChevronDown } from 'lucide-react';

interface StatusDropdownProps {
  status: 'done' | 'cancelled';
  bookings: Booking[];
  onBookingSelect: (bookingId: string) => void;
}

export const StatusDropdown: React.FC<StatusDropdownProps> = ({
  status,
  bookings,
  onBookingSelect
}) => {
  const [open, setOpen] = useState(false);

  const statusConfig = {
    done: {
      label: 'Готово',
      color: 'bg-gray-400 text-white',
      borderColor: 'border-gray-500'
    },
    cancelled: {
      label: 'Отменено',
      color: 'bg-red-500 text-white',
      borderColor: 'border-red-600'
    }
  };

  const config = statusConfig[status];

  const handleBookingSelect = (bookingId: string) => {
    setOpen(false);
    onBookingSelect(bookingId);
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`px-3 py-1.5 rounded-lg ${config.color} ${config.borderColor} border font-medium`}>
        {config.label}: {bookings.length}
      </div>
      {bookings.length > 0 && (
        <Select open={open} onOpenChange={setOpen} onValueChange={handleBookingSelect}>
          <SelectTrigger className="w-[32px] h-8 p-0 border-gray-300">
            <div className="flex items-center justify-center w-full">
              <ChevronDown className="w-4 h-4" />
            </div>
          </SelectTrigger>
          <SelectContent>
            {bookings.map(booking => (
              <SelectItem key={booking.id} value={booking.id}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{booking.startTime}</span>
                  <span className="text-gray-600">{booking.clientName}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};
