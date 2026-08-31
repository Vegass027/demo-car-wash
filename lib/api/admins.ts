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
