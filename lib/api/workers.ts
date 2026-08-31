import { supabase } from '../supabase';
import { getSalarySettings } from './salary';
import { createTransferTransaction, createEarningTransaction } from './salary-transactions';
import { normalizePhoneNumber } from '../../shared/utils/phone';
import { startStaffWorkerShift } from './staff-actions';

/**
 * Режим работы мойщика
 */
export type WorkingMode = 'solo' | 'pair';

/**
 * Статус выбора режима работы
 */
export type WorkingModeStatus = 'waiting' | 'locked';

/**
 * Статус мойщика
 */
export type WorkerStatus = 'available' | 'busy' | 'on_break' | 'offline';

/**
 * Интерфейс мойщика
 * Соответствует таблице workers в базе данных
 */
export interface Worker {
  id: string;                    // UUID
  full_name: string;             // Полное имя мойщика
  phone?: string | null;         // Телефон (опционально)
  is_active: boolean;            // Активен ли мойщик
  working_mode: WorkingMode | null; // Режим работы: solo (один), pair (пара) или null
  working_mode_status: WorkingModeStatus; // Статус выбора режима: waiting (ждет выбора), locked (зафиксирован)
  partner_id: string | null;     // ID партнера для работы в паре
  base_rate_amount: number;      // Зафиксированная базовая ставка (500 или 250)
  is_working_today: boolean;      // Работает ли сегодня
  cars_today: number;            // Количество машин за день (может быть 0.5)
  earned_today: number;          // Заработано за текущий день
  current_balance: number;        // Накопленный баланс
  is_advance_taken: boolean;     // Взят ли аванс
  base_rate_taken_today: boolean; // Начислена ли базовая ставка за сегодня
  completed_bookings: string[];   // Массив ID завершенных заказов
  status: WorkerStatus;          // Статус: available, busy, on_break, offline
  current_booking_id?: string | null;  // ID текущего активного заказа
  card_number?: string | null;   // Номер банковской карты для выплат
  payment_phone?: string | null;  // Номер телефона для СБП/переводов
  payment_comment?: string | null; // Комментарий для перевода по телефону
  salary_comment?: string | null;  // Комментарий админа к выплате зарплаты (заметки)
  last_shift_date?: string | null; // Дата последней смены (для idempotency)
  created_at: string;            // TIMESTAMP
  updated_at: string;            // TIMESTAMP
}

/**
 * Получить всех мойщиков
 * @returns Массив мойщиков, отсортированных по имени
 * @throws Error если запрос к базе данных не удался
 */
export async function getWorkers(): Promise<Worker[]> {
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[Workers] Ошибка при получении мойщиков:', error);
    throw new Error(`Не удалось получить мойщиков: ${error.message}`);
  }

  return data as Worker[];
}

/**
 * Получить только активных мойщиков
 * @returns Массив активных мойщиков
 * @throws Error если запрос к базе данных не удался
 */
export async function getActiveWorkers(): Promise<Worker[]> {
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[Workers] Ошибка при получении активных мойщиков:', error);
    throw new Error(`Не удалось получить активных мойщиков: ${error.message}`);
  }

  return data as Worker[];
}

/**
 * Получить мойщиков с транзакциями выплат за дату (для Итогового отчёта)
 * @param date - Дата в формате YYYY-MM-DD
 * @returns Массив мойщиков с транзакциями
 * @throws Error если запрос к базе данных не удался
 */
export async function getWorkersWithTransactionsByDate(date: string): Promise<Array<Worker & { salary_transactions: any[] }>> {
  const startDate = `${date}T00:00:00`;
  const endDate = `${date}T23:59:59`;

  // Загружаем работников отдельно
  const { data: workers, error: workersError } = await supabase
    .from('workers')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (workersError) {
    console.error('[Workers] Ошибка при получении мойщиков:', workersError);
    throw new Error(`Не удалось получить мойщиков: ${workersError.message}`);
  }

  // Загружаем транзакции с фильтрацией по дате
  const { data: transactions, error: transactionsError } = await supabase
    .from('salary_transactions')
    .select('*')
    .eq('worker_type', 'worker')
    .in('transaction_type', ['PAYOUT', 'ADVANCE'])
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true });

  if (transactionsError) {
    console.error('[Workers] Ошибка при получении транзакций:', transactionsError);
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
 * Получить мойщиков, работающих сегодня
 * @returns Массив мойщиков, которые работают сегодня
 * @throws Error если запрос к базе данных не удался
 */
export async function getWorkersWorkingToday(): Promise<Worker[]> {
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('is_active', true)
    .eq('is_working_today', true)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[Workers] Ошибка при получении работающих сегодня мойщиков:', error);
    throw new Error(`Не удалось получить работающих сегодня мойщиков: ${error.message}`);
  }

  return data as Worker[];
}

/**
 * Получить мойщика по ID
 * @param id - UUID мойщика
 * @returns Мойщик или null если не найден
 * @throws Error если запрос к базе данных не удался
 */
export async function getWorkerById(id: string): Promise<Worker | null> {
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Запись не найдена
      return null;
    }
    console.error('[Workers] Ошибка при получении мойщика по ID:', id, error);
    throw new Error(`Не удалось получить мойщика: ${error.message}`);
  }

  return data as Worker;
}

/**
 * Создать нового мойщика
 * @param data - Данные мойщика (без id, created_at, updated_at)
 * @returns Созданный мойщик
 * @throws Error если запрос к базе данных не удался
 */
export async function createWorker(
  data: Omit<Worker, 'id' | 'created_at' | 'updated_at'>
): Promise<Worker> {
  // ✅ Нормализуем телефоны
  const workerData = {
    ...data,
    phone: data.phone ? normalizePhoneNumber(data.phone) : null,
    payment_phone: data.payment_phone ? normalizePhoneNumber(data.payment_phone) : null
  };

  const { data: worker, error } = await supabase
    .from('workers')
    .insert(workerData)
    .select()
    .single();

  if (error) {
    console.error('[Workers] Ошибка при создании мойщика:', error);
    throw new Error(`Не удалось создать мойщика: ${error.message}`);
  }

  return worker as Worker;
}

/**
 * Обновить данные мойщика
 * @param id - UUID мойщика
 * @param updates - Обновляемые поля (без id, created_at, updated_at)
 * @returns Обновленный мойщик
 * @throws Error если запрос к базе данных не удался
 */
export async function updateWorker(
  id: string,
  updates: Partial<Omit<Worker, 'id' | 'created_at' | 'updated_at'>>
): Promise<Worker> {
  // ✅ Нормализуем телефоны если они есть
  const updatesToApply = { ...updates };
  if (updates.phone) {
    updatesToApply.phone = normalizePhoneNumber(updates.phone);
  }
  if (updates.payment_phone) {
    updatesToApply.payment_phone = normalizePhoneNumber(updates.payment_phone);
  }

  const { data, error } = await supabase
    .from('workers')
    .update(updatesToApply)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[Workers] Ошибка при обновлении мойщика:', error);
    throw new Error(`Не удалось обновить мойщика: ${error.message}`);
  }

  return data as Worker;
}

/**
 * Удалить мойщика
 * @param id - UUID мойщика
 * @throws Error если запрос к базе данных не удался
 */
export async function deleteWorker(id: string): Promise<void> {
  const { error } = await supabase
    .from('workers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[Workers] Ошибка при удалении мойщика:', error);
    throw new Error(`Не удалось удалить мойщика: ${error.message}`);
  }
}

/**
 * Деактивировать мойщика (вместо удаления)
 * @param id - UUID мойщика
 * @throws Error если запрос к базе данных не удался
 */
export async function deactivateWorker(id: string): Promise<void> {
  await updateWorker(id, { is_active: false });
}

/**
 * Активировать мойщика
 * @param id - UUID мойщика
 * @throws Error если запрос к базе данных не удался
 */
export async function activateWorker(id: string): Promise<void> {
  await updateWorker(id, { is_active: true });
}

/**
 * Назначить мойщика на заказ
 * @param bookingId - UUID заказа
 * @param workerId - UUID мойщика
 * @param workerName - Имя мойщика (для кэширования)
 * @param workingMode - Режим работы мойщика
 * @throws Error если запрос к базе данных не удался
 */
export async function assignWorkerToBooking(
  bookingId: string,
  workerId: string,
  workerName: string,
  workingMode: 'solo' | 'pair'
): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({
      worker_id: workerId,
      worker_name: workerName,
      working_mode: workingMode,
    })
    .eq('id', bookingId);

  if (error) {
    console.error('[Workers] Ошибка при назначении мойщика на заказ:', error);
    throw new Error(`Не удалось назначить мойщика на заказ: ${error.message}`);
  }
}

/**
 * Убрать мойщика с заказа
 * @param bookingId - UUID заказа
 * @throws Error если запрос к базе данных не удался
 */
export async function unassignWorkerFromBooking(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({
      worker_id: null,
      worker_name: null,
      working_mode: null,
    })
    .eq('id', bookingId);

  if (error) {
    console.error('[Workers] Ошибка при снятии мойщика с заказа:', error);
    throw new Error(`Не удалось снять мойщика с заказа: ${error.message}`);
  }
}

/**
 * Сбросить дневные показатели мойщика (для начала нового дня)
 * Автоматически переносит дневной баланс на итоговый если есть
 * Сбрасывает все поля режима работы
 * @param workerId - UUID мойщика
 * @throws Error если запрос к базе данных не удался
 */
export async function resetWorkerDailyStats(workerId: string): Promise<void> {
  // Получаем текущие данные мойщика
  const worker = await getWorkerById(workerId);
  if (!worker) {
    throw new Error(`Мойщик с ID ${workerId} не найден`);
  }

  // Если дневной баланс равен 0 - ничего не делаем
  if (worker.earned_today === 0) {
    // Просто сбрасываем показатели без переноса
    const { error } = await supabase
      .from('workers')
      .update({
        is_working_today: false,
        working_mode: null,
        working_mode_status: 'waiting',
        partner_id: null,
        // ❌ НЕ сбрасываем base_rate_amount - база зафиксирована на весь день!
        // base_rate_amount: 0,
        cars_today: 0,
        earned_today: 0,
        is_advance_taken: false,
        base_rate_taken_today: false,
        completed_bookings: [],
        status: 'offline',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workerId);

    if (error) {
      console.error('[Workers] Ошибка при сбросе дневных показателей:', error);
      throw new Error(`Не удалось сбросить дневные показатели: ${error.message}`);
    }
    return;
  }

  // Если есть дневной баланс - переносим на итоговый
  const newBalance = worker.current_balance + worker.earned_today;

  // Создаем транзакцию TRANSFER для переноса дневного баланса
  await createTransferTransaction(
    'worker',
    workerId,
    worker.full_name,
    worker.earned_today,
    newBalance,
    'Перенос дневного заработка'
  );

  // Сбрасываем дневные показатели
  const { error } = await supabase
    .from('workers')
    .update({
      is_working_today: false,
      working_mode: null,
      working_mode_status: 'waiting',
      partner_id: null,
      // ❌ НЕ сбрасываем base_rate_amount - база зафиксирована на весь день!
      // base_rate_amount: 0,
      cars_today: 0,
      earned_today: 0,
      is_advance_taken: false,
      base_rate_taken_today: false,
      completed_bookings: [],  // Сбрасываем историю заказов за день
      current_balance: newBalance,
      status: 'offline',
      updated_at: new Date().toISOString(),
    })
    .eq('id', workerId);

  if (error) {
    console.error('[Workers] Ошибка при сбросе дневных показателей:', error);
    throw new Error(`Не удалось сбросить дневные показатели: ${error.message}`);
  }
}

/**
 * Начать рабочий день мойщика с начислением базовой ставки
 * Устанавливает working_mode_status = 'locked' и фиксирует base_rate_amount
 * @param workerId - UUID мойщика
 * @param workingMode - режим работы ('solo' | 'pair')
 * @param partnerId - ID партнера (только для режима pair)
 * @throws Error если запрос к базе данных не удался
 */
export async function startWorkerDay(
  workerId: string,
  workingMode: 'solo' | 'pair',
  partnerId?: string | null
): Promise<void> {
  const worker = await getWorkerById(workerId);
  if (!worker) {
    throw new Error(`Мойщик с ID ${workerId} не найден`);
  }

  // Получаем настройки зарплаты из БД
  const settings = await getSalarySettings();
  if (!settings) {
    throw new Error('Настройки зарплаты не найдены');
  }

  // Рассчитываем базовую ставку (фиксируется на весь день!)
  const baseRateAmount = workingMode === 'solo'
    ? settings.worker_solo_base    // 500₽
    : settings.worker_pair_base;    // 250₽

  // Начисляем базовую ставку
  const { error } = await supabase
    .from('workers')
    .update({
      is_working_today: true,
      working_mode: workingMode,
      working_mode_status: 'locked',  // БАЗА ЗАФИКСИРОВАНА!
      partner_id: partnerId || null,
      base_rate_amount: baseRateAmount,  // НАВСЕГДА!
      cars_today: 0,
      earned_today: baseRateAmount,
      base_rate_taken_today: true,
      is_advance_taken: false,
      status: 'available',
      updated_at: new Date().toISOString(),
    })
    .eq('id', workerId);

  if (error) {
    console.error('[Workers] Ошибка при начале рабочего дня:', error);
    throw new Error(`Не удалось начать рабочий день: ${error.message}`);
  }

  // Базовая ставка НЕ создает транзакцию в истории выплат
  // Она просто добавляется к earned_today
}

/**
 * Начать смену мойщика с защитой от двойного начисления
 * @param workerId - UUID мойщика
 * @throws Error если запрос к базе данных не удался
 */
export async function startWorkerShift(workerId: string): Promise<void> {
  // 🔒 Pre-check через anon SELECT — быстрый early-return если worker
  // уже работает сегодня (избегаем лишний round-trip к RPC).
  const worker = await getWorkerById(workerId);
  if (!worker) {
    throw new Error(`Мойщик с ID ${workerId} не найден`);
  }
  if (worker.is_working_today) {
    console.log('[Workers] Мойщик уже работает сегодня');
    return;
  }

  // ✅ Slice #3d Step 0: dispatcher proxy (server-stamps p_today + p_salary
  //    from salary_settings.worker_solo_base). Old direct .rpc() + direct
  //    .from('workers').update() paths removed — migration 020 REVOKEd
  //    anon/authenticated UPDATE/INSERT/DELETE on workers, leaving only
  //    SELECT for non-dispatcher flows. The legacy fallback
  //    (base_rate_taken_today=true → direct .update() with status='available')
  //    returned 403 permission denied for every repeat-shift click.
  //
  //    The RPC itself (start_worker_shift) has matching idempotency:
  //      IF v_worker.base_rate_taken_today THEN RETURN v_worker (no UPDATE).
  //    Confirmed safe: scenario 3 (base_rate_taken_today=true AND
  //    is_working_today=false) has 0 current instances and 0 historical
  //    occurrences in 30 days of work_shifts (21 rows, all finished,
  //    unique per worker/date). See PROJECT_STATE.md entry 24a for the
  //    data check rationale; B-path RPC change deferred until scenario 3
  //    becomes real production data.
  await startStaffWorkerShift(workerId);
}

/**
 * Назначить пару мойщиков на заказ
 * @param bookingId - UUID заказа
 * @param worker1Id - UUID первого мойщика
 * @param worker2Id - UUID второго мойщика
 * @throws Error если запрос к базе данных не удался
 */
export async function assignWorkerPairToBooking(
  bookingId: string,
  worker1Id: string,
  worker2Id: string
): Promise<void> {
  const [worker1, worker2] = await Promise.all([
    getWorkerById(worker1Id),
    getWorkerById(worker2Id)
  ]);

  if (!worker1 || !worker2) {
    throw new Error('Один или оба мойщика не найдены');
  }

  const { error } = await supabase
    .from('bookings')
    .update({
      worker_id: worker1Id,
      worker_name: worker1.full_name,
      worker_id_2: worker2Id,
      worker_name_2: worker2.full_name,
      working_mode_at_completion: 'pair'
    })
    .eq('id', bookingId);

  if (error) {
    console.error('[Workers] Ошибка при назначении пары мойщиков:', error);
    throw new Error(`Не удалось назначить пару мойщиков: ${error.message}`);
  }
}

/**
 * Первый выбор режима SOLO для мойщика
 * Фиксирует базовую ставку на 500₽
 * @param workerId - UUID мойщика
 * @returns Обновленный мойщик
 * @throws Error если запрос к базе данных не удался
 */
export async function selectWorkerModeSolo(workerId: string): Promise<Worker> {
  console.log('[selectWorkerModeSolo] Начало выполнения для workerId:', workerId);

  const worker = await getWorkerById(workerId);
  if (!worker) {
    throw new Error(`Мойщик с ID ${workerId} не найден`);
  }

  console.log('[selectWorkerModeSolo] Текущее состояние:', {
    earned_today: worker.earned_today,
    current_balance: worker.current_balance,
    working_mode: worker.working_mode,
    working_mode_status: worker.working_mode_status,
    base_rate_taken_today: worker.base_rate_taken_today,
  });

  // Получаем настройки зарплаты
  const settings = await getSalarySettings();
  if (!settings) {
    throw new Error('Настройки зарплаты не найдены');
  }

  const baseRateAmount = settings.worker_solo_base;  // 500₽

  // Если база уже была начислена сегодня - просто фиксируем режим без начисления
  if (worker.base_rate_taken_today) {
    console.log('[selectWorkerModeSolo] База уже была начислена сегодня, просто фиксируем режим');
    const { data, error } = await supabase
      .from('workers')
      .update({
        working_mode: 'solo',
        working_mode_status: 'locked',
        partner_id: null,
        // ❌ НЕ перезаписываем base_rate_amount - база уже зафиксирована на весь день!
        // base_rate_amount: baseRateAmount,
        status: 'available',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workerId)
      .select()
      .single();

    if (error) {
      console.error('[Workers] Ошибка при выборе режима solo:', error);
      throw new Error(`Не удалось выбрать режим solo: ${error.message}`);
    }

    return data as Worker;
  }

  console.log('[selectWorkerModeSolo] Начисляем базовую ставку:', {
    baseRateAmount,
    currentEarnedToday: worker.earned_today,
    newEarnedToday: worker.earned_today + baseRateAmount,
    current_balance_останется_тем_же: worker.current_balance,
  });

  // Обновляем мойщика - добавляем базу к earned_today!
  const newEarnedToday = worker.earned_today + baseRateAmount;
  const { data, error } = await supabase
    .from('workers')
    .update({
      working_mode: 'solo',
      working_mode_status: 'locked',  // БАЗА ЗАФИКСИРОВАНА!
      partner_id: null,
      base_rate_amount: baseRateAmount,  // НАВСЕГДА!
      base_rate_taken_today: true,
      earned_today: newEarnedToday,  // ✅ Добавляем базу к дневному балансу!
      status: 'available',
      updated_at: new Date().toISOString(),
    })
    .eq('id', workerId)
    .select()
    .single();

  if (error) {
    console.error('[Workers] Ошибка при выборе режима solo:', error);
    throw new Error(`Не удалось выбрать режим solo: ${error.message}`);
  }

  console.log('[selectWorkerModeSolo] Обновленное состояние:', {
    earned_today: data.earned_today,
    current_balance: data.current_balance,
    working_mode: data.working_mode,
    working_mode_status: data.working_mode_status,
  });

  return data as Worker;
}

/**
 * Первый выбор режима PAIR для обоих мойщиков
 * Фиксирует базовую ставку на 250₽ для обоих
 * @param workerId1 - UUID первого мойщика
 * @param workerId2 - UUID второго мойщика
 * @returns Массив обновленных мойщиков
 * @throws Error если запрос к базе данных не удался
 */
export async function selectWorkerPairMode(
  workerId1: string,
  workerId2: string
): Promise<Worker[]> {
  console.log('[selectWorkerPairMode] Начало выполнения для workerId1:', workerId1, 'workerId2:', workerId2);

  const [worker1, worker2] = await Promise.all([
    getWorkerById(workerId1),
    getWorkerById(workerId2)
  ]);

  if (!worker1 || !worker2) {
    throw new Error('Один или оба мойщика не найдены');
  }

  console.log('[selectWorkerPairMode] Текущее состояние worker1:', {
    earned_today: worker1.earned_today,
    current_balance: worker1.current_balance,
    working_mode: worker1.working_mode,
    working_mode_status: worker1.working_mode_status,
    base_rate_taken_today: worker1.base_rate_taken_today,
  });

  console.log('[selectWorkerPairMode] Текущее состояние worker2:', {
    earned_today: worker2.earned_today,
    current_balance: worker2.current_balance,
    working_mode: worker2.working_mode,
    working_mode_status: worker2.working_mode_status,
    base_rate_taken_today: worker2.base_rate_taken_today,
  });

  // Получаем настройки зарплаты
  const settings = await getSalarySettings();
  if (!settings) {
    throw new Error('Настройки зарплаты не найдены');
  }

  const baseRateAmount = settings.worker_pair_base;  // 250₽

  // Проверяем, была ли уже начислена база каждому из мойщиков
  const worker1BaseAlreadyTaken = worker1.base_rate_taken_today;
  const worker2BaseAlreadyTaken = worker2.base_rate_taken_today;

  if (worker1BaseAlreadyTaken && worker2BaseAlreadyTaken) {
    // Оба уже получили базу - просто фиксируем режим без начисления
    console.log('[selectWorkerPairMode] Оба мойщика уже получили базу, просто фиксируем режим');
    const [data1, data2] = await Promise.all([
      supabase
        .from('workers')
        .update({
          working_mode: 'pair',
          working_mode_status: 'locked',
          partner_id: workerId2,
          // ❌ НЕ перезаписываем base_rate_amount - база уже зафиксирована на весь день!
          // base_rate_amount: baseRateAmount,
          status: 'available',
          updated_at: new Date().toISOString(),
        })
        .eq('id', workerId1)
        .select()
        .single(),
      supabase
        .from('workers')
        .update({
          working_mode: 'pair',
          working_mode_status: 'locked',
          partner_id: workerId1,
          // ❌ НЕ перезаписываем base_rate_amount - база уже зафиксирована на весь день!
          // base_rate_amount: baseRateAmount,
          status: 'available',
          updated_at: new Date().toISOString(),
        })
        .eq('id', workerId2)
        .select()
        .single(),
    ]);

    if (data1.error) {
      console.error('[Workers] Ошибка при выборе режима pair для первого мойщика:', data1.error);
      throw new Error(`Не удалось выбрать режим pair: ${data1.error.message}`);
    }

    if (data2.error) {
      console.error('[Workers] Ошибка при выборе режима pair для второго мойщика:', data2.error);
      throw new Error(`Не удалось выбрать режим pair: ${data2.error.message}`);
    }

    return [data1.data as Worker, data2.data as Worker];
  }

  console.log('[selectWorkerPairMode] Начисляем базовую ставку:', {
    baseRateAmount,
    worker1_currentEarnedToday: worker1.earned_today,
    worker1_newEarnedToday: worker1.earned_today + baseRateAmount,
    worker2_currentEarnedToday: worker2.earned_today,
    worker2_newEarnedToday: worker2.earned_today + baseRateAmount,
    current_balance_останется_тем_же_для_обоих: `${worker1.current_balance} и ${worker2.current_balance}`,
  });

  // Обновляем обоих мойщиков - добавляем базу к earned_today!
  const newEarnedToday1 = worker1.earned_today + baseRateAmount;
  const newEarnedToday2 = worker2.earned_today + baseRateAmount;
  const [data1, data2] = await Promise.all([
    supabase
      .from('workers')
      .update({
        working_mode: 'pair',
        working_mode_status: 'locked',  // БАЗА ЗАФИКСИРОВАНА!
        partner_id: workerId2,
        base_rate_amount: baseRateAmount,  // НАВСЕГДА!
        base_rate_taken_today: true,
        earned_today: newEarnedToday1,  // ✅ Добавляем базу к дневному балансу!
        status: 'available',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workerId1)
      .select()
      .single(),
    supabase
      .from('workers')
      .update({
        working_mode: 'pair',
        working_mode_status: 'locked',  // БАЗА ЗАФИКСИРОВАНА!
        partner_id: workerId1,
        base_rate_amount: baseRateAmount,  // НАВСЕГДА!
        base_rate_taken_today: true,
        earned_today: newEarnedToday2,  // ✅ Добавляем базу к дневному балансу!
        status: 'available',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workerId2)
      .select()
      .single(),
  ]);

  if (data1.error) {
    console.error('[Workers] Ошибка при выборе режима pair для первого мойщика:', data1.error);
    throw new Error(`Не удалось выбрать режим pair: ${data1.error.message}`);
  }

  if (data2.error) {
    console.error('[Workers] Ошибка при выборе режима pair для второго мойщика:', data2.error);
    throw new Error(`Не удалось выбрать режим pair: ${data2.error.message}`);
  }

  console.log('[selectWorkerPairMode] Обновленное состояние worker1:', {
    earned_today: data1.data.earned_today,
    current_balance: data1.data.current_balance,
    working_mode: data1.data.working_mode,
    working_mode_status: data1.data.working_mode_status,
  });

  console.log('[selectWorkerPairMode] Обновленное состояние worker2:', {
    earned_today: data2.data.earned_today,
    current_balance: data2.data.current_balance,
    working_mode: data2.data.working_mode,
    working_mode_status: data2.data.working_mode_status,
  });

  return [data1.data as Worker, data2.data as Worker];
}

/**
 * Переключение режима в течение дня (только working_mode, БЕЗ изменения базы!)
 * @param workerId - UUID мойщика
 * @param newMode - новый режим ('solo' | 'pair')
 * @param newPartnerId - ID нового партнера (только для pair)
 * @returns Обновленный мойщик
 * @throws Error если запрос к базе данных не удался
 */
export async function changeWorkerMode(
  workerId: string,
  newMode: 'solo' | 'pair',
  newPartnerId?: string | null
): Promise<Worker> {
  const worker = await getWorkerById(workerId);
  if (!worker) {
    throw new Error(`Мойщик с ID ${workerId} не найден`);
  }

  // Проверяем что база уже зафиксирована
  if (worker.working_mode_status !== 'locked') {
    throw new Error('База не зафиксирована. Сначала выберите режим работы.');
  }

  // ✅ Если переключаемся на solo - проверяем нужно ли очистить current_booking_id
  let shouldClearBookingId = false;
  let shouldMakeAvailable = false;

  if (newMode === 'solo' && worker.current_booking_id) {
    // Получаем текущий заказ работника
    const { data: booking } = await supabase
      .from('bookings')
      .select('start_time, booking_date, status')
      .eq('id', worker.current_booking_id)
      .single();

    if (booking) {
      // Проверяем время заказа
      const bookingHour = parseInt(booking.start_time?.split(':')[0] || '0');
      const currentHour = new Date().getHours();
      
      // Если время заказа прошло или заказ завершен - очищаем current_booking_id
      const isBookingTimePassed = bookingHour < currentHour;
      const isBookingCompleted = booking.status === 'ГОТОВО' || 
                                 booking.status === 'ОТМЕНЕНО';
      
      if (isBookingTimePassed || isBookingCompleted) {
        shouldClearBookingId = true;
        shouldMakeAvailable = true;
      }
    }
  } else if (newMode === 'solo' && !worker.current_booking_id) {
    // Если переключаемся на solo и нет активного заказа - делаем доступным
    shouldMakeAvailable = true;
  }

  // Формируем обновления
  const updates: any = {
    working_mode: newMode,
    partner_id: newMode === 'pair' ? (newPartnerId || null) : null,
    updated_at: new Date().toISOString(),
  };

  if (shouldClearBookingId) {
    updates.current_booking_id = null;
  }

  if (shouldMakeAvailable) {
    updates.status = 'available';
  }

  // Обновляем режим, партнера и статус (если нужно), БАЗУ НЕ ТРОГАЕМ!
  const { data, error } = await supabase
    .from('workers')
    .update(updates)
    .eq('id', workerId)
    .select()
    .single();

  if (error) {
    console.error('[Workers] Ошибка при переключении режима:', error);
    throw new Error(`Не удалось переключить режим: ${error.message}`);
  }

  return data as Worker;
}
