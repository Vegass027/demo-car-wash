/**
 * Конфигурация цветов для графиков и визуализаций
 * Единый цветовой стиль для всех графиков приложения
 */

export const CHART_COLORS = {
  // Финансовые показатели
  income: '#22c55e',        // Зеленый - доходы
  expense: '#ef4444',       // Красный - расходы
  profit: '#10b981',        // Изумрудный - прибыль
  loss: '#dc2626',          // Темно-красный - убыток

  // Типы оплаты
  cash: '#22c55e',          // Зеленый - наличные
  card: '#3b82f6',          // Синий - безнал (карта)
  transfer: '#8b5cf6',      // Фиолетовый - переводы (СБП)

  // Услуги
  carwash: '#3b82f6',       // Синий - автомойка
  tire: '#f59e0b',          // Оранжевый - шиномонтаж

  // Категории расходов
  tea: '#f59e0b',           // Оранжевый - чай/кофе
  repair: '#ef4444',        // Красный - ремонт
  utilities: '#8b5cf6',     // Фиолетовый - коммуналка
  stationery: '#3b82f6',    // Синий - канцелярия
  other: '#6b7280',         // Серый - прочее

  // Роли сотрудников
  worker: '#3b82f6',        // Синий - мойщик
  technician: '#f59e0b',    // Оранжевый - шиномонтажник
  admin: '#8b5cf6',         // Фиолетовый - админ
} as const;

/**
 * Получить цвет по типу оплаты
 */
export const getPaymentMethodColor = (method: string): string => {
  switch (method) {
    case 'Наличный':
      return CHART_COLORS.cash;
    case 'Безналичный':
      return CHART_COLORS.card;
    case 'Перевод':
      return CHART_COLORS.transfer;
    default:
      return CHART_COLORS.other;
  }
};

/**
 * Получить цвет по категории расхода
 */
export const getExpenseCategoryColor = (category: string): string => {
  switch (category) {
    case 'tea':
      return CHART_COLORS.tea;
    case 'repair':
      return CHART_COLORS.repair;
    case 'utilities':
      return CHART_COLORS.utilities;
    case 'stationery':
      return CHART_COLORS.stationery;
    case 'other':
      return CHART_COLORS.other;
    default:
      return CHART_COLORS.other;
  }
};

/**
 * Получить цвет по роли сотрудника
 */
export const getRoleColor = (role: string): string => {
  switch (role) {
    case 'worker':
      return CHART_COLORS.worker;
    case 'technician':
      return CHART_COLORS.technician;
    case 'admin':
      return CHART_COLORS.admin;
    default:
      return CHART_COLORS.other;
  }
};
