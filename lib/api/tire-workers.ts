import { supabase } from '../supabase';
import { getSalarySettings } from './salary';
import { getTireBookingById } from './tire-bookings';
import { createEarningTransaction } from './salary-transactions';
import { normalizePhoneNumber } from '../../shared/utils/phone';
import {
  startStaffTireWorkerShift,
  addStaffTireWorkerEarnings,
} from './staff-actions';

/**
 * Статус мастера шиномонтажа
 */
export type TireWorkerStatus = 'available' | 'busy' | 'on_break' | 'offline';

/**
 * Интерфейс мастера шиномонтажа
 * Соответствует таблице tire_workers в базе данных
 */
export interface TireWorker {
  id: string;                    // UUID
  full_name: string;             // Полное имя мастера
  phone?: string;                // Телефон (опционально)
  is_active: boolean;             // Активен ли мастер
  is_working_today: boolean;      // Работает ли сегодня
  earned_today: number;           // Заработано за текущий день
  current_balance: number;        // Накопленный баланс
  is_advance_taken: boolean;      // Взят ли аванс
  completed_bookings: string[];   // Массив ID завершенных заказов
  status: TireWorkerStatus;      // Статус: available, busy, on_break, offline
  current_booking_id?: string | null;  // ID текущего активного заказа
  card_number?: string;           // Номер банковской карты для выплат
  payment_phone?: string;         // Номер телефона для СБП/переводов
  payment_comment?: string | null; // Комментарий для перевода по телефону
  salary_comment?: string | null;  // Комментарий админа к выплате зарплаты (заметки)
  cars_today: number;            // Количество заказов за текущий день
  last_shift_date?: string | null; // Дата последней смены (для idempotency)
  created_at: string;             // TIMESTAMP
  updated_at: string;             // TIMESTAMP
}

/**
 * Получить всех мастеров
 */
export async function getTireWorkers(): Promise<TireWorker[]> {
  const { data, error } = await supabase
    .from('tire_workers')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[TireWorkers] Ошибка при получении мастеров:', error);
    throw new Error(`Не удалось получить мастеров: ${error.message}`);
  }

  return data as TireWorker[];
}

/**
 * Получить только активных мастеров
 */
export async function getActiveTireWorkers(): Promise<TireWorker[]> {
  const { data, error } = await supabase
    .from('tire_workers')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[TireWorkers] Ошибка при получении активных мастеров:', error);
    throw new Error(`Не удалось получить активных мастеров: ${error.message}`);
  }

  return data as TireWorker[];
}

/**
 * Получить мастеров с транзакциями выплат за дату (для Итогового отчёта)
 * @param date - Дата в формате YYYY-MM-DD
 * @returns Массив мастеров с транзакциями
 * @throws Error если запрос к базе данных не удался
 */
export async function getTireWorkersWithTransactionsByDate(date: string): Promise<Array<TireWorker & { salary_transactions: any[] }>> {
  const startDate = `${date}T00:00:00`;
  const endDate = `${date}T23:59:59`;

  // Загружаем мастеров отдельно
  const { data: workers, error: workersError } = await supabase
    .from('tire_workers')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (workersError) {
    console.error('[TireWorkers] Ошибка при получении мастеров:', workersError);
    throw new Error(`Не удалось получить мастеров: ${workersError.message}`);
  }

  // Загружаем транзакции с фильтрацией по дате
  const { data: transactions, error: transactionsError } = await supabase
    .from('salary_transactions')
    .select('*')
    .eq('worker_type', 'tire_worker')
    .in('transaction_type', ['PAYOUT', 'ADVANCE'])
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true });

  if (transactionsError) {
    console.error('[TireWorkers] Ошибка при получении транзакций:', transactionsError);
    throw new Error(`Не удалось получить транзакции: ${transactionsError.message}`);
  }

  // Объединяем данные в JavaScript
  const workersWithTransactions = (workers || []).map((worker: any) => {
    const workerTransactions = (transactions || [])
      .filter((t: any) => t.worker_id === worker.id);
    return {
      ...worker,
      salary_transactions: workerTransactions,
    };
  });

  return workersWithTransactions;
}

/**
 * Получить мастеров, работающих сегодня
 */
export async function getTireWorkersWorkingToday(): Promise<TireWorker[]> {
  const { data, error } = await supabase
    .from('tire_workers')
    .select('*')
    .eq('is_active', true)
    .eq('is_working_today', true)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[TireWorkers] Ошибка при получении работающих сегодня мастеров:', error);
    throw new Error(`Не удалось получить работающих сегодня мастеров: ${error.message}`);
  }

  return data as TireWorker[];
}

/**
 * Получить мастера по ID
 */
export async function getTireWorkerById(id: string): Promise<TireWorker | null> {
  const { data, error } = await supabase
    .from('tire_workers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[TireWorkers] Ошибка при получении мастера по ID:', id, error);
    throw new Error(`Не удалось получить мастера: ${error.message}`);
  }

  return data as TireWorker;
}

/**
 * Создать нового мастера
 */
export async function createTireWorker(
  data: Omit<TireWorker, 'id' | 'created_at' | 'updated_at'>
): Promise<TireWorker> {
  // ✅ Нормализуем телефоны
  const workerData = {
    ...data,
    phone: data.phone ? normalizePhoneNumber(data.phone) : null,
    payment_phone: data.payment_phone ? normalizePhoneNumber(data.payment_phone) : null
  };

  const { data: worker, error } = await supabase
    .from('tire_workers')
    .insert(workerData)
    .select()
    .single();

  if (error) {
    console.error('[TireWorkers] Ошибка при создании мастера:', error);
    throw new Error(`Не удалось создать мастера: ${error.message}`);
  }

  return worker as TireWorker;
}

/**
 * Обновить данные мастера
 */
export async function updateTireWorker(
  id: string,
  updates: Partial<Omit<TireWorker, 'id' | 'created_at' | 'updated_at'>>
): Promise<TireWorker> {
  // ✅ Нормализуем телефоны если они есть
  const updatesToApply = { ...updates };
  if (updates.phone) {
    updatesToApply.phone = normalizePhoneNumber(updates.phone);
  }
  if (updates.payment_phone) {
    updatesToApply.payment_phone = normalizePhoneNumber(updates.payment_phone);
  }

  const { data, error } = await supabase
    .from('tire_workers')
    .update(updatesToApply)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[TireWorkers] Ошибка при обновлении мастера:', error);
    throw new Error(`Не удалось обновить мастера: ${error.message}`);
  }

  return data as TireWorker;
}

/**
 * Удалить мастера
 */
export async function deleteTireWorker(id: string): Promise<void> {
  const { error } = await supabase
    .from('tire_workers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[TireWorkers] Ошибка при удалении мастера:', error);
    throw new Error(`Не удалось удалить мастера: ${error.message}`);
  }
}

/**
 * Деактивировать мастера
 */
export async function deactivateTireWorker(id: string): Promise<void> {
  await updateTireWorker(id, { is_active: false });
}

/**
 * Активировать мастера
 */
export async function activateTireWorker(id: string): Promise<void> {
  await updateTireWorker(id, { is_active: true });
}

/**
 * Назначить мастера на заказ
 */
export async function assignTireWorkerToBooking(
  bookingId: string,
  workerId: string,
  workerName: string
): Promise<void> {
  const { error } = await supabase
    .from('tire_bookings')
    .update({
      worker_id: workerId,
      worker_name: workerName,
    })
    .eq('id', bookingId);

  if (error) {
    console.error('[TireWorkers] Ошибка при назначении мастера на заказ:', error);
    throw new Error(`Не удалось назначить мастера на заказ: ${error.message}`);
  }
}

/**
 * Убрать мастера с заказа
 */
export async function unassignTireWorkerFromBooking(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('tire_bookings')
    .update({
      worker_id: null,
      worker_name: null,
    })
    .eq('id', bookingId);

  if (error) {
    console.error('[TireWorkers] Ошибка при снятии мастера с заказа:', error);
    throw new Error(`Не удалось снять мастера с заказа: ${error.message}`);
  }
}

/**
 * Добавить заработок мастеру за завершенный заказ (idempotent)
 *
 * Slice #3d Step 0: dispatcher proxy — body accepts ONLY {booking_id}.
 * Worker_id, order_price, services and final earnings are server-computed
 * from tire_bookings + salary_settings + tire_workers. Browser can no
 * longer spoof financial values.
 *
 * @param bookingId - UUID заказа шиномонтажа
 * @returns AddTireWorkerEarningsResult { success, idempotent, ... }
 * @throws Error if RPC fails or booking is invalid
 */
export async function addTireWorkerEarningsForBooking(
  bookingId: string
): Promise<TireWorker | null> {
  const result = await addStaffTireWorkerEarnings(bookingId);
  if (result.idempotent) {
    console.log(`[TireWorkers] Заказ ${bookingId} уже начислен, пропускаем`);
    return null;
  }
  // Return the updated worker row fetched post-earning (caller can refetch
  // via getTireWorkerById if needed).
  return null;
}

/**
 * Начать смену мастера шиномонтажа с защитой от двойного начисления
 * @param workerId - UUID мастера
 * @throws Error если запрос к базе данных не удался
 */
export async function startTireWorkerShift(workerId: string): Promise<void> {
  // 🔒 Проверяем is_working_today перед RPC вызовом
  const worker = await getTireWorkerById(workerId);
  if (!worker) {
    throw new Error(`Мастер с ID ${workerId} не найден`);
  }

  // ✅ Если уже работает сегодня - не позволяем
  if (worker.is_working_today) {
    console.log('[TireWorkers] Мастер уже работает сегодня');
    return;
  }

  // Slice #3d Step 0: dispatcher proxy (server-stamps p_today + p_salary=0).
  // Old direct .rpc('start_tire_worker_shift', ...) path removed — migration 021
  // will REVOKE EXECUTE on the underlying RPC.
  await startStaffTireWorkerShift(workerId);
}

/**
 * Форматировать дату в формат YYYY-MM-DD
 * @param date - Дата
 * @returns Строка в формате YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
