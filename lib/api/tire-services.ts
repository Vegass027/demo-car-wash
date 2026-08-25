import { supabase } from '../supabase';

/**
 * Интерфейс услуги шиномонтажа
 * Соответствует таблице tire_services в базе данных
 */
export interface TireService {
  id: string;                    // UUID
  category: string;              // Категория: ШИНОМОНТАЖ, БАЛАНСИРОВКА, РЕМОНТ, ПЕРЕКАТ, КОНДИЦИОНЕР, ДОПОЛНИТЕЛЬНЫЕ и т.д.
  name: string;                  // Название услуги
  price: number;                 // Цена за 1 единицу (1 колесо, 1 прокол и т.д.)
  description?: string;          // Описание услуги (опционально)
  is_active: boolean;            // Активна ли услуга
  is_custom_price?: boolean;     // Услуга с произвольной ценой (для "ПРОЧЕЕ")
  created_at: string;            // TIMESTAMP
}

/**
 * Получить все активные услуги шиномонтажа
 * @returns Массив активных услуг, отсортированных по категории
 * @throws Error если запрос к базе данных не удался
 */
export async function getTireServices(): Promise<TireService[]> {
  const { data, error } = await supabase
    .from('tire_services')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true });

  if (error) {
    console.error('[TireServices] Ошибка при получении услуг:', error);
    throw new Error(`Не удалось получить услуги шиномонтажа: ${error.message}`);
  }

  return data as TireService[];
}

/**
 * Получить услуги шиномонтажа по категории
 * @param category - Категория услуги (ШИНОМОНТАЖ, БАЛАНСИРОВКА и т.д.)
 * @returns Массив активных услуг указанной категории
 * @throws Error если запрос к базе данных не удался
 */
export async function getTireServicesByCategory(
  category: string
): Promise<TireService[]> {
  const { data, error } = await supabase
    .from('tire_services')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('[TireServices] Ошибка при получении услуг категории:', category, error);
    throw new Error(`Не удалось получить услуги категории "${category}": ${error.message}`);
  }

  return data as TireService[];
}

/**
 * Получить услугу по ID
 * @param id - UUID услуги
 * @returns Услуга или null если не найдена
 * @throws Error если запрос к базе данных не удался
 */
export async function getTireServiceById(id: string): Promise<TireService | null> {
  const { data, error } = await supabase
    .from('tire_services')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Запись не найдена
      return null;
    }
    console.error('[TireServices] Ошибка при получении услуги по ID:', id, error);
    throw new Error(`Не удалось получить услугу: ${error.message}`);
  }

  return data as TireService;
}

/**
 * Сгруппировать услуги по категориям
 * Используется для отображения услуг блоками по категориям в UI
 * @param services - Массив услуг
 * @returns Объект с категориями в качестве ключей и массивами услуг в качестве значений
 *
 * @example
 * const grouped = groupServicesByCategory(services);
 * // {
 * //   "ШИНОМОНТАЖ": [service1, service2],
 * //   "БАЛАНСИРОВКА": [service3, service4],
 * //   "РЕМОНТ": [service5]
 * // }
 */
export function groupServicesByCategory(
  services: TireService[]
): Record<string, TireService[]> {
  return services.reduce((acc, service) => {
    if (!acc[service.category]) {
      acc[service.category] = [];
    }
    acc[service.category].push(service);
    return acc;
  }, {} as Record<string, TireService[]>);
}
