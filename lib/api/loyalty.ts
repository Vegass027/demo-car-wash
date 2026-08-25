import { supabase } from '../supabase';
import { LOYALTY_CONFIG } from '../../shared/config/loyalty';

/**
 * Прогресс лояльности клиента
 */
export interface LoyaltyProgress {
  id: string;
  client_id: string;
  total_washes_with_body: number;
  free_wash_pending: boolean; // ✅ TRUE = бонусная мойка доступна, ждёт использования
  last_booking_id?: string;
  last_wash_date?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Проверить содержит ли заказ услуги для лояльности
 * Условия:
 * 1. Есть услуга "Полная мойка (кузов + салон)" (full-wash)
 * 2. ИЛИ есть услуги кузова И салона одновременно
 * 3. ИЛИ есть услуга химчистки салона (salon-dry-clean)
 *
 * @param serviceIds - массив ID услуг в заказе
 * @returns true если заказ засчитывается для лояльности
 */
export function isBookingEligibleForLoyalty(serviceIds: string[]): boolean {
  // 1. Проверяем наличие полной мойки (кузов + салон)
  if (serviceIds.includes(LOYALTY_CONFIG.FULL_WASH_SERVICE_ID)) {
    return true;
  }

  // 2. Проверяем наличие услуг кузова И салона одновременно
  const hasBodyWash = serviceIds.some(id =>
    LOYALTY_CONFIG.BODY_WASH_SERVICE_IDS.includes(id as any)
  );
  const hasInteriorWash = serviceIds.some(id =>
    LOYALTY_CONFIG.INTERIOR_WASH_SERVICE_IDS.includes(id as any)
  );

  if (hasBodyWash && hasInteriorWash) {
    return true;
  }

  // 3. Проверяем наличие химчистки салона
  if (serviceIds.includes('salon-dry-clean')) {
    return true;
  }

  return false;
}

/**
 * Получить прогресс лояльности клиента
 */
export async function getClientLoyaltyProgress(clientId: string): Promise<LoyaltyProgress | null> {
  const { data, error } = await supabase
    .from('loyalty_carwash_progress')
    .select('*')
    .eq('client_id', clientId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Запись не найдена - возвращаем null
      return null;
    }
    console.error('Error fetching loyalty progress:', error);
    return null;
  }

  return data;
}

/**
 * Получить прогресс лояльности по profile_id
 */
export async function getLoyaltyProgressByProfileId(profileId: string): Promise<LoyaltyProgress | null> {
  // Сначала находим client_id по profile_id
  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('profile_id', profileId)
    .single();

  if (clientError || !clientData) {
    console.error('Error fetching client by profile_id:', clientError);
    return null;
  }

  return getClientLoyaltyProgress(clientData.id);
}

/**
 * Проверить доступна ли бесплатная мойка кузова
 * ✅ Теперь проверяем поле free_wash_pending вместо вычисления
 */
export async function hasFreeBodyWashAvailable(clientId: string): Promise<boolean> {
  const progress = await getClientLoyaltyProgress(clientId);

  if (!progress) {
    return false;
  }

  // ✅ Проверяем флаг free_wash_pending из БД
  return progress.free_wash_pending === true;
}

/**
 * Проверить доступна ли бесплатная мойка по profile_id
 * ✅ Теперь проверяем поле free_wash_pending вместо вычисления
 */
export async function hasFreeBodyWashAvailableByProfileId(profileId: string): Promise<boolean> {
  const progress = await getLoyaltyProgressByProfileId(profileId);

  if (!progress) {
    return false;
  }

  // ✅ Проверяем флаг free_wash_pending из БД
  return progress.free_wash_pending === true;
}

/**
 * Получить количество моек до следующей бесплатной мойки
 */
export async function getWashesUntilNextFreeWash(clientId: string): Promise<number> {
  const progress = await getClientLoyaltyProgress(clientId);

  if (!progress) {
    return 10; // Первая бесплатная мойка через 10 моек
  }

  const currentCount = progress.total_washes_with_body;
  const nextFree = Math.ceil(currentCount / 10) * 10;

  return nextFree - currentCount;
}

/**
 * Получить количество моек до следующей бесплатной мойки по profile_id
 */
export async function getWashesUntilNextFreeWashByProfileId(profileId: string): Promise<number> {
  const progress = await getLoyaltyProgressByProfileId(profileId);

  if (!progress) {
    return 10; // Первая бесплатная мойка через 10 моек
  }

  const currentCount = progress.total_washes_with_body;
  const nextFree = Math.ceil(currentCount / 10) * 10;

  return nextFree - currentCount;
}
