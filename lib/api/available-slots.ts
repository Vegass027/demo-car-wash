import { supabase } from '../supabase';
import { getBookingSettings } from './booking-settings';

/**
 * Свободный слот для записи
 */
export interface AvailableSlot {
  date: string;
  start_time: string;
  end_time: string;
  box_number?: number;
  available: boolean;
}

/**
 * Получить свободные слоты для автомойки на дату
 */
export async function getAvailableCarwashSlots(
  date: string
): Promise<AvailableSlot[]> {
  const settings = await getBookingSettings('carwash');

  if (!settings || !settings.online_booking_enabled) {
    return [];
  }

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('start_time, end_time, box_number')
    .eq('booking_date', date)
    .in('status', ['ОЖИДАЕТ', 'В РАБОТЕ'])
    .order('start_time');

  if (error) {
    console.error('Error fetching bookings:', error);
    return [];
  }

  // ✅ Загружаем закрытые боксы
  const { data: closedBoxes, error: boxesError } = await supabase
    .from('closed_boxes')
    .select('*')
    .eq('closed_date', date)
    .eq('is_closed', true);

  if (boxesError) {
    console.error('Error fetching closed boxes:', boxesError);
  }

  return calculateSlots(settings, bookings || [], date, closedBoxes || []);
}

/**
 * Получить свободные слоты для шиномонтажа на дату
 */
export async function getAvailableTireSlots(
  date: string
): Promise<AvailableSlot[]> {
  const settings = await getBookingSettings('tire');

  if (!settings || !settings.online_booking_enabled) {
    return [];
  }

  const { data: bookings, error } = await supabase
    .from('tire_bookings')
    .select('start_time, end_time')
    .eq('booking_date', date)
    .in('status', ['ОЖИДАЕТ', 'В РАБОТЕ'])
    .order('start_time');

  if (error) {
    console.error('Error fetching tire bookings:', error);
    return [];
  }

  return calculateSlots(settings, bookings || [], date);
}

/**
 * Проверить доступность слота для автомойки
 */
export async function isCarwashSlotAvailable(
  date: string,
  startTime: string,
  endTime: string,
  boxNumber?: number
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('booking_date', date)
    .in('status', ['ОЖИДАЕТ', 'В РАБОТЕ'])
    .or(`and(start_time.lte.${endTime},end_time.gte.${startTime})`)
    .eq('box_number', boxNumber)
    .limit(1);

  if (error) {
    console.error('Error checking slot availability:', error);
    return false;
  }

  return !data || data.length === 0;
}

/**
 * Проверить доступность слота для шиномонтажа
 */
export async function isTireSlotAvailable(
  date: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tire_bookings')
    .select('id')
    .eq('booking_date', date)
    .in('status', ['ОЖИДАЕТ', 'В РАБОТЕ'])
    .or(`and(start_time.lte.${endTime},end_time.gte.${startTime})`)
    .limit(1);

  if (error) {
    console.error('Error checking tire slot availability:', error);
    return false;
  }

  return !data || data.length === 0;
}

/**
 * Рассчитать слоты на основе настроек и существующих записей
 */
function calculateSlots(
  settings: any,
  bookings: any[],
  date: string,
  closedBoxes?: any[]
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const slotDuration = settings.slot_duration_minutes; // минут
  const totalBoxes = settings.total_boxes;
  const startTime = settings.work_start_time;
  const endTime = settings.work_end_time;

  // ✅ Создаём Map закрытых боксов: box_number -> open_hours
  const closedBoxesMap = new Map<number, number[]>();
  closedBoxes?.forEach(box => {
    if (box.is_closed) {
      closedBoxesMap.set(box.box_number, box.open_hours || []);
    }
  });

  // Парсим время начала и конца работы
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  // Создаём дату для расчётов
  const currentDate = new Date(date);
  currentDate.setHours(startHour, startMinute, 0, 0);

  const endDate = new Date(date);
  endDate.setHours(endHour, endMinute, 0, 0);

  // Генерируем слоты
  while (currentDate < endDate) {
    const slotStart = formatTime(currentDate);

    // Добавляем длительность слота
    const slotEnd = new Date(currentDate);
    slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);
    const slotEndStr = formatTime(slotEnd);

    // Проверяем доступность для каждого бокса
    for (let box = 1; box <= totalBoxes; box++) {
      const isAvailable = isSlotAvailable(
        slotStart,
        slotEndStr,
        box,
        bookings
      );

      // ✅ Проверяем закрытость бокса на этот час
      const slotHour = parseInt(slotStart.split(':')[0]);
      const openHours = closedBoxesMap.get(box);
      const isBoxClosedForThisHour = closedBoxesMap.has(box) &&
        (!openHours || !openHours.includes(slotHour));

      slots.push({
        date,
        start_time: slotStart,
        end_time: slotEndStr,
        box_number: box,
        available: isAvailable && !isBoxClosedForThisHour
      });
    }

    // Переходим к следующему слоту
    currentDate.setMinutes(currentDate.getMinutes() + slotDuration);
  }

  return slots;
}

/**
 * Проверить доступность слота
 */
function isSlotAvailable(
  startTime: string,
  endTime: string,
  boxNumber: number,
  bookings: any[]
): boolean {
  for (const booking of bookings) {
    const bookingStart = booking.start_time;
    const bookingEnd = booking.end_time;

    // Проверяем пересечение интервалов
    if (booking.box_number === boxNumber &&
        startTime < bookingEnd &&
        endTime > bookingStart) {
      return false;
    }
  }

  return true;
}

/**
 * Форматировать время в HH:MM
 */
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
