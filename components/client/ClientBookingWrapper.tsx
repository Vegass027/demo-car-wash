import { useEffect, useState, useMemo } from 'react'
import { OnlineBookingWizard, OnlineBookingWizardData } from './OnlineBookingWizard'
import { DayTimeline } from '../admin/DayTimeline'
import { supabase } from '../../lib/supabase'
import { loginViaTelegram, telegramAuthErrorUI, reloadMiniApp, TelegramAuthError } from '../../lib/client-auth'
import { getBookingsByDate, Booking, createOnlineBooking, getClientOrganizationIds } from '../../lib/api/bookings'
import { formatDate, addDays } from '../../shared/utils/date'
import { createClient, createClientCar } from '../../lib/api/clients'
import { normalizePhoneNumber } from '../../shared/utils/phone'
import { findDriversByPhone } from '../../lib/api/organizations'
import { Service } from '../../lib/api/services'
import { Organization, OrganizationDriver, OrganizationCar } from '../../entities/organization/model'
import { Client } from '../../lib/api/clients'
import { getClientCombinedCars } from '../../lib/api/combined-cars'
import { isProfileBlockedForOnlineBooking } from '../../lib/api/booking-cancellations'
import { getClosedBoxesForDate, ClosedBox } from '../../lib/api/boxes'
import { Lock, Clock } from 'lucide-react'

interface ClientBookingWrapperProps {
  services: Service[];
  organizations: Organization[];
  organizationDrivers: OrganizationDriver[];
  organizationCars: OrganizationCar[];
  clients: Client[];
  onWizardOpen?: () => void;
  onWizardClose?: () => void;
  isWizardOpen?: boolean; // ✅ Один источник правды для состояния мастера
}

export function ClientBookingWrapper({
  services,
  organizations,
  organizationDrivers,
  organizationCars,
  clients,
  onWizardOpen,
  onWizardClose,
  isWizardOpen = false // ✅ Один источник правды для состояния мастера
}: ClientBookingWrapperProps) {
  const [profileId, setProfileId] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string>('')
  const [profilePhone, setProfilePhone] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recoveryAction, setRecoveryAction] = useState<'reload_mini_app' | 'retry' | 'none'>('none')
  const [combinedCars, setCombinedCars] = useState<any[]>([])
  // ✅ NEW: ID организаций, где клиент является водителем
  const [driverOrganizationIds, setDriverOrganizationIds] = useState<string[]>([])

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
  const [bookingsByDate, setBookingsByDate] = useState<Record<string, Booking[]>>({})
  const bookings = useMemo(() => bookingsByDate[selectedDate] || [], [bookingsByDate, selectedDate])
  const [closedBoxesByDate, setClosedBoxesByDate] = useState<Record<string, Map<number, number[]>>>({})
  const closedBoxes = useMemo(() => closedBoxesByDate[selectedDate] || new Map(), [closedBoxesByDate, selectedDate])

  // ✅ Удален локальный showWizard state - используем isWizardOpen из props
  const [selectedSlot, setSelectedSlot] = useState<{ hour: number; boxNumber: number } | null>(null)

  useEffect(() => {
    loadClientData()
  }, [])

  // Загрузка заказов при изменении даты
  useEffect(() => {
    if (profileId) {
      loadBookings()
    }
  }, [selectedDate, profileId])

  // ✅ Перезагружаем заказы после закрытия мастера (для СБП оплаты)
  // Bug 2 fix: retry up to 2 times on transient network failure (Safari
  // "Load failed" — fetch-level error, no HTTP body). isMounted guard
  // prevents setState on unmounted component when user navigates away
  // during retry window.
  useEffect(() => {
    if (!isWizardOpen || !profileId || !selectedDate) return;

    let isMounted = true;
    const MAX_RETRIES = 2;
    const RELOAD_DELAY_MS = 2000;
    const RETRY_DELAY_MS = 1000;

    async function reloadWithRetry(attempt = 0): Promise<void> {
      try {
        const data = await getBookingsByDate(selectedDate);
        if (isMounted) {
          console.log('[ClientBookingWrapper] Заказы перезагружены:', data.length);
          setBookingsByDate(prev => cleanOldCache({
            ...prev,
            [selectedDate]: data || [],
          }));
        }
      } catch (error) {
        if (attempt < MAX_RETRIES && isMounted) {
          console.warn(`[ClientBookingWrapper] Reload attempt ${attempt + 1} failed, retrying...`);
          setTimeout(() => {
            if (isMounted) reloadWithRetry(attempt + 1);
          }, RETRY_DELAY_MS);
        } else if (isMounted) {
          console.error('[ClientBookingWrapper] Ошибка при перезагрузке заказов (после retries):', error);
        }
      }
    }

    console.log('[ClientBookingWrapper] Мастер закрыт, перезагружаем заказы через 2 секунды');
    const timeout = setTimeout(() => {
      if (isMounted) reloadWithRetry();
    }, RELOAD_DELAY_MS); // Даём webhook'у 2 секунды на создание заказа

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [isWizardOpen, profileId, selectedDate])

  // Загрузка закрытых боксов при изменении даты (с кэшированием)
  useEffect(() => {
    const loadClosedBoxes = async () => {
      try {
        // Проверяем кэш
        if (closedBoxesByDate[selectedDate]) {
          console.log('[ClientBookingWrapper] Загрузка закрытых боксов из кэша для даты:', selectedDate)
          return
        }

        // Загружаем из БД
        const boxes = await getClosedBoxesForDate(selectedDate);
        
        // Создаем Map: box_number -> open_hours (массив часов, когда бокс открыт)
        const boxesMap = new Map<number, number[]>();
        boxes.forEach(box => {
          if (box.is_closed) {
            // Бокс закрыт, сохраняем open_hours
            boxesMap.set(box.box_number, box.open_hours || []);
          }
        });
        
        setClosedBoxesByDate(prev => ({
          ...prev,
          [selectedDate]: boxesMap
        }))
      } catch (error) {
        console.error('[ClientBookingWrapper] Ошибка загрузки закрытых боксов:', error)
      }
    }
    loadClosedBoxes()
  }, [selectedDate, closedBoxesByDate])

  // Функция для очистки старого кэша заказов
  const MAX_CACHED_DATES = 14
  const cleanOldCache = (cache: Record<string, Booking[]>) => {
    const dates = Object.keys(cache)
    if (dates.length > MAX_CACHED_DATES) {
      const sorted = dates.sort()
      const toKeep = sorted.slice(-MAX_CACHED_DATES)
      return Object.fromEntries(toKeep.map(d => [d, cache[d]]))
    }
    return cache
  }

  // Функция для очистки старого кэша закрытых боксов
  const cleanOldClosedBoxesCache = (cache: Record<string, Map<number, number[]>>) => {
    const dates = Object.keys(cache)
    if (dates.length > MAX_CACHED_DATES) {
      const sorted = dates.sort()
      const toKeep = sorted.slice(-MAX_CACHED_DATES)
      return Object.fromEntries(toKeep.map(d => [d, cache[d]]))
    }
    return cache
  }

  // ✅ Supabase Realtime подписка на изменения в bookings для клиента (postgres_changes)
  useEffect(() => {
    if (!profileId) return

    console.log('[ClientBookingWrapper] Подключение к Realtime для bookings (клиент, postgres_changes)')

    const subscription = supabase
      .channel(`client-booking:bookings:${profileId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings'
      }, (payload: any) => {
        // ✅ Оптимистичное обновление - БЕЗ ЗАПРОСОВ В БД!
        console.log('[ClientBookingWrapper] Изменение в bookings:', payload)

        const bookingDate = payload.new?.booking_date || payload.old?.booking_date;
        if (!bookingDate) return;

        setBookingsByDate(prev => {
          const current = prev[bookingDate] || [];

          let updated;
          if (payload.eventType === 'INSERT') {
            updated = [...current, payload.new];
          } else if (payload.eventType === 'UPDATE') {
            updated = current.map(b => b.id === payload.new.id ? payload.new : b);
          } else if (payload.eventType === 'DELETE') {
            updated = current.filter(b => b.id !== payload.old.id);
          } else {
            return prev;
          }

          return cleanOldCache({ ...prev, [bookingDate]: updated });
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ClientBookingWrapper] Подписано на client-booking:bookings')
        }
      })

    return () => {
      console.log('[ClientBookingWrapper] Отключение от Realtime (клиент)')
      subscription.unsubscribe()
    }
  }, [profileId])

  // ✅ Supabase Realtime подписка на изменения в client_cars для клиента (postgres_changes)
  useEffect(() => {
    if (!clientId || !profilePhone) return

    console.log('[ClientBookingWrapper] Подключение к Realtime для client_cars (клиент, postgres_changes)')

    const subscription = supabase
      .channel('client-booking:client_cars')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'client_cars',
        filter: `client_id=eq.${clientId}`
      }, async (payload: any) => {
        console.log('[ClientBookingWrapper] Изменение в client_cars:', payload)

        // Перезагружаем машины клиента
        try {
          const cars = await getClientCombinedCars(clientId, profilePhone)
          console.log('[ClientBookingWrapper] Машины перезагружены:', cars.length)
          setCombinedCars(cars)
        } catch (error) {
          console.error('[ClientBookingWrapper] Ошибка загрузки машин:', error);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ClientBookingWrapper] Подписано на client-booking:client_cars')
        }
      })

    return () => {
      console.log('[ClientBookingWrapper] Отключение от Realtime (client_cars)')
      subscription.unsubscribe()
    }
  }, [clientId, profilePhone])

  // ✅ Supabase Realtime подписка на изменения в closed_boxes для клиента (postgres_changes)
  useEffect(() => {
    if (!profileId) return

    console.log('[ClientBookingWrapper] Подключение к Realtime для closed_boxes (клиент, postgres_changes)')

    const subscription = supabase
      .channel(`client-booking:closed-boxes:${profileId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'closed_boxes'
      }, (payload: any) => {
        // ✅ Оптимистичное обновление - БЕЗ ЗАПРОСОВ В БД!
        console.log('[ClientBookingWrapper] Изменение в closed_boxes:', payload)

        const closedDate = payload.new?.closed_date || payload.old?.closed_date;
        if (!closedDate) return;

        setClosedBoxesByDate(prev => {
          const currentMap = new Map(prev[closedDate] || []);

          if (payload.eventType === 'DELETE') {
            // Бокс удалён — убираем из Map
            currentMap.delete(payload.old.box_number);
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (payload.new.is_closed) {
              // Бокс закрыт — добавляем/обновляем
              currentMap.set(payload.new.box_number, payload.new.open_hours || []);
            } else {
              // Бокс открыт — убираем из Map
              currentMap.delete(payload.new.box_number);
            }
          }

          return cleanOldClosedBoxesCache({
            ...prev,
            [closedDate]: currentMap
          });
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ClientBookingWrapper] Подписано на client-booking:closed-boxes')
        }
      })

    return () => {
      console.log('[ClientBookingWrapper] Отключение от Realtime (closed_boxes)')
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
      console.log('[ClientBookingWrapper] Начало загрузки данных клиента')

      // Phase 1.6b: single HMAC-verified call to /api/telegram-auth replaces
      // the old 4-step flow (initTelegram + isTelegram check + getTelegramId +
      // supabase.from('profiles').eq('telegram_id')). JWT is injected into the
      // supabase-js wrapper on success; subsequent supabase calls carry it.
      const { profile_id, full_name } = await loginViaTelegram();

      // Найти client по profile_id (через wrapper с JWT — RLS Категории C пока
      // нет, public_all_access). auto-create flow остаётся до Phase 1.5 / 2.5.
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, online_booking_blocked_until, phone')
        .eq('profile_id', profile_id)
        .single();

      // Если клиент не найден — создаём автоматически (TODO: заменить на
      // /api/link-client-profile в Фазе 1.5; anon INSERT закроется в 2.5).
      let resolvedClientId: string;
      let resolvedPhone: string | null = null;

      if (clientError || !client) {
        console.log('[ClientBookingWrapper] Клиент не найден, создаём автоматически');
        try {
          const newClient = await createClient({
            full_name: full_name || '',
            phone: '',
          });

          const { error: linkError } = await supabase
            .from('clients')
            .update({ profile_id })
            .eq('id', newClient.id);

          if (linkError) {
            console.error('[ClientBookingWrapper] Ошибка при связывании клиента с профилем:', linkError);
          }

          resolvedClientId = newClient.id;
        } catch (createError: any) {
          console.error('[ClientBookingWrapper] Ошибка при создании клиента:', createError);
          setError(createError?.message === 'Такой клиент уже существует'
            ? 'Такой клиент уже существует'
            : 'Ошибка при создании клиента');
          setLoading(false);
          return;
        }
      } else {
        resolvedClientId = client.id;
        resolvedPhone = client.phone || null;
      }

      // Всё ОК — сохраняем данные и грузим дальше
      console.log('[ClientBookingWrapper] Данные загружены успешно');
      setProfileId(profile_id);
      setClientId(resolvedClientId);
      setProfileName(full_name || '');
      setProfilePhone(resolvedPhone || '');

      // Загружаем машины клиента (через phone из clients, не из profile)
      if (resolvedClientId && resolvedPhone) {
        const cars = await getClientCombinedCars(resolvedClientId, resolvedPhone);
        setCombinedCars(cars);
      }

      // Загружаем организации, где клиент — водитель (по phone из clients)
      if (resolvedPhone) {
        try {
          const orgIds = await getClientOrganizationIds(resolvedPhone);
          setDriverOrganizationIds(orgIds);
        } catch (error) {
          console.error('[ClientBookingWrapper] Ошибка загрузки организаций клиента:', error);
        }
      }

      // Загружаем заказы
      await loadBookings()
    } catch (err) {
      // TelegramAuthError has typed `kind` — map to user-friendly UI.
      // Other errors (e.g. supabase.from('clients') failure) fall through
      // to generic message.
      const maybeAuthErr = err as Partial<TelegramAuthError>;
      if (maybeAuthErr && typeof maybeAuthErr.kind === 'string') {
        const ui = telegramAuthErrorUI(maybeAuthErr.kind as TelegramAuthError['kind']);
        setError(ui.message);
        setRecoveryAction(ui.recovery);
      } else {
        console.error('[ClientBookingWrapper] Error loading client:', err);
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
        console.log('[ClientBookingWrapper] Загрузка заказов из кэша для даты:', selectedDate)
        return bookingsByDate[selectedDate]
      }

      // Загружаем из БД
      const data = await getBookingsByDate(selectedDate)
      console.log('[ClientBookingWrapper] Заказы загружены из БД:', data.length)
      setBookingsByDate(prev => cleanOldCache({
        ...prev,
        [selectedDate]: data || []
      }))
    } catch (error) {
      console.error('[ClientBookingWrapper] Error loading bookings:', error)
    }
  }

  const handleSlotClick = (hour: number, boxNumber: number) => {
    console.log('[ClientBookingWrapper] Выбран слот:', hour, 'Бокс:', boxNumber)

    // Проверяем наличие машин у клиента
    if (combinedCars.length === 0) {
      alert('Чтобы создать запись нужно добавить свое авто в разделе "Мой гараж"')
      return
    }

    setSelectedSlot({ hour, boxNumber })
    // ✅ Вызываем onWizardOpen для установки isWizardOpen = true в App.tsx
    onWizardOpen?.()
  }

  const handleWizardBack = () => {
    setSelectedSlot(null)
    // ✅ Вызываем onWizardClose для установки isWizardOpen = false в App.tsx
    onWizardClose?.()
  }

  const handleWizardComplete = async (data: OnlineBookingWizardData) => {
    try {
      console.log('[ClientBookingWrapper] Создание заказа:', data)

      // ✅ Определяем тип машины и готовим данные
      let driverId: string | undefined
      let orgName: string | undefined

      // Если это организационная машина, находим водителя
      if (data.isOrganizationCar && data.organizationId && profilePhone) {
        const drivers = await findDriversByPhone(profilePhone)
        if (drivers && drivers.length > 0) {
          const driver = drivers.find(d => d.organization.id === data.organizationId)
          if (driver) {
            driverId = driver.driver.id
            orgName = driver.organization.name
          }
        }
      }

      // ✅ Создаем запись через API функцию
      await createOnlineBooking({
        client_name: profileName,
        phone: normalizePhoneNumber(profilePhone),
        car_model: data.carModel,
        plate_number: data.plateNumber,
        car_type: data.carType,
        services: data.services,
        price: data.price,
        payment_method: data.paymentMethod,
        booking_date: data.bookingDate,
        start_time: data.startTime,
        end_time: `${(parseInt(data.startTime.split(':')[0]) + 1).toString().padStart(2, '0')}:00`, // end_time = start_time + 1 час
        box_number: data.boxNumber,
        status: 'ОЖИДАЕТ',
        booking_source: 'online',
        created_by_profile_id: profileId,
        client_id: clientId,
        client_car_id: data.clientCarId,          // Личная машина
        car_id: data.organizationCarId,            // Организационная машина
        is_org: data.isOrganizationCar || false,
        organization_id: data.organizationId,
        org_name: orgName,
        driver_id: driverId,
        signature_obtained: false,
        is_quick_booking: false,
        is_paid: false,
      })

      console.log('[ClientBookingWrapper] Заказ создан успешно')
      // Успешно - закрываем мастер и перезагружаем заказы
      setSelectedSlot(null)
      onWizardClose?.() // ✅ Вызываем callback для скрытия подвала
      await loadBookings()
      alert('Запись успешно создана!')
    } catch (err) {
      console.error('[ClientBookingWrapper] Error completing booking:', err)
      setError('Ошибка при создании записи')
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

  if (!profileId || !clientId) {
    return null
  }

  // Если открыт мастер - показываем его
  if (isWizardOpen && selectedSlot) {
    return (
      <OnlineBookingWizard
        onBack={handleWizardBack}
        onComplete={handleWizardComplete}
        onWizardClose={onWizardClose}
        profileId={profileId}
        clientId={clientId}
        profileName={profileName}
        profilePhone={profilePhone}
        services={services}
        existingBookings={bookings}
        selectedSlot={{
          date: selectedDate,
          startTime: `${selectedSlot.hour.toString().padStart(2, '0')}:00`,
          boxNumber: selectedSlot.boxNumber
        }}
        selectedDate={selectedDate}
        isFromTimeline={true}
      />
    )
  }

  // Иначе показываем Timeline
  return (
    <>
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 pt-safe telegram-safe-area-top">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Запись на мойку</h1>
        
        {/* Бейдж с режимом работы */}
        <div className="inline-flex items-center gap-2 border-2 border-black bg-white px-4 py-2 rounded-full mb-3">
          <Clock className="w-4 h-4 text-black" />
          <span className="text-base font-medium text-black">Режим работы с 8:00 до 18:00</span>
        </div>
        
        <p className="text-gray-600">Выберите свободное время для записи</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 pb-safe telegram-safe-area-bottom">
        <DayTimeline
          bookings={bookings}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onCreateBooking={handleSlotClick}
          userRole="client"
          currentClientId={clientId}
          closedBoxes={closedBoxes}
          driverOrganizationIds={driverOrganizationIds}
        />
      </div>
    </>
  )
}
