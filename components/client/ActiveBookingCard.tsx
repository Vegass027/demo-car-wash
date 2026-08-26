import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Clock, CreditCard, Calendar, Car, Trash2 } from 'lucide-react';
import { Booking } from '../../lib/api/bookings';
import { TireBooking } from '../../lib/api/tire-bookings';
import { Service } from '../../lib/api/services';
import { getServices } from '../../lib/api/services';
import { getTireServices } from '../../lib/api/tire-services';
import { formatTimeWithoutSeconds, calculateEndTime } from '../../shared/utils/time';
import { cancelOnlineBooking } from '../../lib/api/bookings';
import { getCancellationCountByProfileId } from '../../lib/api/booking-cancellations';
import { getSessionToken } from '../../lib/supabase';

interface ActiveBookingCardProps {
  booking: Booking | TireBooking;
  type: 'carwash' | 'tire';
  services?: Service[];
  tireServices?: any[];
  onDelete?: (bookingId: string) => void;
  profileId?: string | null;
}

export const ActiveBookingCard: React.FC<ActiveBookingCardProps> = ({ booking, type, services = [], tireServices = [], onDelete, profileId }) => {
  const isCarwash = type === 'carwash';

  // Получаем названия услуг
  const getServiceNames = (): string[] => {
    if (isCarwash) {
      const bookingServices = (booking as Booking).services || [];
      return bookingServices.map(serviceId => {
        const service = services.find(s => s.id === serviceId);
        return service?.name || serviceId;
      });
    } else {
      const bookingServices = (booking as TireBooking).services || [];
      return bookingServices.map(s => s.name);
    }
  };

  const serviceNames = getServiceNames();
  const price = isCarwash ? (booking as Booking).price : (booking as TireBooking).total_price;
  const paymentMethod = isCarwash ? (booking as Booking).payment_method : (booking as TireBooking).payment_method;
  const status = booking.status;
  const clientId = isCarwash ? (booking as Booking).client_id : (booking as TireBooking).client_id;

  const handleDelete = async () => {
    if (!clientId) {
      alert('Не удалось определить клиента');
      return;
    }

    // Проверяем количество отмен
    let cancellationCount = 0;
    if (profileId) {
      cancellationCount = await getCancellationCountByProfileId(profileId, 30);
    }

    const message = cancellationCount >= 2
      ? '⚠️ Это будет 3-я отмена! После неё онлайн запись будет недоступна на 30 дней. Точно отменить заказ?'
      : 'Точно отменить заказ? После 3х отмен онлайн запись будет недоступна';

    if (confirm(message)) {
      try {
        if (isCarwash) {
          await cancelOnlineBooking((booking as Booking).id, clientId);
        } else {
          // Slice #2: tire cancel now routes through service_role-owned RPC
          // via /api/client dispatcher (cancel_own_tire_booking). Replaces
          // the previous anon UPDATE path that leaked cross-tenant UPDATE
          // permissions on tire_bookings.
          const token = getSessionToken();
          if (!token) throw new Error('Missing session token (reopen Mini App)');

          const res = await fetch('/api/client?action=cancel-tire-booking', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              tire_booking_id: (booking as TireBooking).id,
              reason: 'client_self_cancel',
            }),
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const errStatus = res.status;
            const errCode = errBody?.error || 'http_error';
            if (errStatus === 404) {
              throw new Error('Бронирование не найдено или вам не принадлежит');
            }
            if (errStatus === 409 && errBody?.current_status) {
              throw new Error(`Нельзя отменить (текущий статус: ${errBody.current_status})`);
            }
            throw new Error(`Не удалось отменить (${errStatus} ${errCode})`);
          }

          await res.json().catch(() => ({}));
        }
        if (onDelete) {
          onDelete(booking.id);
        }
      } catch (error) {
        console.error('Ошибка при удалении заказа:', error);
        const message = (error as Error)?.message || 'Не удалось удалить заказ';
        alert(message);
      }
    }
  };

  return (
    <Card className="border-primary bg-blue-50/50">
      <CardContent className="p-4 space-y-3">
        {/* Верхняя строка: дата/время + статус */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-xs md:text-sm text-gray-600">
            <Calendar className="w-3 h-3 md:w-4 md:h-4" />
            <span>{booking.booking_date}</span>
            <span className="mx-1">|</span>
            <Clock className="w-3 h-3 md:w-4 md:h-4" />
            {isCarwash ? (
              <span>{formatTimeWithoutSeconds((booking as Booking).start_time)} - {formatTimeWithoutSeconds((booking as Booking).end_time)}</span>
            ) : (
              <span>
                {formatTimeWithoutSeconds((booking as TireBooking).start_time)} - {calculateEndTime((booking as TireBooking).start_time, (booking as TireBooking).estimated_duration)}
              </span>
            )}
          </div>
          <Badge variant="outline" className="ml-2">
            {status}
          </Badge>
        </div>

        {/* Нижняя строка: марка/госномер + кнопка удаления */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-gray-600" />
            <span className="font-bold">{booking.car_model}</span>
            <span className="text-sm text-gray-500">| {booking.plate_number}</span>
          </div>
          <button
            onClick={handleDelete}
            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            title="Удалить заказ"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Услуги */}
        {serviceNames.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Услуги:</div>
            <div className="space-y-1">
              {serviceNames.map((name, index) => (
                <div key={index} className="text-sm">
                  • {name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Цена и оплата */}
        <div className="flex justify-between items-center pt-2 border-t">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CreditCard className="w-4 h-4" />
            <span>{paymentMethod}</span>
          </div>
          <span className="text-xl font-bold">{price} ₽</span>
        </div>
      </CardContent>
    </Card>
  );
};
