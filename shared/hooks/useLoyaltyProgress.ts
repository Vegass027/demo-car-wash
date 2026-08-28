import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getMyLoyaltyProgressAction, getMyWashesUntilNextFreeWashAction } from '../../lib/api/client-actions';
import { LOYALTY_CONFIG } from '../config/loyalty';

export interface LoyaltyProgressData {
  currentWashes: number;
  washesUntilFree: number;
  progressPercentage: number;
  hasFreeWashAvailable: boolean;
  freeWashPending: boolean; // ✅ Флаг бонусной мойки из БД
  isLoading: boolean;
  error: string | null;
}

export function useLoyaltyProgress(profileId: string | null | undefined): LoyaltyProgressData {
  const [currentWashes, setCurrentWashes] = useState<number>(0);
  const [washesUntilFree, setWashesUntilFree] = useState<number>(LOYALTY_CONFIG.FREE_WASH_AFTER);
  const [freeWashPending, setFreeWashPending] = useState<boolean>(false); // ✅ Новый state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) {
      setIsLoading(false);
      return;
    }

    async function fetchLoyaltyProgress() {
      try {
        setIsLoading(true);
        setError(null);

        // Phase B: dispatcher reads via /api/client, identity from JWT (no profileId param).
        const { progress } = await getMyLoyaltyProgressAction();

        if (progress) {
          setCurrentWashes(progress.total_washes_with_body);
          setFreeWashPending(progress.free_wash_pending || false); // ✅ Загружаем флаг
          const { remaining: washesUntilFree } = await getMyWashesUntilNextFreeWashAction();
          setWashesUntilFree(washesUntilFree);
        } else {
          // Если прогресса нет - первая мойка через 10
          setCurrentWashes(0);
          setFreeWashPending(false);
          setWashesUntilFree(LOYALTY_CONFIG.FREE_WASH_AFTER);
        }
      } catch (err) {
        console.error('Error fetching loyalty progress:', err);
        setError('Не удалось загрузить прогресс лояльности');
      } finally {
        setIsLoading(false);
      }
    }

    // Первичная загрузка
    fetchLoyaltyProgress();

    // ✅ Supabase Realtime подписка на изменения в loyalty_carwash_progress
    const subscription = supabase
      .channel('loyalty-progress:updates')
      .on('postgres_changes', {
        event: '*', // Все события: INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'loyalty_carwash_progress'
      }, async (payload: any) => {
        console.log('[useLoyaltyProgress] Изменение в loyalty_carwash_progress:', payload);
        
        // ✅ Мгновенное обновление без мигания
        if (payload.eventType === 'UPDATE' && payload.new) {
          // Для UPDATE обновляем состояние напрямую из payload (без запроса к БД)
          const newProgress = payload.new;
          setCurrentWashes(newProgress.total_washes_with_body);
          setFreeWashPending(newProgress.free_wash_pending || false); // ✅ Обновляем флаг
          
          // Вычисляем washesUntilFree локально без запроса к БД
          const nextFree = Math.ceil(newProgress.total_washes_with_body / LOYALTY_CONFIG.FREE_WASH_AFTER) * LOYALTY_CONFIG.FREE_WASH_AFTER;
          setWashesUntilFree(nextFree - newProgress.total_washes_with_body);
        } else if (payload.eventType === 'INSERT' && payload.new) {
          // Для INSERT загружаем данные полностью (первичная загрузка)
          await fetchLoyaltyProgress();
        } else if (payload.eventType === 'DELETE') {
          // Для DELETE сбрасываем состояние
          setCurrentWashes(0);
          setFreeWashPending(false);
          setWashesUntilFree(LOYALTY_CONFIG.FREE_WASH_AFTER);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[useLoyaltyProgress] Подписано на loyalty_carwash_progress');
        }
      });

    return () => {
      console.log('[useLoyaltyProgress] Отключение от Realtime');
      subscription.unsubscribe();
    };
  }, [profileId]);

  // Вычисляем процент прогресса
  const progressPercentage = Math.min(
    (currentWashes / LOYALTY_CONFIG.FREE_WASH_AFTER) * 100,
    100
  );

  // ✅ Проверяем доступна ли бесплатная мойка - теперь используем флаг из БД
  const hasFreeWashAvailable = freeWashPending;

  return {
    currentWashes,
    washesUntilFree,
    progressPercentage,
    hasFreeWashAvailable,
    freeWashPending, // ✅ Добавляем в return
    isLoading,
    error,
  };
}
