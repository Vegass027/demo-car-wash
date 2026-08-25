import { supabase } from '../supabase';
import { normalizePhoneNumber } from '../../shared/utils/phone';

/**
 * Типы сущности "Организация"
 * Соответствует таблице organizations в базе данных
 */
export interface Organization {
  id: string;
  name: string;
  inn?: string;
  kpp?: string;              // ✅ КПП организации
  ogrn?: string;             // ✅ ОГРН организации
  legal_address?: string;     // ✅ Юридический адрес
  payment_account?: string;   // ✅ Расчетный счет (р/сч)
  bank_name?: string;         // ✅ Название банка
  correspondent_account?: string; // ✅ Корреспондентский счет (к/сч)
  bik?: string;              // ✅ БИК банка
  contact_person?: string;
  contact_phone?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
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
  car_type: string;  // ✅ Тип автомобиля (SEDAN, CROSSOVER, JEEP, LARGE_SUV, MINIVAN)
  is_active: boolean;
  created_at: string;
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
  created_at: string;
  // ✅ Поля для цифровой подписи
  signature_data?: string;           // Base64 PNG подпись водителя (мастер-копия)
  signature_updated_at?: string;      // Дата последнего обновления подписи
}

/**
 * Получить все активные организации
 */
export async function getOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Ошибка при загрузке организаций:', error);
    throw error;
  }

  return data || [];
}

/**
 * Получить организацию по ID
 */
export async function getOrganizationById(id: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Ошибка при загрузке организации ${id}:`, error);
    return null;
  }

  return data;
}

/**
 * Найти организацию по номеру телефона
 */
export async function findOrganizationByPhone(phone: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('contact_phone', normalizePhoneNumber(phone))
    .eq('is_active', true)
    .single();

  // PGRST116 = not found, это нормально
  if (error && error.code !== 'PGRST116') {
    console.error('Ошибка при поиске организации:', error);
    throw error;
  }

  return data as Organization | null;
}

/**
 * Создать новую организацию
 * @throws Error если организация с таким номером телефона уже существует
 */
export async function createOrganization(data: {
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
  notes?: string;
}): Promise<Organization> {
  // Проверяем, существует ли организация с таким номером телефона
  if (data.contact_phone) {
    const existingOrg = await findOrganizationByPhone(data.contact_phone)
    
    if (existingOrg) {
      throw new Error('Такая организация уже существует')
    }
  }

  const { data: newOrg, error } = await supabase
    .from('organizations')
    .insert({
      name: data.name.trim(),
      inn: data.inn?.trim() || null,
      kpp: data.kpp?.trim() || null,
      ogrn: data.ogrn?.trim() || null,
      legal_address: data.legal_address?.trim() || null,
      payment_account: data.payment_account?.trim() || null,
      bank_name: data.bank_name?.trim() || null,
      correspondent_account: data.correspondent_account?.trim() || null,
      bik: data.bik?.trim() || null,
      contact_person: data.contact_person?.trim() || null,
      contact_phone: data.contact_phone ? normalizePhoneNumber(data.contact_phone) : null,
      notes: data.notes?.trim() || null,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    console.error('Ошибка при создании организации:', error);
    throw error;
  }

  return newOrg;
}

/**
 * Проверить, существует ли водитель с таким номером телефона
 * Используется при создании новой организации
 */
export async function findDriverByPhone(phone: string): Promise<OrganizationDriver | null> {
  const normalizedPhone = normalizePhoneNumber(phone);
  
  const { data, error } = await supabase
    .from('organization_drivers')
    .select('*')
    .eq('phone', normalizedPhone)
    .eq('is_active', true)
    .single();

  // PGRST116 = not found, это нормально
  if (error && error.code !== 'PGRST116') {
    console.error('Ошибка при поиске водителя:', error);
    throw error;
  }

  return data as OrganizationDriver | null;
}

/**
 * Обновить организацию
 */
export async function updateOrganization(
  id: string,
  data: Partial<Omit<Organization, 'id' | 'created_at' | 'updated_at'>>
): Promise<Organization> {
  const { data: updatedOrg, error } = await supabase
    .from('organizations')
    .update({
      name: data.name?.trim(),
      inn: data.inn?.trim(),
      kpp: data.kpp?.trim(),
      ogrn: data.ogrn?.trim(),
      legal_address: data.legal_address?.trim(),
      payment_account: data.payment_account?.trim(),
      bank_name: data.bank_name?.trim(),
      correspondent_account: data.correspondent_account?.trim(),
      bik: data.bik?.trim(),
      contact_person: data.contact_person?.trim(),
      contact_phone: data.contact_phone ? normalizePhoneNumber(data.contact_phone) : undefined,
      notes: data.notes?.trim(),
      is_active: data.is_active
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`Ошибка при обновлении организации ${id}:`, error);
    throw error;
  }

  return updatedOrg;
}

/**
 * Удалить организацию (мягкое удаление - is_active = false)
 */
export async function deleteOrganization(id: string): Promise<void> {
  const { error } = await supabase
    .from('organizations')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error(`Ошибка при удалении организации ${id}:`, error);
    throw error;
  }
}

/**
 * Получить всех водителей организации
 */
export async function getOrganizationDrivers(organizationId?: string): Promise<OrganizationDriver[]> {
  let query = supabase
    .from('organization_drivers')
    .select('*')
    .eq('is_active', true);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query.order('full_name', { ascending: true });

  if (error) {
    console.error('Ошибка при загрузке водителей:', error);
    throw error;
  }

  return data || [];
}

/**
 * Найти всех водителей по номеру телефона с их организациями и автомобилями
 * Возвращает массив вариантов для выбора
 */
export async function findDriversByPhone(phone: string): Promise<Array<{
  driver: OrganizationDriver;
  organization: Organization;
  cars: OrganizationCar[];
}> | null> {
  // Нормализуем номер телефона: удаляем все нецифровые символы
  const normalizedPhone = phone.replace(/\D/g, '');
  
  // Пробуем оба формата: с 7 или с 8 в начале
  const phoneVariants = [
    normalizedPhone.startsWith('7') ? normalizedPhone : `7${normalizedPhone.slice(1)}`,
    normalizedPhone.startsWith('8') ? normalizedPhone : `8${normalizedPhone.slice(1)}`
  ];

  // Ищем всех водителей по любому из вариантов номера
  // Нормализуем телефон в БД для сравнения
  const { data: drivers, error: driversError } = await supabase
    .from('organization_drivers')
    .select(`
      *,
      organizations (
        id,
        name,
        inn,
        contact_person,
        contact_phone,
        is_active
      )
    `)
    .eq('is_active', true);

  if (driversError || !drivers || drivers.length === 0) {
    return null;
  }

  // Фильтруем водителей по номеру телефона (нормализуем оба номера)
  const filteredDrivers = drivers.filter(driver => {
    if (!driver.phone) return false;
    const dbPhoneNormalized = driver.phone.replace(/\D/g, '');
    return phoneVariants.some(variant => dbPhoneNormalized === variant);
  });

  if (filteredDrivers.length === 0) {
    return null;
  }

  // Для каждого водителя получаем автомобили организации
  const results = await Promise.all(
    filteredDrivers.map(async (driverData) => {
      const { data: cars, error: carsError } = await supabase
        .from('organization_cars')
        .select('*')
        .eq('organization_id', driverData.organization_id)
        .eq('is_active', true)
        .order('car_model', { ascending: true });

      return {
        driver: {
          id: driverData.id,
          organization_id: driverData.organization_id,
          full_name: driverData.full_name,
          phone: driverData.phone,
          is_active: driverData.is_active,
          created_at: driverData.created_at,
          signature_data: driverData.signature_data,
          signature_updated_at: driverData.signature_updated_at
        },
        organization: driverData.organizations as Organization,
        cars: carsError ? [] : (cars || [])
      };
    })
  );

  return results;
}

/**
 * Создать нового водителя организации
 */
export async function createOrganizationDriver(data: {
  organization_id: string;
  full_name: string;
  phone?: string;
}): Promise<OrganizationDriver> {
  const { data: newDriver, error } = await supabase
    .from('organization_drivers')
    .insert({
      organization_id: data.organization_id,
      full_name: data.full_name.trim(),
      phone: data.phone ? normalizePhoneNumber(data.phone) : null,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    console.error('Ошибка при создании водителя:', error);
    throw error;
  }

  return newDriver;
}

/**
 * Обновить водителя организации
 */
export async function updateOrganizationDriver(
  id: string,
  data: Partial<Omit<OrganizationDriver, 'id' | 'created_at'>>
): Promise<OrganizationDriver> {
  const { data: updatedDriver, error } = await supabase
    .from('organization_drivers')
    .update({
      full_name: data.full_name?.trim(),
      phone: data.phone ? normalizePhoneNumber(data.phone) : undefined,
      is_active: data.is_active
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`Ошибка при обновлении водителя ${id}:`, error);
    throw error;
  }

  return updatedDriver;
}

/**
 * Обновить цифровую подпись водителя
 * @param id - ID водителя
 * @param signatureData - Base64 PNG подпись
 * @returns Обновленный водитель с новой подписью
 */
export async function updateDriverSignature(
  id: string,
  signatureData: string
): Promise<OrganizationDriver> {
  const { data: updatedDriver, error } = await supabase
    .from('organization_drivers')
    .update({
      signature_data: signatureData,
      signature_updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`Ошибка при обновлении подписи водителя ${id}:`, error);
    throw error;
  }

  return updatedDriver;
}

/**
 * Получить цифровую подпись водителя
 * @param id - ID водителя
 * @returns Base64 PNG подпись или null если подпись не установлена
 */
export async function getDriverSignature(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('organization_drivers')
    .select('signature_data')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Ошибка при получении подписи водителя ${id}:`, error);
    return null;
  }

  return data?.signature_data || null;
}

/**
 * Получить все автомобили организации
 */
export async function getOrganizationCars(organizationId?: string): Promise<OrganizationCar[]> {
  let query = supabase
    .from('organization_cars')
    .select('*')
    .eq('is_active', true);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query.order('car_model', { ascending: true });

  if (error) {
    console.error('Ошибка при загрузке автомобилей:', error);
    throw error;
  }

  return data || [];
}

/**
 * Создать новый автомобиль организации
 */
export async function createOrganizationCar(data: {
  organization_id: string;
  car_model: string;
  plate_number: string;
  car_type: string;
}): Promise<OrganizationCar> {
  const { data: newCar, error } = await supabase
    .from('organization_cars')
    .insert({
      organization_id: data.organization_id,
      car_model: data.car_model.trim(),
      plate_number: data.plate_number.trim(),
      car_type: data.car_type,
      is_active: true
    })
    .select()
    .single();

  if (error) {
    console.error('Ошибка при создании автомобиля:', error);
    throw error;
  }

  return newCar;
}

/**
 * Обновить автомобиль организации
 */
export async function updateOrganizationCar(
  id: string,
  data: Partial<Omit<OrganizationCar, 'id' | 'created_at'>>
): Promise<OrganizationCar> {
  const { data: updatedCar, error } = await supabase
    .from('organization_cars')
    .update({
      car_model: data.car_model?.trim(),
      plate_number: data.plate_number?.trim(),
      car_type: data.car_type,
      is_active: data.is_active
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`Ошибка при обновлении автомобиля ${id}:`, error);
    throw error;
  }

  return updatedCar;
}

/**
 * Получить все организации с их автомобилями (один запрос с JOIN)
 * Используется для базы клиентов в админке
 */
export async function getOrganizationsWithCars(): Promise<Array<{
  organization: Organization;
  cars: OrganizationCar[];
}>> {
  const { data, error } = await supabase
    .from('organizations')
    .select(`
      *,
      organization_cars (
        id,
        organization_id,
        car_model,
        plate_number,
        car_type,
        is_active,
        created_at
      )
    `)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    console.error('Ошибка при загрузке организаций с автомобилями:', error);
    throw error;
  }

  // Фильтруем только активные машины
  return (data || []).map(organization => ({
    organization: {
      id: organization.id,
      name: organization.name,
      inn: organization.inn,
      kpp: organization.kpp,
      ogrn: organization.ogrn,
      legal_address: organization.legal_address,
      payment_account: organization.payment_account,
      bank_name: organization.bank_name,
      correspondent_account: organization.correspondent_account,
      bik: organization.bik,
      contact_person: organization.contact_person,
      contact_phone: organization.contact_phone,
      is_active: organization.is_active,
      notes: organization.notes,
      created_at: organization.created_at,
      updated_at: organization.updated_at
    },
    cars: (organization.organization_cars as OrganizationCar[] || []).filter(car => car.is_active)
  }))
}

/**
 * Получить все организации с их водителями и автомобилями
 * Используется для базы клиентов в мастере заказа
 */
export async function getOrganizationsWithDriversAndCars(): Promise<Array<{
  organization: Organization;
  drivers: OrganizationDriver[];
  cars: OrganizationCar[];
}>> {
  const { data, error } = await supabase
    .from('organizations')
    .select(`
      *,
      organization_drivers (
        id,
        organization_id,
        full_name,
        phone,
        is_active,
        created_at,
        signature_data,
        signature_updated_at
      ),
      organization_cars (
        id,
        organization_id,
        car_model,
        plate_number,
        car_type,
        is_active,
        created_at
      )
    `)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    console.error('Ошибка при загрузке организаций с водителями и автомобилями:', error);
    throw error;
  }

  // Фильтруем только активные водители и машины
  return (data || []).map(organization => ({
    organization: {
      id: organization.id,
      name: organization.name,
      inn: organization.inn,
      kpp: organization.kpp,
      ogrn: organization.ogrn,
      legal_address: organization.legal_address,
      payment_account: organization.payment_account,
      bank_name: organization.bank_name,
      correspondent_account: organization.correspondent_account,
      bik: organization.bik,
      contact_person: organization.contact_person,
      contact_phone: organization.contact_phone,
      is_active: organization.is_active,
      notes: organization.notes,
      created_at: organization.created_at,
      updated_at: organization.updated_at
    },
    drivers: (organization.organization_drivers as OrganizationDriver[] || []).filter(driver => driver.is_active),
    cars: (organization.organization_cars as OrganizationCar[] || []).filter(car => car.is_active)
  }))
}
