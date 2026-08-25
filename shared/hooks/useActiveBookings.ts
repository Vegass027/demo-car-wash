import { useState, useEffect } from 'react';
import { getBookingsByProfileId, Booking, getAllBookingsForClient } from '../../lib/api/bookings';
import { getTireBookingsByProfileId, TireBooking, getAllTireBookingsForClient } from '../../lib/api/tire-bookings';
import { supabase } from '../../lib/supabase';

export interface ActiveBookingData {
  carwashBookings: Booking[];
  tireBookings: TireBooking[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useActiveBookings(
  profileId: string | null | undefined,
  profilePhone?: string | null
): ActiveBookingData {
  const [carwashBookings, setCarwashBookings] = useState<Booking[]>([]);
  const [tireBookings, setTireBookings] = useState<TireBooking[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveBookings = async () => {
    if (!profileId) {
      setCarwashBookings([]);
      setTireBookings([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // ✅ Получаем ВСЕ записи клиента (личные + организационные)
      const allCarwashBookings = await getAllBookingsForClient(profileId, profilePhone);
      // Фильтруем только активные (ОЖИДАЕТ, В РАБОТЕ)
      const activeCarwashBookings = allCarwashBookings.filter(
        (booking) => booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ'
      );

      // ✅ Получаем ВСЕ записи шиномонтажа (личные + организационные)
      const allTireBookings = await getAllTireBookingsForClient(profileId, profilePhone);
      // Фильтруем только активные (ОЖИДАЕТ, В РАБОТЕ)
      const activeTireBookings = allTireBookings.filter(
        (booking) => booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ'
      );

      setCarwashBookings(activeCarwashBookings);
      setTireBookings(activeTireBookings);
    } catch (err) {
      console.error('Error fetching active bookings:', err);
      setError('Не удалось загрузить актуальные записи');
    } finally {
      setIsLoading(false);
    }
  };

  // Первичная загрузка при монтировании
  useEffect(() => {
    fetchActiveBookings();
  }, [profileId, profilePhone]);

  // ✅ Supabase Realtime подписка на изменения в bookings и tire_bookings
  useEffect(() => {
    if (!profileId) return;

    console.log('[useActiveBookings] Подключение к Realtime для bookings и tire_bookings');

    // Подписка на bookings (автомойка) с фильтрацией по profile_id
    const bookingsSubscription = supabase
      .channel('active-bookings:bookings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `created_by_profile_id=eq.${profileId}`
      }, async (payload: any) => {
        console.log('[useActiveBookings] Изменение в bookings:', payload);

        // ✅ Оптимистичное обновление без мигания
        if (payload.eventType === 'UPDATE' && payload.new) {
          // Обновляем запись в массиве напрямую из payload
          setCarwashBookings(prev => {
            const updated = prev.map(booking =>
              booking.id === payload.new.id ? payload.new : booking
            );
            // Фильтруем только активные
            return updated.filter(
              (booking) => booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ'
            );
          });
        } else if (payload.eventType === 'INSERT' && payload.new) {
          // Добавляем новую запись
          setCarwashBookings(prev => {
            const withNew = [...prev, payload.new];
            // Фильтруем только активные
            return withNew.filter(
              (booking) => booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ'
            );
          });
        } else if (payload.eventType === 'DELETE') {
          // Удаляем запись
          setCarwashBookings(prev => prev.filter(booking => booking.id !== payload.old.id));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[useActiveBookings] Подписано на active-bookings:bookings');
        }
      });

    // Подписка на tire_bookings (шиномонтаж) с фильтрацией по profile_id
    const tireBookingsSubscription = supabase
      .channel('active-bookings:tire_bookings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tire_bookings',
        filter: `created_by_profile_id=eq.${profileId}`
      }, async (payload: any) => {
        console.log('[useActiveBookings] Изменение в tire_bookings:', payload);

        // ✅ Оптимистичное обновление без мигания
        if (payload.eventType === 'UPDATE' && payload.new) {
          // Обновляем запись в массиве напрямую из payload
          setTireBookings(prev => {
            const updated = prev.map(booking =>
              booking.id === payload.new.id ? payload.new : booking
            );
            // Фильтруем только активные
            return updated.filter(
              (booking) => booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ'
            );
          });
        } else if (payload.eventType === 'INSERT' && payload.new) {
          // Добавляем новую запись
          setTireBookings(prev => {
            const withNew = [...prev, payload.new];
            // Фильтруем только активные
            return withNew.filter(
              (booking) => booking.status === 'ОЖИДАЕТ' || booking.status === 'В РАБОТЕ'
            );
          });
        } else if (payload.eventType === 'DELETE') {
          // Удаляем запись
          setTireBookings(prev => prev.filter(booking => booking.id !== payload.old.id));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[useActiveBookings] Подписано на active-bookings:tire_bookings');
        }
      });

    return () => {
      console.log('[useActiveBookings] Отключение от Realtime');
      bookingsSubscription.unsubscribe();
      tireBookingsSubscription.unsubscribe();
    };
  }, [profileId]);

  return {
    carwashBookings,
    tireBookings,
    isLoading,
    error,
    refetch: fetchActiveBookings,
  };
}
