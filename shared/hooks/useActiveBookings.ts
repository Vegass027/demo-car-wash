import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Booking, getAllBookingsForClient } from '../../lib/api/bookings';
import { TireBooking, getAllTireBookingsForClient } from '../../lib/api/tire-bookings';

const ACTIVE_STATUSES = ['ОЖИДАЕТ', 'В РАБОТЕ'] as const;

function isActive(booking: { status: string }): boolean {
  return ACTIVE_STATUSES.includes(booking.status as typeof ACTIVE_STATUSES[number]);
}

/**
 * useActiveBookings — управляет списком активных (ОЖИДАЕТ/В РАБОТЕ) броней
 * клиента для вкладки "Мой гараж".
 *
 * Источники обновления:
 *   1. Initial fetch через REST (`getAllBookingsForClient` + getAllTireBookingsForClient).
 *   2. Realtime subscription на postgres_changes с фильтром
 *      `created_by_profile_id=eq.${profileId}`.
 *   3. Локальный append после успешного create (BUG3 fix): если Realtime
 *      событие не дошло в Telegram WKWebView, создатель брони всё равно
 *      увидит её мгновенно. Dedup по id защищает от дубля, если Realtime
 *      тоже сработает.
 *
 * Cancel-flow уже обработан: ActiveBookingCard вызывает onDelete после
 * успешного cancel-API, что удаляет запись из state сразу (не зависит от
 * Realtime UPDATE-события).
 */
export interface UseActiveBookingsResult {
  carwashBookings: Booking[];
  tireBookings: TireBooking[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  appendCarwashBooking: (booking: Booking) => void;
  appendTireBooking: (booking: TireBooking) => void;
}

export function useActiveBookings(
  profileId: string | null | undefined,
  driverIds: string[]
): UseActiveBookingsResult {
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

      const [cw, tb] = await Promise.all([
        getAllBookingsForClient(profileId, driverIds ?? []),
        getAllTireBookingsForClient(profileId, driverIds ?? []),
      ]);

      setCarwashBookings(cw.filter(isActive));
      setTireBookings(tb.filter(isActive));
    } catch (err: any) {
      console.error('[useActiveBookings] fetchActiveBookings error:', err);
      setError(err?.message || 'Не удалось загрузить бронирования');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial / deps-change fetch
  useEffect(() => {
    fetchActiveBookings();
  }, [profileId, driverIds]);

  // Realtime subscription. Фильтр по created_by_profile_id матчит оба
  // сценария: личная бронь (создал сам клиент) и орг-бронь от водителя
  // (но физлицо, не менеджер — см. policy RLS на стороне сервера).
  useEffect(() => {
    if (!profileId) return;

    const filter = `created_by_profile_id=eq.${profileId}`;

    const bookingsSubscription = supabase
      .channel('active-bookings:bookings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter,
      }, (payload: any) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          setCarwashBookings(prev => {
            const updated = prev.map(booking =>
              booking.id === payload.new.id ? payload.new : booking
            );
            return updated.filter(isActive);
          });
        } else if (payload.eventType === 'INSERT' && payload.new) {
          setCarwashBookings(prev => {
            if (prev.some(b => b.id === payload.new.id)) return prev;
            return [...prev, payload.new].filter(isActive);
          });
        } else if (payload.eventType === 'DELETE') {
          setCarwashBookings(prev =>
            prev.filter(booking => booking.id !== payload.old.id)
          );
        }
      })
      .subscribe();

    const tireBookingsSubscription = supabase
      .channel('active-bookings:tire_bookings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tire_bookings',
        filter,
      }, (payload: any) => {
        if (payload.eventType === 'UPDATE' && payload.new) {
          setTireBookings(prev => {
            const updated = prev.map(booking =>
              booking.id === payload.new.id ? payload.new : booking
            );
            return updated.filter(isActive);
          });
        } else if (payload.eventType === 'INSERT' && payload.new) {
          setTireBookings(prev => {
            if (prev.some(b => b.id === payload.new.id)) return prev;
            return [...prev, payload.new].filter(isActive);
          });
        } else if (payload.eventType === 'DELETE') {
          setTireBookings(prev =>
            prev.filter(booking => booking.id !== payload.old.id)
          );
        }
      })
      .subscribe();

    return () => {
      void bookingsSubscription.unsubscribe();
      void tireBookingsSubscription.unsubscribe();
    };
  }, [profileId]);

  // BUG3 fix: локальный append после server-confirmed create. Срабатывает
  // РАНЬШЕ Realtime (если он вообще доставит событие), и не зависит от
  // iOS WKWebView WS quirks. Dedup by id защищает от дубля.
  const appendCarwashBooking = (booking: Booking) => {
    setCarwashBookings(prev => {
      if (prev.some(b => b.id === booking.id)) return prev;
      if (!isActive(booking)) return prev;
      return [...prev, booking];
    });
  };

  const appendTireBooking = (booking: TireBooking) => {
    setTireBookings(prev => {
      if (prev.some(b => b.id === booking.id)) return prev;
      if (!isActive(booking)) return prev;
      return [...prev, booking];
    });
  };

  return {
    carwashBookings,
    tireBookings,
    isLoading,
    error,
    refetch: fetchActiveBookings,
    appendCarwashBooking,
    appendTireBooking,
  };
}
