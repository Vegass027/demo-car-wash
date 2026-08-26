import { useState, useEffect } from 'react';
import { supabase, getSessionToken } from '../../lib/supabase';
import { CombinedCar } from '../../lib/api/combined-cars';

// Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
//
// Previous version: anon SELECTs against clients (public_all_access) and
// organization_drivers (joined by phone) → cross-tenant leak risk. Plus
// anon INSERT against client_cars (Category C will block).
//
// Replaced with a single server-side boundary:
//   fetchCars  → POST /api/client?action=get-my-cars  (Bearer JWT, server-admin)
//   addCar     → POST /api/client?action=create-car   (server-admin)
// Realtime subscription on client_cars kept (filter restricts to client_id);
// organization_cars realtime removed because the org link is server-managed.
//
// Phase 2 / Category C is still applied table-level; this hook is now safe
// pre-Category because the server is the trust boundary. After Category C,
// this hook remains correct (the endpoint does not rely on anon reads).

export interface UseClientCarsResult {
  cars: CombinedCar[];
  isLoading: boolean;
  error: string | null;
  addCar: (carModel: string, plateNumber: string, carType: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const SERVER_ERRORS: Record<string, string> = {
  client_profile_not_linked: 'Клиент не найден. Перезагрузите Mini App.',
  car_model_required: 'Укажите марку машины.',
  plate_number_bad_format: 'Неверный формат гос. номера.',
  plate_number_required: 'Укажите гос. номер.',
  car_type_invalid: 'Неверный тип автомобиля.',
  missing_authorization: 'Сессия истекла. Перезагрузите Mini App.',
  invalid_or_expired_token: 'Сессия истекла. Перезагрузите Mini App.',
  wrong_role: 'Эта секция только для клиентов.',
};

function mapServerError(code: string): string {
  return SERVER_ERRORS[code] ?? 'Не удалось обновить список машин';
}

export function useClientCars(profileId: string | null | undefined, profilePhone: string | null | undefined): UseClientCarsResult {
  const [cars, setCars] = useState<CombinedCar[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  const fetchCars = async () => {
    if (!profileId) {
      setCars([]);
      setIsLoading(false);
      return;
    }
    const token = getSessionToken();
    if (!token) {
      setCars([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch('/api/client?action=get-my-cars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = body?.error || '';
        if (res.status === 404 && code === 'client_profile_not_linked') {
          // Server says no profile yet — clear the list, no error UI needed.
          setCars([]);
          setClientId(null);
          return;
        }
        throw new Error(code || `HTTP ${res.status}`);
      }

      const data = body?.data;
      if (!data) throw new Error('empty response');

      const ownId: string | null = data?.client?.id ?? null;
      setClientId(ownId);

      const serverCars: CombinedCar[] = Array.isArray(data?.combined_cars)
        ? data.combined_cars
        : [];
      setCars(serverCars);
    } catch (err: any) {
      console.error('[useClientCars] fetchCars error:', err);
      // Heuristic: if msg looks like a server error code, map it.
      const code = typeof err?.message === 'string' ? err.message : '';
      setError(mapServerError(code));
      setCars([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCars();
  }, [profileId]);

  // Realtime: still useful for own-cars live updates. Server-side role check
  // limits RLS after Category C; pre-Category this publishes events but the
  // channel filter restricts to the client_id we already captured.
  useEffect(() => {
    if (!clientId) return;

    const clientCarsSubscription = supabase
      .channel('client-cars:client_cars')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'client_cars',
        filter: `client_id=eq.${clientId}`,
      }, () => {
        // Refetch via server (which already includes the just-touched row
        // with full PII). Simpler than optimistic patch.
        void fetchCars();
      })
      .subscribe();

    return () => {
      void clientCarsSubscription.unsubscribe();
    };
  }, [clientId]);

  const addCar = async (carModel: string, plateNumber: string, carType: string) => {
    const token = getSessionToken();
    if (!token) {
      const m = mapServerError('missing_authorization');
      setError(m);
      throw new Error(m);
    }
    try {
      setError(null);
      const res = await fetch('/api/client?action=create-car', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ car_model: carModel, plate_number: plateNumber, car_type: carType }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = body?.error || `HTTP ${res.status}`;
        const friendly = mapServerError(code);
        setError(friendly);
        throw new Error(friendly);
      }
      // Realtime will trigger fetchCars() once the server-side insert is captured.
    } catch (err) {
      const friendly = err instanceof Error ? err.message : 'Не удалось добавить машину';
      setError(friendly);
      throw err;
    }
  };

  return {
    cars,
    isLoading,
    error,
    addCar,
    refetch: fetchCars,
  };
}
