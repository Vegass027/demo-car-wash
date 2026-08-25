import { useState, useEffect } from 'react';
import { createClientCar, getClientByProfileId } from '../../lib/api/clients';
import { getClientCombinedCars, CombinedCar } from '../../lib/api/combined-cars';
import { supabase } from '../../lib/supabase';
import { normalizePhoneNumber } from '../../shared/utils/phone';

export interface UseClientCarsResult {
  cars: CombinedCar[];
  isLoading: boolean;
  error: string | null;
  addCar: (carModel: string, plateNumber: string, carType: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useClientCars(profileId: string | null | undefined, profilePhone: string | null | undefined): UseClientCarsResult {
  const [cars, setCars] = useState<CombinedCar[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  console.log('[useClientCars] Инициализация хука, profileId:', profileId, 'profilePhone:', profilePhone);

  const fetchCars = async () => {
    console.log('[useClientCars] fetchCars вызван, profileId:', profileId, 'profilePhone:', profilePhone);

    if (!profileId || !profilePhone) {
      console.log('[useClientCars] profileId или profilePhone отсутствуют, очищаем список');
      setCars([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Получаем клиента по profile_id
      console.log('[useClientCars] Получаем клиента по profileId:', profileId);
      const client = await getClientByProfileId(profileId);

      if (!client) {
        console.log('[useClientCars] Клиент не найден');
        setCars([]);
        setClientId(null);
        setIsLoading(false);
        return;
      }

      console.log('[useClientCars] Клиент найден, clientId:', client.id);
      setClientId(client.id);

      // Получаем комбинированный список машин (личные + организационные)
      console.log('[useClientCars] Загружаем комбинированный список машин');
      const data = await getClientCombinedCars(client.id, profilePhone);
      console.log('[useClientCars] Загружено машин:', data.length, data);
      setCars(data);

      // Проверяем, является ли клиент водителем организации для подписки на organization_cars
      const normalizedPhone = normalizePhoneNumber(profilePhone);
      console.log('[useClientCars] Проверяем водителя организации, phone:', normalizedPhone);
      const { data: drivers } = await supabase
        .from('organization_drivers')
        .select('organization_id')
        .eq('phone', normalizedPhone)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (drivers) {
        console.log('[useClientCars] Водитель найден, organizationId:', drivers.organization_id);
        setOrganizationId(drivers.organization_id);
      } else {
        console.log('[useClientCars] Водитель не найден');
        setOrganizationId(null);
      }
    } catch (err) {
      console.error('[useClientCars] Ошибка загрузки машин:', err);
      setError('Не удалось загрузить список машин');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCars();
  }, [profileId, profilePhone]);

  // ✅ Supabase Realtime подписка на изменения в client_cars
  useEffect(() => {
    if (!clientId) {
      console.log('[useClientCars] clientId отсутствует, пропускаем создание подписки на client_cars');
      return;
    }

    console.log('[useClientCars] Подключение к Realtime для client_cars, clientId:', clientId);

    const clientCarsSubscription = supabase
      .channel('client-cars:client_cars')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'client_cars',
        filter: `client_id=eq.${clientId}`
      }, async (payload: any) => {
        console.log('[useClientCars] Изменение в client_cars:', payload);
        console.log('[useClientCars] Текущее количество машин до обновления:', cars.length);

        // ✅ Оптимистичное обновление без мигания
        if (payload.eventType === 'INSERT' && payload.new) {
          console.log('[useClientCars] INSERT - новая машина:', payload.new);
          // Добавляем новую личную машину
          setCars(prev => {
            const newCar: CombinedCar = {
              id: payload.new.id,
              car_model: payload.new.car_model,
              plate_number: payload.new.plate_number,
              car_type: payload.new.car_type,
              type: 'personal'
            };
            // Проверяем дубликаты
            const exists = prev.some(c => c.id === newCar.id);
            console.log('[useClientCars] Машина уже существует?', exists);
            const result = exists ? prev : [...prev, newCar];
            console.log('[useClientCars] Новое количество машин после INSERT:', result.length);
            return result;
          });
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          console.log('[useClientCars] UPDATE - обновленная машина:', payload.new);
          // Если машина помечена как неактивная - удаляем из списка
          if (payload.new.is_active === false) {
            console.log('[useClientCars] Машина помечена как неактивная, удаляем из списка');
            setCars(prev => {
              const result = prev.filter(car => car.id !== payload.new.id);
              console.log('[useClientCars] Новое количество машин после UPDATE (is_active=false):', result.length);
              return result;
            });
          } else {
            // Обновляем личную машину
            setCars(prev => prev.map(car =>
              car.id === payload.new.id && car.type === 'personal'
                ? {
                    ...car,
                    car_model: payload.new.car_model,
                    plate_number: payload.new.plate_number,
                    car_type: payload.new.car_type
                  }
                : car
            ));
          }
        } else if (payload.eventType === 'DELETE') {
          console.log('[useClientCars] DELETE - удаленная машина:', payload.old);
          // Удаляем личную машину
          setCars(prev => {
            const result = prev.filter(car => car.id !== payload.old.id);
            console.log('[useClientCars] Новое количество машин после DELETE:', result.length);
            return result;
          });
        }
      })
      .subscribe((status) => {
        console.log('[useClientCars] Статус подписки client-cars:client_cars:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[useClientCars] ✅ Подписано на client-cars:client_cars');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[useClientCars] ❌ Ошибка подписки на client_cars');
        } else if (status === 'TIMED_OUT') {
          console.error('[useClientCars] ❌ Таймаут подписки на client_cars');
        } else if (status === 'CLOSED') {
          console.log('[useClientCars] Подписка закрыта');
        }
      });

    return () => {
      console.log('[useClientCars] Отключение от Realtime (client_cars)');
      clientCarsSubscription.unsubscribe();
    };
  }, [clientId]);

  // ✅ Supabase Realtime подписка на изменения в organization_cars
  useEffect(() => {
    if (!organizationId) {
      console.log('[useClientCars] organizationId отсутствует, пропускаем создание подписки на organization_cars');
      return;
    }

    console.log('[useClientCars] Подключение к Realtime для organization_cars, organizationId:', organizationId);

    const orgCarsSubscription = supabase
      .channel('client-cars:organization_cars')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'organization_cars',
        filter: `organization_id=eq.${organizationId}`
      }, async (payload: any) => {
        console.log('[useClientCars] Изменение в organization_cars:', payload);

        // ✅ Оптимистичное обновление без мигания
        if (payload.eventType === 'INSERT' && payload.new) {
          console.log('[useClientCars] INSERT - новая орг. машина:', payload.new);
          // Добавляем новую организационную машину
          setCars(prev => {
            const newCar: CombinedCar = {
              id: payload.new.id,
              car_model: payload.new.car_model,
              plate_number: payload.new.plate_number,
              car_type: payload.new.car_type || 'SEDAN',
              type: 'organization',
              organization_id: organizationId,
              organization_name: prev.find(c => c.type === 'organization')?.organization_name || ''
            };
            // Проверяем дубликаты
            const exists = prev.some(c => c.id === newCar.id);
            const result = exists ? prev : [...prev, newCar];
            console.log('[useClientCars] Новое количество машин после INSERT:', result.length);
            return result;
          });
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          console.log('[useClientCars] UPDATE - обновленная орг. машина:', payload.new);
          // Обновляем организационную машину
          setCars(prev => prev.map(car =>
            car.id === payload.new.id && car.type === 'organization'
              ? {
                  ...car,
                  car_model: payload.new.car_model,
                  plate_number: payload.new.plate_number,
                  car_type: payload.new.car_type || 'SEDAN'
                }
              : car
          ));
        } else if (payload.eventType === 'DELETE') {
          console.log('[useClientCars] DELETE - удаленная орг. машина:', payload.old);
          // Удаляем организационную машину
          setCars(prev => {
            const result = prev.filter(car => car.id !== payload.old.id);
            console.log('[useClientCars] Новое количество машин после DELETE:', result.length);
            return result;
          });
        }
      })
      .subscribe((status) => {
        console.log('[useClientCars] Статус подписки client-cars:organization_cars:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[useClientCars] ✅ Подписано на client-cars:organization_cars');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[useClientCars] ❌ Ошибка подписки на organization_cars');
        } else if (status === 'TIMED_OUT') {
          console.error('[useClientCars] ❌ Таймаут подписки на organization_cars');
        } else if (status === 'CLOSED') {
          console.log('[useClientCars] Подписка закрыта');
        }
      });

    return () => {
      console.log('[useClientCars] Отключение от Realtime (organization_cars)');
      orgCarsSubscription.unsubscribe();
    };
  }, [organizationId]);

  // ✅ Supabase Realtime подписка на изменения в organization_drivers
  useEffect(() => {
    if (!profilePhone) {
      console.log('[useClientCars] profilePhone отсутствует, пропускаем создание подписки на organization_drivers');
      return;
    }

    const normalizedPhone = normalizePhoneNumber(profilePhone);
    console.log('[useClientCars] Подключение к Realtime для organization_drivers, phone:', normalizedPhone);

    const driversSubscription = supabase
      .channel('client-cars:organization_drivers')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'organization_drivers',
        filter: `phone=eq.${normalizedPhone}`
      }, async (payload: any) => {
        console.log('[useClientCars] Изменение в organization_drivers:', payload);

        // При изменении статуса водителя перезагружаем список машин
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
          console.log('[useClientCars] Перезагружаем список машин после изменения водителя');
          await fetchCars();
        }
      })
      .subscribe((status) => {
        console.log('[useClientCars] Статус подписки client-cars:organization_drivers:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[useClientCars] ✅ Подписано на client-cars:organization_drivers');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[useClientCars] ❌ Ошибка подписки на organization_drivers');
        } else if (status === 'TIMED_OUT') {
          console.error('[useClientCars] ❌ Таймаут подписки на organization_drivers');
        } else if (status === 'CLOSED') {
          console.log('[useClientCars] Подписка закрыта');
        }
      });

    return () => {
      console.log('[useClientCars] Отключение от Realtime (organization_drivers)');
      driversSubscription.unsubscribe();
    };
  }, [profilePhone]);

  const addCar = async (carModel: string, plateNumber: string, carType: string) => {
    console.log('[useClientCars] addCar вызван:', { carModel, plateNumber, carType });

    if (!profileId) {
      console.error('[useClientCars] profileId отсутствует');
      throw new Error('Необходимо авторизоваться для добавления машины');
    }

    try {
      setError(null);

      // Сначала получаем client_id по profile_id
      console.log('[useClientCars] Получаем клиента по profileId:', profileId);
      const client = await getClientByProfileId(profileId);

      if (!client) {
        console.error('[useClientCars] Клиент не найден');
        throw new Error('Клиент не найден');
      }

      console.log('[useClientCars] Создаем машину в БД, clientId:', client.id);
      // Создаем машину
      await createClientCar({
        client_id: client.id,
        car_model: carModel,
        plate_number: plateNumber,
        car_type: carType,
      });

      console.log('[useClientCars] Машина создана в БД, ждем realtime обновления');

      // ❌ НЕ вызываем fetchCars() - Realtime подписка сама обработает изменение
      // await fetchCars();
    } catch (err) {
      console.error('[useClientCars] Ошибка добавления машины:', err);
      setError('Не удалось добавить машину');
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
