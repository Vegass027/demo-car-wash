import { supabase } from '../supabase';
import { getDriverSignature, getOrganizationById } from './organizations';
import { timeToMinutes } from '@/shared/utils/time';
import { normalizePhoneNumber } from '../../shared/utils/phone';

/**
 * Интерфейс услуги в заказе шиномонтажа
 * Хранится в поле services (JSONB) таблицы tire_bookings
 */
export interface TireServiceItem {
  service_id: string;      // UUID услуги из tire_services
  name: string;            // Название услуги (копируется при создании)
  quantity: number;         // Количество (1-10)
  price: number;           // Цена за 1 единицу (копируется из tire_services)
  total: number;           // Общая сумма = price × quantity
  customPrice?: number;    // Произвольная цена (для is_custom_price)
  comment?: string;        // Комментарий к услуге
}

/**
 * Статус заказа шиномонтажа
 */
export type TireBookingStatus = 'ОЖИДАЕТ' | 'В РАБОТЕ' | 'ГОТОВО' | 'ОТМЕНЕНО' | 'ПРОСРОЧЕН';
export type TireBookingSource = 'admin' | 'online';

/**
 * Интерфейс заказа шиномонтажа
 * Соответствует таблице tire_bookings в базе данных
 */
export interface TireBooking {
  id: string;                          // UUID
  client_name: string;                 // Имя клиента
  phone: string;                       // Телефон клиента
  car_model: string;                   // Модель машины
  plate_number: string;                // Гос. номер
  booking_date: string;                // Дата записи (YYYY-MM-DD)
  start_time: string;                  // Время начала (HH:MM)
  estimated_duration: number;          // Ожидаемая длительность в минутах
  services: TireServiceItem[];        // Массив услуг (JSONB)
  total_price: number;                 // Общая сумма заказа
  payment_method: string;              // Способ оплаты (Наличные, Карта, Безнал)
  is_paid: boolean;                    // Оплачен ли заказ
  paid_at?: string;                    // Время оплаты (TIMESTAMP)
  status: TireBookingStatus;           // Статус заказа
  is_org: boolean;                     // Это организация?
  organization_id?: string;             // UUID организации (если is_org = true)
  driver_id?: string;                  // UUID водителя (если is_org = true)
  car_id?: string;                     // UUID машины организации (если is_org = true)
  org_name?: string;                   // Название организации (для отображения)
  client_id?: string;                  // UUID клиента-физлица (если is_org = false)
  client_car_id?: string;              // UUID машины клиента (если is_org = false)
  worker_id?: string;                  // UUID шиномонтажника (ссылка на tire_workers)
  worker_name?: string;                // Кэшированное имя мастера для быстрого отображения в истории заказов
  signature_data?: string;             // Подпись водителя (base64, если is_org = true)
  signature_obtained_at?: string;      // Время получения подписи (TIMESTAMP)
  notes?: string;                      // Заметки к заказу
  created_at: string;                  // TIMESTAMP
  updated_at: string;                  // TIMESTAMP

  // ✅ Новые поля для онлайн-записи
  booking_source: TireBookingSource;
  created_by_profile_id?: string;
  end_time?: string;                   // Вычисляемое поле (start_time + estimated_duration)
}

/**
 * Создать заказ шиномонтажа с автокопированием подписи для организаций
 * @param data - Данные заказа (без id, created_at, updated_at)
 * @returns Созданный заказ
 * @throws Error если запрос к базе данных не удался
 */
export async function createTireBooking(
  data: Omit<TireBooking, 'id' | 'created_at' | 'updated_at'>
): Promise<TireBooking> {
  let bookingToInsert = { ...data };

  // ✅ Нормализуем телефон
  if (data.phone) {
    bookingToInsert.phone = normalizePhoneNumber(data.phone);
  }

  // ✅ ЗАПОЛНЕНИЕ org_name для организаций
  if (data.is_org && data.organization_id) {
    try {
      const organization = await getOrganizationById(data.organization_id);
      if (organization) {
        bookingToInsert = {
          ...bookingToInsert,
          org_name: organization.name
        };
      }
    } catch (error) {
      console.error('[TireBookings] Ошибка при получении названия организации:', error);
      // Не прерываем создание заказа, просто продолжаем без org_name
    }
  }

  // ✅ АВТОКОПИРОВАНИЕ ПОДПИСИ для организаций
  if (data.is_org && data.driver_id) {
    try {
      const signature = await getDriverSignature(data.driver_id);
      if (signature) {
        bookingToInsert = {
          ...bookingToInsert,
          signature_data: signature,
          signature_obtained_at: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('[TireBookings] Ошибка при получении подписи водителя:', error);
      // Не прерываем создание заказа, просто продолжаем без подписи
    }
  }

  const { data: booking, error } = await supabase
    .from('tire_bookings')
    .insert(bookingToInsert)
    .select()
    .single();

  if (error) {
    console.error('[TireBookings] Ошибка при создании заказа:', error);
    throw new Error(`Не удалось создать заказ: ${error.message}`);
  }

  return booking as TireBooking;
}

/**
 * Получить заказы шиномонтажа по дате
 * @param date - Дата в формате YYYY-MM-DD
 * @returns Массив заказов, отсортированных по времени начала
 * @throws Error если запрос к базе данных не удался
 */
export async function getTireBookingsByDate(
  date: string
): Promise<TireBooking[]> {
  const { data, error } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('booking_date', date)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[TireBookings] Ошибка при получении заказов на дату:', date, error);
    throw new Error(`Не удалось получить заказы: ${error.message}`);
  }

  return data as TireBooking[];
}

/**
 * Получить завершенные заказы шиномонтажа за дату (для Итогового отчёта)
 * Фильтрация на уровне БД для оптимизации
 * @param date - Дата в формате YYYY-MM-DD
 * @returns Массив завершенных заказов, отсортированных по времени начала
 * @throws Error если запрос к базе данных не удался
 */
export async function getCompletedTireBookingsByDate(
  date: string
): Promise<TireBooking[]> {
  const { data, error } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('status', 'ГОТОВО')
    .eq('booking_date', date)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[TireBookings] Ошибка при получении завершенных заказов на дату:', date, error);
    throw new Error(`Не удалось получить заказы: ${error.message}`);
  }

  return data as TireBooking[];
}

/**
 * Получить заказ по ID
 * @param id - UUID заказа
 * @returns Заказ или null если не найден
 * @throws Error если запрос к базе данных не удался
 */
export async function getTireBookingById(id: string): Promise<TireBooking | null> {
  const { data, error } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Запись не найдена
      return null;
    }
    console.error('[TireBookings] Ошибка при получении заказа по ID:', id, error);
    throw new Error(`Не удалось получить заказ: ${error.message}`);
  }

  return data as TireBooking;
}

/**
 * Обновить статус заказа шиномонтажа
 * @param id - UUID заказа
 * @param status - Новый статус
 * @throws Error если запрос к базе данных не удался
 */
export async function updateTireBookingStatus(
  id: string,
  status: TireBookingStatus
): Promise<void> {
  const { error } = await supabase
    .from('tire_bookings')
    .update({ 
      status, 
      updated_at: new Date().toISOString() 
    })
    .eq('id', id);

  if (error) {
    console.error('[TireBookings] Ошибка при обновлении статуса:', error);
    throw new Error(`Не удалось обновить статус: ${error.message}`);
  }
}

/**
 * Отметить заказ как оплаченный (idempotent)
 * Если заказ уже оплачен - просто возвращает без ошибки
 * @param id - UUID заказа
 * @throws Error если запрос к базе данных не удался
 */
export async function markTireBookingAsPaid(id: string): Promise<void> {
  // ✅ ПРОВЕРКА: заказ уже оплачен?
  const { data: booking } = await supabase
    .from('tire_bookings')
    .select('is_paid, paid_at')
    .eq('id', id)
    .single();

  if (!booking) {
    throw new Error('Заказ не найден');
  }

  if (booking.is_paid) {
    // ✅ Уже оплачен — просто возвращаем
    return;
  }

  const { error } = await supabase
    .from('tire_bookings')
    .update({
      is_paid: true,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error('[TireBookings] Ошибка при отметке заказа как оплаченного:', error);
    throw new Error(`Не удалось отметить заказ как оплаченный: ${error.message}`);
  }
}

/**
 * Отметить заказ как готовый (idempotent)
 * Проверяет что заказ оплачен перед завершением
 * Если заказ уже завершен - просто возвращает без ошибки
 * @param id - UUID заказа
 * @throws Error если запрос к базе данных не удался или заказ не оплачен
 */
export async function markTireBookingAsReady(id: string): Promise<void> {
  // ✅ ПРОВЕРКА: заказ оплачен?
  const { data: booking } = await supabase
    .from('tire_bookings')
    .select('id, status, is_paid, worker_id, total_price')
    .eq('id', id)
    .single();

  if (!booking) {
    throw new Error('Заказ не найден');
  }

  // ✅ ПРОВЕРКА: заказ уже завершен?
  if (booking.status === 'ГОТОВО') {
    return; // Уже завершен — просто возвращаем
  }

  // ✅ ПРОВЕРКА: заказ оплачен?
  if (!booking.is_paid) {
    throw new Error('Сначала отметьте заказ как оплаченный');
  }

  // ✅ НАЧИСЛЯЕМ ЗАРАБОТОК МАСТЕРУ если есть worker_id
  // Slice #3d Step 0: pass ONLY bookingId; dispatcher server-computes worker_id,
  // total_price, services and final earnings. Old direct .rpc() path removed.
  if (booking.worker_id) {
    try {
      // Импортируем addTireWorkerEarningsForBooking динамически, чтобы избежать циклических зависимостей
      const { addTireWorkerEarningsForBooking } = await import('./tire-workers');
      await addTireWorkerEarningsForBooking(booking.id);
      console.log(`[TireBookings] Начислен заработок мастеру ${booking.worker_id} за заказ ${booking.id}`);
    } catch (error) {
      console.error('[TireBookings] Ошибка при начислении заработка мастеру:', error);
      // Не прерываем процесс завершения заказа, но логируем ошибку
    }
  }

  const { error } = await supabase
    .from('tire_bookings')
    .update({
      status: 'ГОТОВО',
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error('[TireBookings] Ошибка при обновлении статуса:', error);
    throw new Error(`Не удалось обновить статус: ${error.message}`);
  }
}

/**
 * Обновить данные заказа
 * @param id - UUID заказа
 * @param updates - Обновляемые поля (без id, created_at)
 * @throws Error если запрос к базе данных не удался
 */
export async function updateTireBooking(
  id: string,
  updates: Partial<Omit<TireBooking, 'id' | 'created_at'>>
): Promise<TireBooking> {
  // ✅ Нормализуем телефон если он есть
  const updatesToApply = { ...updates };
  if (updates.phone) {
    updatesToApply.phone = normalizePhoneNumber(updates.phone);
  }

  const { data, error } = await supabase
    .from('tire_bookings')
    .update({
      ...updatesToApply,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[TireBookings] Ошибка при обновлении заказа:', error);
    throw new Error(`Не удалось обновить заказ: ${error.message}`);
  }

  return data as TireBooking;
}

/**
 * Удалить заказ шиномонтажа
 * @param id - UUID заказа
 * @throws Error если запрос к базе данных не удался
 */
export async function deleteTireBooking(id: string): Promise<void> {
  const { error } = await supabase
    .from('tire_bookings')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[TireBookings] Ошибка при удалении заказа:', error);
    throw new Error(`Не удалось удалить заказ: ${error.message}`);
  }
}

/**
 * Получить заказы шиномонтажа по телефону клиента
 * @param phone - Телефон клиента
 * @returns Массив заказов, отсортированных по дате и времени
 * @throws Error если запрос к базе данных не удался
 */
export async function getTireBookingsByPhone(phone: string): Promise<TireBooking[]> {
  const { data, error } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('phone', phone)
    .order('booking_date', { ascending: false })
    .order('start_time', { ascending: false });

  if (error) {
    console.error('[TireBookings] Ошибка при получении заказов по телефону:', phone, error);
    throw new Error(`Не удалось получить заказы: ${error.message}`);
  }

  return data as TireBooking[];
}

/**
 * Добавить услуги к заказу шиномонтажа
 * @param bookingId - UUID заказа
 * @param servicesToAdd - Массив услуг для добавления (с quantity)
 * @param tireServices - Список всех услуг шиномонтажа (для получения цен)
 * @throws Error если запрос к базе данных не удался
 */
export async function addTireServicesToBooking(
  bookingId: string,
  servicesToAdd: Array<{ service_id: string; quantity: number }>,
  tireServices: Array<{ id: string; name: string; price: number }>
): Promise<void> {
  // Получаем текущий заказ
  const booking = await getTireBookingById(bookingId);
  if (!booking) {
    throw new Error('Заказ не найден');
  }

  // Создаем Map для быстрого поиска услуг
  const servicesMap = new Map(
    tireServices.map(s => [s.id, { name: s.name, price: s.price }])
  );

  // Добавляем новые услуги к существующим
  const newServices: TireServiceItem[] = [...booking.services];

  for (const serviceToAdd of servicesToAdd) {
    const serviceInfo = servicesMap.get(serviceToAdd.service_id);
    if (!serviceInfo) {
      console.warn(`[TireBookings] Услуга ${serviceToAdd.service_id} не найдена`);
      continue;
    }

    // Проверяем, есть ли уже такая услуга в заказе
    const existingService = newServices.find(s => s.service_id === serviceToAdd.service_id);
    if (existingService) {
      // Увеличиваем количество
      existingService.quantity += serviceToAdd.quantity;
      existingService.total = existingService.price * existingService.quantity;
    } else {
      // Добавляем новую услугу
      newServices.push({
        service_id: serviceToAdd.service_id,
        name: serviceInfo.name,
        quantity: serviceToAdd.quantity,
        price: serviceInfo.price,
        total: serviceInfo.price * serviceToAdd.quantity
      });
    }
  }

  // Пересчитываем общую сумму
  const newTotalPrice = newServices.reduce((sum, s) => sum + s.total, 0);

  // Обновляем заказ в БД
  await updateTireBooking(bookingId, {
    services: newServices,
    total_price: newTotalPrice
  });

  // Синхронизируем с ведомостью
  try {
    const { updateWorksheetEntryByTireBookingId } = await import('./worksheets');
    await updateWorksheetEntryByTireBookingId(bookingId, newServices, newTotalPrice);
  } catch (error) {
    console.error('[addTireServicesToBooking] Ошибка синхронизации с ведомостью:', error);
    // Не прерываем процесс, просто логируем ошибку
  }
}

/**
 * Удалить услугу из заказа шиномонтажа
 * @param bookingId - UUID заказа
 * @param serviceId - UUID услуги для удаления
 * @throws Error если запрос к базе данных не удался
 */
export async function removeTireServiceFromBooking(
  bookingId: string,
  serviceId: string
): Promise<void> {
  // Получаем текущий заказ
  const booking = await getTireBookingById(bookingId);
  if (!booking) {
    throw new Error('Заказ не найден');
  }

  // Удаляем услугу из массива
  const newServices = booking.services.filter(s => s.service_id !== serviceId);

  // Пересчитываем общую сумму
  const newTotalPrice = newServices.reduce((sum, s) => sum + s.total, 0);

  // Обновляем заказ в БД
  await updateTireBooking(bookingId, {
    services: newServices,
    total_price: newTotalPrice
  });

  // Синхронизируем с ведомостью
  try {
    const { updateWorksheetEntryByTireBookingId } = await import('./worksheets');
    await updateWorksheetEntryByTireBookingId(bookingId, newServices, newTotalPrice);
  } catch (error) {
    console.error('[removeTireServiceFromBooking] Ошибка синхронизации с ведомостью:', error);
    // Не прерываем процесс, просто логируем ошибку
  }
}

/**
 * Назначить мастера на заказ шиномонтажа
 * @param bookingId - UUID заказа
 * @param technicianId - UUID мастера из tire_workers
 * @param technicianName - Имя мастера для кэширования
 * @throws Error если запрос к базе данных не удался
 */
export async function assignTireTechnicianToBooking(
  bookingId: string,
  technicianId: string,
  technicianName: string
): Promise<TireBooking> {
  const { data, error } = await supabase
    .from('tire_bookings')
    .update({
      worker_id: technicianId,
      worker_name: technicianName,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) {
    console.error('[TireBookings] Ошибка при назначении мастера:', error);
    throw new Error(`Не удалось назначить мастера: ${error.message}`);
  }

  return data as TireBooking;
}

/**
 * Автоматически обновляет статусы заказов на сегодня
 * - ОЖИДАЕТ → В РАБОТЕ (когда время подошло)
 * - В РАБОТЕ → ГОТОВО (когда время закончилось)
 * - ОЖИДАЕТ/В РАБОТЕ → ПРОСРОЧЕН (когда время закончилось и заказ не выполнен)
 * @returns Количество обновленных заказов
 * @throws Error если запрос к базе данных не удался
 */
export async function autoUpdateTireBookingStatuses(): Promise<number> {
  const today = new Date();
  // Используем локальную дату, а не UTC (toISOString конвертирует в UTC)
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; // YYYY-MM-DD (локальная дата)
  const currentTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
  const currentMinutesTotal = today.getHours() * 60 + today.getMinutes();

  console.log(`[TireBookings] Автообновление статусов: дата=${todayStr}, время=${currentTime}, минут=${currentMinutesTotal}`);

  // Получаем все заказы на сегодня (кроме отмененных и готовых)
  const { data: bookings, error } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('booking_date', todayStr)
    .in('status', ['ОЖИДАЕТ', 'В РАБОТЕ']);

  if (error) {
    console.error('[TireBookings] Ошибка при получении заказов для автообновления:', error);
    throw new Error(`Не удалось получить заказы: ${error.message}`);
  }

  if (!bookings || bookings.length === 0) {
    console.log('[TireBookings] Нет заказов для автообновления');
    return 0;
  }

  console.log(`[TireBookings] Найдено ${bookings.length} заказов для проверки`);

  let updatedCount = 0;

  for (const booking of bookings) {
    const startMinutes = timeToMinutes(booking.start_time);
    const endMinutes = startMinutes + booking.estimated_duration;

    // Проверяем, переходит ли заказ через полночь
    const isOvernight = endMinutes < startMinutes;

    // Если заказ переходит через полночь - не меняем статус (проверка просрочки на следующий день)
    if (isOvernight) {
      console.log(`[TireBookings] Заказ ${booking.id} (${booking.start_time}) переходит через полночь - пропускаем`);
      continue;
    }

    let newStatus: TireBookingStatus | null = null;

    console.log(`[TireBookings] Проверка заказа ${booking.id}: статус=${booking.status}, время=${booking.start_time}, длительность=${booking.estimated_duration}мин, начало=${startMinutes}мин, конец=${endMinutes}мин, текущее=${currentMinutesTotal}мин`);

    if (booking.status === 'ОЖИДАЕТ' && currentMinutesTotal >= startMinutes && currentMinutesTotal < endMinutes) {
      // Время подошло, но еще не закончилось - переводим в работу
      newStatus = 'В РАБОТЕ';
      console.log(`[TireBookings] -> Нужно обновить на В РАБОТЕ`);
    } else if (currentMinutesTotal >= endMinutes) {
      // Время закончилось - проверяем статус
      if (booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ') {
        // Заказ не выполнен вовремя - просрочен
        newStatus = 'ПРОСРОЧЕН';
        console.log(`[TireBookings] -> Нужно обновить на ПРОСРОЧЕН`);
      }
    } else {
      console.log(`[TireBookings] -> Статус не меняется`);
    }

    if (newStatus) {
      const { error: updateError } = await supabase
        .from('tire_bookings')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', booking.id);

      if (updateError) {
        console.error(`[TireBookings] Ошибка при обновлении статуса заказа ${booking.id}:`, updateError);
      } else {
        updatedCount++;
        console.log(`[TireBookings] ✅ Заказ ${booking.id} автоматически изменен на статус: ${newStatus}`);
      }
    }
  }

  console.log(`[TireBookings] Автообновление завершено: обновлено ${updatedCount} заказов`);
  return updatedCount;
}

/**
 * Создать онлайн-запись на шиномонтаж
 */
export async function createOnlineTireBooking(
  data: Omit<TireBooking, 'id' | 'created_at' | 'updated_at' | 'booking_source'> & {
    booking_source?: TireBookingSource;
  }
): Promise<TireBooking> {
  const bookingToInsert = {
    ...data,
    booking_source: data.booking_source || 'online'
  };

  // ✅ Нормализуем телефон
  if (data.phone) {
    bookingToInsert.phone = normalizePhoneNumber(data.phone);
  }

  // ✅ ЗАПОЛНЕНИЕ org_name для организаций
  if (data.is_org && data.organization_id) {
    try {
      const organization = await getOrganizationById(data.organization_id);
      if (organization) {
        bookingToInsert.org_name = organization.name;
      }
    } catch (error) {
      console.error('[TireBookings] Ошибка при получении названия организации:', error);
    }
  }

  // ✅ АВТОКОПИРОВАНИЕ ПОДПИСИ для организаций
  if (data.is_org && data.driver_id) {
    try {
      const signature = await getDriverSignature(data.driver_id);
      if (signature) {
        bookingToInsert.signature_data = signature;
        bookingToInsert.signature_obtained_at = new Date().toISOString();
      }
    } catch (error) {
      console.error('[TireBookings] Ошибка при получении подписи водителя:', error);
    }
  }

  const { data: booking, error } = await supabase
    .from('tire_bookings')
    .insert(bookingToInsert)
    .select()
    .single();

  if (error) {
    console.error('[TireBookings] Ошибка при создании онлайн-заказа:', error);
    throw new Error(`Не удалось создать заказ: ${error.message}`);
  }

  return booking as TireBooking;
}

/**
 * Получить записи шиномонтажа клиента по profile_id
 */
export async function getTireBookingsByProfileId(profileId: string): Promise<TireBooking[]> {
  const { data, error } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('created_by_profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[TireBookings] Ошибка при получении заказов по profile_id:', error);
    return [];
  }

  return data as TireBooking[];
}

/**
 * Получить все записи шиномонтажа клиента (личные + организационные) по profile_id и телефону
 * Ищет записи:
 * 1. По created_by_profile_id (личные записи, созданные клиентом)
 * 2. По driver_id (записи организации, где клиент является водителем)
 *
 * @param profileId - ID профиля клиента
 * @param profilePhone - Телефон профиля (для поиска driver_id)
 */
export async function getAllTireBookingsForClient(
  profileId: string,
  profilePhone?: string
): Promise<TireBooking[]> {
  console.log('[getAllTireBookingsForClient] profileId:', profileId, 'phone:', profilePhone);
  
  // 1. Получаем личные записи клиента
  const { data: personalBookings, error: personalError } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('created_by_profile_id', profileId);

  if (personalError) {
    console.error('[getAllTireBookingsForClient] Error fetching personal bookings:', personalError);
  }

  console.log('[getAllTireBookingsForClient] Личных записей:', personalBookings?.length || 0);

  // Если телефон не передан, возвращаем только личные записи
  if (!profilePhone) {
    return (personalBookings || []) as TireBooking[];
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
    console.log('[getAllTireBookingsForClient] Водитель не найден для телефона:', normalizedPhone);
    return (personalBookings || []) as TireBooking[];
  }

  console.log('[getAllTireBookingsForClient] Найден водитель:', driver.id);

  // 3. Получаем записи организации для этого водителя
  const { data: orgBookings, error: orgError } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('driver_id', driver.id);

  if (orgError) {
    console.error('[getAllTireBookingsForClient] Error fetching organization bookings:', orgError);
  }

  console.log('[getAllTireBookingsForClient] Организационных записей:', orgBookings?.length || 0);

  // 4. Объединяем и убираем дубликаты
  const allBookings = [...(personalBookings || []), ...(orgBookings || [])];
  const uniqueBookings = allBookings.filter((booking, index, self) =>
    index === self.findIndex(b => b.id === booking.id)
  );

  // 5. Сортируем по дате создания
  uniqueBookings.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  console.log('[getAllTireBookingsForClient] Итого уникальных записей:', uniqueBookings.length);

  return uniqueBookings as TireBooking[];
}

/**
 * Получить записи шиномонтажа клиента по profile_id и дате
 */
export async function getTireBookingsByProfileIdAndDate(
  profileId: string,
  date: string
): Promise<TireBooking[]> {
  const { data, error } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('created_by_profile_id', profileId)
    .eq('booking_date', date)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[TireBookings] Ошибка при получении заказов по profile_id и дате:', error);
    return [];
  }

  return data as TireBooking[];
}

/**
 * Получить записи шиномонтажа по источнику (admin или online)
 */
export async function getTireBookingsBySource(source: TireBookingSource): Promise<TireBooking[]> {
  const { data, error } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('booking_source', source)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[TireBookings] Ошибка при получении заказов по источнику:', error);
    return [];
  }

  return data as TireBooking[];
}

/**
 * Получить записи шиномонтажа по источнику и дате
 */
export async function getTireBookingsBySourceAndDate(
  source: TireBookingSource,
  date: string
): Promise<TireBooking[]> {
  const { data, error } = await supabase
    .from('tire_bookings')
    .select('*')
    .eq('booking_source', source)
    .eq('booking_date', date)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[TireBookings] Ошибка при получении заказов по источнику и дате:', error);
    return [];
  }

  return data as TireBooking[];
}

/**
 * Отменить онлайн-запись шиномонтажа с логированием
 */
export async function cancelOnlineTireBooking(
  id: string,
  clientId: string,
  reason?: string
): Promise<void> {
  // Импортируем handleClientCancellation
  const { handleClientCancellation } = await import('./booking-cancellations');

  // Создаём запись об отмене и проверяем блокировку
  const result = await handleClientCancellation({
    client_id: clientId,
    tire_booking_id: id,
    reason
  });

  if (result.blocked) {
    console.log(`[TireBookings] Client ${clientId} has been blocked for online booking until ${result.blockedUntil}`);
  }

  // ✅ Удаляем запись из ведомости перед отменой
  try {
    const { deleteWorksheetEntryByBookingId } = await import('./worksheets');
    await deleteWorksheetEntryByBookingId(id, 'tire');
  } catch (error) {
    console.error('[cancelOnlineTireBooking] Ошибка удаления записи ведомости:', error);
    // Не прерываем отмену заказа
  }

  // Отменяем заказ
  await updateTireBookingStatus(id, 'ОТМЕНЕНО');
}

/**
 * Отменить заказ шиномонтажа
 * @param id ID заказа
 * @returns Обновленный заказ
 * @throws Error если запрос к БД не удался
 */
export async function cancelTireBooking(id: string): Promise<TireBooking> {
  // ✅ Удаляем запись из ведомости перед отменой
  try {
    const { deleteWorksheetEntryByBookingId } = await import('./worksheets');
    await deleteWorksheetEntryByBookingId(id, 'tire');
  } catch (error) {
    console.error('[cancelTireBooking] Ошибка удаления записи ведомости:', error);
    // Не прерываем отмену заказа
  }

  return updateTireBooking(id, { status: 'ОТМЕНЕНО' });
}
