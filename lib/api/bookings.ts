import { supabase } from '../supabase';
import { getServicePrice, Service } from './services';
import { CarType } from '../types/common';
import { getDriverSignature } from './organizations';
import { normalizePhoneNumber } from '../../shared/utils/phone';
import { updateWorksheetEntryByBookingId } from './worksheets';

export type BookingSource = 'admin' | 'online';

/**
 * Интерфейс для создания онлайн-записи (с поддержкой организационных машин)
 */
export interface OnlineBookingInput {
  client_name: string;
  phone?: string;
  car_model: string;
  plate_number: string;
  car_type: string;
  services: string[];
  price: number;
  payment_method?: string;
  status: string;
  booking_date: string;
  start_time?: string;
  end_time?: string;
  box_number?: number;
  worker_id?: string;
  worker_name?: string;
  working_mode?: string;
  is_org: boolean;
  organization_id?: string;
  driver_id?: string;
  car_id?: string;
  org_name?: string;
  client_id?: string;
  client_car_id?: string;
  signature_obtained: boolean;
  signed_at?: string;
  is_quick_booking: boolean;
  completed_at?: string;
  cancel_comment?: string;
  signature_data?: string;
  signature_obtained_at?: string;
  is_paid: boolean;
  paid_at?: string;
  booking_source?: BookingSource;
  created_by_profile_id?: string;
}

export interface Booking {
  id: string;
  client_name: string;
  phone?: string;
  car_model: string;
  plate_number: string;
  car_type: string;
  services: string[];
  price: number;
  payment_method?: string;
  status: string;
  booking_date: string;
  start_time?: string;
  end_time?: string;
  box_number?: number;
  worker_id?: string;
  worker_name?: string;              // Кэшированное имя мойщика для быстрого отображения в истории заказов
  worker_id_2?: string;             // Второй мойщик при работе в паре
  worker_name_2?: string;           // Имя второго мойщика
  working_mode?: string;
  working_mode_at_completion?: string;
  is_org: boolean;
  organization_id?: string;
  driver_id?: string;
  car_id?: string;
  org_name?: string;

  // ✅ Новые поля для физлиц
  client_id?: string;
  client_car_id?: string;

  signature_obtained: boolean;
  signed_at?: string;
  is_quick_booking: boolean;
  completed_at?: string;
  cancel_comment?: string;
  created_at: string;
  updated_at: string;

  // ✅ Поля для цифровой подписи водителя (snapshot при создании заказа)
  signature_data?: string;           // Snapshot подписи водителя при создании заказа (неизменяемый)
  signature_obtained_at?: string;    // Дата копирования подписи из профиля водителя

  // ✅ Поля для отслеживания оплаты
  is_paid: boolean;
  paid_at?: string;

  // ✅ Поля для отслеживания фактического времени работы
  work_start_time?: string;  // Фактическое время начала работы (при нажатии "В работу")
  work_end_time?: string;    // Фактическое время окончания работы (при статусе "ГОТОВО")

  // ✅ Новые поля для онлайн-записи
  booking_source: BookingSource;
  created_by_profile_id?: string;

  // ✅ Скидка
  discount: number;

  // ✅ Новое поле для услуг с количеством (только для незамерзающих жидкостей)
  services_with_quantities?: Array<{
    service_id: string;
    quantity: number;
    price: number;
    total: number;
    /**
     * Issue 16 — list-priced unit price set by the server at create time
     * (see migration 044 + api/_lib/booking-services.ts:recomputeBookingServices).
     * Used by calculateWorkerEarnings and calculateOrderEarnings as the
     * commission basis. Optional for backward compat with legacy rows.
     */
    nominal_unit_price?: number | null;
  }>;
}

/**
 * Получить заказы по дате (только обычные заказы, без быстрых)
 * Быстрые заказы (is_quick_booking=true) получаются через getQuickBookings()
 */
export async function getBookingsByDate(date: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_date', date)
    .eq('is_quick_booking', false)
    .order('start_time', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data as Booking[];
}

/**
 * Получить быстрые заказы по дате
 */
export async function getQuickBookings(date: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('is_quick_booking', true)
    .eq('booking_date', date)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Booking[];
}

/**
 * Получить завершенные заказы за дату (для Итогового отчёта)
 * Фильтрация на уровне БД для оптимизации
 */
export async function getCompletedBookingsByDate(date: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', 'ГОТОВО')
    .eq('booking_date', date)
    .order('start_time', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data as Booking[];
}

/**
 * Создать новый заказ
 * Если передан driver_id, автоматически копирует подпись из профиля водителя
 */
export async function createBooking(
  booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>
): Promise<Booking> {
  // ✅ Проверяем закрытость бокса перед созданием заказа
  if (booking.box_number && booking.booking_date && booking.start_time) {
    const { data: closedBox } = await supabase
      .from('closed_boxes')
      .select('*')
      .eq('box_number', booking.box_number)
      .eq('closed_date', booking.booking_date)
      .eq('is_closed', true)
      .single();
    
    if (closedBox) {
      const bookingHour = parseInt(booking.start_time.split(':')[0]);
      const openHours = closedBox.open_hours || [];
      
      // Если бокс закрыт и этот час не в списке открытых
      if (!openHours.includes(bookingHour)) {
        throw new Error(`Бокс ${booking.box_number} закрыт на ${bookingHour}:00`);
      }
    }
  }

  // ✅ Проверяем, свободен ли бокс на это время (защита от дублей)
  if (booking.box_number && booking.booking_date && booking.start_time) {
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id, client_name, car_model, plate_number')
      .eq('box_number', booking.box_number)
      .eq('booking_date', booking.booking_date)
      .eq('start_time', booking.start_time)
      .not('status', 'in', '("ОТМЕНЕНО","ГОТОВО")')
      .maybeSingle();
    
    if (existingBooking) {
      const existingClient = existingBooking.client_name;
      const existingCar = `${existingBooking.car_model} ${existingBooking.plate_number}`;
      const timeStr = booking.start_time.slice(0, 5);
      throw new Error(`Бокс ${booking.box_number} уже занят на ${timeStr} клиентом: ${existingClient} (${existingCar}). Выберите другой бокс или время.`);
    }
  }

  // ✅ Если это заказ от организации с водителем, копируем подпись из профиля водителя
  let bookingToInsert = { ...booking };

  // ✅ Нормализуем телефон
  if (booking.phone) {
    bookingToInsert.phone = normalizePhoneNumber(booking.phone);
  }

  // ✅ Если есть organization_id, но нет org_name - заполнить из БД
  if (bookingToInsert.organization_id && !bookingToInsert.org_name) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', bookingToInsert.organization_id)
      .single();

    if (org) {
      bookingToInsert.org_name = org.name;
    }
  }

  if (booking.driver_id && booking.is_org) {
    const driverSignature = await getDriverSignature(booking.driver_id);

    if (driverSignature) {
      bookingToInsert = {
        ...bookingToInsert,
        signature_data: driverSignature,
        signature_obtained_at: new Date().toISOString()
      };
    }
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert([bookingToInsert])
    .select()
    .single();

  if (error) throw error;
  return data as Booking;
}

/**
 * Обновить заказ
 */
export async function updateBooking(
  id: string,
  updates: Partial<Booking>
): Promise<Booking> {
  // ✅ Нормализуем телефон если он есть
  const updatesToApply = { ...updates };
  if (updates.phone) {
    updatesToApply.phone = normalizePhoneNumber(updates.phone);
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({
      ...updatesToApply,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Booking;
}

/**
 * Обновить статус заказа
 */
export async function updateBookingStatus(
  id: string,
  status: string
): Promise<Booking> {
  return updateBooking(id, { status });
}

/**
 * Рассчитать общую стоимость заказа на основе услуг и типа авто
 * Учитывает количество услуг из services_with_quantities (для незамерзающих жидкостей)
 */
function calculateBookingPrice(
  services: string[],
  allServices: Service[],
  carType: CarType,
  servicesWithQuantities?: Array<{service_id: string; quantity: number; price: number; total: number}>
): number {
  // ✅ Сначала проверяем services_with_quantities (для новых заказов)
  if (servicesWithQuantities && servicesWithQuantities.length > 0) {
    // Для услуг с количеством используем total (уже учитывает quantity)
    const quantifiedServicesTotal = servicesWithQuantities.reduce((sum, item) => sum + item.total, 0);

    // Добавляем обычные услуги (без количества) - используем allServices только для них
    const regularServices = services.filter(serviceId =>
      !servicesWithQuantities.some(q => q.service_id === serviceId)
    );

    // Если есть обычные услуги, используем allServices
    if (regularServices.length > 0 && allServices.length > 0) {
      const regularServicesTotal = regularServices.reduce((total, serviceId) => {
        const service = allServices.find(s => s.id === serviceId || s.service_id === serviceId);
        if (!service) return total;

        const price = getServicePrice(service, carType);
        return total + price;
      }, 0);

      return quantifiedServicesTotal + regularServicesTotal;
    }

    // Если только услуги с количеством - возвращаем их сумму
    return quantifiedServicesTotal;
  }

  // ✅ Fallback для старых заказов (без количества)
  if (allServices.length > 0) {
    return services.reduce((total, serviceId) => {
      // Ищем услугу по обоим полям: id (UUID) И service_id (строка)
      // Для обычных услуг хранится UUID (id), для незамерзайки - service_id
      const service = allServices.find(s => s.id === serviceId || s.service_id === serviceId);
      if (!service) return total;

      // Для незамерзающих услуг цена не зависит от типа авто
      const isAntifreeze = ['antifreeze-org', 'antifreeze-umc'].includes(service.service_id);
      const price = isAntifreeze
        ? Number(service.price_sedan) // Используем базовую цену для незамерзайки
        : getServicePrice(service, carType);

      return total + price;
    }, 0);
  }

  // Если нет данных о ценах - возвращаем 0
  return 0;
}

/**
 * Добавить несколько услуг к заказу за один раз
 * @param discount Сумма скидки (вычитается из текущей цены заказа и сохраняется в БД)
 */
export async function addServicesToBooking(
  id: string,
  serviceIds: string[],
  currentServices: string[],
  allServices: Service[],
  carType: CarType,
  discount: number = 0
): Promise<Booking> {
  const newServices = [...currentServices, ...serviceIds];
  
  // ✅ Получаем текущее services_with_quantities
  const { data: currentBooking } = await supabase
    .from('bookings')
    .select('services_with_quantities')
    .eq('id', id)
    .single();
  
  const currentQuantities = currentBooking?.services_with_quantities || [];
  
  // ✅ Добавляем количество для незамерзающих жидкостей
  const newQuantities = [...currentQuantities];
  for (const serviceId of serviceIds) {
    if (['antifreeze-org', 'antifreeze-umc'].includes(serviceId) && !newQuantities.some(q => q.service_id === serviceId)) {
      const service = allServices.find(s => s.id === serviceId || s.service_id === serviceId);
      if (service) {
        const price = Number(service.price_sedan);
        newQuantities.push({
          service_id: serviceId,
          quantity: 1,
          price: price,
          total: price
        });
      }
    }
  }
  
  const newPrice = calculateBookingPrice(newServices, allServices, carType, newQuantities);
  const finalPrice = Math.max(0, newPrice - discount);

  // Сохраняем услуги, финальную цену, скидку и количества
  const updatedBooking = await updateBooking(id, {
    services: newServices,
    price: finalPrice,
    discount: discount,
    services_with_quantities: newQuantities
  });

  // Синхронизируем с ведомостью
  await updateWorksheetEntryByBookingId(id, newServices, finalPrice, carType, newQuantities);

  return updatedBooking;
}

/**
 * Удалить услугу из заказа
 */
export async function removeServiceFromBooking(
  id: string,
  serviceId: string,
  currentServices: string[],
  allServices: Service[],
  carType: CarType
): Promise<Booking> {
  const newServices = currentServices.filter(s => s !== serviceId);
  
  // ✅ Получаем текущее services_with_quantities и скидку
  const { data: currentBooking } = await supabase
    .from('bookings')
    .select('services_with_quantities, discount')
    .eq('id', id)
    .single();
  
  const currentQuantities = currentBooking?.services_with_quantities || [];
  const newQuantities = currentQuantities.filter(q => q.service_id !== serviceId);
  
  const newPrice = calculateBookingPrice(newServices, allServices, carType, newQuantities);
  const discount = currentBooking?.discount || 0;
  const finalPrice = Math.max(0, newPrice - discount);

  const updatedBooking = await updateBooking(id, {
    services: newServices,
    price: finalPrice,
    services_with_quantities: newQuantities
  });

  // Синхронизируем с ведомостью
  await updateWorksheetEntryByBookingId(id, newServices, finalPrice, carType, newQuantities);

  return updatedBooking;
}

/**
 * Отменить заказ
 */
export async function cancelBooking(id: string): Promise<Booking> {
  // ✅ Удаляем запись из ведомости перед отменой
  try {
    const { deleteWorksheetEntryByBookingId } = await import('./worksheets');
    await deleteWorksheetEntryByBookingId(id, 'carwash');
  } catch (error) {
    console.error('[cancelBooking] Ошибка удаления записи ведомости:', error);
    // Не прерываем отмену заказа
  }

  return updateBooking(id, { status: 'ОТМЕНЕНО' });
}

/**
 * Отметить как готовый (idempotent)
 * Проверяет что заказ оплачен перед завершением
 * Если заказ уже завершен - просто возвращает его без ошибки
 */
export async function markAsReady(id: string): Promise<Booking> {
  // ✅ ПРОВЕРКА: заказ оплачен?
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, is_paid')
    .eq('id', id)
    .single();

  if (!booking) {
    throw new Error('Заказ не найден');
  }

  // ✅ ПРОВЕРКА: заказ уже завершен?
  if (booking.status === 'ГОТОВО') {
    return booking as Booking; // Уже завершен — просто возвращаем
  }

  // ✅ ПРОВЕРКА: заказ оплачен?
  if (!booking.is_paid) {
    throw new Error('Сначала отметьте заказ как оплаченный');
  }

  return updateBooking(id, {
    status: 'ГОТОВО',
    completed_at: new Date().toISOString(),
    work_end_time: new Date().toISOString()
  });
}

/**
 * Начать работу
 */
export async function startWork(id: string): Promise<Booking> {
  return updateBooking(id, {
    status: 'В РАБОТЕ',
    work_start_time: new Date().toISOString()
  });
}

/**
 * Отметить как оплаченный (idempotent)
 * Если заказ уже оплачен - просто возвращает его без ошибки
 */
export async function markAsPaid(id: string): Promise<Booking> {
  // ✅ ПРОВЕРКА: заказ уже оплачен?
  const { data: booking } = await supabase
    .from('bookings')
    .select('is_paid, paid_at')
    .eq('id', id)
    .single();

  if (!booking) {
    throw new Error('Заказ не найден');
  }

  if (booking.is_paid) {
    // ✅ Уже оплачен — просто возвращаем, без ошибки
    return booking as Booking;
  }

  return updateBooking(id, {
    is_paid: true,
    paid_at: new Date().toISOString()
  });
}

/**
 * Обновить способ оплаты
 */
export async function updatePaymentMethod(
  id: string,
  paymentMethod: string
): Promise<Booking> {
  return updateBooking(id, { payment_method: paymentMethod });
}

/**
 * Назначить мойщика(ов) на заказ
 * Если мойщик работает в паре - назначает обоих мойщиков
 */
export async function assignWorkerToBooking(
  bookingId: string,
  workerId: string,
  workerName: string,
  workerMode: 'solo' | 'pair',
  partnerId?: string,
  partnerName?: string
): Promise<Booking> {
  const updates: Partial<Booking> = {
    worker_id: workerId,
    worker_name: workerName,
    working_mode: workerMode
  };

  // ✅ Если это пара - добавляем второго мойщика
  if (workerMode === 'pair' && partnerId && partnerName) {
    updates.worker_id_2 = partnerId;
    updates.worker_name_2 = partnerName;
  } else {
    // ✅ Если это solo - очищаем второго мойщика
    updates.worker_id_2 = null;
    updates.worker_name_2 = null;
  }

  return updateBooking(bookingId, updates);
}

/**
 * Создать онлайн-запись на автомойку
 */
export async function createOnlineBooking(
  booking: OnlineBookingInput
): Promise<Booking> {
  // ✅ ПРОВЕРКА: машина уже записана на это время?
  // Уникальный индекс idx_bookings_unique_client_slot использует (client_car_id, booking_date, start_time)
  // Одна машина не может быть записана на одно время дважды, даже на разных боксах
  if (booking.client_car_id && booking.booking_date && booking.start_time) {
    // .maybeSingle() — no PGRST116 noise in console when no duplicate exists.
    // Functionality unchanged: existingBooking is null in that case, code proceeds.
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id, box_number, status')
      .eq('client_car_id', booking.client_car_id)
      .eq('booking_date', booking.booking_date)
      .eq('start_time', booking.start_time)
      .not('status', 'in', '("ОТМЕНЕНО","ГОТОВО")')
      .maybeSingle();

    if (existingBooking) {
      throw new Error(`Эта машина уже записана на ${booking.start_time.slice(0, 5)} на боксе ${existingBooking.box_number}`);
    }
  }

  let bookingToInsert = {
    ...booking,
    booking_source: booking.booking_source || 'online',
    is_quick_booking: false,
    signature_obtained: false
  };

  // ✅ Нормализуем телефон
  if (booking.phone) {
    bookingToInsert.phone = normalizePhoneNumber(booking.phone);
  }

  // ✅ Определяем тип машины и устанавливаем правильные поля
  const isOrgCar = booking.car_id && !booking.client_car_id;
  
  if (isOrgCar) {
    // ✅ Организационная машина
    bookingToInsert.is_org = true;
    bookingToInsert.car_id = booking.car_id;
    bookingToInsert.client_car_id = undefined;
    bookingToInsert.organization_id = booking.organization_id;
  } else if (booking.client_car_id && !booking.car_id) {
    // ✅ Личная машина
    bookingToInsert.is_org = false;
    bookingToInsert.client_car_id = booking.client_car_id;
    bookingToInsert.car_id = undefined;
    bookingToInsert.organization_id = undefined;
  }

  // ✅ Если есть organization_id, но нет org_name - заполнить из БД
  if (bookingToInsert.organization_id && !bookingToInsert.org_name) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', bookingToInsert.organization_id)
      .single();

    if (org) {
      bookingToInsert.org_name = org.name;
    }
  }

  // ✅ Если это заказ от организации с водителем, копируем подпись из профиля водителя
  if (isOrgCar && booking.driver_id) {
    const driverSignature = await getDriverSignature(booking.driver_id);

    if (driverSignature) {
      bookingToInsert = {
        ...bookingToInsert,
        signature_data: driverSignature,
        signature_obtained_at: new Date().toISOString()
      };
    }
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert([bookingToInsert])
    .select()
    .single();

  if (error) throw error;
  return data as Booking;
}

/**
 * Получить записи клиента по profile_id
 */
export async function getBookingsByProfileId(profileId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('created_by_profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching bookings by profile_id:', error);
    return [];
  }

  return data as Booking[];
}

/**
 * Получить все записи клиента (личные + организационные) по profile_id и телефону
 * Ищет записи:
 * 1. По created_by_profile_id (личные записи, созданные клиентом)
 * 2. По driver_id (записи организации, где клиент является водителем)
 *
 * @param profileId - ID профиля клиента
 * @param profilePhone - Телефон профиля (для поиска driver_id)
 */
export async function getAllBookingsForClient(
  profileId: string,
  profilePhone?: string
): Promise<Booking[]> {
  console.log('[getAllBookingsForClient] profileId:', profileId, 'phone:', profilePhone);
  
  // 1. Получаем личные записи клиента
  const { data: personalBookings, error: personalError } = await supabase
    .from('bookings')
    .select('*')
    .eq('created_by_profile_id', profileId);

  if (personalError) {
    console.error('Error fetching personal bookings:', personalError);
  }

  console.log('[getAllBookingsForClient] Личных записей:', personalBookings?.length || 0);

  // Если телефон не передан, возвращаем только личные записи
  if (!profilePhone) {
    return (personalBookings || []) as Booking[];
  }

  // 2. Находим driver_id по телефону
  const normalizedPhone = normalizePhoneNumber(profilePhone);
  const { data: driver, error: driverError } = await supabase
    .from('organization_drivers')
    .select('id')
    .eq('phone', normalizedPhone)
    .eq('is_active', true)
    .single();

  if (driverError || !driver) {
    // Водитель не найден - возвращаем только личные записи
    console.log('[getAllBookingsForClient] Водитель не найден для телефона:', normalizedPhone);
    return (personalBookings || []) as Booking[];
  }

  console.log('[getAllBookingsForClient] Найден водитель:', driver.id);

  // 3. Получаем записи организации для этого водителя
  const { data: orgBookings, error: orgError } = await supabase
    .from('bookings')
    .select('*')
    .eq('driver_id', driver.id);

  if (orgError) {
    console.error('Error fetching organization bookings:', orgError);
  }

  console.log('[getAllBookingsForClient] Организационных записей:', orgBookings?.length || 0);

  // 4. Объединяем и убираем дубликаты
  const allBookings = [...(personalBookings || []), ...(orgBookings || [])];
  const uniqueBookings = allBookings.filter((booking, index, self) =>
    index === self.findIndex(b => b.id === booking.id)
  );

  // 5. Сортируем по дате создания
  uniqueBookings.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  console.log('[getAllBookingsForClient] Итого уникальных записей:', uniqueBookings.length);

  return uniqueBookings as Booking[];
}

/**
 * Получить ID организаций, где клиент является водителем
 * @param profilePhone - Телефон профиля клиента
 * @returns Массив ID организаций
 */
export async function getClientOrganizationIds(profilePhone: string): Promise<string[]> {
  const normalizedPhone = normalizePhoneNumber(profilePhone);
  
  const { data: drivers, error } = await supabase
    .from('organization_drivers')
    .select('organization_id')
    .eq('phone', normalizedPhone)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching client organizations:', error);
    return [];
  }

  return (drivers || []).map(d => d.organization_id);
}

/**
 * Получить записи клиента по profile_id с фильтрацией по дате
 */
export async function getBookingsByProfileIdAndDate(
  profileId: string,
  date: string
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('created_by_profile_id', profileId)
    .eq('booking_date', date)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching bookings by profile_id and date:', error);
    return [];
  }

  return data as Booking[];
}

/**
 * Получить записи по источнику (admin или online)
 */
export async function getBookingsBySource(source: BookingSource): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_source', source)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching bookings by source:', error);
    return [];
  }

  return data as Booking[];
}

/**
 * Получить записи по источнику и дате
 */
export async function getBookingsBySourceAndDate(
  source: BookingSource,
  date: string
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_source', source)
    .eq('booking_date', date)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching bookings by source and date:', error);
    return [];
  }

  return data as Booking[];
}

/**
 * Обновить тип автомобиля в записи
 * Синхронизирует тип авто, услуги и сумму с ведомостью
 * @param bookingId ID записи
 * @param carType Новый тип автомобиля
 * @param allServices Список всех услуг для расчета цен
 * @returns Обновленная запись
 */
export async function updateBookingCarType(
  bookingId: string,
  carType: CarType,
  allServices: Service[]
): Promise<Booking> {
  // Получаем текущий заказ с услугами, количеством и скидкой
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select('services, services_with_quantities, discount')
    .eq('id', bookingId)
    .single();

  if (bookingError) throw bookingError;
  if (!bookingData) throw new Error('Booking not found');

  // Рассчитываем новую цену с учетом количества
  const newPrice = calculateBookingPrice(
    bookingData.services,
    allServices,
    carType,
    bookingData.services_with_quantities
  );

  // Применяем скидку
  const discount = bookingData.discount || 0;
  const finalPrice = Math.max(0, newPrice - discount);

  // Обновляем тип авто и цену в заказе
  const updatedBooking = await updateBooking(bookingId, { car_type: carType, price: finalPrice });

  // Синхронизируем с ведомостью
  await updateWorksheetEntryByBookingId(bookingId, bookingData.services, finalPrice, carType, bookingData.services_with_quantities);

  return updatedBooking;
}

/**
 * Удалить заказ
 * @param id ID заказа
 * @returns Удаленный заказ
 */
export async function deleteBooking(id: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
