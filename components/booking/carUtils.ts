import { ClientCar } from '../../lib/api/clients';
import { OrganizationCar } from '../../entities/organization/model';

/**
 * Проверяет, изменилось ли значение поля автомобиля
 */
export function checkCarFieldChanged(
  currentValue: string,
  originalValue: string
): boolean {
  return currentValue !== originalValue;
}

/**
 * Отслеживает изменения полей автомобиля
 */
export interface CarChangeTracking {
  originalModel: string;
  originalNumber: string;
  isModelChanged: boolean;
  isNumberChanged: boolean;
}

export function trackCarChanges(
  currentModel: string,
  currentNumber: string,
  car: ClientCar | OrganizationCar | null
): CarChangeTracking {
  if (!car) {
    return {
      originalModel: '',
      originalNumber: '',
      isModelChanged: false,
      isNumberChanged: false
    };
  }

  return {
    originalModel: car.car_model,
    originalNumber: car.plate_number,
    isModelChanged: checkCarFieldChanged(currentModel, car.car_model),
    isNumberChanged: checkCarFieldChanged(currentNumber, car.plate_number)
  };
}

/**
 * Унифицированная функция обновления автомобиля
 */
export async function updateCar(
  clientType: 'PHYSICAL' | 'ORG',
  carId: string,
  updates: {
    car_model?: string;
    plate_number?: string;
  }
): Promise<void> {
  const { updateClientCar } = await import('../../lib/api/clients');
  const { updateOrganizationCar } = await import('../../lib/api/organizations');

  if (clientType === 'ORG') {
    await updateOrganizationCar(carId, updates);
  } else {
    await updateClientCar(carId, updates);
  }
}

/**
 * Получает автомобиль по ID из массива
 */
export function findCarById<T extends { id: string }>(
  cars: T[],
  carId: string | null
): T | null {
  if (!carId) return null;
  return cars.find(c => c.id === carId) || null;
}
