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
  // ✅ Phase E (a) P0: own client_id for Realtime filter narrowing.
  //    loyalty_carwash_progress table has only `client_id` as ownership column
  //    (no `profile_id`/`created_by_profile_id`). Without this filter, the
  //    subscription receives every client's loyalty row — payload.new flows
  //    directly into setCurrentWashes / setFreeWashPending, leaking client B's
  //    data into client A's UI. With filter `client_id=eq.<own>`, Supabase WS
  //    applies narrowing server-side (verified in realtime-p2-smoke.mjs).
  const [ownClientId, setOwnClientId] = useState<string | null>(null);

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
          setOwnClientId(progress.client_id); // capture for Realtime filter
          setCurrentWashes(progress.total_washes_with_body);
          setFreeWashPending(progress.free_wash_pending || false); // ✅ Загружаем флаг
          const { remaining: washesUntilFree } = await getMyWashesUntilNextFreeWashAction();
          setWashesUntilFree(washesUntilFree);
        } else {
          // Если прогресса нет - первая мойка через 10
          setOwnClientId(null);
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
    //    ✅ Phase E (a) P0: filter narrowed to own client_id — server-side
    //       blocking of foreign rows (P2 smoke verified narrowing works).
    //       Without this filter, payload.new for client B's row flows into
    //       setCurrentWashes/setFreeWashPending — a functionally-visible bug
    //       where client A sees "you have a free wash" + client B's counter.
    //    ⚠️ Until ownClientId is resolved (progress loaded), we do NOT
    //       subscribe at all — avoids a window where the subscription would
    //       accept any row. Client without progress row cannot have one
    //       created via Realtime path; if a row is INSERTed, the next
    //       poll/refetch picks it up via the dispatcher.
    const subscription = ownClientId
      ? supabase
          .channel('loyalty-progress:updates')
          .on(
            'postgres_changes',
            {
              event: '*', // Все события: INSERT, UPDATE, DELETE
              schema: 'public',
              table: 'loyalty_carwash_progress',
              filter: `client_id=eq.${ownClientId}`,
            },
            async (payload: any) => {
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
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('[useLoyaltyProgress] Подписано на loyalty_carwash_progress (filter: client_id=eq.' + ownClientId + ')');
            }
          })
      : null;

    return () => {
      console.log('[useLoyaltyProgress] Отключение от Realtime');
      if (subscription) subscription.unsubscribe();
    };
  }, [profileId, ownClientId]);

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
