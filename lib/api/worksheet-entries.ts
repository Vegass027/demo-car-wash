import { supabase } from '../supabase';

/**
 * Тип услуги в ведомости
 */
export interface WorksheetService {
  name: string;
  price: number;
}

/**
 * Типы сущности "Запись ведомости"
 * Соответствует таблице worksheet_entries в базе данных
 */
export interface WorksheetEntry {
  id: string;
  organization_id: string;
  driver_id?: string;
  car_id?: string;
  driver_name: string;
  car_model?: string;
  plate_number?: string;
  service_date: string;
  services_provided: WorksheetService[];  // jsonb - список услуг
  services: WorksheetService[];          // Алиас для удобства использования в UI
  total_amount: number;
  total_price: number;                   // Алиас для удобства использования в UI
  organization_name?: string;            // Для отображения в UI
  signature_data?: string;               // Подпись водителя (копируется из bookings)
  signed_at?: string;                    // Дата подписания
  created_at: string;
}

/**
 * Создать запись в ведомости
 * Автоматически копирует подпись из заказа если есть
 */
export async function createWorksheetEntry(
  data: Omit<WorksheetEntry, 'id' | 'created_at'>
): Promise<WorksheetEntry> {
  const { data: newEntry, error } = await supabase
    .from('worksheet_entries')
    .insert([data])
    .select()
    .single();

  if (error) {
    console.error('Ошибка при создании записи в ведомости:', error);
    throw error;
  }

  return newEntry;
}

/**
 * Получить все записи ведомости для организации
 */
export async function getWorksheetEntriesByOrganization(
  organizationId: string,
  startDate?: string,
  endDate?: string
): Promise<WorksheetEntry[]> {
  let query = supabase
    .from('worksheet_entries')
    .select('*')
    .eq('organization_id', organizationId);

  if (startDate) {
    query = query.gte('service_date', startDate);
  }

  if (endDate) {
    query = query.lte('service_date', endDate);
  }

  const { data, error } = await query.order('service_date', { ascending: true });

  if (error) {
    console.error('Ошибка при загрузке записей ведомости:', error);
    throw error;
  }

  // Добавляем алиасы для удобства использования в UI
  return (data || []).map(entry => ({
    ...entry,
    services: entry.services_provided || [],
    total_price: entry.total_amount,
  }));
}

/**
 * Получить запись ведомости по ID
 */
export async function getWorksheetEntryById(id: string): Promise<WorksheetEntry | null> {
  const { data, error } = await supabase
    .from('worksheet_entries')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Ошибка при загрузке записи ведомости ${id}:`, error);
    return null;
  }

  return data;
}

/**
 * Обновить запись в ведомости
 */
export async function updateWorksheetEntry(
  id: string,
  updates: Partial<Omit<WorksheetEntry, 'id' | 'created_at'>>
): Promise<WorksheetEntry> {
  const { data: updatedEntry, error } = await supabase
    .from('worksheet_entries')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`Ошибка при обновлении записи ведомости ${id}:`, error);
    throw error;
  }

  return updatedEntry;
}

/**
 * Удалить запись в ведомости
 */
export async function deleteWorksheetEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('worksheet_entries')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`Ошибка при удалении записи ведомости ${id}:`, error);
    throw error;
  }
}
