import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Booking, CarType } from '../../types';
import { Worker } from '../../lib/api/workers';
import { Service, getServicePrice } from '../../lib/api/services';
import { Clock, CarFront, Banknote, User, Building2, Phone, MessageSquare, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

const ANTIFREEZE_SERVICE_IDS = ['antifreeze-org', 'antifreeze-umc'];

export interface OrdersHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookings: Booking[];
  selectedDate?: string;
  workers?: Worker[];
  services?: Service[];
}

export const OrdersHistoryModal: React.FC<OrdersHistoryModalProps> = ({
  isOpen,
  onClose,
  bookings,
  selectedDate,
  workers = [],
  services = []
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
                  workers={workers}
                  services={services}
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
  booking: Booking;
  showCancelComment: boolean;
  workers?: Worker[];
  services: Service[];
}

const HistoryCard: React.FC<HistoryCardProps> = ({ booking, showCancelComment, workers = [], services }) => {
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
              <span className="font-semibold text-sm">{booking.start_time}</span>
              {booking.completed_at && (
                <span className="text-gray-400">→</span>
              )}
              {booking.completed_at && (
                <span className="font-semibold text-sm">
                  {new Date(booking.completed_at).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              )}
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

            {/* Правая колонка - автомобиль и мойщик */}
            <div className="space-y-3 text-sm">
              {booking.status === 'ГОТОВО' && booking.worker_id && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 flex-shrink-0 text-blue-600" />
                  <span className="text-gray-600 text-xs">Мойщик:</span>
                  <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 text-xs">
                    {getWorkerName(booking.worker_id, booking.worker_name, booking.worker_id_2, booking.worker_name_2, workers)}
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
                  {booking.services.map(serviceId => {
                    // Ищем услугу по обоим полям: id (UUID) И service_id (строка)
                    const service = services.find(s => s.id === serviceId || s.service_id === serviceId);
                    if (!service) return null;
                    
                    // Для незамерзающих услуг цена не зависит от типа авто
                    const isAntifreeze = ANTIFREEZE_SERVICE_IDS.includes(service.service_id);
                    const price = isAntifreeze
                      ? Number(service.price_sedan)
                      : getServicePrice(service, booking.car_type as CarType);
                    
                    // ✅ Проверяем количество для незамерзающих жидкостей
                    let quantity = 1;
                    let displayPrice = price;
                    
                    if (isAntifreeze && booking.services_with_quantities && booking.services_with_quantities.length > 0) {
                      const serviceWithQuantity = booking.services_with_quantities.find(
                        (sq: any) => sq.service_id === serviceId
                      );
                      if (serviceWithQuantity) {
                        quantity = serviceWithQuantity.quantity;
                        displayPrice = serviceWithQuantity.total;
                      }
                    }
                    
                    return (
                      <div key={service.id} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2 flex-1">
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-gray-700">{service.name}</span>
                          {quantity > 1 && (
                            <span className="text-gray-500">({quantity})</span>
                          )}
                        </div>
                        <span className="text-gray-500">+{displayPrice} ₽</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold">Итого:</span>
              </div>
              <Badge variant="outline" className="text-lg font-bold">
                {booking.price} ₽
              </Badge>
            </div>
          </div>

          {/* Комментарий при отмене */}
          {showCancelComment && booking.cancel_comment && (
            <div className="border-t pt-4 bg-red-50 -mx-6 px-6 pb-4">
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-red-700 mb-1">
                    Причина отмены:
                  </div>
                  <div className="text-sm text-red-600">
                    {booking.cancel_comment}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Вспомогательная функция для получения имени мойщика
const getWorkerName = (
  workerId: string,
  worker_name: string | undefined,
  worker_id_2: string | undefined,
  worker_name_2: string | undefined,
  workers: Worker[]
): string => {
  if (worker_id_2 && worker_name_2) {
    return `Пара: ${worker_name || ''} + ${worker_name_2}`;
  }

  if (worker_name) {
    return worker_name;
  }

  const worker = workers.find(w => w.id === workerId);
  if (!worker) return workerId;
  return worker.full_name;
};
