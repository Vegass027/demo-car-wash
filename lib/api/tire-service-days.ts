import { supabase } from '../supabase';

/**
 * Статус работы шиномонтажа на конкретный день
 */
export interface TireServiceDay {
  id: string;
  service_date: string; // YYYY-MM-DD
  is_open: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Получить статус работы шиномонтажа на конкретную дату
 * Если записи нет - возвращается is_open: true (по умолчанию открыт)
 */
export async function getTireServiceDayStatus(date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('tire_service_days')
    .select('is_open')
    .eq('service_date', date)
    .single();

  if (error) {
    // Если запись не найдена - день открыт по умолчанию
    if (error.code === 'PGRST116') {
      return true;
    }
    console.error('Error fetching tire service day status:', error);
    return true; // По умолчанию открыт при ошибке
  }

  return data?.is_open ?? true;
}

/**
 * Получить полную информацию о дне шиномонтажа
 */
export async function getTireServiceDay(date: string): Promise<TireServiceDay | null> {
  const { data, error } = await supabase
    .from('tire_service_days')
    .select('*')
    .eq('service_date', date)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching tire service day:', error);
    return null;
  }

  return data;
}

/**
 * Установить статус работы шиномонтажа на конкретную дату
 * Создаёт запись если не существует, обновляет если существует
 */
export async function setTireServiceDayStatus(date: string, isOpen: boolean): Promise<boolean> {
  console.log('[setTireServiceDayStatus] Начало установки статуса:', { date, isOpen });

  // Сначала проверяем существует ли запись
  const existing = await getTireServiceDay(date);
  console.log('[setTireServiceDayStatus] Существующая запись:', existing);

  let result;

  if (existing) {
    // Обновляем существующую запись
    console.log('[setTireServiceDayStatus] Обновление существующей записи');
    const { error, data } = await supabase
      .from('tire_service_days')
      .update({
        is_open: isOpen,
        updated_at: new Date().toISOString()
      })
      .eq('service_date', date)
      .select();

    console.log('[setTireServiceDayStatus] Результат UPDATE:', { error, data });
    result = { error };
  } else {
    // Создаём новую запись
    console.log('[setTireServiceDayStatus] Создание новой записи');
    const { error, data } = await supabase
      .from('tire_service_days')
      .insert({
        service_date: date,
        is_open: isOpen
      })
      .select();

    console.log('[setTireServiceDayStatus] Результат INSERT:', { error, data });
    result = { error };
  }

  if (result.error) {
    console.error('[setTireServiceDayStatus] Ошибка:', result.error);
    return false;
  }

  console.log('[setTireServiceDayStatus] Успешно завершено');
  return true;
}

/**
 * Получить статусы для диапазона дат
 */
export async function getTireServiceDaysRange(
  fromDate: string, 
  toDate: string
): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('tire_service_days')
    .select('service_date, is_open')
    .gte('service_date', fromDate)
    .lte('service_date', toDate);

  if (error) {
    console.error('Error fetching tire service days range:', error);
    return {};
  }

  // Преобразуем в Record для удобного доступа
  const result: Record<string, boolean> = {};
  for (const item of data || []) {
    result[item.service_date] = item.is_open;
  }

  return result;
}

/**
 * Найти ближайший открытый день начиная с указанной даты
 * @param fromDate Дата с которой начинать поиск (включительно)
 * @param maxDaysAhead Максимальное количество дней для поиска (по умолчанию 30)
 */
export async function getNextOpenTireServiceDate(
  fromDate: string,
  maxDaysAhead: number = 30
): Promise<string | null> {
  // Генерируем массив дат для проверки
  const dates: string[] = [];
  const startDate = new Date(fromDate);
  
  for (let i = 0; i <= maxDaysAhead; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }

  // Получаем статусы для всех дат
  const statuses = await getTireServiceDaysRange(dates[0], dates[dates.length - 1]);

  // Ищем первый открытый день
  for (const date of dates) {
    // Если записи нет - день открыт по умолчанию
    const isOpen = statuses[date] ?? true;
    if (isOpen) {
      return date;
    }
  }

  return null;
}

/**
 * Получить статусы для массива дат (для DateSelector)
 */
export async function getTireServiceDaysForDates(dates: string[]): Promise<Record<string, boolean>> {
  if (dates.length === 0) return {};

  const { data, error } = await supabase
    .from('tire_service_days')
    .select('service_date, is_open')
    .in('service_date', dates);

  if (error) {
    console.error('Error fetching tire service days for dates:', error);
    return {};
  }

  const result: Record<string, boolean> = {};
  for (const item of data || []) {
    result[item.service_date] = item.is_open;
  }

  return result;
}
