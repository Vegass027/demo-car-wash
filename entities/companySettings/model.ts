/**
 * Юридические данные компании для генерации документов (счета, акты)
 */
export interface CompanySettings {
  id: string;
  
  // Основная информация
  legal_form: string; // 'ИП', 'ООО', 'АО'
  full_legal_name: string; // Полное юридическое наименование как в ЕГРЮЛ/ЕГРИП
  short_name: string | null; // Краткое наименование для удобства
  
  // Налоговые реквизиты
  inn: string; // ИНН
  kpp: string | null; // КПП (для ООО/АО, у ИП пусто)
  ogrn: string; // ОГРН/ОГРНИП
  
  // Адреса
  legal_address: string; // Юридический адрес
  actual_address: string | null; // Фактический адрес
  
  // Банковские реквизиты
  bank_name: string; // Название банка
  bik: string; // БИК
  correspondent_account: string; // Корреспондентский счет банка
  payment_account: string; // Расчетный счет компании
  
  // Руководитель и бухгалтер
  director_name: string; // ФИО руководителя
  director_position: string | null; // Должность
  accountant_name: string | null; // ФИО бухгалтера
  
  // НДС
  is_vat_payer: boolean; // Плательщик НДС (true/false)
  
  // Контакты (опционально)
  phone: string | null;
  email: string | null;
  website: string | null;
  
  // Системные поля
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Данные для создания/обновления юридических данных
 */
export interface CompanySettingsInput {
  legal_form: string;
  full_legal_name: string;
  short_name?: string;
  inn: string;
  kpp?: string;
  ogrn: string;
  legal_address: string;
  actual_address?: string;
  bank_name: string;
  bik: string;
  correspondent_account: string;
  payment_account: string;
  director_name: string;
  director_position?: string;
  accountant_name?: string;
  is_vat_payer: boolean;
  phone?: string;
  email?: string;
  website?: string;
}
