import { supabase } from '../supabase';
import { getServicePrice, Service } from './services';
import { CarType } from '../types/common';

/**
 * Интерфейс для услуги с количеством (для незамерзающих жидкостей)
 */
export interface ServiceWithQuantity {
  service_id: string;
  quantity: number;
  price: number;
  total: number;
}

export interface WorksheetEntry {
  id: string;
  carwash_booking_id: string | null;
  tire_booking_id: string | null;
  organization_id: string;
  driver_id: string | null;
  car_id: string | null;
  driver_name: string;
  car_model: string | null;
  plate_number: string | null;
  service_date: string;
  services_provided: any;
  total_amount: number;
  service_type: 'carwash' | 'tire' | null;
  signature_data: string | null;
  signed_at: string | null;
  created_at: string;
  car_type: string | null; // Тип автомобиля (SEDAN, CROSSOVER, JEEP, LARGE_SUV, MINIVAN)
}

/**
 * Создать запись в ведомости
 * @param data Данные для создания записи
 * @returns Созданная запись
 * @throws Error если запрос к БД не удался
 */
export async function createWorksheetEntry(data: {
  carwash_booking_id?: string;
  tire_booking_id?: string;
  organization_id: string;
  driver_id?: string;
  car_id?: string;
  driver_name: string;
  car_model?: string;
  plate_number?: string;
  service_date: string;
  services_provided: any;
  total_amount: number;
  service_type: 'carwash' | 'tire';
  signature_data?: string;
  services_with_quantities?: ServiceWithQuantity[];
  car_type?: CarType;
}): Promise<WorksheetEntry> {
  // ✅ Формируем services_provided на основе services_with_quantities
  let servicesProvided = data.services_provided;
  
  if (data.services_with_quantities && data.services_with_quantities.length > 0) {
    // Если есть услуги с количеством, формируем правильный формат для ведомости
    servicesProvided = data.services_with_quantities.map(item => ({
      name: item.service_id === 'antifreeze-org' ? 'Незамерзайка для организаций' : 
             item.service_id === 'antifreeze-umc' ? 'Незамерзайка для ЮМЦ' : 
             'Незамерзайка',
      price: item.price,
      quantity: item.quantity,
      total: item.total
    }));
  }
  
  const { data: entry, error } = await supabase
    .from('worksheet_entries')
    .insert({
      ...data,
      services_provided: servicesProvided, // ✅ Используем сформированные услуги
    })
    .select()
    .single();

  if (error) throw error;
  return entry;
}

/**
 * Получить записи ведомости по организации, типу услуги и периоду
 * @param params Параметры фильтрации
 * @returns Массив записей ведомости
 * @throws Error если запрос к БД не удался
 */
export async function getWorksheetEntries(params: {
  organization_id: string;
  service_type: 'carwash' | 'tire';
  start_date: string;
  end_date: string;
}): Promise<WorksheetEntry[]> {
  const { data, error } = await supabase
    .from('worksheet_entries')
    .select('*')
    .eq('organization_id', params.organization_id)
    .eq('service_type', params.service_type)
    .gte('service_date', params.start_date)
    .lte('service_date', params.end_date)
    .order('service_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Удалить запись из ведомости по ID заказа
 * @param bookingId ID заказа (bookings или tire_bookings)
 * @param bookingType Тип заказа ('carwash' или 'tire')
 * @throws Error если запрос к БД не удался
 */
export async function deleteWorksheetEntryByBookingId(
  bookingId: string,
  bookingType: 'carwash' | 'tire'
): Promise<void> {
  const column = bookingType === 'carwash' ? 'carwash_booking_id' : 'tire_booking_id';
  
  const { error } = await supabase
    .from('worksheet_entries')
    .delete()
    .eq(column, bookingId);

  if (error) {
    console.error(`[deleteWorksheetEntryByBookingId] Ошибка удаления записи ведомости:`, error);
    throw error;
  }
}

/**
 * Получить все активные организации
 * @returns Массив организаций
 * @throws Error если запрос к БД не удался
 */
export async function getOrganizations(): Promise<any[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * Обновить запись в ведомости по ID заказа
 * Синхронизирует услуги и сумму между bookings и worksheet_entries
 * @param bookingId ID заказа (bookings)
 * @param services Массив ID услуг
 * @param totalAmount Общая сумма
 * @param carType Тип автомобиля для расчета цен услуг
 * @param servicesWithQuantities Массив услуг с количеством (для незамерзающих жидкостей)
 * @throws Error если запрос к БД не удался
 */
export async function updateWorksheetEntryByBookingId(
  bookingId: string,
  services: string[],
  totalAmount: number,
  carType: CarType,
  servicesWithQuantities?: Array<{service_id: string; quantity: number; price: number; total: number}>
): Promise<void> {
  try {
    // Находим запись в ведомости по booking_id
    const { data: worksheetEntry, error: findError } = await supabase
      .from('worksheet_entries')
      .select('id')
      .eq('carwash_booking_id', bookingId)
      .single();

    // Если запись не найдена - silently игнорируем (не все заказы имеют ведомость)
    if (findError || !worksheetEntry) {
      console.log(`[updateWorksheetEntryByBookingId] Ведомость для заказа ${bookingId} не найдена, пропускаем`);
      return;
    }

    // Получаем данные услуг
    // Ищем по id (UUID) И service_id (строка), т.к. для незамерзайки используется service_id
    const { data: servicesData, error: servicesError } = await supabase
      .from('services')
      .select('*')
      .or(`id.in.(${services.join(',')}),service_id.in.(${services.join(',')})`);

    if (servicesError) {
      console.error('[updateWorksheetEntryByBookingId] Ошибка загрузки услуг:', servicesError);
      throw servicesError;
    }

    // ✅ Если есть services_with_quantities, используем его
    if (servicesWithQuantities && servicesWithQuantities.length > 0) {
      // Добавляем обычные услуги (без количества)
      const regularServices = services.filter(serviceId =>
        !servicesWithQuantities.some(q => q.service_id === serviceId)
      );
        
      // Получаем данные обычных услуг
      const { data: regularServicesData, error: regularServicesError } = await supabase
        .from('services')
        .select('*')
        .or(`id.in.(${regularServices.join(',')}),service_id.in.(${regularServices.join(',')})`);

      if (regularServicesError) {
        console.error('[updateWorksheetEntryByBookingId] Ошибка загрузки обычных услуг:', regularServicesError);
        throw regularServicesError;
      }

      // Формируем массив услуг для ведомости
      const servicesProvided = [
        // Услуги с количеством
        ...servicesWithQuantities.map(item => ({
          name: item.service_id === 'antifreeze-org' ? 'Незамерзайка для организаций' : item.service_id === 'antifreeze-umc' ? 'Незамерзайка для ЮМЦ' : 'Незамерзайка',
          price: item.price,
          quantity: item.quantity,
          total: item.total
        })),
        // Обычные услуги
        ...(regularServicesData || []).map((service: Service) => ({
          name: service.name,
          price: getServicePrice(service, carType)
        }))
      ];

      // Обновляем запись в ведомости
      const { error: updateError } = await supabase
        .from('worksheet_entries')
        .update({
          car_type: carType,
          services_provided: servicesProvided,
          total_amount: totalAmount
        })
        .eq('id', worksheetEntry.id);

      if (updateError) {
        console.error('[updateWorksheetEntryByBookingId] Ошибка обновления ведомости:', updateError);
        throw updateError;
      }

      console.log(`[updateWorksheetEntryByBookingId] Ведомость для заказа ${bookingId} обновлена успешно`);
      return;
    }

    // ✅ Fallback для старых заказов (без количества)
    // Преобразуем услуги в формат {name, price}
    // Для незамерзающих услуг используем базовую цену (не зависит от типа авто)
    const servicesProvided = (servicesData || []).map((service: Service) => {
      const isAntifreeze = ['antifreeze-org', 'antifreeze-umc'].includes(service.service_id);
      const price = isAntifreeze
        ? Number(service.price_sedan) // Используем базовую цену для незамерзайки
        : getServicePrice(service, carType);
        
      return {
        name: service.name,
        price: price
      };
    });

    // Обновляем запись в ведомости
    const { error: updateError } = await supabase
      .from('worksheet_entries')
      .update({
        car_type: carType, // Синхронизируем тип авто
        services_provided: servicesProvided,
        total_amount: totalAmount
      })
      .eq('id', worksheetEntry.id);

    if (updateError) {
      console.error('[updateWorksheetEntryByBookingId] Ошибка обновления ведомости:', updateError);
      throw updateError;
    }

    console.log(`[updateWorksheetEntryByBookingId] Ведомость для заказа ${bookingId} обновлена успешно`);
  } catch (error) {
    console.error('[updateWorksheetEntryByBookingId] Ошибка:', error);
    // Не выбрасываем ошибку, чтобы не прерывать основной поток
  }
}

/**
 * Обновить запись в ведомости по ID заказа шиномонтажа
 * Синхронизирует услуги и сумму между tire_bookings и worksheet_entries
 * @param bookingId ID заказа (tire_bookings)
 * @param services Массив услуг в формате [{service_id, name, quantity, price, total}]
 * @param totalAmount Общая сумма
 * @throws Error если запрос к БД не удался
 */
export async function updateWorksheetEntryByTireBookingId(
  bookingId: string,
  services: Array<{ service_id: string; name: string; quantity: number; price: number; total: number }>,
  totalAmount: number
): Promise<void> {
  try {
    // Находим запись в ведомости по tire_booking_id
    const { data: worksheetEntry, error: findError } = await supabase
      .from('worksheet_entries')
      .select('id')
      .eq('tire_booking_id', bookingId)
      .single();

    // Если запись не найдена - silently игнорируем (не все заказы имеют ведомость)
    if (findError || !worksheetEntry) {
      console.log(`[updateWorksheetEntryByTireBookingId] Ведомость для заказа ${bookingId} не найдена, пропускаем`);
      return;
    }

    // Обновляем запись в ведомости
    // Услуги уже в правильном формате JSONB, просто копируем
    const { error: updateError } = await supabase
      .from('worksheet_entries')
      .update({
        services_provided: services,
        total_amount: totalAmount
      })
      .eq('id', worksheetEntry.id);

    if (updateError) {
      console.error('[updateWorksheetEntryByTireBookingId] Ошибка обновления ведомости:', updateError);
      throw updateError;
    }

    console.log(`[updateWorksheetEntryByTireBookingId] Ведомость для заказа ${bookingId} обновлена успешно`);
  } catch (error) {
    console.error('[updateWorksheetEntryByTireBookingId] Ошибка:', error);
    // Не выбрасываем ошибку, чтобы не прерывать основной поток
  }
}
