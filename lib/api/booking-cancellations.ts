/**
 * Server-side booking cancellation utilities.
 *
 * Phase B (Slice #3e): browser-side reads (getCancellationCountByProfileId,
 * isProfileBlockedForOnlineBooking, etc.) have been ported to
 * api/client.ts dispatcher (see lib/api/client-actions.ts for typed
 * wrappers). What remains here is server-side mutation logic only —
 * called from service_role paths (admin dispatcher, triggers) and
 * server-side cron jobs.
 *
 * Do NOT import this file from browser/client code — RLS changes in
 * Slice #3e Phase D will revoke anon access to booking_cancellations.
 * Use lib/api/client-actions.ts getMyCancellationCountAction() and
 * getMyBlockStatusAction() instead.
 */

import { supabase } from '../supabase';

/**
 * Запись об отмене бронирования
 */
export interface BookingCancellation {
  id: string;
  client_id: string;
  booking_id?: string;
  tire_booking_id?: string;
  cancelled_at: string;
  reason?: string;
}

/**
 * Создать запись об отмене
 */
export async function createCancellation(cancellationData: {
  client_id: string;
  booking_id?: string;
  tire_booking_id?: string;
  reason?: string;
}): Promise<BookingCancellation | null> {
  const { data, error } = await supabase
    .from('booking_cancellations')
    .insert({
      ...cancellationData,
      cancelled_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    return null;
  }

  return data;
}

/**
 * Заблокировать клиента для онлайн-записи
 */
export async function blockClientForOnlineBooking(
  clientId: string,
  days: number = 30
): Promise<boolean> {
  const blockedUntil = new Date();
  blockedUntil.setTime(blockedUntil.getTime() + days * 24 * 60 * 60 * 1000);

  const blockedUntilDate = blockedUntil.toISOString().split('T')[0];

  const { error } = await supabase
    .from('clients')
    .update({ online_booking_blocked_until: blockedUntilDate })
    .eq('id', clientId);

  if (error) {
    return false;
  }

  return true;
}

/**
 * Разблокировать клиента для онлайн-записи
 */
export async function unblockClientForOnlineBooking(clientId: string): Promise<boolean> {
  const { error } = await supabase
    .from('clients')
    .update({ online_booking_blocked_until: null })
    .eq('id', clientId);

  if (error) {
    return false;
  }

  return true;
}

/**
 * Обработать отмену бронирования клиентом
 * Создает запись об отмене и блокирует клиента если это 3-я отмена за 30 дней
 */
export async function handleClientCancellation(cancellationData: {
  client_id: string;
  booking_id?: string;
  tire_booking_id?: string;
  reason?: string;
}): Promise<{ success: boolean; blocked?: boolean; blockedUntil?: string }> {
  const cancellation = await createCancellation(cancellationData);
  if (!cancellation) {
    return { success: false };
  }

  const startDate = new Date();
  startDate.setTime(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const { count } = await supabase
    .from('booking_cancellations')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', cancellationData.client_id)
    .gte('cancelled_at', startDate.toISOString());

  const cancellationCount = count || 0;

  if (cancellationCount >= 3) {
    const blocked = await blockClientForOnlineBooking(cancellationData.client_id, 30);
    if (blocked) {
      const blockedUntil = new Date();
      blockedUntil.setTime(blockedUntil.getTime() + 30 * 24 * 60 * 60 * 1000);
      return { success: true, blocked: true, blockedUntil: blockedUntil.toISOString() };
    }
  }

  return { success: true, blocked: false };
}
