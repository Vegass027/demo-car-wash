/**
 * Утилиты для работы со временем в формате HH:mm
 */

import { Booking } from '../../lib/api/bookings';
import { TireBooking } from '../../lib/api/tire-bookings';
import { formatDate } from './date';

/**
 * Форматирует время без секунд (убирает секунды из HH:mm:ss)
 * @param time - время в формате HH:mm или HH:mm:ss
 * @returns время в формате HH:mm
 */
export function formatTimeWithoutSeconds(time: string): string {
  return time.split(':').slice(0, 2).join(':');
}

/**
 * Добавляет минуты к времени в формате HH:mm
 * @param time - время в формате HH:mm
 * @param minutes - количество минут для добавления
 * @returns время в формате HH:mm
 */
export function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

/**
 * Проверяет пересечение двух временных интервалов
 * @param start1 - начало первого интервала (HH:mm)
 * @param end1 - конец первого интервала (HH:mm)
 * @param start2 - начало второго интервала (HH:mm)
 * @param end2 - конец второго интервала (HH:mm)
 * @returns true если интервалы пересекаются
 */
export function isTimeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  const s1 = timeToMinutes(start1);
  const e1 = timeToMinutes(end1);
  const s2 = timeToMinutes(start2);
  const e2 = timeToMinutes(end2);

  return s1 < e2 && s2 < e1;
}

/**
 * Проверяет пересечение нового заказа с существующими
 * @param startTime - время начала нового заказа
 * @param endTime - время окончания нового заказа
 * @param existingBookings - существующие заказы
 * @param date - дата заказа
 * @param excludeBookingId - ID заказа который нужно исключить из проверки
 * @returns массив заказов с которыми есть пересечение
 */
export function findOverlappingBookings(
  startTime: string,
  endTime: string,
  existingBookings: Booking[],
  date: string,
  excludeBookingId?: string
): Booking[] {
  return existingBookings.filter(booking => {
    if (booking.booking_date !== date) return false;
    if (excludeBookingId && booking.id === excludeBookingId) return false;
    // Игнорируем отмененные и готовые заказы при проверке конфликтов
    if (booking.status === 'ОТМЕНЕНО' || booking.status === 'ГОТОВО') return false;
    return isTimeOverlap(startTime, endTime, booking.start_time, booking.end_time);
  });
}

/**
 * Валидирует что endTime != startTime
 * Заказы через полночь (например, 23:57 - 00:27) валидны
 * @param startTime - время начала
 * @param endTime - время окончания
 * @returns true если валидно
 */
export function isValidTimeRange(startTime: string, endTime: string): boolean {
  return timeToMinutes(endTime) !== timeToMinutes(startTime);
}

/**
 * Находит свободные интервалы между заказами
 * @param existingBookings - существующие заказы
 * @param date - дата заказа
 * @param allowedDurations - разрешенные длительности в минутах
 * @returns массив свободных интервалов {start, end, label, duration}
 */
export function findAvailableTimeSlots(
  existingBookings: Booking[],
  date: string,
  allowedDurations: number[] = [30, 60, 90, 120]
): { start: string; end: string; label: string; duration: number }[] {
  // Фильтруем заказы: только за указанную дату, не отмененные, не готовые
  const activeBookings = existingBookings.filter(booking => {
    return booking.booking_date === date &&
           booking.status !== 'ОТМЕНЕНО' &&
           booking.status !== 'ГОТОВО';
  });

  // Сортируем по времени начала
  const sortedBookings = [...activeBookings].sort((a, b) => {
    const timeA = timeToMinutes(a.start_time);
    const timeB = timeToMinutes(b.start_time);
    return timeA - timeB;
  });

  const availableSlots: { start: string; end: string; label: string; duration: number }[] = [];
  const workingDayStart = '08:00';
  const workingDayEnd = '20:00';

  // Если нет заказов - нет окон между заказами
  if (sortedBookings.length === 0) {
    return [];
  }

  // === ШАГ 1: Объединение пересекающихся и соприкасающихся записей ===
  const mergedBookings: { start: string; end: string }[] = [];
  
  for (const booking of sortedBookings) {
    const bookingStart = timeToMinutes(booking.start_time);
    const bookingEnd = timeToMinutes(booking.end_time);
    
    if (mergedBookings.length === 0) {
      mergedBookings.push({ start: booking.start_time, end: booking.end_time });
      continue;
    }
    
    const lastMerged = mergedBookings[mergedBookings.length - 1];
    const lastMergedEnd = timeToMinutes(lastMerged.end);
    
    // Если записи пересекаются или соприкасаются (end == next start) - объединяем
    if (bookingStart <= lastMergedEnd) {
      // Объединяем: начало остаётся, конец становится максимумом
      const newEnd = Math.max(lastMergedEnd, bookingEnd);
      mergedBookings[mergedBookings.length - 1].end = minutesToTime(newEnd);
    } else {
      // Нет пересечения - добавляем как отдельный интервал
      mergedBookings.push({ start: booking.start_time, end: booking.end_time });
    }
  }

  // === ШАГ 2: Построение свободных интервалов ===
  const freeIntervals: { start: string; end: string }[] = [];
  
  // Интервал между рабочим началом дня и первой записью
  const firstBooking = mergedBookings[0];
  if (timeToMinutes(firstBooking.start) > timeToMinutes(workingDayStart)) {
    freeIntervals.push({
      start: workingDayStart,
      end: firstBooking.start
    });
  }
  
  // Интервалы между записями
  for (let i = 1; i < mergedBookings.length; i++) {
    const prev = mergedBookings[i - 1];
    const current = mergedBookings[i];
    
    const prevEnd = timeToMinutes(prev.end);
    const currentStart = timeToMinutes(current.start);
    
    // Свободный интервал существует только если prev.end < current.start
    if (prevEnd < currentStart) {
      freeIntervals.push({
        start: prev.end,
        end: current.start
      });
    }
  }
  
  // Интервал после последней записи до конца рабочего дня
  const lastBooking = mergedBookings[mergedBookings.length - 1];
  if (timeToMinutes(lastBooking.end) < timeToMinutes(workingDayEnd)) {
    freeIntervals.push({
      start: lastBooking.end,
      end: workingDayEnd
    });
  }

  // === ШАГ 3: Генерация окон внутри свободных интервалов ===
  for (const freeInterval of freeIntervals) {
    const freeStart = timeToMinutes(freeInterval.start);
    const freeEnd = timeToMinutes(freeInterval.end);
    const freeDuration = freeEnd - freeStart;
    
    // Для каждой допустимой длительности проверяем, помещается ли она в свободный интервал
    for (const duration of allowedDurations) {
      // Ключевая проверка: окно должно полностью помещаться в свободный интервал
      if (duration <= freeDuration) {
        const slotEnd = minutesToTime(freeStart + duration);
        availableSlots.push({
          start: freeInterval.start,
          end: slotEnd,
          label: `${formatDuration(duration)}: ${freeInterval.start} - ${slotEnd}`,
          duration
        });
      }
      // Если duration > freeDuration - окно НЕ добавляем (ошибка в старой логике)
    }
  }

  return availableSlots;
}

/**
 * Конвертирует минуты в формат HH:mm
 * @param minutes - количество минут от начала дня
 * @returns время в формате HH:mm
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Форматирует длительность в читаемый вид
 * @param minutes - длительность в минутах
 * @returns отформатированная строка
 */
function formatDuration(minutes: number): string {
  if (minutes === 30) return '30 мин';
  if (minutes === 60) return '1 час';
  if (minutes === 90) return '1.5 ч';
  if (minutes === 120) return '2 ч';
  return `${minutes} мин`;
}

/**
 * Получает информацию о последнем заказе за дату
 * @param existingBookings - существующие заказы
 * @param date - дата заказа
 * @returns последний заказ или null
 */
export function getLastBooking(
  existingBookings: Booking[],
  date: string
): Booking | null {
  const dayBookings = existingBookings.filter(booking => {
    return booking.booking_date === date &&
           booking.status !== 'ОТМЕНЕНО';
  });

  if (dayBookings.length === 0) return null;

  // Сортируем по времени начала и берем последний
  return [...dayBookings].sort((a, b) => {
    const timeA = timeToMinutes(a.start_time);
    const timeB = timeToMinutes(b.start_time);
    return timeB - timeA;
  })[0];
}

/**
 * Конвертирует время в формате HH:mm в минуты от начала дня
 * @param time - время в формате HH:mm
 * @returns количество минут от начала дня
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Определяет, находится ли заказ в активном временном интервале
 * Автоматический флаг: start_time <= now < end_time
 * @param booking - заказ для проверки
 * @returns true если текущее время находится в интервале заказа
 */
export function isTimeActive(booking: { startTime: string; endTime: string; date: string }): boolean {
  const now = new Date();
  const today = formatDate(now);
  
  // Проверяем, что заказ на сегодня
  if (booking.date !== today) return false;
  
  const currentMinutesTotal = now.getHours() * 60 + now.getMinutes();
  const startMinutes = timeToMinutes(booking.startTime);
  const endMinutes = timeToMinutes(booking.endTime);
  
  // Проверяем, что текущее время находится в интервале заказа
  return currentMinutesTotal >= startMinutes && currentMinutesTotal < endMinutes;
}

/**
 * Определяет, активен ли заказ (универсальная функция с camelCase полями)
 * Гибридная логика: заказ активен если ЛЮБОЕ из двух условий выполнено:
 * 1. status == 'В РАБОТЕ' (ручной статус)
 * 2. ИЛИ status == 'ОЖИДАЕТ' И текущее время в интервале заказа (автоматический флаг)
 * @param booking - заказ для проверки
 * @returns true если заказ активен
 */
export function isBookingActive(booking: { status: string; startTime: string; endTime: string; date: string }): boolean {
  // Если статус уже 'В РАБОТЕ' - заказ активен (ручной статус)
  if (booking.status === 'В РАБОТЕ') {
    return true;
  }
  
  // Если статус не 'ОЖИДАЕТ' - заказ не активен
  if (booking.status !== 'ОЖИДАЕТ') {
    return false;
  }
  
  // Проверяем, что заказ на сегодня и текущее время находится в интервале (автоматический флаг)
  return isTimeActive(booking);
}

/**
 * Определяет, активен ли заказ автомойки (Booking из lib/api/bookings)
 * Использует snake_case поля: start_time, end_time, booking_date
 * Заказ активен ТОЛЬКО если статус == 'В РАБОТЕ' (ручной статус)
 * @param booking - заказ автомойки для проверки
 * @returns true если заказ активен
 */
export function isCarWashBookingActive(booking: { status: string; start_time: string; end_time: string; booking_date: string }): boolean {
  // Заказ активен ТОЛЬКО если статус == 'В РАБОТЕ' (ручной статус)
  return booking.status === 'В РАБОТЕ';
}

/**
 * Вычисляет время окончания для шиномонтажа
 */
export function calculateEndTime(startTime: string, duration: number): string {
  return addMinutesToTime(startTime, duration);
}

/**
 * Проверка просрочки для ШИНОМОНТАЖА (tire_bookings)
 */
export function isTireBookingExpired(
  bookingDate: string,
  startTime: string,
  duration: number,
  status: string
): boolean {
  if (status === 'ГОТОВО' || status === 'ОТМЕНЕНО' || status === 'ПРОСРОЧЕН') {
    return false;
  }
  
  const now = new Date();
  const today = formatDate(now);
  if (bookingDate !== today) {
    return false;
  }
  
  const endTime = calculateEndTime(startTime, duration);
  const currentMinutesTotal = now.getHours() * 60 + now.getMinutes();
  const endMinutes = timeToMinutes(endTime);
  
  return currentMinutesTotal > endMinutes;
}

// ==================== ШИНОМОНТАЖ (tire_bookings) ====================
// Отдельные функции для шиномонтажа, т.к. поля в snake_case

/**
 * Проверяет пересечение нового заказа шиномонтажа с существующими
 * @param startTime - время начала нового заказа
 * @param endTime - время окончания нового заказа
 * @param existingBookings - существующие заказы шиномонтажа
 * @param date - дата заказа
 * @param excludeBookingId - ID заказа который нужно исключить из проверки
 * @returns массив заказов с которыми есть пересечение
 */
export function findOverlappingTireBookings(
  startTime: string,
  endTime: string,
  existingBookings: TireBooking[],
  date: string,
  excludeBookingId?: string
): TireBooking[] {
  return existingBookings.filter(booking => {
    if (booking.booking_date !== date) return false;
    if (excludeBookingId && booking.id === excludeBookingId) return false;
    // Игнорируем отмененные и готовые заказы при проверке конфликтов
    if (booking.status === 'ОТМЕНЕНО' || booking.status === 'ГОТОВО') return false;
    const bookingEndTime = calculateEndTime(booking.start_time, booking.estimated_duration);
    return isTimeOverlap(startTime, endTime, booking.start_time, bookingEndTime);
  });
}

/**
 * Находит свободные интервалы между заказами шиномонтажа
 * @param existingBookings - существующие заказы шиномонтажа
 * @param date - дата заказа
 * @param allowedDurations - разрешенные длительности в минутах
 * @returns массив свободных интервалов {start, end, label, duration}
 */
export function findAvailableTireTimeSlots(
  existingBookings: TireBooking[],
  date: string,
  allowedDurations: number[] = [30, 60, 90, 120]
): { start: string; end: string; label: string; duration: number }[] {
  // Фильтруем заказы: только за указанную дату, не отмененные, не готовые
  const activeBookings = existingBookings.filter(booking => {
    return booking.booking_date === date &&
           booking.status !== 'ОТМЕНЕНО' &&
           booking.status !== 'ГОТОВО';
  });

  // Сортируем по времени начала
  const sortedBookings = [...activeBookings].sort((a, b) => {
    const timeA = timeToMinutes(a.start_time);
    const timeB = timeToMinutes(b.start_time);
    return timeA - timeB;
  });

  const availableSlots: { start: string; end: string; label: string; duration: number }[] = [];
  const workingDayStart = '08:00';
  const workingDayEnd = '20:00';

  // Если нет заказов - нет окон между заказами
  if (sortedBookings.length === 0) {
    return [];
  }

  // === ШАГ 1: Объединение пересекающихся и соприкасающихся записей ===
  const mergedBookings: { start: string; end: string }[] = [];
  
  for (const booking of sortedBookings) {
    const bookingStart = timeToMinutes(booking.start_time);
    const bookingEnd = timeToMinutes(calculateEndTime(booking.start_time, booking.estimated_duration));
    
    if (mergedBookings.length === 0) {
      mergedBookings.push({ start: booking.start_time, end: calculateEndTime(booking.start_time, booking.estimated_duration) });
      continue;
    }
    
    const lastMerged = mergedBookings[mergedBookings.length - 1];
    const lastMergedEnd = timeToMinutes(lastMerged.end);
    
    // Если записи пересекаются или соприкасаются (end == next start) - объединяем
    if (bookingStart <= lastMergedEnd) {
      // Объединяем: начало остаётся, конец становится максимумом
      const newEnd = Math.max(lastMergedEnd, bookingEnd);
      mergedBookings[mergedBookings.length - 1].end = minutesToTime(newEnd);
    } else {
      // Нет пересечения - добавляем как отдельный интервал
      mergedBookings.push({ start: booking.start_time, end: calculateEndTime(booking.start_time, booking.estimated_duration) });
    }
  }

  // === ШАГ 2: Построение свободных интервалов ===
  const freeIntervals: { start: string; end: string }[] = [];
  
  // Интервал между рабочим началом дня и первой записью
  const firstBooking = mergedBookings[0];
  if (timeToMinutes(firstBooking.start) > timeToMinutes(workingDayStart)) {
    freeIntervals.push({
      start: workingDayStart,
      end: firstBooking.start
    });
  }
  
  // Интервалы между записями
  for (let i = 1; i < mergedBookings.length; i++) {
    const prev = mergedBookings[i - 1];
    const current = mergedBookings[i];
    
    const prevEnd = timeToMinutes(prev.end);
    const currentStart = timeToMinutes(current.start);
    
    // Свободный интервал существует только если prev.end < current.start
    if (prevEnd < currentStart) {
      freeIntervals.push({
        start: prev.end,
        end: current.start
      });
    }
  }
  
  // Интервал после последней записи до конца рабочего дня
  const lastBooking = mergedBookings[mergedBookings.length - 1];
  if (timeToMinutes(lastBooking.end) < timeToMinutes(workingDayEnd)) {
    freeIntervals.push({
      start: lastBooking.end,
      end: workingDayEnd
    });
  }

  // === ШАГ 3: Генерация окон внутри свободных интервалов ===
  for (const freeInterval of freeIntervals) {
    const freeStart = timeToMinutes(freeInterval.start);
    const freeEnd = timeToMinutes(freeInterval.end);
    const freeDuration = freeEnd - freeStart;
    
    // Для каждой допустимой длительности проверяем, помещается ли она в свободный интервал
    for (const duration of allowedDurations) {
      // Ключевая проверка: окно должно полностью помещаться в свободный интервал
      if (duration <= freeDuration) {
        const slotEnd = minutesToTime(freeStart + duration);
        availableSlots.push({
          start: freeInterval.start,
          end: slotEnd,
          label: `${formatDuration(duration)}: ${freeInterval.start} - ${slotEnd}`,
          duration
        });
      }
      // Если duration > freeDuration - окно НЕ добавляем (ошибка в старой логике)
    }
  }

  return availableSlots;
}

/**
 * Определяет, активен ли заказ шиномонтажа
 * Гибридная логика: заказ активен если ЛЮБОЕ из двух условий выполнено:
 * 1. status == 'В РАБОТЕ' (ручной статус)
 * 2. ИЛИ status == 'ОЖИДАЕТ' И текущее время в интервале заказа (автоматический флаг)
 * @param booking - заказ шиномонтажа для проверки
 * @returns true если заказ активен
 */
export function isTireBookingActive(booking: { status: string; start_time: string; estimated_duration: number; booking_date: string }): boolean {
  // Если статус уже 'В РАБОТЕ' - заказ активен (ручной статус)
  if (booking.status === 'В РАБОТЕ') {
    return true;
  }
  
  // Если статус не 'ОЖИДАЕТ' - заказ не активен
  if (booking.status !== 'ОЖИДАЕТ') {
    return false;
  }
  
  // Проверяем, что заказ на сегодня и текущее время находится в интервале (автоматический флаг)
  const now = new Date();
  const today = formatDate(now);
  
  if (booking.booking_date !== today) return false;
  
  const currentMinutesTotal = now.getHours() * 60 + now.getMinutes();
  const startMinutes = timeToMinutes(booking.start_time);
  const endTime = calculateEndTime(booking.start_time, booking.estimated_duration);
  const endMinutes = timeToMinutes(endTime);
  
  return currentMinutesTotal >= startMinutes && currentMinutesTotal < endMinutes;
}
