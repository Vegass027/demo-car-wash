import { supabase } from '../supabase';
import { getSalarySettings } from './salary';
import { getTireBookingById } from './tire-bookings';
import { createEarningTransaction } from './salary-transactions';
import { normalizePhoneNumber } from '../../shared/utils/phone';

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
 * Использует RPC функцию с блокировкой FOR UPDATE для защиты от дублей
 * @param workerId - UUID мастера
 * @param bookingId - UUID заказа
 * @param orderPrice - стоимость заказа
 * @returns Обновленный мастер
 * @throws Error если запрос к базе данных не удался
 */
export async function addTireWorkerEarningsForBooking(
  workerId: string,
  bookingId: string,
  orderPrice: number
): Promise<TireWorker> {
  // Получаем текущие данные мастера
  const worker = await getTireWorkerById(workerId);
  if (!worker) {
    throw new Error(`Мастер с ID ${workerId} не найден`);
  }

  // Получаем настройки зарплаты из БД
  const settings = await getSalarySettings();
  if (!settings) {
    throw new Error('Настройки зарплаты не найдены');
  }

  // Получаем данные заказа для проверки услуг
  const booking = await getTireBookingById(bookingId);
  if (!booking) {
    throw new Error(`Заказ с ID ${bookingId} не найден`);
  }

  // Импортируем конфигурацию для получения списка услуг хранения
  const { TIRE_TECHNICIAN_CONFIG } = await import('@/shared/config/worker');

  // Проверяем, содержит ли заказ услугу хранения резины
  const isStorageService = booking.services.some(s =>
    TIRE_TECHNICIAN_CONFIG.STORAGE_SERVICE_NAMES.includes(s.name as any)
  );

  let earnings: number;

  if (isStorageService) {
    // Если есть хранение - считаем отдельно:
    // 1. 50% от суммы обычных услуг (не услуги хранения)
    // 2. Фиксированная ставка за хранение

    const regularServicesTotal = booking.services
      .filter(s => !TIRE_TECHNICIAN_CONFIG.STORAGE_SERVICE_NAMES.includes(s.name as any))
      .reduce((sum, s) => sum + s.total, 0);

    const regularEarnings = regularServicesTotal * settings.tire_worker_commission;
    const storageEarnings = settings.tire_worker_storage_fee || 300;

    earnings = regularEarnings + storageEarnings;
    console.log(`[TireWorkers] Смешанный заказ (хранение + обычные): ${regularServicesTotal}₽ обычных × ${settings.tire_worker_commission * 100}% = ${regularEarnings}₽ + ${storageEarnings}₽ за хранение = ${earnings}₽`);
  } else {
    // Для обычных услуг - мастер получает 50% от чека
    earnings = orderPrice * settings.tire_worker_commission;
    console.log(`[TireWorkers] Обычная услуга: мастер получает ${earnings}₽ (${settings.tire_worker_commission * 100}% от ${orderPrice}₽)`);
  }

  // ✅ ВЫЗОВ RPC ФУНКЦИИ с блокировкой FOR UPDATE
  const { data, error } = await supabase.rpc('add_tire_worker_earnings', {
    p_worker_id: workerId,
    p_booking_id: bookingId,
    p_earnings: earnings
  });

  if (error) {
    console.error('[TireWorkers] Ошибка при добавлении заработка:', error);
    throw new Error(`Не удалось добавить заработок: ${error.message}`);
  }

  // ✅ Проверка: уже было начислено?
  if (!data.success) {
    console.log(`[TireWorkers] Заказ ${bookingId} уже начислен, пропускаем`);
    return data.worker as TireWorker;
  }

  // ✅ Создаем транзакцию только если реально начислили
  const description = `Шиномонтаж #${bookingId.slice(0, 8)}`;
  await createEarningTransaction(
    'tire_worker',
    workerId,
    worker.full_name,
    earnings,
    data.worker.current_balance,
    description
  );

  return data.worker as TireWorker;
}

/**
 * Начать смену мастера шиномонтажа с защитой от двойного начисления
 * @param workerId - UUID мастера
 * @throws Error если запрос к базе данных не удался
 */
export async function startTireWorkerShift(workerId: string): Promise<void> {
  const today = formatDate(new Date()); // "2026-01-25"

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

  // Получаем настройки зарплаты
  const settings = await getSalarySettings();
  if (!settings) {
    throw new Error('Настройки зарплаты не найдены');
  }

  // 🔒 Вызываем PostgreSQL RPC функцию
  const { data, error } = await supabase.rpc('start_tire_worker_shift', {
    p_worker_id: workerId,
    p_salary: 0,  // У мастеров нет базовой ставки
    p_today: today
  });

  if (error) {
    console.error('[TireWorkers] Ошибка при начале смены:', error);
    throw new Error(`Не удалось начать смену: ${error.message}`);
  }
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
