import React from 'react';
import { TireWorker } from '../../lib/api/tire-workers';
import { TireBooking } from '../../lib/api/tire-bookings';
import { TIRE_TECHNICIAN_CONFIG } from '../../shared/config/worker';
import { calculateOrderEarnings, getTechnicianBookingsForToday } from '../../features/tire-technicians/calculateEarnings';
import { ArrowLeft, Car, User, Banknote, CheckCircle } from 'lucide-react';
import type { TireServiceItem } from '../../lib/api/tire-bookings';
import type { SalarySettings } from '../../lib/types/salary';
import { formatDate } from '../../shared/utils/date';

interface TireTechnicianBookingsListProps {
  technician: TireWorker;
  allBookings: TireBooking[];
  isOpen: boolean;
  onClose: () => void;
  salarySettings?: SalarySettings | null;
}

export const TireTechnicianBookingsList: React.FC<TireTechnicianBookingsListProps> = ({
  technician,
  allBookings,
  isOpen,
  onClose,
  salarySettings
}) => {
  if (!isOpen) return null;

  // ✅ Форматируем дату в YYYY-MM-DD для сравнения с booking_date в БД
  // Используем formatDate для локального времени (как в App.tsx)
  const today = formatDate(new Date());
  let todayBookings = getTechnicianBookingsForToday(technician, allBookings, today);
  
  // Сортируем заказы по времени завершения (updated_at)
  todayBookings = [...todayBookings].sort((a, b) =>
    new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
  );
  
  const totalEarningsFromBookings = todayBookings.reduce(
    (sum, booking) => sum + calculateOrderEarnings(booking, salarySettings),
    0
  );

  const baseSalary = 0; // У мастеров нет базовой ставки

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">{technician.full_name}</h3>
              <span className="text-sm text-gray-500">
                {`${todayBookings.length} ${todayBookings.length === 1 ? 'заказ' : 'заказов'} за сегодня`}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Итого за день */}
          {technician.is_working_today ? (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200 mb-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Базовая ставка:</span>
                  <span className="font-semibold">{baseSalary} ₽</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Проценты с заказов:</span>
                  <span className="font-semibold text-green-600">+{totalEarningsFromBookings} ₽</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-green-300 text-base">
                  <span className="font-bold">Итого за сегодня:</span>
                  <span className="font-bold text-green-700 text-lg">
                    {baseSalary + totalEarningsFromBookings} ₽
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200 mb-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Базовая ставка:</span>
                  <span className="font-semibold text-gray-400">0 ₽</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Проценты с заказов:</span>
                  <span className="font-semibold text-green-600">+{totalEarningsFromBookings} ₽</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-300 text-base">
                  <span className="font-bold">Итого за сегодня:</span>
                  <span className="font-bold text-gray-700 text-lg">
                    {totalEarningsFromBookings} ₽
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Список заказов */}
          {!technician.is_working_today && todayBookings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Шиномонтажник не работает сегодня</p>
            </div>
          ) : todayBookings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>За сегодня еще нет выполненных заказов</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayBookings.map((booking, index) => {
                const earnings = calculateOrderEarnings(booking, salarySettings);

                // Получаем метки услуг шиномонтажа
                const serviceLabels = booking.services
                  .map((service: TireServiceItem) => {
                    return `${service.name} × ${service.quantity}`;
                  })
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div
                    key={booking.id}
                    className="bg-gray-50 rounded-xl p-4 border border-gray-100"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-bold text-lg">{booking.car_model}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            <Car className="w-3 h-3" />
                            {booking.plate_number}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Чек</div>
                        <div className="font-bold text-lg">{booking.total_price} ₽</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-700">
                        <User className="w-4 h-4 text-gray-400" />
                        <span>{booking.is_org ? booking.org_name || booking.client_name : booking.client_name}</span>
                      </div>

                      {serviceLabels && (
                        <div className="text-gray-600">
                          <span className="text-gray-500">Услуги:</span> {serviceLabels}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                        <span className="text-gray-500">
                          {(() => {
                            const hasStorageService = booking.services.some(s =>
                              TIRE_TECHNICIAN_CONFIG.STORAGE_SERVICE_NAMES.includes(s.name as any)
                            );
                            const hasOnlyStorage = hasStorageService && booking.services.length === 1;
                            const hasStorageWithOthers = hasStorageService && booking.services.length > 1;

                            if (hasOnlyStorage) {
                              return 'Заработок:';
                            } else if (hasStorageWithOthers) {
                              return 'Заработок:';
                            } else {
                              return `Заработок (${((salarySettings?.tire_worker_commission || 0.5) * 100).toFixed(0)}%):`;
                            }
                          })()}
                        </span>
                        <div className="flex items-center gap-1 text-green-600 font-bold">
                          <Banknote className="w-4 h-4" />
                          +{earnings} ₽
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
