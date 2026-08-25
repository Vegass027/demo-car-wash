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
 * Получить количество отмен клиента за период
 */
export async function getClientCancellationCount(
  clientId: string,
  days: number = 30
): Promise<number> {
  const startDate = new Date();
  startDate.setTime(startDate.getTime() - days * 24 * 60 * 60 * 1000);

  const { count, error } = await supabase
    .from('booking_cancellations')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('cancelled_at', startDate.toISOString());

  if (error) {
    return 0;
  }

  return count || 0;
}

/**
 * Получить количество отмен по profile_id
 */
export async function getCancellationCountByProfileId(
  profileId: string,
  days: number = 30
): Promise<number> {
  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('profile_id', profileId)
    .single();

  if (clientError || !clientData) {
    return 0;
  }

  return getClientCancellationCount(clientData.id, days);
}

/**
 * Проверить заблокирован ли клиент для онлайн-записи
 */
export async function isClientBlockedForOnlineBooking(clientId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('clients')
    .select('online_booking_blocked_until')
    .eq('id', clientId)
    .single();

  if (error || !data) {
    return false;
  }

  if (!data.online_booking_blocked_until) {
    return false;
  }

  const blockedUntil = new Date(data.online_booking_blocked_until);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return blockedUntil >= today;
}

/**
 * Проверить заблокирован ли клиент для онлайн-записи по profile_id
 */
export async function isProfileBlockedForOnlineBooking(profileId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, online_booking_blocked_until')
    .eq('profile_id', profileId)
    .single();

  if (error || !data) {
    return false;
  }

  return isClientBlockedForOnlineBooking(data.id);
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

  const cancellationCount = await getClientCancellationCount(cancellationData.client_id, 30);

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
