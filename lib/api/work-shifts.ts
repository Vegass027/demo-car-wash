import { supabase } from '../supabase';
import type { WorkShift } from '../types/work-shift';

/**
 * Получить все смены работника
 * @param workerType - Тип работника ('worker' | 'tire_worker' | 'admin')
 * @param workerId - UUID работника
 * @returns Массив смен, отсортированных по дате начала (убывание)
 * @throws Error если запрос к базе данных не удался
 */
export async function getWorkShiftsByWorker(
  workerType: 'worker' | 'tire_worker' | 'admin',
  workerId: string
): Promise<WorkShift[]> {
  const { data, error } = await supabase
    .from('work_shifts')
    .select('*')
    .eq('worker_type', workerType)
    .eq('worker_id', workerId)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('[WorkShifts] Ошибка при получении смен:', error);
    throw new Error(`Не удалось получить смены: ${error.message}`);
  }

  return data as WorkShift[];
}

/**
 * Получить смены админов за конкретную дату
 * @param date - Дата в формате YYYY-MM-DD
 * @returns Массив смен админов за указанную дату
 * @throws Error если запрос к базе данных не удался
 */
export async function getAdminShiftsByDate(date: string): Promise<WorkShift[]> {
  const { data, error } = await supabase
    .from('work_shifts')
    .select('*')
    .eq('worker_type', 'admin')
    .eq('work_date', date)
    .order('started_at', { ascending: false });

  if (error) {
    console.error('[WorkShifts] Ошибка при получении смен админов:', error);
    throw new Error(`Не удалось получить смены админов: ${error.message}`);
  }

  return data as WorkShift[];
}
