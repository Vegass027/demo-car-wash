import { supabase } from '../supabase';

/**
 * Настройки онлайн-записи
 */
export interface BookingSettings {
  id: string;
  service_type: 'carwash' | 'tire';
  work_start_time: string;
  work_end_time: string;
  online_booking_enabled: boolean;
  max_days_ahead: number;
  total_boxes: number;
  slot_duration_minutes: number;
  updated_at: string;
}

/**
 * Получить настройки онлайн-записи для типа сервиса
 */
export async function getBookingSettings(serviceType: 'carwash' | 'tire'): Promise<BookingSettings | null> {
  const { data, error } = await supabase
    .from('booking_settings')
    .select('*')
    .eq('service_type', serviceType)
    .single();

  if (error) {
    console.error('Error fetching booking settings:', error);
    return null;
  }

  return data;
}

/**
 * Получить все настройки онлайн-записи
 */
export async function getAllBookingSettings(): Promise<BookingSettings[]> {
  const { data, error } = await supabase
    .from('booking_settings')
    .select('*')
    .order('service_type');

  if (error) {
    console.error('Error fetching all booking settings:', error);
    return [];
  }

  return data || [];
}

/**
 * Обновить настройки онлайн-записи
 */
export async function updateBookingSettings(
  serviceType: 'carwash' | 'tire',
  settings: Partial<Omit<BookingSettings, 'id' | 'service_type' | 'updated_at'>>
): Promise<BookingSettings | null> {
  const { data, error } = await supabase
    .from('booking_settings')
    .update({
      ...settings,
      updated_at: new Date().toISOString()
    })
    .eq('service_type', serviceType)
    .select()
    .single();

  if (error) {
    console.error('Error updating booking settings:', error);
    return null;
  }

  return data;
}

/**
 * Включить/выключить онлайн-запись
 */
export async function toggleOnlineBooking(
  serviceType: 'carwash' | 'tire',
  enabled: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from('booking_settings')
    .update({ online_booking_enabled: enabled })
    .eq('service_type', serviceType);

  if (error) {
    console.error('Error toggling online booking:', error);
    return false;
  }

  return true;
}
