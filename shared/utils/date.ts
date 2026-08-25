/**
 * Утилиты для работы с датами
 */

// ISO формат для хранения: "2024-11-12" (использует локальное время)
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Отображение в dropdown: "12 ноября"
export const formatDateLabel = (date: Date): string => {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

// Добавить дни к дате
export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Получить текущий час
export const getCurrentHour = (): number => {
  return new Date().getHours();
};

// Проверить, является ли дата сегодняшней
export const isToday = (date: string): boolean => {
  const today = formatDate(new Date());
  return date === today;
};
