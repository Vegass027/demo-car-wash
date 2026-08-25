/**
 * Конфигурация категорий услуг для автомойки
 * Используется для группировки услуг в мастере создания заказа
 */

export type ServiceCategory = 
  | 'main-wash'
  | 'salon-cleaning'
  | 'tech-wash'
  | 'polish-protection'
  | 'engine-care'
  | 'additional';

export interface ServiceCategoryConfig {
  id: ServiceCategory;
  label: string;
  icon: string;
  services: string[]; // service_id из БД
}

export const SERVICE_CATEGORIES: Record<ServiceCategory, ServiceCategoryConfig> = {
  'main-wash': {
    id: 'main-wash',
    label: 'Основные услуги мойки',
    icon: '🚗',
    services: ['body-wash', 'full-wash']
  },
  'salon-cleaning': {
    id: 'salon-cleaning',
    label: 'Уборка салона',
    icon: '🧹',
    services: [
      'salon-vacuum',
      'salon-vacuum-only',
      'salon-wet-cleaning',
      'trunk-clean',
      'rubber-mats-wash',
      'textile-mats-shampoo',
      'rubber-mats-wash-1pc',  // Мойка резиновых ковриков (1шт)
      'textile-mats-shampoo-1pc',  // Мойка ворсовых ковр. с шампунем (1шт)
      'full-dry-clean',      // Химчистка всех сидений
      'salon-dry-clean'      // Химчистка салона
    ]
  },
  'tech-wash': {
    id: 'tech-wash',
    label: 'Техническая мойка',
    icon: '🔧',
    services: ['tech-wash-no-wipe', 'tech-wash-with-wipe']
  },
  'polish-protection': {
    id: 'polish-protection',
    label: 'Полировка и защита',
    icon: '✨',
    services: [
      'plastic-polish',
      'panel-plastic-polish',
      'rubber-blackening',
      'wax-coating',
      'nano-wax'
    ]
  },
  'engine-care': {
    id: 'engine-care',
    label: 'Уход за двигателем',
    icon: '🔥',
    services: ['engine-wash-start', 'engine-wash-no-start']
  },
  'additional': {
    id: 'additional',
    label: 'Дополнительные услуги',
    icon: '🎁',
    services: [
      'stain-removal',
      'headlight-clean',
      'silicone-rubber',
      'air-conditioning',
      'glass-clean',
      'wheel-clean',
      'antifreeze-org',  // Незамерзайка для организаций
      'antifreeze-umc',  // Незамерзайка для ЮМЦ
      // Тестовые услуги для СБП
      'test_sbp_wash',
      'test_sbp_wax',
      'test_sbp_polish'
    ]
  }
};

/**
 * Получить категорию услуги по service_id
 */
export function getServiceCategory(serviceId: string): ServiceCategory | null {
  for (const category of Object.values(SERVICE_CATEGORIES)) {
    if (category.services.includes(serviceId)) {
      return category.id;
    }
  }
  return null;
}

/**
 * Проверить, является ли услуга бонусной (для клиентов)
 */
export function isBonusService(serviceId: string): boolean {
  return serviceId === 'free-body-wash';
}
