import { useEffect, useState, useMemo } from 'react'
import { OnlineTireBookingWizard, OnlineTireBookingWizardData } from './OnlineTireBookingWizard'
import { TireTimeline } from '../admin/TireTimeline'
import { getTelegramId, initTelegramWebApp, isTelegramWebApp } from '../../shared/telegram/telegram'
import { supabase } from '../../lib/supabase'
import { getTireBookingsByProfileId, getTireBookingsByDate, createOnlineTireBooking } from '../../lib/api/tire-bookings'
import { findDriversByPhone } from '../../lib/api/organizations'
import { getClientOrganizationIds } from '../../lib/api/bookings'
import { createClient } from '../../lib/api/clients'
import { normalizePhoneNumber } from '../../shared/utils/phone'
import { formatDate, addDays } from '../../shared/utils/date'
import { TireBooking } from '../../lib/api/tire-bookings'
import { Organization, OrganizationDriver, OrganizationCar } from '../../entities/organization/model'
import { Client } from '../../lib/api/clients'
import { isProfileBlockedForOnlineBooking } from '../../lib/api/booking-cancellations'
import { getTireServiceDayStatus, getNextOpenTireServiceDate } from '../../lib/api/tire-service-days'
import { Lock, Clock } from 'lucide-react'

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
  useEffect(() => {
    if (!isWizardOpen && profileId && selectedDate) {
      console.log('[ClientTireBookingWrapper] Мастер закрыт, перезагружаем заказы через 2 секунды')
      const timeout = setTimeout(async () => {
        try {
          // Перезагружаем из БД (игнорируя кэш)
          const data = await getTireBookingsByDate(selectedDate)
          console.log('[ClientTireBookingWrapper] Заказы перезагружены:', data.length)
          setBookingsByDate(prev => cleanOldCache({
            ...prev,
            [selectedDate]: data || []
          }))
        } catch (error) {
          console.error('[ClientTireBookingWrapper] Ошибка при перезагрузке заказов:', error)
        }
      }, 2000) // Задержка 2 секунды чтобы webhook успел создать заказ

      return () => clearTimeout(timeout)
    }
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
            const data = await getTireBookingsByDate(bookingDate);
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
      console.log('[ClientTireBookingWrapper] Начало загрузки данных клиента')

      // 1. Инициализация Telegram Web App
      console.log('[ClientTireBookingWrapper] Инициализация Telegram Web App')
      await initTelegramWebApp()

      // 2. Проверка что открыто в Telegram
      const isTelegram = isTelegramWebApp()
      console.log('[ClientTireBookingWrapper] isTelegramWebApp:', isTelegram)
      if (!isTelegram) {
        setError('Откройте через Telegram бота')
        setLoading(false)
        return
      }

      // 3. Получить telegram_id
      const telegramId = getTelegramId()
      console.log('[ClientTireBookingWrapper] telegramId:', telegramId)
      if (!telegramId) {
        setError('Не удалось получить данные Telegram')
        setLoading(false)
        return
      }

      // 4. Найти profile по telegram_id
      console.log('[ClientTireBookingWrapper] Поиск профиля по telegram_id:', telegramId)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, phone, role')
        .eq('telegram_id', telegramId)
        .single()

      console.log('[ClientTireBookingWrapper] Профиль:', profile, 'Ошибка:', profileError)

      if (profileError || !profile) {
        setError('Профиль не найден. Авторизуйтесь через бота')
        setLoading(false)
        return
      }

      // 5. Проверить что профиль - клиент
      console.log('[ClientTireBookingWrapper] Роль профиля:', profile.role)
      if (profile.role !== 'client') {
        setError('Доступ только для клиентов')
        setLoading(false)
        return
      }

      // 6. Найти client по profile_id
      console.log('[ClientTireBookingWrapper] Поиск клиента по profile_id:', profile.id)
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, online_booking_blocked_until')
        .eq('profile_id', profile.id)
        .single()

      console.log('[ClientTireBookingWrapper] Клиент:', client, 'Ошибка:', clientError)

      // Если клиент не найден - создаем автоматически
      if (clientError || !client) {
        console.log('[ClientTireBookingWrapper] Клиент не найден, создаем автоматически')
        try {
          // Создаем клиента через API функцию (телефон нормализуется автоматически)
          const newClient = await createClient({
            full_name: profile.full_name || '',
            phone: profile.phone || ''
          })

          // Связываем клиента с профилем
          const { error: linkError } = await supabase
            .from('clients')
            .update({ profile_id: profile.id })
            .eq('id', newClient.id)

          if (linkError) {
            console.error('[ClientTireBookingWrapper] Ошибка при связывании клиента с профилем:', linkError)
          }

          // Используем созданного клиента
          const createdClient = { id: newClient.id, online_booking_blocked_until: null }
          console.log('[ClientTireBookingWrapper] Клиент создан:', createdClient)

          // Продолжаем с созданным клиентом
          setProfileId(profile.id)
          setClientId(createdClient.id)
          setProfileName(profile.full_name || '')
          setProfilePhone(profile.phone || '')

          // ✅ NEW: Загружаем организации, где клиент является водителем
          if (profile.phone) {
            try {
              const orgIds = await getClientOrganizationIds(profile.phone)
              console.log('[ClientTireBookingWrapper] Организации клиента (новый):', orgIds)
              setDriverOrganizationIds(orgIds)
            } catch (error) {
              console.error('[ClientTireBookingWrapper] Ошибка загрузки организаций клиента:', error)
            }
          }

          setLoading(false)
          return
        } catch (createError) {
          console.error('[ClientTireBookingWrapper] Ошибка при создании клиента:', createError)
          
          // Проверяем тип ошибки для красивого сообщения
          if (createError.message === 'Такой клиент уже существует') {
            setError('Такой клиент уже существует')
          } else {
            setError('Ошибка при создании клиента')
          }
          setLoading(false)
          return
        }
      }

      // 7. Всё ОК - показываем мастер
      console.log('[ClientTireBookingWrapper] Данные загружены успешно')
      setProfileId(profile.id)
      setClientId(client.id)
      setProfileName(profile.full_name || '')
      setProfilePhone(profile.phone || '')

      // ✅ NEW: Загружаем организации, где клиент является водителем
      if (profile.phone) {
        try {
          const orgIds = await getClientOrganizationIds(profile.phone)
          console.log('[ClientTireBookingWrapper] Организации клиента:', orgIds)
          setDriverOrganizationIds(orgIds)
        } catch (error) {
          console.error('[ClientTireBookingWrapper] Ошибка загрузки организаций клиента:', error)
        }
      }

      // Загружаем заказы
      await loadBookings()
    } catch (err) {
      console.error('[ClientTireBookingWrapper] Error loading client:', err)
      setError('Ошибка загрузки данных')
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
      const data = await getTireBookingsByDate(selectedDate)
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

      // Создаем запись через API функцию
      await createOnlineTireBooking({
        client_name: profileName,
        phone: normalizePhoneNumber(profilePhone),
        car_model: data.carModel,
        plate_number: data.plateNumber,
        services: data.services,
        total_price: data.price,
        payment_method: data.paymentMethod,
        booking_date: data.bookingDate,
        start_time: data.startTime,
        estimated_duration: data.estimatedDuration,
        status: 'ОЖИДАЕТ',
        booking_source: 'online',
        created_by_profile_id: data.profileId,
        client_id: clientId,
        is_org: isOrg,
        organization_id: data.organization_id,
        org_name: data.org_name,
        driver_id: driverId,
        car_id: data.car_id,
        client_car_id: data.client_car_id,
        signature_data: data.signature_data,
        is_paid: false
      });

      console.log('[ClientTireBookingWrapper] Заказ создан успешно')
      // Успешно - закрываем мастер и перезагружаем заказы
      setSelectedSlot(null)
      onWizardClose?.() // ✅ Вызываем callback для скрытия подвала
      await loadBookings()
      alert('Запись успешно создана!')
    } catch (err) {
      console.error('[ClientTireBookingWrapper] Error completing tire booking:', err)
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
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Попробовать снова
          </button>
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
