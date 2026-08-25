/**
 * Типы сущности "Организация"
 * Соответствует таблице organizations в базе данных
 */

export interface Organization {
  id: string;
  name: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  legal_address?: string;
  payment_account?: string;
  bank_name?: string;
  correspondent_account?: string;
  bik?: string;
  contact_person?: string;
  contact_phone?: string;
  is_active: boolean;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Типы сущности "Водитель организации"
 * Соответствует таблице organization_drivers в базе данных
 */
export interface OrganizationDriver {
  id: string;
  organization_id: string;
  full_name: string;
  phone?: string;
  is_active: boolean;
  created_at: Date;
  // ✅ Поля для цифровой подписи
  signature_data?: string;           // Base64 PNG подпись водителя (мастер-копия)
  signature_updated_at?: Date;       // Дата последнего обновления подписи
}

/**
 * Типы сущности "Автомобиль организации"
 * Соответствует таблице organization_cars в базе данных
 */
export interface OrganizationCar {
  id: string;
  organization_id: string;
  car_model: string;
  plate_number: string;
  car_type: string; // ✅ Добавлено поле car_type
  is_active: boolean;
  created_at: Date;
}

/**
 * Расширенный тип для водителя с названием организации
 */
export interface OrganizationDriverWithOrg extends OrganizationDriver {
  organization_name?: string;
}

/**
 * Расширенный тип для автомобиля с названием организации
 */
export interface OrganizationCarWithOrg extends OrganizationCar {
  organization_name?: string;
}
