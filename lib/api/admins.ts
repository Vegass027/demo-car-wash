import { supabase } from '../supabase';
import { getSalarySettings } from './salary';
import { createEarningTransaction, createTransferTransaction } from './salary-transactions';
import type { Admin } from '../types/admin';
import { normalizePhoneNumber } from '../../shared/utils/phone';

/**
 * Получить всех админов
 * @returns Массив админов, отсортированных по имени
 * @throws Error если запрос к базе данных не удался
 */
export async function getAdmins(): Promise<Admin[]> {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[Admins] Ошибка при получении админов:', error);
    throw new Error(`Не удалось получить админов: ${error.message}`);
  }

  return data as Admin[];
}

/**
 * Получить только активных админов
 * @returns Массив активных админов
 * @throws Error если запрос к базе данных не удался
 */
export async function getActiveAdmins(): Promise<Admin[]> {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('[Admins] Ошибка при получении активных админов:', error);
    throw new Error(`Не удалось получить активных админов: ${error.message}`);
  }

  return data as Admin[];
}

/**
 * Получить админа по ID
 * @param id - UUID админа
 * @returns Админ или null если не найден
 * @throws Error если запрос к базе данных не удался
 */
export async function getAdminById(id: string): Promise<Admin | null> {
  const { data, error } = await supabase
    .from('admins')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Запись не найдена
      return null;
    }
    console.error('[Admins] Ошибка при получении админа по ID:', id, error);
    throw new Error(`Не удалось получить админа: ${error.message}`);
  }

  return data as Admin;
}

/**
 * Создать нового админа
 * @param data - Данные админа (без id, created_at, updated_at)
 * @returns Созданный админ
 * @throws Error если запрос к базе данных не удался
 */
export async function createAdmin(
  data: Omit<Admin, 'id' | 'created_at' | 'updated_at' | 'profile_id'>
): Promise<Admin> {
  // ✅ Нормализуем телефоны
  const normalizedPhone = data.phone ? normalizePhoneNumber(data.phone) : null;
  
  // 1. Генерируем UUID для профиля на клиенте
  const profileId = crypto.randomUUID();
  
  // 2. Создаем профиль в таблице profiles с явным указанием id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: profileId,
      role: 'admin',
      full_name: data.full_name,
      phone: normalizedPhone,
    })
    .select()
    .single();

  if (profileError) {
    console.error('[Admins] Ошибка при создании профиля:', profileError);
    throw new Error(`Не удалось создать профиль админа: ${profileError.message}`);
  }

  // 3. Создаем админа с profile_id
  const adminData = {
    ...data,
    phone: normalizedPhone,
    payment_phone: data.payment_phone ? normalizePhoneNumber(data.payment_phone) : null,
    profile_id: profileId,
  };

  const { data: admin, error } = await supabase
    .from('admins')
    .insert(adminData)
    .select()
    .single();

  if (error) {
    console.error('[Admins] Ошибка при создании админа:', error);
    throw new Error(`Не удалось создать админа: ${error.message}`);
  }

  return admin as Admin;
}

/**
 * Обновить данные админа
 * @param id - UUID админа
 * @param updates - Обновляемые поля (без id, profile_id, created_at, updated_at)
 * @returns Обновленный админ
 * @throws Error если запрос к базе данных не удался
 */
export async function updateAdmin(
  id: string,
  updates: Partial<Omit<Admin, 'id' | 'profile_id' | 'created_at' | 'updated_at'>>
): Promise<Admin> {
  // ✅ Нормализуем телефоны если они есть
  const updatesToApply = { ...updates };
  if (updates.phone) {
    updatesToApply.phone = normalizePhoneNumber(updates.phone);
  }
  if (updates.payment_phone) {
    updatesToApply.payment_phone = normalizePhoneNumber(updates.payment_phone);
  }

  const { data, error } = await supabase
    .from('admins')
    .update(updatesToApply)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[Admins] Ошибка при обновлении админа:', error);
    throw new Error(`Не удалось обновить админа: ${error.message}`);
  }

  return data as Admin;
}

/**
 * Удалить админа
 * @param id - UUID админа
 * @throws Error если запрос к базе данных не удался
 */
export async function deleteAdmin(id: string): Promise<void> {
  // 1. Сначала получаем profile_id админа
  const { data: admin, error: fetchError } = await supabase
    .from('admins')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (fetchError) {
    console.error('[Admins] Ошибка при получении админа:', fetchError);
    throw new Error(`Не удалось получить админа: ${fetchError.message}`);
  }

  if (!admin || !admin.profile_id) {
    console.error('[Admins] Админ не найден или не имеет profile_id');
    throw new Error('Админ не найден или не имеет связанного профиля');
  }

  const profileId = admin.profile_id;

  // 2. Удаляем профиль из таблицы profiles
  const { error: profileDeleteError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', profileId);

  if (profileDeleteError) {
    console.error('[Admins] Ошибка при удалении профиля:', profileDeleteError);
    throw new Error(`Не удалось удалить профиль админа: ${profileDeleteError.message}`);
  }

  // 3. Удаляем админа из таблицы admins
  const { error } = await supabase
    .from('admins')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[Admins] Ошибка при удалении админа:', error);
    throw new Error(`Не удалось удалить админа: ${error.message}`);
  }
}

/**
 * Деактивировать админа (вместо удаления)
 * @param id - UUID админа
 * @throws Error если запрос к базе данных не удался
 */
export async function deactivateAdmin(id: string): Promise<void> {
  await updateAdmin(id, { is_active: false });
}

/**
 * Активировать админа
 * @param id - UUID админа
 * @throws Error если запрос к базе данных не удался
 */
export async function activateAdmin(id: string): Promise<void> {
  await updateAdmin(id, { is_active: true });
}

/**
 * Начать смену админа с защитой от двойного начисления
 * @param adminId - UUID админа
 * @throws Error если запрос к базе данных не удался
 */
export async function startAdminShift(adminId: string): Promise<void> {
  const today = formatDate(new Date()); // "2026-01-25"

  // 🔒 УРОВЕНЬ 2: Проверяем last_shift_date перед RPC вызовом
  const admin = await getAdminById(adminId);
  if (!admin) {
    throw new Error(`Админ с ID ${adminId} не найден`);
  }

  // ✅ УЖЕ начислено сегодня?
  if (admin.last_shift_date === today) {
    console.log('[Admins] Смена уже начата сегодня');
    return;
  }

  // Получаем настройки зарплаты
  const settings = await getSalarySettings();
  if (!settings) {
    throw new Error('Настройки зарплаты не найдены');
  }

  // 🔒 УРОВЕНЬ 1: Вызываем PostgreSQL RPC функцию
  const { data, error } = await supabase.rpc('start_admin_shift', {
    p_admin_id: adminId,
    p_salary: settings.admin_fixed_salary,
    p_today: today
  });

  if (error) {
    console.error('[Admins] Ошибка при начале смены:', error);
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

/**
 * Завершить смену админа
 * @param adminId - UUID админа
 * @throws Error если запрос к базе данных не удался
 */
export async function finishAdminShift(adminId: string): Promise<void> {
  const admin = await getAdminById(adminId);
  if (!admin) {
    throw new Error(`Админ с ID ${adminId} не найден`);
  }

  // Получаем активную смену
  const { data: shift } = await supabase
    .from('work_shifts')
    .select('*')
    .eq('worker_type', 'admin')
    .eq('worker_id', adminId)
    .eq('status', 'working')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  // Закрываем смену если она существует
  if (shift) {
    await supabase
      .from('work_shifts')
      .update({
        finished_at: new Date().toISOString(),
        status: 'finished',
        earnings: admin.earned_today
      })
      .eq('id', shift.id);
  }

  // Сбрасываем дневные показатели (транзакция уже создана при начале смены)
  const { error } = await supabase
    .from('admins')
    .update({
      is_working_today: false,
      base_rate_taken_today: false,
      earned_today: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', adminId);

  if (error) {
    console.error('[Admins] Ошибка при завершении смены:', error);
    throw new Error(`Не удалось завершить смену: ${error.message}`);
  }
}

/**
 * Получить историю смен админа
 * @param adminId - UUID админа
 * @returns Массив смен с датой и суммой начисления
 * @throws Error если запрос к базе данных не удался
 */
export async function getAdminShiftHistory(adminId: string): Promise<Array<{
  id: string;
  work_date: string;
  started_at: string;
  finished_at: string | null;
  earnings: number;
  status: string;
}>> {
  const { data, error } = await supabase
    .from('work_shifts')
    .select('*')
    .eq('worker_type', 'admin')
    .eq('worker_id', adminId)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('[Admins] Ошибка при получении истории смен:', error);
    throw new Error(`Не удалось получить историю смен: ${error.message}`);
  }

  return data || [];
}

/**
 * Выплатить зарплату админу
 * @param adminId - UUID админа
 * @param amount - Сумма выплаты
 * @returns Обновленный админ
 * @throws Error если запрос к базе данных не удался
 */
export async function payoutAdminSalary(adminId: string, amount: number): Promise<Admin> {
  const admin = await getAdminById(adminId);
  if (!admin) {
    throw new Error(`Админ с ID ${adminId} не найден`);
  }

  if (amount > admin.current_balance) {
    throw new Error('Недостаточно средств на балансе');
  }

  const newBalance = admin.current_balance - amount;

  // Создаем транзакцию выплаты
  const { createPayoutTransaction } = await import('./salary-transactions');
  await createPayoutTransaction(
    'admin',
    adminId,
    admin.full_name,
    amount,
    newBalance,
    'Выплата зарплаты'
  );

  // Обновляем баланс админа
  const { data, error } = await supabase
    .from('admins')
    .update({
      current_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', adminId)
    .select()
    .single();

  if (error) {
    console.error('[Admins] Ошибка при выплате зарплаты:', error);
    throw new Error(`Не удалось выплатить зарплату: ${error.message}`);
  }

  return data as Admin;
}

/**
 * Выдать аванс админу
 * @param adminId - UUID админа
 * @param amount - Сумма аванса
 * @returns Обновленный админ
 * @throws Error если запрос к базе данных не удался
 */
export async function giveAdminAdvance(adminId: string, amount: number): Promise<Admin> {
  const admin = await getAdminById(adminId);
  if (!admin) {
    throw new Error(`Админ с ID ${adminId} не найден`);
  }

  if (admin.is_advance_taken) {
    throw new Error('Аванс уже выдан сегодня');
  }

  if (amount > admin.current_balance) {
    throw new Error('Недостаточно средств на балансе');
  }

  const newBalance = admin.current_balance - amount;

  // Создаем транзакцию аванса
  const { createAdvanceTransaction } = await import('./salary-transactions');
  await createAdvanceTransaction(
    'admin',
    adminId,
    admin.full_name,
    amount,
    newBalance,
    'Выдача аванса'
  );

  // Обновляем баланс админа
  const { data, error } = await supabase
    .from('admins')
    .update({
      current_balance: newBalance,
      is_advance_taken: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', adminId)
    .select()
    .single();

  if (error) {
    console.error('[Admins] Ошибка при выдаче аванса:', error);
    throw new Error(`Не удалось выдать аванс: ${error.message}`);
  }

  return data as Admin;
}

/**
 * Перенести дневной заработок админа на итоговый баланс
 * @param adminId - UUID админа
 * @returns Обновленный админ
 * @throws Error если запрос к базе данных не удался
 */
export async function transferAdminEarningsToBalance(adminId: string): Promise<Admin> {
  const admin = await getAdminById(adminId);
  if (!admin) {
    throw new Error(`Админ с ID ${adminId} не найден`);
  }

  if (admin.earned_today <= 0) {
    throw new Error('Нет заработка для переноса');
  }

  const newBalance = admin.current_balance + admin.earned_today;

  // Создаем транзакцию перевода (не начисления!)
  await createTransferTransaction(
    'admin',
    adminId,
    admin.full_name,
    admin.earned_today,
    newBalance,
    'Перенос дневного заработка на баланс'
  );

  // Обновляем баланс админа и сбрасываем дневной заработок
  const { data, error } = await supabase
    .from('admins')
    .update({
      current_balance: newBalance,
      earned_today: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', adminId)
    .select()
    .single();

  if (error) {
    console.error('[Admins] Ошибка при переносе заработка:', error);
    throw new Error(`Не удалось перенести заработок: ${error.message}`);
  }

  return data as Admin;
}

/**
 * Получить админов с транзакциями выплат за дату (для Итогового отчёта)
 * @param date - Дата в формате YYYY-MM-DD
 * @returns Массив админов с транзакциями
 * @throws Error если запрос к базе данных не удался
 */
export async function getAdminsWithTransactionsByDate(date: string): Promise<Array<Admin & { salary_transactions: any[] }>> {
  const startDate = `${date}T00:00:00`;
  const endDate = `${date}T23:59:59`;

  // Загружаем админов отдельно
  const { data: admins, error: adminsError } = await supabase
    .from('admins')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (adminsError) {
    console.error('[Admins] Ошибка при получении админов:', adminsError);
    throw new Error(`Не удалось получить админов: ${adminsError.message}`);
  }

  // Загружаем транзакции с фильтрацией по дате
  const { data: transactions, error: transactionsError } = await supabase
    .from('salary_transactions')
    .select('*')
    .eq('worker_type', 'admin')
    .in('transaction_type', ['PAYOUT', 'ADVANCE'])
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true });

  if (transactionsError) {
    console.error('[Admins] Ошибка при получении транзакций:', transactionsError);
    throw new Error(`Не удалось получить транзакции: ${transactionsError.message}`);
  }

  // Объединяем данные в JavaScript
  const adminsWithTransactions = (admins || []).map((admin: any) => {
    const adminTransactions = (transactions || [])
      .filter((t: any) => t.worker_id === admin.id);
    return {
      ...admin,
      salary_transactions: adminTransactions,
    };
  });

  return adminsWithTransactions;
}
