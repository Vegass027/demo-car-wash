import { supabase } from '../supabase'
import { normalizePhoneNumber } from '../../shared/utils/phone'

export interface SearchResult {
  type: 'client' | 'organization'

  // Для физлиц
  client_id?: string
  client_name?: string
  client_cars?: Array<{
    id: string
    car_model: string
    plate_number: string
    car_type: string
  }>
  // Блокировка онлайн-записи (только для клиентов)
  online_booking_blocked_until?: string | null

  // Для юрлиц
  organization_id?: string
  organization_name?: string
  driver_id?: string
  driver_name?: string
  organization_cars?: Array<{
    id: string
    car_model: string
    plate_number: string
    car_type: string // ✅ Добавлено поле car_type
  }>

  // Общее
  phone: string
}

/**
 * Универсальный поиск по телефону
 * Ищет ОДНОВРЕМЕННО в clients и organization_drivers
 * Поддерживает разные форматы номеров телефонов
 */
export async function searchByPhone(phone: string): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const normalizedPhone = normalizePhoneNumber(phone)
  
  // Поиск в физлицах с машинами (по нормализованному номеру)
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select(`
      id,
      full_name,
      phone,
      online_booking_blocked_until,
      client_cars(id, car_model, plate_number, car_type, is_active)
    `)
    .eq('phone', normalizedPhone)
    .eq('is_active', true)

  if (clientsError) {
    console.error('Ошибка при поиске в clients:', clientsError)
  } else if (clients && clients.length > 0) {
    clients.forEach((client: any) => {
      // ✅ Фильтруем только активные машины (is_active = true)
      const activeCars = (client.client_cars || []).filter((car: any) => car.is_active === true)
      
      results.push({
        type: 'client',
        client_id: client.id,
        client_name: client.full_name,
        client_cars: activeCars,
        online_booking_blocked_until: client.online_booking_blocked_until,
        phone: client.phone
      })
    })
  }

  // Поиск в водителях организаций (по нормализованному номеру)
  const { data: drivers, error: driversError } = await supabase
    .from('organization_drivers')
    .select(`
      id,
      full_name,
      phone,
      organization_id,
      organizations!inner(id, name)
    `)
    .eq('phone', normalizedPhone)
    .eq('is_active', true)

  if (driversError) {
    console.error('Ошибка при поиске в organization_drivers:', driversError)
  } else if (drivers && drivers.length > 0) {
    // Получаем ВСЕХ водителей найденной организации
    const organizationId = drivers[0].organization_id
    const organizationName = (drivers[0] as any).organizations?.name || ''
    
    console.log('Найдена организация:', organizationName, 'ID:', organizationId)
    
    const { data: allDrivers, error: allDriversError } = await supabase
      .from('organization_drivers')
      .select('id, full_name, phone, organization_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
    
    if (allDriversError) {
      console.error('Ошибка при загрузке всех водителей организации:', allDriversError)
    } else if (allDrivers) {
      // Получаем автомобили организации (один раз для всех водителей)
      const { data: orgCars, error: orgCarsError } = await supabase
        .from('organization_cars')
        .select('id, car_model, plate_number, car_type') // ✅ Добавлено car_type
        .eq('organization_id', organizationId)
        .eq('is_active', true)

      if (orgCarsError) {
        console.error('Ошибка при загрузке автомобилей организации:', orgCarsError)
      }

      // Добавляем ВСЕХ водителей организации с их машинами
      allDrivers.forEach((driver: any) => {
        results.push({
          type: 'organization',
          organization_id: driver.organization_id,
          organization_name: organizationName,
          driver_id: driver.id,
          driver_name: driver.full_name,
          organization_cars: orgCars || [],
          phone: driver.phone
        })
      })
    }
  }

  return results
}

/**
 * Поиск по гос номеру автомобиля
 * Ищет в client_cars и organization_cars
 */
export async function searchByPlateNumber(plateNumber: string): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const normalizedPlate = plateNumber.trim().toUpperCase()
  
  // 1. Поиск в личных машинах клиентов
  const { data: clientCars, error: clientCarsError } = await supabase
    .from('client_cars')
    .select(`
      id,
      car_model,
      plate_number,
      car_type,
      client_id,
      clients!inner(id, full_name, phone, online_booking_blocked_until)
    `)
    .eq('plate_number', normalizedPlate)
    .eq('is_active', true)
  
  if (!clientCarsError && clientCars) {
    // Группируем по клиенту (один клиент может иметь несколько машин)
    const clientsMap = new Map<string, SearchResult>()
    
    clientCars.forEach((car: any) => {
      const clientId = car.clients.id
      if (!clientsMap.has(clientId)) {
        clientsMap.set(clientId, {
          type: 'client',
          client_id: clientId,
          client_name: car.clients.full_name,
          phone: car.clients.phone,
          online_booking_blocked_until: car.clients.online_booking_blocked_until,
          client_cars: []
        })
      }
      clientsMap.get(clientId)!.client_cars!.push({
        id: car.id,
        car_model: car.car_model,
        plate_number: car.plate_number,
        car_type: car.car_type
      })
    })
    
    results.push(...Array.from(clientsMap.values()))
  }
  
  // 2. Поиск в организационных машинах
  const { data: orgCars, error: orgCarsError } = await supabase
    .from('organization_cars')
    .select(`
      id,
      car_model,
      plate_number,
      car_type,
      organization_id,
      organizations!inner(id, name)
    `)
    .eq('plate_number', normalizedPlate)
    .eq('is_active', true)
  
  if (!orgCarsError && orgCars && orgCars.length > 0) {
    const orgId = orgCars[0].organization_id
    const orgName = (orgCars[0] as any).organizations?.name || ''
    
    // Получаем всех водителей этой организации
    const { data: drivers } = await supabase
      .from('organization_drivers')
      .select('id, full_name, phone')
      .eq('organization_id', orgId)
      .eq('is_active', true)
    
    if (drivers) {
      drivers.forEach((driver: any) => {
        results.push({
          type: 'organization',
          organization_id: orgId,
          organization_name: orgName,
          driver_id: driver.id,
          driver_name: driver.full_name,
          organization_cars: orgCars.map((car: any) => ({
            id: car.id,
            car_model: car.car_model,
            plate_number: car.plate_number,
            car_type: car.car_type
          })),
          phone: driver.phone || ''
        })
      })
    }
  }
  
  return results
}
