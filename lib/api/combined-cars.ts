import { supabase } from '../supabase'
import { normalizePhoneNumber } from '../../shared/utils/phone'

/**
 * Комбинированный автомобиль (личный или организационный)
 */
export interface CombinedCar {
  id: string
  car_model: string
  plate_number: string
  car_type: string
  type: 'personal' | 'organization'
  organization_id?: string
  organization_name?: string
}

/**
 * Получает все автомобили клиента (личные + организационные)
 * 
 * @param clientId - ID клиента
 * @param clientPhone - Телефон клиента (для поиска в организации)
 * @returns Массив всех автомобилей клиента
 */
export async function getClientCombinedCars(
  clientId: string,
  clientPhone: string
): Promise<CombinedCar[]> {
  const results: CombinedCar[] = []
  const normalizedPhone = normalizePhoneNumber(clientPhone)

  console.log('[getClientCombinedCars] Загрузка машин, clientId:', clientId, 'phone:', normalizedPhone)

  try {
    // 1. Получаем личные машины клиента
    console.log('[getClientCombinedCars] Загружаем личные машины...')
    const { data: clientCars, error: clientCarsError } = await supabase
      .from('client_cars')
      .select('id, car_model, plate_number, car_type')
      .eq('client_id', clientId)
      .eq('is_active', true)

    console.log('[getClientCombinedCars] Личные машины - data:', clientCars, 'error:', clientCarsError)

    if (clientCarsError) {
      console.error('Ошибка при загрузке личных машин:', clientCarsError)
    } else if (clientCars) {
      console.log('[getClientCombinedCars] Найдено личных машин:', clientCars.length)
      clientCars.forEach((car: any) => {
        results.push({
          id: car.id,
          car_model: car.car_model,
          plate_number: car.plate_number,
          car_type: car.car_type,
          type: 'personal'
        })
      })
    }

    // 2. Проверяем, является ли клиент водителем организации
    console.log('[getClientCombinedCars] Проверяем водителя организации...')
    const { data: drivers, error: driversError } = await supabase
      .from('organization_drivers')
      .select('id, organization_id')
      .eq('phone', normalizedPhone)
      .eq('is_active', true)
      .limit(1)

    console.log('[getClientCombinedCars] Водители организации - data:', drivers, 'error:', driversError)

    if (driversError) {
      console.error('Ошибка при поиске водителя в организациях:', driversError)
    } else if (drivers && drivers.length > 0) {
      // Клиент является водителем организации
      const driver = drivers[0] as any
      const organizationId = driver.organization_id

      // Получаем название организации
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single()

      const organizationName = org?.name || ''

      console.log('Клиент является водителем организации:', organizationName, 'ID:', organizationId)

      // 3. Получаем организационные машины
      console.log('[getClientCombinedCars] Загружаем организационные машины...')
      const { data: orgCars, error: orgCarsError } = await supabase
        .from('organization_cars')
        .select('id, car_model, plate_number, car_type')
        .eq('organization_id', organizationId)
        .eq('is_active', true)

      console.log('[getClientCombinedCars] Организационные машины - data:', orgCars, 'error:', orgCarsError)

      if (orgCarsError) {
        console.error('Ошибка при загрузке организационных машин:', orgCarsError)
      } else if (orgCars) {
        console.log('[getClientCombinedCars] Найдено организационных машин:', orgCars.length)
        orgCars.forEach((car: any) => {
          results.push({
            id: car.id,
            car_model: car.car_model,
            plate_number: car.plate_number,
            car_type: car.car_type || 'SEDAN', // Используем car_type из БД
            type: 'organization',
            organization_id: organizationId,
            organization_name: organizationName
          })
        })
      }
    }

    console.log('[getClientCombinedCars] Итого машин:', results.length, results)
    return results
  } catch (error) {
    console.error('Ошибка при загрузке комбинированного списка машин:', error)
    return []
  }
}
