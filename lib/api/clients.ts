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
  // DEPRECATED Phase A Slice #3e: was anon-side SELECT clients via supabase.
  // Replaced by staff dispatcher listClientsAction() (api/staff.ts).
  // Zero live callers per AST scan 27.08.2026.
  throw new Error('getClients: deprecated, use staff dispatcher list-clients');
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
 * DEPRECATED Phase A Slice #3e: was anon-side SELECT client_cars via supabase.
 * Replaced by staff dispatcher getClientCarsByClientIdAction() (api/staff.ts).
 * Zero live callers per AST scan 27.08.2026 (BookingWizard + TireBookingWizard
 * rewired; OnlineBookingWizard.tsx had only dead import — removed).
 */
export async function getClientCars(_clientId: string): Promise<ClientCar[]> {
  throw new Error('getClientCars: deprecated, use staff dispatcher get-client-cars-by-client-id');
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
 * Связать клиента с профилем
 */
export async function linkClientToProfile_DEPRECATED(
  _clientId: string,
  _profileId: string
): Promise<Client> {
  // DEPRECATED Phase A Slice #3e: was anon-side UPDATE clients via supabase.
  // Replaced by staff dispatcher path (api/staff.ts search-client-by-phone +
  // update-client). Zero live callers per AST scan 27.08.2026.
  // Kept as no-op stub for any external module-level import that might still
  // exist; safe to delete in next minor refactor.
  throw new Error('linkClientToProfile: deprecated, use staff dispatcher update-client');
}

/**
 * DEPRECATED Phase A Slice #3e: was anon-side SELECT clients via supabase.
 * Replaced by staff dispatcher listClientsWithCarsAction() (api/staff.ts).
 * Zero live callers per AST scan 27.08.2026.
 */
export async function getClientsWithCars_DEPRECATED(): Promise<Array<{
  client: Client;
  cars: ClientCar[];
}>> {
  throw new Error('getClientsWithCars: deprecated, use staff dispatcher list-clients-with-cars');
}
