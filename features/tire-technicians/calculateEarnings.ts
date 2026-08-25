/**
 * Функции для расчета заработной платы мастеров шиномонтажа
 * Работают с БД через API функции
 */

import { TireWorker, updateTireWorker } from '@/lib/api/tire-workers';
import { TireBooking } from '@/lib/api/tire-bookings';
import { TIRE_TECHNICIAN_CONFIG } from '@/shared/config/worker';
import type { SalarySettings } from '@/lib/types/salary';

/**
 * Рассчитывает заработок мастера за заказ
 * @param booking - заказ шиномонтажа
 * @param salarySettings - настройки зарплаты из БД
 * @returns заработок с этого заказа
 *
 * Логика:
 * - Если есть услуга хранения резины → процент от обычных услуг + плата за хранение
 * - Если нет хранения резины → процент от всего чека
 */
export function calculateOrderEarnings(
  booking: TireBooking,
  salarySettings: SalarySettings | null
): number {
  const commission = salarySettings?.tire_worker_commission || 0.5; // 50%
  const storageFee = salarySettings?.tire_worker_storage_fee || 300; // 300₽
  const storageServiceNames = TIRE_TECHNICIAN_CONFIG.STORAGE_SERVICE_NAMES;

  const hasStorageService = booking.services.some(s =>
    storageServiceNames.includes(s.name as any)
  );

  if (hasStorageService) {
    // Процент от суммы обычных услуг (не услуги хранения резины)
    const regularServicesTotal = booking.services
      .filter(s => !storageServiceNames.includes(s.name as any))
      .reduce((sum, s) => sum + s.total, 0);

    const regularEarnings = regularServicesTotal * commission;
    const storageEarnings = storageFee;

    return regularEarnings + storageEarnings;
  } else {
    // Если нет хранения - процент от чека
    return booking.total_price * commission;
  }
}

/**
 * Рассчитывает общий заработок за день
 * @param technician - мастер
 * @returns общий заработок (только проценты, базовой ставки нет)
 */
export function calculateTotalDailyEarnings(technician: TireWorker): number {
  return technician.earned_today;
}

/**
 * Получает выполненные заказы мастера за текущий день
 * @param technician - мастер
 * @param allBookings - все заказы
 * @param today - текущая дата (ISO string в формате YYYY-MM-DD)
 * @returns заказы, выполненные сегодня
 */
export function getTechnicianBookingsForToday(
  technician: TireWorker,
  allBookings: TireBooking[],
  today: string
): TireBooking[] {
  return allBookings.filter(booking => {
    // ✅ Проверка 1: заказ в списке выполненных
    if (!technician.completed_bookings.includes(booking.id)) return false;
    
    // ✅ Проверка 2: заказ на нужную дату (по booking_date)
    if (!booking.booking_date) return false;
    
    // ✅ Сравниваем booking_date с today (оба в формате YYYY-MM-DD)
    return booking.booking_date === today;
  });
}

/**
 * Рассчитывает общую сумму процентов от выполненных заказов
 * @param bookings - выполненные заказы
 * @param salarySettings - настройки зарплаты из БД
 * @returns сумма процентов (без базовой ставки)
 */
export function calculateTotalEarningsFromBookings(
  bookings: TireBooking[],
  salarySettings: SalarySettings | null
): number {
  return bookings.reduce((sum, booking) => {
    return sum + calculateOrderEarnings(booking, salarySettings);
  }, 0);
}

/**
 * Рассчитывает ожидаемый заработок за заказ
 * @param booking - заказ шиномонтажа
 * @param salarySettings - настройки зарплаты из БД
 * @returns ожидаемый заработок
 */
export function calculateExpectedEarnings(
  booking: TireBooking,
  salarySettings: SalarySettings | null
): number {
  return calculateOrderEarnings(booking, salarySettings);
}

/**
 * Добавляет выполненный заказ в список мастера
 * @param technician - мастер
 * @param bookingId - ID заказа
 * @returns обновленный мастер
 */
export async function addCompletedBookingToTechnician(
  technician: TireWorker,
  bookingId: string
): Promise<TireWorker> {
  const updatedCompletedBookings = [...technician.completed_bookings, bookingId];
  return await updateTireWorker(technician.id, {
    completed_bookings: updatedCompletedBookings,
  });
}

/**
 * Переключает статус "работает сегодня" для мастера
 * @param technician - мастер
 * @returns обновленный мастер
 */
export async function toggleTechnicianWorkingToday(technician: TireWorker): Promise<TireWorker> {
  return await updateTireWorker(technician.id, {
    is_working_today: !technician.is_working_today,
  });
}
