import { supabase } from '../supabase';
import type { SalarySettings } from '../types/salary';

/**
 * Получить настройки зарплаты (первая запись из таблицы)
 */
export async function getSalarySettings(): Promise<SalarySettings | null> {
  const { data, error } = await supabase
    .from('salary_settings')
    .select('*')
    .single();

  if (error) {
    console.error('[getSalarySettings] Error:', error);
    return null;
  }

  return data;
}

/**
 * Обновить настройки зарплаты
 */
export async function updateSalarySettings(
  updates: Partial<SalarySettings>
): Promise<SalarySettings | null> {
  const settings = await getSalarySettings();
  
  if (!settings) {
    console.error('[updateSalarySettings] No settings found');
    return null;
  }

  const { data, error } = await supabase
    .from('salary_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', settings.id)
    .select()
    .single();

  if (error) {
    console.error('[updateSalarySettings] Error:', error);
    return null;
  }

  return data;
}

/**
 * Рассчитать зарплату мойщика для одного заказа
 * @param workingMode - режим работы: 'solo' или 'pair'
 * @param bookingPrice - цена заказа
 * @returns заработок за заказ
 */
export async function calculateWorkerEarnings(
  workingMode: 'solo' | 'pair',
  bookingPrice: number
): Promise<number> {
  const settings = await getSalarySettings();
  
  if (!settings) {
    console.error('[calculateWorkerEarnings] No settings found');
    return 0;
  }

  if (workingMode === 'solo') {
    // СОЛО: базовая ставка 500₽ + 40% от заказа
    return bookingPrice * settings.worker_solo_commission + settings.worker_solo_base;
  } else {
    // ПАРА: базовая ставка 250₽ + 20% от заказа
    return bookingPrice * settings.worker_pair_commission + settings.worker_pair_base;
  }
}

/**
 * Рассчитать зарплату шиномонтажника для одного заказа
 * @param bookingPrice - цена заказа
 * @returns заработок за заказ (50% от цены)
 */
export async function calculateTireWorkerEarnings(bookingPrice: number): Promise<number> {
  const settings = await getSalarySettings();
  
  if (!settings) {
    console.error('[calculateTireWorkerEarnings] No settings found');
    return 0;
  }

  // Шиномонтажник: 50% от заказа (без базовой ставки)
  return bookingPrice * settings.tire_worker_commission;
}

/**
 * Рассчитать фиксированную зарплату админа
 * @returns фиксированная зарплата админа (2000₽)
 */
export async function calculateAdminEarnings(): Promise<number> {
  const settings = await getSalarySettings();
  
  if (!settings) {
    console.error('[calculateAdminEarnings] No settings found');
    return 0;
  }

  return settings.admin_fixed_salary;
}

/**
 * Получить базовую ставку мойщика
 * @param workingMode - режим работы: 'solo' или 'pair'
 * @returns базовая ставка (500₽ для solo, 250₽ для pair)
 */
export async function getWorkerBaseRate(workingMode: 'solo' | 'pair'): Promise<number> {
  const settings = await getSalarySettings();
  
  if (!settings) {
    console.error('[getWorkerBaseRate] No settings found');
    return 0;
  }

  return workingMode === 'solo' ? settings.worker_solo_base : settings.worker_pair_base;
}

/**
 * Получить процент мойщика
 * @param workingMode - режим работы: 'solo' или 'pair'
 * @returns процент (0.4 для solo, 0.2 для pair)
 */
export async function getWorkerCommission(workingMode: 'solo' | 'pair'): Promise<number> {
  const settings = await getSalarySettings();
  
  if (!settings) {
    console.error('[getWorkerCommission] No settings found');
    return 0;
  }

  return workingMode === 'solo' ? settings.worker_solo_commission : settings.worker_pair_commission;
}
