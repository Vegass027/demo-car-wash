/**
 * Конфигурация для записей на шиномонтаж
 */

/**
 * Опции быстрого выбора длительности заказа
 */
export const DURATION_OPTIONS = [
  { label: '30 мин', minutes: 30 },
  { label: '1 час', minutes: 60 },
  { label: '1.5 ч', minutes: 90 },
  { label: '2 часа', minutes: 120 },
] as const;

export type DurationOption = typeof DURATION_OPTIONS[number];
