import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { TireBooking } from '../../lib/api/tire-bookings';
import { Clock, CarFront, Banknote, User, Building2, Phone, MessageSquare, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { TireServiceItem } from '../../lib/api/tire-bookings';
import { formatTimeWithoutSeconds, calculateEndTime } from '../../shared/utils/time';

export interface TireOrdersHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookings: TireBooking[];
  selectedDate?: string;
  technicians?: any[];
}

export const TireOrdersHistoryModal: React.FC<TireOrdersHistoryModalProps> = ({
  isOpen,
  onClose,
  bookings,
  selectedDate,
  technicians = []
}) => {
  const [selectedTab, setSelectedTab] = useState<'done' | 'cancelled'>('done');

  // Фильтруем заказы по статусу и дате
  const filteredBookings = bookings.filter(booking => {
    const matchesStatus = selectedTab === 'done'
      ? booking.status === 'ГОТОВО'
      : booking.status === 'ОТМЕНЕНО';
    const matchesDate = selectedDate ? booking.booking_date === selectedDate : true;
    return matchesStatus && matchesDate;
  });

  // Сортируем по времени (новые сверху)
  const sortedBookings = [...filteredBookings].sort((a, b) => {
    const timeA = a.start_time;
    const timeB = b.start_time;
    return timeB.localeCompare(timeA);
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto scroll-mobile">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg md:text-xl font-bold">История заказов</DialogTitle>
            <span className="text-gray-400">|</span>
            <Select value={selectedTab} onValueChange={(value) => setSelectedTab(value as 'done' | 'cancelled')}>
                <SelectTrigger className="w-[100px] md:w-[140px] h-7 md:h-9 text-xs md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="done">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 md:w-4 md:h-4 text-green-600" />
                      <span className="text-xs md:text-sm">Готово</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {bookings.filter(b => b.status === 'ГОТОВО' && (!selectedDate || b.booking_date === selectedDate)).length}
                      </Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="cancelled">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3 h-3 md:w-4 md:h-4 text-red-600" />
                      <span className="text-xs md:text-sm">Отменено</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {bookings.filter(b => b.status === 'ОТМЕНЕНО' && (!selectedDate || b.booking_date === selectedDate)).length}
                      </Badge>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
          </div>
        </DialogHeader>

        <div className="mt-4">
          {sortedBookings.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {selectedTab === 'done' ? 'Нет выполненных заказов' : 'Нет отмененных заказов'}
            </div>
          ) : (
            <div className="space-y-4">
              {sortedBookings.map(booking => (
                <HistoryCard
                  key={booking.id}
                  booking={booking}
                  showCancelComment={selectedTab === 'cancelled'}
                  technicians={technicians}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface HistoryCardProps {
  booking: TireBooking;
  showCancelComment: boolean;
  technicians?: any[];
}

const HistoryCard: React.FC<HistoryCardProps> = ({ booking, showCancelComment, technicians = [] }) => {
  const startTime = formatTimeWithoutSeconds(booking.start_time);
  const endTime = calculateEndTime(startTime, booking.estimated_duration);

  return (
    <Card
      className={cn(
        "border-l-4 relative",
        booking.status === 'ГОТОВО' ? 'border-l-green-500' : 'border-l-red-500'
      )}
    >
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Заголовок с временем и статусом */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-sm">{startTime} - {endTime}</span>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "font-semibold",
                booking.status === 'ГОТОВО'
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              )}
            >
              {booking.status}
            </Badge>
          </div>

          {/* Информация о клиенте и автомобиле */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
            {/* Левая колонка - клиент */}
            <div className="space-y-3 text-sm">
              {booking.is_org && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  <span className="font-semibold">{booking.org_name || 'Не указана'}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <span className="font-semibold">{booking.client_name}</span>
              </div>
              {booking.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  <span className="text-sm">{booking.phone}</span>
                </div>
              )}
            </div>

            {/* Вертикальный разделитель */}
            <div className="border-l border-gray-200"></div>

            {/* Правая колонка - мастер и автомобиль */}
            <div className="space-y-3 text-sm">
              {booking.status === 'ГОТОВО' && booking.worker_id && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 flex-shrink-0 text-blue-600" />
                  <span className="text-gray-600 text-xs">Мастер:</span>
                  <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 text-xs">
                    {booking.worker_name || technicians.find(t => t.id === booking.worker_id)?.full_name || booking.worker_id}
                  </Badge>
                </div>
              )}
              <div className="flex items-center gap-2">
                <CarFront className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <span className="text-sm">{booking.car_model}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs uppercase">
                  {booking.plate_number}
                </Badge>
              </div>
            </div>
          </div>

          {/* Услуги и сумма */}
          <div className="border-t pt-4">
            {booking.services && booking.services.length > 0 && (
              <div className="space-y-2 mb-4">
                <div className="text-sm font-semibold text-gray-700 mb-2">Услуги:</div>
                <div className="space-y-2">
                  {(booking.services as TireServiceItem[]).map(service => (
                    <div key={service.service_id} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2 flex-1">
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-700">{service.name} × {service.quantity}</span>
                        {service.comment && <span className="text-xs text-orange-500">({service.comment})</span>}
                      </div>
                      <span className="text-gray-500">{service.total} ₽</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold">Итого:</span>
              </div>
              <Badge variant="outline" className="text-lg font-bold">
                {booking.total_price} ₽
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
