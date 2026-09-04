/**
 * Функции для расчета заработной платы мойщиков
 * Работают с БД через API функции
 */

import { Worker, updateWorker } from '@/lib/api/workers';
import { startStaffWorkerShift, stopStaffWorkerShift } from '@/lib/api/staff-actions';
import { Booking } from '@/lib/api/bookings';
import type { SalarySettings } from '@/lib/types/salary';

/**
 * Рассчитывает заработок мойщика за заказ
 *
 * Issue 16 — the basis is now sum(nominal_unit_price * quantity) across
 * the booking's services_with_quantities (list-priced gross), not
 * bookings.price + bookings.discount. Universal principle: bonus/free
 * services contribute their retail-equivalent unit price, so the
 * displayed earnings in WorkerBookingsList match the actual ledger row
 * written by api/staff.ts:markStaffReadyAction.
 *
 * Legacy rows without nominal_unit_price fall back to per-line total,
 * matching the previous behavior for fully-paid bookings.
 *
 * @param swq - bookings.services_with_quantities (array of line items)
 * @param workingMode - режим работы мойщика
 * @param salarySettings - настройки зарплаты из БД
 * @returns заработок с этого заказа
 */
export function calculateOrderEarnings(
  swq: Booking['services_with_quantities'] | null | undefined,
  workingMode: 'solo' | 'pair',
  salarySettings: SalarySettings | null,
): number {
  const lines = Array.isArray(swq) ? swq : [];
  const percentage = workingMode === 'pair'
    ? (salarySettings?.worker_pair_commission || 0.2) // 20%
    : (salarySettings?.worker_solo_commission || 0.4); // 40%
  let gross = 0;
  for (const line of lines) {
    const nominal = line?.nominal_unit_price;
    const qty = Number(line?.quantity ?? 0);
    const lineTotal = nominal != null && Number(nominal) > 0
      ? Number(nominal) * qty
      : Number(line?.total ?? (Number(line?.price ?? 0) * qty));
    gross += lineTotal;
  }
  return gross * percentage;
}

/**
 * Рассчитывает количество машин для заказов
 * @param workingMode - режим работы мойщика
 * @returns количество машин (1 для solo, 0.5 для pair)
 */
export function calculateCarCount(workingMode: 'solo' | 'pair'): number {
  return workingMode === 'pair' ? 0.5 : 1;
}

/**
 * Рассчитывает базовую ставку для режима
 * @param workingMode - режим работы мойщика
 * @param salarySettings - настройки зарплаты из БД
 * @returns базовая ставка
 */
export function calculateBaseSalary(
  workingMode: 'solo' | 'pair',
  salarySettings: SalarySettings | null
): number {
  return workingMode === 'pair'
    ? (salarySettings?.worker_pair_base || 250) // 250₽
    : (salarySettings?.worker_solo_base || 500); // 500₽
}

/**
 * Рассчитывает общий заработок за день
 * @param worker - мойщик
 * @param salarySettings - настройки зарплаты из БД
 * @returns общий заработок (база + проценты)
 */
export function calculateTotalDailyEarnings(
  worker: Worker,
  salarySettings: SalarySettings | null
): number {
  const baseSalary = calculateBaseSalary(worker.working_mode, salarySettings);
  return baseSalary + worker.earned_today;
}

/**
 * Получает выполненные заказы мойщика за текущий день
 * @param worker - мойщик
 * @param allBookings - все заказы
 * @param today - текущая дата (ISO string)
 * @returns заказы, выполненные сегодня
 */
export function getWorkerBookingsForToday(
  worker: Worker,
  allBookings: Booking[],
  today: string
): Booking[] {
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  return allBookings.filter(booking => {
    if (!worker.completed_bookings.includes(booking.id)) return false;
    if (!booking.completed_at) return false;

    const completedDate = new Date(booking.completed_at);
    return completedDate >= todayStart && completedDate <= todayEnd;
  });
}

/**
 * Рассчитывает общую сумму процентов от выполненных заказов
 * @param bookings - выполненные заказы
 * @param workingMode - режим работы мойщика
 * @param salarySettings - настройки зарплаты из БД
 * @returns сумма процентов (без базовой ставки)
 */
export function calculateTotalEarningsFromBookings(
  bookings: Booking[],
  workingMode: 'solo' | 'pair',
  salarySettings: SalarySettings | null
): number {
  return bookings.reduce((sum, booking) => {
    return sum + calculateOrderEarnings(
      booking.services_with_quantities,
      workingMode,
      salarySettings,
    );
  }, 0);
}

/**
 * Рассчитывает ожидаемый заработок за заказ
 *
 * Issue 16 — accepts a swq-like array now (list-priced gross). When a
 * caller only has a single orderPrice, pass [{ service_id: 'synthetic',
 * quantity: 1, price: orderPrice, total: orderPrice,
 * nominal_unit_price: orderPrice }] to preserve the old single-amount
 * semantics.
 *
 * @param swq - bookings.services_with_quantities (or synthetic 1-line)
 * @param workingMode - режим работы мойщика
 * @param salarySettings - настройки зарплаты из БД
 * @returns ожидаемый заработок
 */
export function calculateExpectedEarnings(
  swq: Booking['services_with_quantities'] | null | undefined,
  workingMode: 'solo' | 'pair',
  salarySettings: SalarySettings | null,
): { earnings: number; carCount: number } {
  const earnings = calculateOrderEarnings(swq, workingMode, salarySettings);
  const carCount = calculateCarCount(workingMode);
  return { earnings, carCount };
}

/**
 * Добавляет выполненный заказ в список мойщика
 * @param worker - мойщик
 * @param bookingId - ID заказа
 * @returns обновленный мойщик
 */
export async function addCompletedBookingToWorker(
  worker: Worker,
  bookingId: string
): Promise<Worker> {
  const updatedCompletedBookings = [...worker.completed_bookings, bookingId];
  return await updateWorker(worker.id, {
    completed_bookings: updatedCompletedBookings,
  });
}

/**
 * Переключает статус "работает сегодня" для мойщика
 * При включении устанавливает working_mode_status = 'waiting'
 * При выключении сбрасывает режим и партнера
 * @param worker - мойщик
 * @returns обновленный мойщик
 */
export async function toggleWorkerWorkingToday(worker: Worker): Promise<Worker> {
  console.log('[toggleWorkerWorkingToday] Начало выполнения для worker:', worker.full_name, 'id:', worker.id);
  console.log('[toggleWorkerWorkingToday] Текущее состояние:', {
    is_working_today: worker.is_working_today,
    earned_today: worker.earned_today,
    current_balance: worker.current_balance,
    working_mode: worker.working_mode,
    working_mode_status: worker.working_mode_status,
  });

  if (!worker.is_working_today) {
    console.log('[toggleWorkerWorkingToday] Включаем работу через startStaffWorkerShift (dispatcher)');

    // ✅ Commit 1 hotfix: route "turn on shift" through startStaffWorkerShift
    //    dispatcher. The previous generic updateWorker call passed 4
    //    blacklisted salary/status fields (is_working_today,
    //    working_mode_status, status, partner_id=null) which were all
    //    rejected by migration 026 RPC whitelist + JS-side filter,
    //    returning 400 no_updates_to_apply. startStaffWorkerShift is the
    //    correct path: it calls start_worker_shift RPC which handles
    //    is_working_today, working_mode_status, etc. server-side atomically.
    //
    //    Note: the old code also tried to clear working_mode and partner_id
    //    to null on turn-on — that's a no-op via the new RPC (they're
    //    already null for fresh workers). For re-entry after end-of-day
    //    reset (status='offline'), the daily reset cron handles it.
    const updated = await startStaffWorkerShift(worker.id);

    console.log('[toggleWorkerWorkingToday] После включения:', {
      earned_today: updated.earned_today,
      current_balance: updated.current_balance,
      working_mode: updated.working_mode,
      working_mode_status: updated.working_mode_status,
    });

    return updated;
  } else {
    console.log('[toggleWorkerWorkingToday] Выключаем работу — временно недоступно');

    // ✅ Commit 8: restore prod parity for off-shift toggle. Replaces the
    //    hardcoded throw (Hotfix A followup 5acc80f) — that was a temporary
    //    placeholder until stop_worker_shift RPC existed. 1:1 mirror prod
    //    lib/api/workers.ts:224 + features/workers/calculateEarnings.ts:194-211
    //    — same 6-field UPDATE, no work_shifts close (by design: reset_daily
    //    cron handles that next morning).
    console.log('[toggleWorkerWorkingToday] Выключаем работу через stopStaffWorkerShift (Commit 8 dispatcher)');
    return await stopStaffWorkerShift(worker.id);
  }
}

/**
 * Переключает режим работы мойщика (solo/pair)
 * @param worker - мойщик
 * @returns обновленный мойщик
 */
export async function toggleWorkerWorkingMode(worker: Worker): Promise<Worker> {
  const newMode = worker.working_mode === 'solo' ? 'pair' : 'solo';
  return await updateWorker(worker.id, {
    working_mode: newMode,
  });
}
