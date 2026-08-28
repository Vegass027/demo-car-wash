import { useEffect, useState, useMemo } from 'react'
import { OnlineTireBookingWizard, OnlineTireBookingWizardData } from './OnlineTireBookingWizard'
import { TireTimeline } from '../admin/TireTimeline'
import { supabase, getSessionToken } from '../../lib/supabase'
import { loginViaTelegram, telegramAuthErrorUI, reloadMiniApp, TelegramAuthError } from '../../lib/client-auth'
import { getTireBookingsByProfileId } from '../../lib/api/tire-bookings'
import { findDriversByPhone } from '../../lib/api/organizations'
import { getClientOrganizationIds } from '../../lib/api/bookings'
import { normalizePhoneNumber } from '../../shared/utils/phone'
import { formatDate, addDays } from '../../shared/utils/date'
import { TireBooking } from '../../lib/api/tire-bookings'
import { Organization, OrganizationDriver, OrganizationCar } from '../../entities/organization/model'
import { Client } from '../../lib/api/clients'
import { getTireServiceDayStatus, getNextOpenTireServiceDate } from '../../lib/api/tire-service-days'
import { Lock, Clock } from 'lucide-react'

// =========================================================================
// Phase 2 / Slice #2: tire client flow.
//
// All OWN-booking reads and writes for the tire client path now go through
// the /api/client dispatcher (service_role-only writes) instead of the
// legacy anon paths in lib/api/tire-bookings.ts.
//
// * getTireBookingsByDate  → /api/client?action=get-tire-bookings
// * createOnlineTireBooking → /api/client?action=create-tire-booking
//
// Public availability (slot metadata for the timeline) still goes through
// `get_public_tire_booking_slots` (anon-callable RPC) — but the wrapper
// itself does not consume it directly; `TireTimeline` does via
// supabase-js subscriptions (out of scope for Slice #2, see TODO at end).
//
// Cancellation now lives in components/client/ActiveBookingCard.tsx via
// /api/client?action=cancel-tire-booking — this wrapper has no internal
// cancel handler (it renders TireTimeline which delegates the cancel UI
// to ActiveBookingCard through `onDelete`).
// =========================================================================

async function fetchOwnTireBookings(date: string): Promise<TireBooking[]> {
  const token = getSessionToken();
  if (!token) throw new Error('Missing session token (reopen Mini App)');
  const res = await fetch(`/api/client?action=get-tire-bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ date }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(`get-tire-bookings HTTP ${res.status}: ${body?.error || 'unknown'}`);
    (err as any).status = res.status;
    (err as any).body = body;
    throw err;
  }
  const body = await res.json();
  return (body?.data?.bookings ?? []) as TireBooking[];
}

async function postTireBookingToDispatcher(payload: AnyObj): Promise<TireBooking> {
  const token = getSessionToken();
  if (!token) throw new Error('Missing session token (reopen Mini App)');
  const res = await fetch(`/api/client?action=create-tire-booking`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const status = res.status;
    const errCode = body?.error || 'http_error';
    let message = `create-tire-booking HTTP ${status}: ${errCode}`;
    if (status === 409 && errCode === 'slot_occupied') {
      message = `Слот уже занят${body?.conflicting_count ? ` (конфликтов: ${body.conflicting_count})` : ''}`;
    } else if (status === 409 && errCode === 'duplicate_booking_for_car') {
      message = 'У этой машины уже есть запись на это время';
    } else if (status === 403) {
      message = `Доступ запрещён: ${errCode}`;
    }
    const err = new Error(message);
    (err as any).status = status;
    (err as any).body = body;
    throw err;
  }
  const body = await res.json();
  return body?.data?.booking as TireBooking;
}

type AnyObj = Record<string, any>;

interface ClientTireBookingWrapperProps {
  tireServices: any[];
  organizations: Organization[];
  organizationDrivers: OrganizationDriver[];
  organizationCars: OrganizationCar[];
  clients: Client[];
  onWizardOpen?: () => void;
  onWizardClose?: () => void;
  isWizardOpen?: boolean; // ✅ Один источник правды для состояния мастера
}

export function ClientTireBookingWrapper({
  tireServices,
  organizations,
  organizationDrivers,
  organizationCars,
  clients,
  onWizardOpen,
  onWizardClose,
  isWizardOpen = false // ✅ Один источник правды для состояния мастера
}: ClientTireBookingWrapperProps) {
  const [profileId, setProfileId] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string>('')
  const [profilePhone, setProfilePhone] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recoveryAction, setRecoveryAction] = useState<'reload_mini_app' | 'retry' | 'none'>('none')

  // Проверка блокировки
  const [isBlocked, setIsBlocked] = useState(false)
  const [isLoadingBlocked, setIsLoadingBlocked] = useState(true)
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null)

  // Данные для Timeline
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const SWITCH_HOUR = 18; // 18:00 МСК - время переключения для клиентов

    // После 18:00 для клиентов показываем завтра
    if (currentHour >= SWITCH_HOUR) {
      return formatDate(addDays(now, 1));
    }
    return formatDate(now);
  })
  const [bookingsByDate, setBookingsByDate] = useState<Record<string, TireBooking[]>>({})
  const bookings = useMemo(() => bookingsByDate[selectedDate] || [], [bookingsByDate, selectedDate])

  // ✅ Удален локальный showWizard state - используем isWizardOpen из props
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string;
    startTime: string;
  } | null>(null)

  // ✅ Новое состояние: статус работы шиномонтажа для выбранной даты
  const [isDayOpen, setIsDayOpen] = useState(true)
  const [nextOpenDateText, setNextOpenDateText] = useState<string | null>(null)
  
  // ✅ NEW: ID организаций, где клиент является водителем
  const [driverOrganizationIds, setDriverOrganizationIds] = useState<string[]>([])

  useEffect(() => {
    loadClientData()
  }, [])

  // Загрузка заказов при изменении даты
  useEffect(() => {
    if (profileId) {
      loadBookings()
    }
  }, [selectedDate, profileId])

  // ✅ Загрузка статуса дня при изменении selectedDate
  useEffect(() => {
    const loadDayStatus = async () => {
      try {
        const status = await getTireServiceDayStatus(selectedDate)
        setIsDayOpen(status)
        
        // Если день закрыт - находим ближайший открытый
        if (!status) {
          const nextOpenDate = await getNextOpenTireServiceDate(selectedDate)
          if (nextOpenDate) {
            const date = new Date(nextOpenDate)
            setNextOpenDateText(date.toLocaleDateString('ru-RU', { 
              day: 'numeric', 
              month: 'long' 
            }))
          } else {
            setNextOpenDateText(null)
          }
        }
      } catch (error) {
        console.error('[ClientTireBookingWrapper] Ошибка загрузки статуса дня:', error)
        setIsDayOpen(true) // По умолчанию открыт
      }
    }
    
    loadDayStatus()
  }, [selectedDate])

  // ✅ Realtime подписка на изменения в tire_service_days
  useEffect(() => {
    if (!profileId) return

    console.log('[ClientTireBookingWrapper] Подключение к Realtime для tire_service_days')

    const subscription = supabase
      .channel('client-tire-service-days')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tire_service_days'
      }, async (payload: any) => {
        console.log('[ClientTireBookingWrapper] Изменение в tire_service_days:', payload)

        const changedDate = payload.new?.service_date || payload.old?.service_date

        // Если изменилась выбранная дата - перезагружаем статус
        if (changedDate === selectedDate) {
          const status = await getTireServiceDayStatus(selectedDate)
          setIsDayOpen(status)

          if (!status) {
            const nextOpenDate = await getNextOpenTireServiceDate(selectedDate)
            if (nextOpenDate) {
              const date = new Date(nextOpenDate)
              setNextOpenDateText(date.toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long'
              }))
            }
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ClientTireBookingWrapper] Подписано на client-tire-service-days')
        }
      })

    return () => {
      console.log('[ClientTireBookingWrapper] Отключение от Realtime tire_service_days')
      subscription.unsubscribe()
    }
  }, [profileId, selectedDate])

  // ✅ Перезагружаем заказы после закрытия мастера (для СБП оплаты)
  // Bug 2 fix: retry up to 2 times on transient network failure. isMounted
  // guard prevents setState on unmounted component.
  useEffect(() => {
    if (!isWizardOpen || !profileId || !selectedDate) return;

    let isMounted = true;
    const MAX_RETRIES = 2;
    const RELOAD_DELAY_MS = 2000;
    const RETRY_DELAY_MS = 1000;

    async function reloadWithRetry(attempt = 0): Promise<void> {
      try {
        const data = await fetchOwnTireBookings(selectedDate);
        if (isMounted) {
          console.log('[ClientTireBookingWrapper] Заказы перезагружены:', data.length);
          setBookingsByDate(prev => cleanOldCache({
            ...prev,
            [selectedDate]: data || [],
          }));
        }
      } catch (error) {
        if (attempt < MAX_RETRIES && isMounted) {
          console.warn(`[ClientTireBookingWrapper] Reload attempt ${attempt + 1} failed, retrying...`);
          setTimeout(() => {
            if (isMounted) reloadWithRetry(attempt + 1);
          }, RETRY_DELAY_MS);
        } else if (isMounted) {
          console.error('[ClientTireBookingWrapper] Ошибка при перезагрузке заказов (после retries):', error);
        }
      }
    }

    console.log('[ClientTireBookingWrapper] Мастер закрыт, перезагружаем заказы через 2 секунды');
    const timeout = setTimeout(() => {
      if (isMounted) reloadWithRetry();
    }, RELOAD_DELAY_MS);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [isWizardOpen, profileId, selectedDate])

  // Функция для очистки старого кэша
  const MAX_CACHED_DATES = 14
  const cleanOldCache = (cache: Record<string, TireBooking[]>) => {
    const dates = Object.keys(cache)
    if (dates.length > MAX_CACHED_DATES) {
      const sorted = dates.sort()
      const toKeep = sorted.slice(-MAX_CACHED_DATES)
      return Object.fromEntries(toKeep.map(d => [d, cache[d]]))
    }
    return cache
  }

  // ✅ Supabase Realtime подписка на изменения в tire_bookings (postgres_changes)
  useEffect(() => {
    if (!profileId) return

    console.log('[ClientTireBookingWrapper] Подключение к Realtime для tire_bookings (postgres_changes)')

    const subscription = supabase
      .channel('client-tire-booking:tire_bookings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tire_bookings'
      }, async (payload: any) => {
        console.log('[ClientTireBookingWrapper] Изменение в tire_bookings:', payload)

        const bookingDate = payload.new?.booking_date || payload.old?.booking_date;

        if (bookingDate) {
          // Перезагружаем данные из БД для конкретной даты (игнорируя кэш)
          try {
            const data = await fetchOwnTireBookings(bookingDate);
            setBookingsByDate(prev => cleanOldCache({
              ...prev,
              [bookingDate]: data || []
            }));
          } catch (error) {
            console.error('[ClientTireBookingWrapper] Ошибка загрузки заказов из БД:', error);
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ClientTireBookingWrapper] Подписано на client-tire-booking:tire_bookings')
        }
      })

    return () => {
      console.log('[ClientTireBookingWrapper] Отключение от Realtime')
      subscription.unsubscribe()
    }
  }, [profileId])

  // ✅ Проверка блокировки клиента
  useEffect(() => {
    const checkBlock = async () => {
      if (!profileId) return
      
      try {
        const { data: client } = await supabase
          .from('clients')
          .select('online_booking_blocked_until')
          .eq('profile_id', profileId)
          .single()
        
        if (client?.online_booking_blocked_until) {
          setIsBlocked(true)
          // Форматируем дату из YYYY-MM-DD в DD.MM.YYYY
          const [year, month, day] = client.online_booking_blocked_until.split('-');
          const formattedDate = `${day}.${month}.${year}`;
          setBlockedUntil(formattedDate)
        } else {
          setIsBlocked(false)
          setBlockedUntil(null)
        }
        setIsLoadingBlocked(false)
      } catch (error) {
        setIsBlocked(false)
        setIsLoadingBlocked(false)
      }
    }
    
    checkBlock()
  }, [profileId])

  const loadClientData = async () => {
    try {
      console.log('[ClientTireBookingWrapper] Начало загрузки данных клиента');

      // Phase 1.6b: single HMAC-verified call replaces 4-step telegram_id lookup.
      // Server-side role-check (api/telegram-auth) ensures only client role
      // gets a JWT — admin/owner with linked Telegram get 403 here.
      const { profile_id, full_name } = await loginViaTelegram();

      // Найти client по profile_id (через wrapper с JWT).
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, online_booking_blocked_until, phone')
        .eq('profile_id', profile_id)
        .single();

      let resolvedClientId: string;
      let resolvedPhone: string | null = null;

      if (clientError || !client) {
        console.log('[ClientTireBookingWrapper] Клиент не найден, создаём автоматически');
        try {
          // Phase 1.5: replace anon INSERT with /api/link-client-profile
          // (client-only, service_role-backed). JWT is the same one set by
          // loginViaTelegram() above.
          const token = getSessionToken();
          if (!token) throw new Error('No session token for link-client-profile');

          const res = await fetch('/api/link-client-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              full_name: full_name || '',
              phone: '', // empty OK if row exists; endpoint returns 400 for new row
            }),
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const errMsg = errBody.error || `HTTP ${res.status}`;
            console.error('[ClientTireBookingWrapper] link-client-profile failed:', res.status, errMsg);
            throw new Error(errMsg);
          }

          const { client: newClient } = await res.json();
          resolvedClientId = newClient.id;
        } catch (createError: any) {
          console.error('[ClientTireBookingWrapper] Ошибка при создании клиента:', createError);
          setError(createError?.message || 'Ошибка при создании клиента');
          setLoading(false);
          return;
        }
      } else {
        resolvedClientId = client.id;
        resolvedPhone = client.phone || null;
      }

      console.log('[ClientTireBookingWrapper] Данные загружены успешно');
      setProfileId(profile_id);
      setClientId(resolvedClientId);
      setProfileName(full_name || '');
      setProfilePhone(resolvedPhone || '');

      // Загружаем организации, где клиент — водитель (по phone из clients)
      if (resolvedPhone) {
        try {
          const orgIds = await getClientOrganizationIds(resolvedPhone);
          setDriverOrganizationIds(orgIds);
        } catch (error) {
          console.error('[ClientTireBookingWrapper] Ошибка загрузки организаций клиента:', error);
        }
      }

      // Загружаем заказы
      await loadBookings()
    } catch (err) {
      // TelegramAuthError has typed `kind` — map to user-friendly UI.
      // Other errors (e.g. supabase query failure) fall through to generic.
      const maybeAuthErr = err as Partial<TelegramAuthError>;
      if (maybeAuthErr && typeof maybeAuthErr.kind === 'string') {
        const ui = telegramAuthErrorUI(maybeAuthErr.kind as TelegramAuthError['kind']);
        setError(ui.message);
        setRecoveryAction(ui.recovery);
      } else {
        console.error('[ClientTireBookingWrapper] Error loading client:', err);
        setError('Ошибка загрузки данных');
        setRecoveryAction('retry');
      }
    } finally {
      setLoading(false)
    }
  }

  const loadBookings = async () => {
    if (!profileId) return

    try {
      // Проверяем кэш
      if (bookingsByDate[selectedDate]) {
        console.log('[ClientTireBookingWrapper] Загрузка заказов из кэша для даты:', selectedDate)
        return bookingsByDate[selectedDate]
      }

      // Загружаем из БД
      const data = await fetchOwnTireBookings(selectedDate)
      console.log('[ClientTireBookingWrapper] Заказы загружены из БД:', data.length)
      setBookingsByDate(prev => cleanOldCache({
        ...prev,
        [selectedDate]: data || []
      }))
    } catch (error) {
      console.error('[ClientTireBookingWrapper] Error loading bookings:', error)
    }
  }

  const handleSlotClick = (hour: number) => {
    console.log('[ClientTireBookingWrapper] Выбран слот:', hour)
    const startTime = `${hour.toString().padStart(2, '0')}:00`
    setSelectedSlot({
      date: selectedDate,
      startTime
    })
    // ✅ Вызываем onWizardOpen для установки isWizardOpen = true в App.tsx
    onWizardOpen?.()
  }

  const handleWizardBack = () => {
    setSelectedSlot(null)
    // ✅ Вызываем onWizardClose для установки isWizardOpen = false в App.tsx
    onWizardClose?.()
  }

  const handleBack = () => {
    // Возврат в личный кабинет (TODO)
    window.location.hash = 'client-dashboard'
  }

  const handleComplete = async (data: OnlineTireBookingWizardData) => {
    try {
      // Определяем параметры для создания записи
      const isOrg = data.selectedCarType === 'organization';
      
      // Если это организационная машина - находим driver_id по телефону
      let driverId = data.driver_id;
      if (isOrg && !driverId && profilePhone) {
        try {
          const driversData = await findDriversByPhone(profilePhone);
          if (driversData && driversData.length > 0) {
            driverId = driversData[0].driver.id;
          }
        } catch (error) {
          console.error('Error finding driver:', error);
        }
      }

      // Создаем запись через dispatcher /api/client?action=create-tire-booking
      // (Phase 2 / Slice #2 — service_role INSERT, server-resolves
      // client_id + created_by_profile_id, validates 4-ID ownership,
      // overlap-checked via find_tire_booking_overlap RPC).
      await postTireBookingToDispatcher({
        car_model: data.carModel,
        plate_number: data.plateNumber,
        services: data.services,
        total_price: data.price,
        payment_method: data.paymentMethod,
        booking_date: data.bookingDate,
        start_time: data.startTime,
        estimated_duration: data.estimatedDuration,
        organization_id: data.organization_id || undefined,
        driver_id: driverId || undefined,
        car_id: data.car_id || undefined,
        client_car_id: data.client_car_id || undefined,
      });

      console.log('[ClientTireBookingWrapper] Заказ создан успешно')
      // Успешно - закрываем мастер и перезагружаем заказы
      setSelectedSlot(null)
      onWizardClose?.() // ✅ Вызываем callback для скрытия подвала
      await loadBookings()
      alert('Запись успешно создана!')
    } catch (err) {
      console.error('[ClientTireBookingWrapper] Error completing tire booking:', err)
      const errMsg = (err as Error)?.message || 'Ошибка при создании записи'
      setError(errMsg)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Загрузка...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-xl font-bold text-red-800 mb-2">Ошибка</h2>
          <p className="text-red-600">{error}</p>
          {recoveryAction === 'reload_mini_app' && (
            <button
              onClick={reloadMiniApp}
              className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Перезагрузить Mini App
            </button>
          )}
          {recoveryAction === 'retry' && (
            <button
              onClick={() => loadClientData()}
              className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Повторить
            </button>
          )}
          {recoveryAction === 'none' && (
            <button
              onClick={() => window.location.reload()}
              className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Попробовать снова
            </button>
          )}
        </div>
      </div>
    )
  }

  // Блокировка клиента
  if (isBlocked && !isLoadingBlocked) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 min-h-screen">
        <div className="text-center p-8">
          <Lock className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <div className="text-lg font-bold text-gray-700 mb-2">
            Онлайн запись для вас недоступна
          </div>
          {blockedUntil && (
            <div className="flex items-center justify-center gap-2 text-gray-600 mb-3">
              <Clock className="w-5 h-5" />
              <span>Доступ вернется: <span className="font-bold">{blockedUntil}</span></span>
            </div>
          )}
          <div className="text-gray-600">
            Чтобы записаться, позвоните по номеру: <span className="font-bold">89965228101</span>
          </div>
        </div>
      </div>
    )
  }

  console.log('[ClientTireBookingWrapper] Рендер:', {
    profileId,
    clientId,
    isWizardOpen,
    selectedSlot,
    selectedDate,
    bookingsCount: bookings.length
  })

  if (!profileId || !clientId) {
    console.log('[ClientTireBookingWrapper] Возвращаем null - нет profileId или clientId')
    return null
  }

  // Если открыт мастер - показываем его
  if (isWizardOpen && selectedSlot) {
    console.log('[ClientTireBookingWrapper] Показываем мастер')
    return (
      <OnlineTireBookingWizard
        onBack={handleWizardBack}
        onComplete={handleComplete}
        onWizardClose={onWizardClose}
        profileId={profileId}
        clientId={clientId}
        profileName={profileName}
        profilePhone={profilePhone}
        tireServices={tireServices}
        organizations={organizations}
        organizationDrivers={organizationDrivers}
        organizationCars={organizationCars}
        clients={clients}
        selectedDate={selectedDate}
        selectedSlot={selectedSlot}
        existingBookings={bookings}
      />
    )
  }

  // Иначе показываем Timeline
  console.log('[ClientTireBookingWrapper] Показываем Timeline')
  return (
    <>
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 pt-safe telegram-safe-area-top">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Запись на шиномонтаж</h1>

        {/* Бейдж с режимом работы */}
        <div className="inline-flex items-center gap-2 border-2 border-black bg-white px-4 py-2 rounded-full mb-3">
          <Clock className="w-4 h-4 text-black" />
          <span className="text-base font-medium text-black">Режим работы с 8:00 до 18:00</span>
        </div>

        <p className="text-gray-600">Выберите свободное время для записи</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 pb-safe telegram-safe-area-bottom">
        <TireTimeline
          bookings={bookings}
          userRole="client"
          currentProfileId={profileId}
          driverOrganizationIds={driverOrganizationIds}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onCreateBooking={handleSlotClick}
          showAddButton={false}
          isDayOpen={isDayOpen}
          nextOpenDateText={nextOpenDateText}
        />
      </div>
    </>
  )
}
