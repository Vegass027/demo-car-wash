import React from 'react';
import { Worker } from '../../types';
import { Booking } from '../../lib/api/bookings';
import { Service } from '../../lib/api/services';
import { WORKER_CONFIG } from '../../shared/config/worker';
import { calculateOrderEarnings, getWorkerBookingsForToday } from '../../features/workers/calculateEarnings';
import { declineNameInstrumental } from '../../shared/utils/declineName';
import { ArrowLeft, ArrowRightLeft, Car, User, Banknote, CheckCircle, Users } from 'lucide-react';
import type { SalarySettings } from '../../lib/types/salary';

interface WorkerBookingsListProps {
  worker: Worker;
  allBookings: Booking[];
  allWorkers: Worker[];
  services: Service[];
  isOpen: boolean;
  onClose: () => void;
  salarySettings?: SalarySettings | null;
}

export const WorkerBookingsList: React.FC<WorkerBookingsListProps> = ({
  worker,
  allBookings,
  allWorkers,
  services,
  isOpen,
  onClose,
  salarySettings
}) => {
  if (!isOpen) return null;

  // Локальная функция для расчета заработка с использованием динамических настроек
  const calculateOrderEarningsDynamic = (price: number, discount: number, workingMode: string | null): number => {
    const commission = workingMode === 'pair'
      ? (salarySettings?.worker_pair_commission || 0.20) // 20%
      : (salarySettings?.worker_solo_commission || 0.4); // 40%
    const priceForSalary = price + discount; // ✅ Полная цена БЕЗ скидки!
    return Math.round(priceForSalary * commission);
  };

  // ✅ Форматируем дату в YYYY-MM-DD для сравнения с booking_date в БД
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // "2026-02-17"
  const todayBookings = getWorkerBookingsForToday(worker, allBookings, today)
    .sort((a, b) => {
      // Сортируем по completed_at (время завершения)
      const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return aTime - bTime;
    });

  const totalEarningsFromBookings = todayBookings.reduce(
    (sum, booking) => {
      const workingMode = booking.working_mode || worker.working_mode;
      return sum + calculateOrderEarningsDynamic(booking.price, booking.discount || 0, workingMode);
    },
    0
  );

  const percentage = worker.working_mode === 'pair'
    ? (salarySettings?.worker_pair_commission || 0.20) // 20%
    : (salarySettings?.worker_solo_commission || 0.4); // 40%

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
              <h3 className="text-lg font-bold">{worker.full_name}</h3>
              {worker.working_mode === 'pair' && worker.partner_id ? (
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <ArrowRightLeft className="w-3 h-3" />
                  работает с {declineNameInstrumental(allWorkers.find(w => w.id === worker.partner_id)?.full_name || 'партнёром')}
                </span>
              ) : (
                <span className="text-sm text-gray-500">
                  {`${todayBookings.length} ${todayBookings.length === 1 ? 'машина' : 'машин'} за сегодня`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Итого за день */}
          {worker.is_working_today ? (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200 mb-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Заработано сегодня:</span>
                  <span className="font-semibold text-green-600">Выход: {worker.base_rate_amount} ₽</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Проценты с заказов:</span>
                  <span className="font-semibold text-green-600">+{totalEarningsFromBookings} ₽</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-green-300 text-base">
                  <span className="font-bold">Итого за сегодня:</span>
                  <span className="font-bold text-green-700 text-lg">
                    {worker.base_rate_amount + totalEarningsFromBookings} ₽
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200 mb-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Заработано сегодня:</span>
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
          {!worker.is_working_today && todayBookings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Мойщик не работает сегодня</p>
            </div>
          ) : todayBookings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>За сегодня еще нет выполненных заказов</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayBookings.map((booking, index) => {
                const workingMode = booking.working_mode || worker.working_mode;
                const earnings = calculateOrderEarningsDynamic(booking.price, booking.discount || 0, workingMode);
                const serviceLabels = booking.services
                  .map(serviceId => {
                    const service = services.find(s => s.id === serviceId);
                    return service?.name || serviceId;
                  })
                  .join(', ');

                // Определяем имя напарника, если работа в паре
                const partnerName = workingMode === 'pair' && booking.worker_id_2
                  ? (worker.id === booking.worker_id ? booking.worker_name_2 : booking.worker_name)
                  : null;

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
                        <div className="font-bold text-lg">{booking.price} ₽</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-700">
                        <User className="w-4 h-4 text-gray-400" />
                        <span>{booking.is_org ? booking.org_name || booking.client_name : booking.client_name}</span>
                      </div>

                      {partnerName && (
                        <div className="flex items-center gap-2 text-blue-700">
                          <Users className="w-4 h-4 text-blue-500" />
                          <span>Напарник: {partnerName}</span>
                        </div>
                      )}

                      {serviceLabels && (
                        <div className="text-gray-600">
                          <span className="text-gray-500">Услуги:</span> {serviceLabels}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                        <span className="text-gray-500">
                          Заработок ({(workingMode === 'pair' ? (salarySettings?.worker_pair_commission || 0.20) * 100 : (salarySettings?.worker_solo_commission || 0.4) * 100).toFixed(0)}%{workingMode === 'pair' ? ', пара' : ''}):
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
