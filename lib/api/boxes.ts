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
 * Открыть или закрыть бокс на конкретную дату
 * @param boxNumber - Номер бокса (1, 2 или 3)
 * @param date - Дата закрытия бокса (YYYY-MM-DD)
 * @param profileId - ID профиля админа, который выполняет действие
 * @returns Обновленный объект бокса
 * @throws Error если запрос к базе данных не удался или админ не найден
 */
export async function toggleBox(boxNumber: number, date: string, profileId: string): Promise<ClosedBox> {
  // Проверяем, существует ли запись для этой даты
  const { data: existingBox } = await supabase
    .from('closed_boxes')
    .select('*')
    .eq('box_number', boxNumber)
    .eq('closed_date', date)
    .single();

  if (existingBox) {
    // Запись существует - переключаем статус
    const newStatus = !existingBox.is_closed;

    const { data, error } = await supabase
      .from('closed_boxes')
      .update({
        is_closed: newStatus,
        closed_at: newStatus ? new Date().toISOString() : null,
        closed_by: newStatus ? profileId : null,
        updated_at: new Date().toISOString()
      })
      .eq('box_number', boxNumber)
      .eq('closed_date', date)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Записи нет - создаем новую
    const { data, error } = await supabase
      .from('closed_boxes')
      .insert({
        box_number: boxNumber,
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: profileId,
        closed_date: date
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
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
 * Временно открыть бокс на конкретный час
 * @param boxNumber - Номер бокса (1, 2 или 3)
 * @param date - Дата (YYYY-MM-DD)
 * @param hour - Час для открытия (8-18)
 * @param profileId - ID профиля админа
 * @returns Обновленный объект бокса
 * @throws Error если запрос к базе данных не удался
 */
export async function openBoxForHour(boxNumber: number, date: string, hour: number, profileId: string): Promise<ClosedBox> {
  console.log('[openBoxForHour] Открываем бокс', boxNumber, 'на дату:', date, 'час:', hour, 'профиль:', profileId);

  // Проверяем, существует ли запись для этой даты
  const { data: existingBox } = await supabase
    .from('closed_boxes')
    .select('*')
    .eq('box_number', boxNumber)
    .eq('closed_date', date)
    .single();

  if (existingBox) {
    console.log('[openBoxForHour] Существующий бокс:', existingBox);
    // Запись существует - добавляем час в open_hours
    const currentOpenHours = existingBox.open_hours || [];

    // Если бокс закрыт, добавляем час в open_hours
    if (existingBox.is_closed && !currentOpenHours.includes(hour)) {
      console.log('[openBoxForHour] Добавляем час', hour, 'к open_hours:', currentOpenHours);
      const newOpenHours = [...currentOpenHours, hour].sort((a, b) => a - b);

      const { data, error } = await supabase
        .from('closed_boxes')
        .update({
          open_hours: newOpenHours,
          updated_at: new Date().toISOString()
        })
        .eq('box_number', boxNumber)
        .eq('closed_date', date)
        .select()
        .single();

      if (error) throw error;
      console.log('[openBoxForHour] Бокс успешно открыт:', data);
      return data;
    }

    console.log('[openBoxForHour] Бокс уже открыт на этот час или не закрыт');
    return existingBox;
  } else {
    console.log('[openBoxForHour] Создаем новый закрытый бокс с открытым часом:', hour);
    // Записи нет - создаем новую с закрытым боксом
    const { data, error } = await supabase
      .from('closed_boxes')
      .insert({
        box_number: boxNumber,
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: profileId,
        closed_date: date,
        open_hours: [hour]  // Бокс закрыт, но открыт на этот час
      })
      .select()
      .single();

    if (error) throw error;
    console.log('[openBoxForHour] Новый бокс создан:', data);
    return data;
  }
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
export async function toggleBoxWithReset(boxNumber: number, date: string, profileId: string): Promise<ClosedBox> {
  console.log('[toggleBoxWithReset] Переключаем бокс', boxNumber, 'на дату:', date, 'профиль:', profileId);

  // Проверяем, существует ли запись для этой даты
  const { data: existingBox } = await supabase
    .from('closed_boxes')
    .select('*')
    .eq('box_number', boxNumber)
    .eq('closed_date', date)
    .single();

  if (existingBox) {
    console.log('[toggleBoxWithReset] Существующий бокс:', existingBox);

    if (existingBox.is_closed) {
      // Бокс закрыт → открываем полностью (open_hours = NULL)
      console.log('[toggleBoxWithReset] Бокс закрыт, открываем полностью (open_hours = NULL)');
      const { data, error } = await supabase
        .from('closed_boxes')
        .update({
          is_closed: false,
          open_hours: null,  // ← СБРАСЫВАЕМ В NULL!
          closed_at: null,
          closed_by: null,
          updated_at: new Date().toISOString()
        })
        .eq('box_number', boxNumber)
        .eq('closed_date', date)
        .select()
        .single();

      if (error) throw error;
      console.log('[toggleBoxWithReset] Бокс открыт полностью:', data);
      return data;
    } else {
      // Бокс открыт → закрываем (open_hours = [])
      console.log('[toggleBoxWithReset] Бокс открыт, закрываем (open_hours = [])');
      const { data, error } = await supabase
        .from('closed_boxes')
        .update({
          is_closed: true,
          open_hours: [],  // ← ПУСТОЙ МАССИВ!
          closed_at: new Date().toISOString(),
          closed_by: profileId,
          updated_at: new Date().toISOString()
        })
        .eq('box_number', boxNumber)
        .eq('closed_date', date)
        .select()
        .single();

      if (error) throw error;
      console.log('[toggleBoxWithReset] Бокс закрыт:', data);
      return data;
    }
  } else {
    // Записи нет - создаем закрытую запись
    console.log('[toggleBoxWithReset] Записи нет, создаем закрытую запись');
    const { data, error } = await supabase
      .from('closed_boxes')
      .insert({
        box_number: boxNumber,
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: profileId,
        closed_date: date,
        open_hours: []  // ← ПУСТОЙ МАССИВ!
      })
      .select()
      .single();

    if (error) throw error;
    console.log('[toggleBoxWithReset] Новая закрытая запись создана:', data);
    return data;
  }
}
