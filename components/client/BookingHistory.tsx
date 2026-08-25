import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { ChevronDown, ChevronUp, Calendar, Clock, Car, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Booking } from '../../lib/api/bookings';
import { TireBooking } from '../../lib/api/tire-bookings';
import { Service } from '../../lib/api/services';
import { formatTimeWithoutSeconds } from '../../shared/utils/time';

interface BookingHistoryProps {
  carwashBookings: Booking[];
  tireBookings: TireBooking[];
  services?: Service[];
}

export const BookingHistory: React.FC<BookingHistoryProps> = ({
  carwashBookings,
  tireBookings,
  services = []
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  // Сортировка по дате (новые сначала)
  const sortedCarwashBookings = [...carwashBookings].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  const sortedTireBookings = [...tireBookings].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-4">
      {/* Автомойка */}
      <Card>
        <button
          onClick={() => toggleSection('carwash')}
          className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg">Автомойка</span>
            <span className="text-sm text-gray-500">({sortedCarwashBookings.length})</span>
          </div>
          {expandedSections.has('carwash') ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>

        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            expandedSections.has('carwash') ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="p-4 space-y-3">
            {sortedCarwashBookings.length > 0 ? (
              sortedCarwashBookings.map((booking) => (
                <Card key={booking.id} className="border">
                  <CardContent className="p-4 space-y-2">
                    {/* Дата и время */}
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>{booking.booking_date}</span>
                      <span className="mx-1">|</span>
                      <Clock className="w-4 h-4" />
                      <span>{formatTimeWithoutSeconds(booking.start_time)} - {formatTimeWithoutSeconds(booking.end_time)}</span>
                    </div>

                    {/* Автомобиль */}
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-gray-600" />
                      <span className="font-bold">{booking.car_model}</span>
                      <span className="text-sm text-gray-500">| {booking.plate_number}</span>
                    </div>

                    {/* Услуги */}
                    {booking.services && booking.services.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Услуги:</div>
                        <div className="space-y-1">
                          {booking.services.map((serviceId) => {
                            const service = services.find(s => s.id === serviceId);
                            return (
                              <div key={serviceId} className="text-sm flex items-center gap-2">
                                <Check className="w-3 h-3 text-green-500" />
                                <span>{service?.name || serviceId}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Цена и статус */}
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm text-gray-500">{booking.status}</span>
                      <span className="font-bold">{booking.price} ₽</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-6 text-gray-500">
                История записей пуста
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Шиномонтаж */}
      <Card>
        <button
          onClick={() => toggleSection('tire')}
          className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg">Шиномонтаж</span>
            <span className="text-sm text-gray-500">({sortedTireBookings.length})</span>
          </div>
          {expandedSections.has('tire') ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>

        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            expandedSections.has('tire') ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="p-4 space-y-3">
            {sortedTireBookings.length > 0 ? (
              sortedTireBookings.map((booking) => (
                <Card key={booking.id} className="border">
                  <CardContent className="p-4 space-y-2">
                    {/* Дата и время */}
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>{booking.booking_date}</span>
                      <span className="mx-1">|</span>
                      <Clock className="w-4 h-4" />
                      <span>{formatTimeWithoutSeconds(booking.start_time)}</span>
                      <span className="text-gray-400">
                        ({booking.estimated_duration} мин)
                      </span>
                    </div>

                    {/* Автомобиль */}
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-gray-600" />
                      <span className="font-bold">{booking.car_model}</span>
                      <span className="text-sm text-gray-500">| {booking.plate_number}</span>
                    </div>

                    {/* Услуги */}
                    {booking.services && booking.services.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Услуги:</div>
                        <div className="space-y-1">
                          {booking.services.map((service) => (
                            <div key={service.service_id} className="text-sm flex items-center gap-2">
                              <Check className="w-3 h-3 text-green-500" />
                              <span>{service.name} × {service.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Цена и статус */}
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm text-gray-500">{booking.status}</span>
                      <span className="font-bold">{booking.total_price} ₽</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-6 text-gray-500">
                История записей пуста
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
