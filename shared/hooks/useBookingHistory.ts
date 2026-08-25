import { useState, useEffect } from 'react';
import { getBookingsByProfileId, Booking } from '../../lib/api/bookings';
import { getTireBookingsByProfileId, TireBooking } from '../../lib/api/tire-bookings';
import { supabase } from '../../lib/supabase';

export interface BookingHistoryData {
  carwashBookings: Booking[];
  tireBookings: TireBooking[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useBookingHistory(profileId: string | null | undefined): BookingHistoryData {
  const [carwashBookings, setCarwashBookings] = useState<Booking[]>([]);
  const [tireBookings, setTireBookings] = useState<TireBooking[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookingHistory = async () => {
    if (!profileId) {
      setCarwashBookings([]);
      setTireBookings([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Получаем все записи на автомойку
      const allCarwashBookings = await getBookingsByProfileId(profileId);
      // Фильтруем только завершенные (ГОТОВО)
      const completedCarwashBookings = allCarwashBookings.filter(
        (booking) => booking.status === 'ГОТОВО'
      );

      // Получаем все записи на шиномонтаж
      const allTireBookings = await getTireBookingsByProfileId(profileId);
      // Фильтруем только завершенные (ГОТОВО)
      const completedTireBookings = allTireBookings.filter(
        (booking) => booking.status === 'ГОТОВО'
      );

      setCarwashBookings(completedCarwashBookings);
      setTireBookings(completedTireBookings);
    } catch (err) {
      console.error('Error fetching booking history:', err);
      setError('Не удалось загрузить историю записей');
    } finally {
      setIsLoading(false);
    }
  };

  // Первичная загрузка при монтировании
  useEffect(() => {
    fetchBookingHistory();
  }, [profileId]);

  // ✅ Supabase Realtime подписка на изменения в bookings и tire_bookings
  useEffect(() => {
    if (!profileId) return;

    console.log('[useBookingHistory] Подключение к Realtime для bookings и tire_bookings');

    // Подписка на bookings (автомойка) с фильтрацией по profile_id
    const bookingsSubscription = supabase
      .channel('booking-history:bookings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `created_by_profile_id=eq.${profileId}`
      }, async (payload: any) => {
        console.log('[useBookingHistory] Изменение в bookings:', payload);

        // ✅ Оптимистичное обновление без мигания
        if (payload.eventType === 'UPDATE' && payload.new) {
          // Обновляем запись в массиве напрямую из payload
          setCarwashBookings(prev => {
            const updated = prev.map(booking =>
              booking.id === payload.new.id ? payload.new : booking
            );
            // Фильтруем только завершенные
            return updated.filter((booking) => booking.status === 'ГОТОВО');
          });
        } else if (payload.eventType === 'INSERT' && payload.new) {
          // Добавляем новую запись
          setCarwashBookings(prev => {
            const withNew = [...prev, payload.new];
            // Фильтруем только завершенные
            return withNew.filter((booking) => booking.status === 'ГОТОВО');
          });
        } else if (payload.eventType === 'DELETE') {
          // Удаляем запись
          setCarwashBookings(prev => prev.filter(booking => booking.id !== payload.old.id));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[useBookingHistory] Подписано на booking-history:bookings');
        }
      });

    // Подписка на tire_bookings (шиномонтаж) с фильтрацией по profile_id
    const tireBookingsSubscription = supabase
      .channel('booking-history:tire_bookings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tire_bookings',
        filter: `created_by_profile_id=eq.${profileId}`
      }, async (payload: any) => {
        console.log('[useBookingHistory] Изменение в tire_bookings:', payload);

        // ✅ Оптимистичное обновление без мигания
        if (payload.eventType === 'UPDATE' && payload.new) {
          // Обновляем запись в массиве напрямую из payload
          setTireBookings(prev => {
            const updated = prev.map(booking =>
              booking.id === payload.new.id ? payload.new : booking
            );
            // Фильтруем только завершенные
            return updated.filter((booking) => booking.status === 'ГОТОВО');
          });
        } else if (payload.eventType === 'INSERT' && payload.new) {
          // Добавляем новую запись
          setTireBookings(prev => {
            const withNew = [...prev, payload.new];
            // Фильтруем только завершенные
            return withNew.filter((booking) => booking.status === 'ГОТОВО');
          });
        } else if (payload.eventType === 'DELETE') {
          // Удаляем запись
          setTireBookings(prev => prev.filter(booking => booking.id !== payload.old.id));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[useBookingHistory] Подписано на booking-history:tire_bookings');
        }
      });

    return () => {
      console.log('[useBookingHistory] Отключение от Realtime');
      bookingsSubscription.unsubscribe();
      tireBookingsSubscription.unsubscribe();
    };
  }, [profileId]);

  return {
    carwashBookings,
    tireBookings,
    isLoading,
    error,
    refetch: fetchBookingHistory,
  };
}
