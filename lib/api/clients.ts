import { supabase } from '../supabase'
import { normalizePhoneNumber } from '../../shared/utils/phone'

// ✅ ТИПЫ ЗДЕСЬ (НЕ в entities/)

export interface Client {
  id: string
  full_name: string
  phone: string
  is_active: boolean
  notes?: string
  profile_id?: string
  online_booking_blocked_until?: string
  created_at: string
  updated_at: string
}

export interface ClientCar {
  id: string
  client_id: string
  car_model: string
  plate_number: string
  car_type: string
  is_active: boolean
  created_at: string
}

// CRUD ФУНКЦИИ

/**
 * Получить всех активных клиентов
 */
export async function getClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  if (error) {
    console.error('Ошибка при загрузке клиентов:', error)
    throw error
  }

  return data || []
}

/**
 * Создать нового клиента
 * @throws Error если клиент с таким номером телефона уже существует
 */
export async function createClient(data: {
  full_name: string
  phone: string
  notes?: string
}): Promise<Client> {
  // Проверяем, существует ли клиент с таким номером телефона
  const existingClient = await findClientByPhone(data.phone)

  if (existingClient) {
    throw new Error('Такой клиент уже существует')
  }

  const { data: newClient, error } = await supabase
    .from('clients')
    .insert({
      full_name: data.full_name.trim(),
      phone: normalizePhoneNumber(data.phone),
      notes: data.notes?.trim() || null,
      is_active: true
    })
    .select()
    .single()

  if (error) {
    console.error('Ошибка при создании клиента:', error)
    throw error
  }

  return newClient
}

/**
 * Обновить клиента
 */
export async function updateClient(
  id: string,
  data: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>
): Promise<Client> {
  const { data: updatedClient, error } = await supabase
    .from('clients')
    .update({
      full_name: data.full_name?.trim(),
      phone: data.phone ? normalizePhoneNumber(data.phone) : undefined,
      notes: data.notes?.trim() || null,
      is_active: data.is_active,
      profile_id: data.profile_id,
      online_booking_blocked_until: data.online_booking_blocked_until
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error(`Ошибка при обновлении клиента ${id}:`, error)
    throw error
  }

  return updatedClient
}

/**
 * Получить все автомобили клиента
 */
export async function getClientCars(clientId: string): Promise<ClientCar[]> {
  const { data, error } = await supabase
    .from('client_cars')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('car_model', { ascending: true })

  if (error) {
    console.error('Ошибка при загрузке автомобилей клиентов:', error)
    throw error
  }

  return data || []
}

/**
 * Создать новый автомобиль клиента
 */
export async function createClientCar(data: {
  client_id: string
  car_model: string
  plate_number: string
  car_type: string
}): Promise<ClientCar> {
  const { data: newCar, error } = await supabase
    .from('client_cars')
    .insert({
      client_id: data.client_id,
      car_model: data.car_model.trim(),
      plate_number: data.plate_number.trim().toUpperCase(),
      car_type: data.car_type.trim(),
      is_active: true
    })
    .select()
    .single()

  if (error) {
    console.error('Ошибка при создании автомобиля клиента:', error)
    throw error
  }

  return newCar
}

/**
 * Обновить автомобиль клиента
 */
export async function updateClientCar(
  id: string,
  data: Partial<Omit<ClientCar, 'id' | 'created_at'>>
): Promise<ClientCar> {
  const { data: updatedCar, error } = await supabase
    .from('client_cars')
    .update({
      car_model: data.car_model?.trim(),
      plate_number: data.plate_number?.trim().toUpperCase(),
      car_type: data.car_type?.trim(),
      is_active: data.is_active
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error(`Ошибка при обновлении автомобиля клиента ${id}:`, error)
    throw error
  }

  return updatedCar
}

/**
 * Удалить автомобиль клиента (soft delete - помечаем как неактивную)
 */
export async function deleteClientCar(carId: string): Promise<void> {
  console.log('[deleteClientCar] Удаление машины с ID:', carId)
  const { error } = await supabase
    .from('client_cars')
    .update({ is_active: false })
    .eq('id', carId)

  if (error) {
    console.error(`Ошибка при удалении автомобиля клиента ${carId}:`, error)
    throw error
  }
  console.log('[deleteClientCar] Машина успешно помечена как неактивная')
}

/**
 * Найти клиента по телефону (простой поиск)
 */
export async function findClientByPhone(phone: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('phone', normalizePhoneNumber(phone))
    .eq('is_active', true)
    .single()

  // PGRST116 = not found, это нормально
  if (error && error.code !== 'PGRST116') {
    console.error('Ошибка при поиске клиента:', error)
    throw error
  }

  return data as Client | null
}

/**
 * Получить клиента по profile_id
 */
export async function getClientByProfileId(profileId: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('profile_id', profileId)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('Ошибка при поиске клиента по profile_id:', error)
    throw error
  }

  return data as Client | null
}

/**
 * Получить машины клиента по profile_id
 */
export async function getClientCarsByProfileId(profileId: string): Promise<ClientCar[]> {
  // Сначала находим client_id по profile_id
  const client = await getClientByProfileId(profileId)

  if (!client) {
    return []
  }

  return getClientCars(client.id)
}

/**
 * Связать клиента с профилем
 */
export async function linkClientToProfile(
  clientId: string,
  profileId: string
): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update({ profile_id: profileId })
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    console.error('Ошибка при связывании клиента с профилем:', error)
    throw error
  }

  return data as Client
}

/**
 * Получить всех клиентов с их автомобилями (один запрос с JOIN)
 * Используется для базы клиентов в админке
 */
export async function getClientsWithCars(): Promise<Array<{
  client: Client;
  cars: ClientCar[];
}>> {
  const { data, error } = await supabase
    .from('clients')
    .select(`
      *,
      client_cars (
        id,
        client_id,
        car_model,
        plate_number,
        car_type,
        is_active,
        created_at
      )
    `)
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  if (error) {
    console.error('Ошибка при загрузке клиентов с автомобилями:', error)
    throw error
  }

  // Фильтруем только активные машины
  return (data || []).map(client => ({
    client: {
      id: client.id,
      full_name: client.full_name,
      phone: client.phone,
      is_active: client.is_active,
      notes: client.notes,
      profile_id: client.profile_id,
      online_booking_blocked_until: client.online_booking_blocked_until,
      created_at: client.created_at,
      updated_at: client.updated_at
    },
    cars: (client.client_cars as ClientCar[] || []).filter(car => car.is_active)
  }))
}
