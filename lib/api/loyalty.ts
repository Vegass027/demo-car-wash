/**
 * Loyalty-related pure helpers and types.
 *
 * Phase B (Slice #3e): browser-side reads (getClientLoyaltyProgress,
 * getLoyaltyProgressByProfileId, hasFreeBodyWashAvailable,
 * hasFreeBodyWashAvailableByProfileId, getWashesUntilNextFreeWash,
 * getWashesUntilNextFreeWashByProfileId) have been ported to
 * api/client.ts dispatcher (see lib/api/client-actions.ts for typed
 * wrappers). What remains here is the pure-logic eligibility check
 * (no DB reads) and the LoyaltyProgress type.
 *
 * Do NOT import this file from browser/client code for loyalty reads —
 * RLS changes in Slice #3e Phase D will revoke anon access to
 * loyalty_carwash_progress. Use lib/api/client-actions.ts
 * getMyLoyaltyProgressAction() / getMyFreeWashStatusAction() /
 * getMyWashesUntilNextFreeWashAction() instead.
 */

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
