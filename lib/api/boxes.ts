import { supabase } from '../supabase';

export interface ClosedBox {
  id: string;
  box_number: number;
  is_closed: boolean;
  closed_at: string | null;
  closed_by: string | null;
  closed_date: string | null;
  open_hours: number[] | null;  // Часы, когда бокс временно открыт
  created_at: string;
  updated_at: string;
}

/**
 * Получить все боксы с их статусами
 * @returns Массив всех боксов
 * @throws Error если запрос к базе данных не удался
 */
export async function getBoxes(): Promise<ClosedBox[]> {
  const { data, error } = await supabase
    .from('closed_boxes')
    .select('*')
    .order('box_number');

  if (error) throw error;
  return data || [];
}

/**
 * DEPRECATED Slice #3e Phase A follow-up: was anon-side INSERT/UPDATE
 * on closed_boxes via supabase. After Slice #3d migration 019 anon
 * grants revoked, this fails with 42501 permission_denied. Replaced by
 * toggleBoxActionDispatcher() (api/staff.ts) which uses service_role.
 *
 * Zero live callers after App.tsx rewire — kept as throw-stub to
 * prevent silent re-introduction.
 */
export async function toggleBox(_boxNumber: number, _date: string, _profileId: string): Promise<ClosedBox> {
  throw new Error('toggleBox: deprecated, use toggleBoxActionDispatcher');
}

/**
 * Получить статус конкретного бокса
 * @param boxNumber - Номер бокса
 * @returns Объект бокса или null
 * @throws Error если запрос к базе данных не удался
 */
export async function getBoxStatus(boxNumber: number): Promise<ClosedBox | null> {
  const { data, error } = await supabase
    .from('closed_boxes')
    .select('*')
    .eq('box_number', boxNumber)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Запись не найдена
      return null;
    }
    throw error;
  }
  return data;
}

/**
 * Проверить, закрыт ли бокс
 * @param boxNumber - Номер бокса
 * @returns true если бокс закрыт, false если открыт
 */
export async function isBoxClosed(boxNumber: number): Promise<boolean> {
  const box = await getBoxStatus(boxNumber);
  return box?.is_closed || false;
}

/**
 * Получить закрытые боксы для конкретной даты
 * @param date - Дата в формате YYYY-MM-DD
 * @returns Массив боксов для указанной даты
 * @throws Error если запрос к базе данных не удался
 */
export async function getClosedBoxesForDate(date: string): Promise<ClosedBox[]> {
  const { data, error } = await supabase
    .from('closed_boxes')
    .select('*')
    .eq('closed_date', date)
    .order('box_number');

  if (error) throw error;
  return data || [];
}

/**
 * DEPRECATED Slice #3e Phase A follow-up: was anon-side UPDATE on
 * closed_boxes via supabase. After Slice #3d migration 019 anon grants
 * revoked, this fails with 42501 permission_denied. Replaced by
 * openBoxForHourActionDispatcher() (api/staff.ts) which uses service_role.
 */
export async function openBoxForHour(_boxNumber: number, _date: string, _hour: number, _profileId: string): Promise<ClosedBox> {
  throw new Error('openBoxForHour: deprecated, use openBoxForHourActionDispatcher');
}

/**
 * Переключить состояние бокса (простая логика)
 * - Если бокс закрыт (есть запись) → открыть (is_closed = false, open_hours = NULL)
 * - Если бокс открыт (нет записи или is_closed = false) → закрыть (is_closed = true, open_hours = [])
 * @param boxNumber - Номер бокса (1, 2 или 3)
 * @param date - Дата (YYYY-MM-DD)
 * @param profileId - ID профиля админа
 * @returns Обновленный объект бокса
 * @throws Error если запрос к базе данных не удался
 */
/**
 * DEPRECATED Slice #3e Phase A follow-up: was anon-side INSERT/UPDATE
 * on closed_boxes via supabase. After Slice #3d migration 019 anon
 * grants revoked, this fails with 42501 permission_denied. Replaced by
 * toggleBoxActionDispatcher() (api/staff.ts) which uses service_role.
 *
 * Zero live callers after App.tsx rewire — kept as throw-stub to
 * prevent silent re-introduction.
 */
export async function toggleBoxWithReset(_boxNumber: number, _date: string, _profileId: string): Promise<ClosedBox> {
  throw new Error('toggleBoxWithReset: deprecated, use toggleBoxActionDispatcher');
}
