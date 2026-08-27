import React, { useState, useEffect, useMemo } from 'react';
import { Dashboard } from './components/admin/Dashboard';
import { BookingWizard, BookingWizardData, mapWizardDataToBooking } from './components/admin/BookingWizard';
import { TireBookingWizard, TireBookingWizardData } from './components/admin/TireBookingWizard';
import { Workers } from './components/admin/Workers';
import { Inventory } from './components/admin/Inventory';
import { BookingsList } from './components/admin/BookingsList';
import { TireBookingsList } from './components/admin/TireBookingsList';
import { SummaryPage } from './components/admin/SummaryPage';
import { AnalyticsPage } from './components/admin/AnalyticsPage';
import { Login } from './components/auth/Login';
import { PinCodeModal } from './components/admin/PinCodeModal';
import { AssignWorkerModal } from './components/admin/AssignWorkerModal';
import { AssignTireTechnicianModal } from './components/admin/AssignTireTechnicianModal';
import { ChangePaymentMethodModal } from './components/admin/ChangePaymentMethodModal';
import { ClientBookingWrapper } from './components/client/ClientBookingWrapper';
import { ClientTireBookingWrapper } from './components/client/ClientTireBookingWrapper';
import { UnifiedClientBooking } from './components/client/UnifiedClientBooking';
import { PaymentReturnPage } from './components/client/PaymentReturnPage';
import { PublicPage } from './components/public/PublicPage';
import { ShowerHead, LifeBuoy, Users, Package, BarChart3, Car } from 'lucide-react';
import { cn } from './lib/utils';
import { PostStatus, Booking, CarType } from './types';
import { Worker, WorkingMode } from './lib/api/workers';
import { TireWorker } from './lib/api/tire-workers';
import { TireBooking, TireServiceItem } from './lib/api/tire-bookings';
import type { Admin } from './lib/types/admin';
import { supabase, setSessionToken, registerSessionExpiredHandler, getSessionToken } from './lib/supabase';
import { initTelegramWebApp, getTelegramId } from './shared/telegram/telegram';

import { getServices, getServicesWithPrices, Service, getServicePrice } from './lib/api/services';
import { getOrganizations, getOrganizationDrivers, getOrganizationCars } from './lib/api/organizations';
import { getClients, Client } from './lib/api/clients';
import { getBoxes, toggleBox as toggleBoxApi, toggleBoxWithReset, getClosedBoxesForDate } from './lib/api/boxes';
import { getSalarySettings } from './lib/api/salary';
import { createWorksheetEntry, updateWorksheetEntryByBookingId } from './lib/api/worksheets';
import {
  getBookingsByDate,
  getQuickBookings,
} from './lib/api/bookings';
import {
  getTireBookingsByDate,
  autoUpdateTireBookingStatuses,
  TireBookingStatus
} from './lib/api/tire-bookings';
import {
  createStaffBooking,
  createStaffTireBooking,
  updateStaffBooking,
  updateStaffTireBooking,
  addStaffServices,
  removeStaffService,
  addStaffTireServices,
  removeStaffTireService,
  assignStaffWorker,
  assignStaffTireTechnician,
  startStaffWork,
  startStaffTireWork,
  markStaffPaid,
  markStaffTirePaid,
  markStaffReady,
  markStaffTireReady,
  updateStaffPaymentMethod,
  updateStaffTirePaymentMethod,
  staffCancelBooking,
  staffCancelTireBooking,
} from './lib/api/staff-actions';
import { getTireServices } from './lib/api/tire-services';
import { toggleWorkerWorkingToday, toggleWorkerWorkingMode } from './features/workers/calculateEarnings';
import { toggleTechnicianWorkingToday } from './features/tire-technicians/calculateEarnings';
import { addWorkerEarningsForBooking } from './lib/api/workers';
import { formatDate, addDays } from './shared/utils/date';
import { Organization, OrganizationDriver, OrganizationCar } from './entities/organization/model';

const ANTIFREEZE_SERVICE_IDS = ['antifreeze-org', 'antifreeze-umc'];

type View = 'dashboard' | 'booking-wizard' | 'quick-booking-wizard' | 'tire-booking-wizard' | 'bookings' | 'bookings-actual' | 'workers' | 'inventory' | 'summary' | 'analytics' | 'client-book' | 'client-tire-book' | 'onlinebook' | 'admin' | 'owner' | 'public' | 'payment-return';

export default function App() {
  // Восстанавливаем сессию из localStorage при инициализации
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const savedUserId = localStorage.getItem('userId');
    const savedUserRole = localStorage.getItem('userRole');
    return !!(savedUserId && savedUserRole);
  });
  const [isTelegramAuth, setIsTelegramAuth] = useState(false);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [clientView, setClientView] = useState<View | null>(null); // Хранит клиентский view из URL
  const [clientActiveService, setClientActiveService] = useState<'carwash' | 'tire' | 'my-garage'>('carwash'); // Для UnifiedClientBooking
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [pinAction, setPinAction] = useState<(() => void) | null>(null);
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [isCreatingTireBooking, setIsCreatingTireBooking] = useState(false);
  const [userId, setUserId] = useState<string>(() => localStorage.getItem('userId') || '');
  const [userRole, setUserRole] = useState<'admin' | 'owner'>(() =>
    (localStorage.getItem('userRole') as 'admin' | 'owner') || 'admin'
  );
  // When wrapper fires onSessionExpired (staff 401 mid-session), surface a
  // banner above the Login form. Cleared on next successful login.
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string>('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false); // Отслеживание состояния клавиатуры
  const [initialViewportHeight, setInitialViewportHeight] = useState<number | null>(null); // Начальная высота viewport

  // Phase 1.6a: legacy localStorage migration + 401 handler.
  //   - If userId/userRole exist in localStorage but no JWT in memory →
  //     this is a legacy session from before Phase 1.6 (RPC-based login
  //     without JWT). Clear it and force re-login via /api/login.
  //   - For NEW users who logged in via /api/login: localStorage has both
  //     userId/userRole AND the module-level currentToken is set. We DON'T
  //     clear in that case (the user is mid-session, valid JWT in memory).
  //   - Staff on page reload: currentToken is null (by design, staff token
  //     lives in memory only), so cleanup runs and forces re-login. This
  //     is the documented "close-tab/reload = logout" trade-off.
  //   - Client on Mini App reload: currentToken is restored from
  //     sessionStorage in wrapper module-load, so cleanup does NOT run.
  useEffect(() => {
    const hasLegacyKeys = !!(
      localStorage.getItem('userId') && localStorage.getItem('userRole')
    );
    const hasCurrentJwt = !!getSessionToken();
    if (hasLegacyKeys && !hasCurrentJwt) {
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');
      setUserId('');
      setUserRole('admin');
      setIsAuthenticated(false);
      setSessionExpiredMessage('Сессия устарела. Войдите снова.');
    }

    // Centralized handler for staff 401 mid-session. Any of 17+ supabase-js
    // importers may trigger this; we handle it once here.
    registerSessionExpiredHandler(() => {
      localStorage.removeItem('userId');
      localStorage.removeItem('userRole');
      setUserId('');
      setUserRole('admin');
      setIsAuthenticated(false);
      setSessionExpiredMessage('Сессия истекла. Войдите снова.');
    });

    return () => {
      // On App unmount (rare — single-page app), deregister the handler.
      registerSessionExpiredHandler(null);
    };
  }, []);

  // Логируем изменения состояния клавиатуры
  useEffect(() => {
    console.log('[App] isKeyboardOpen изменился:', isKeyboardOpen);
  }, [isKeyboardOpen]);

  // Отслеживаем состояние клавиатуры через Telegram WebApp API и visualViewport
  useEffect(() => {
    console.log('[App] Инициализация отслеживания клавиатуры');
    const tg = (window as any).Telegram?.WebApp;

    console.log('[App] Telegram WebApp доступен?', !!tg);
    if (tg) {
      console.log('[App] Telegram WebApp isExpanded:', tg.isExpanded);
    }
    console.log('[App] visualViewport доступен?', !!window.visualViewport);

    // Функция для проверки состояния клавиатуры
    const checkKeyboardState = () => {
      console.log('[App] checkKeyboardState вызван');

      if (tg) {
        // ✅ ИСПРАВЛЕНИЕ: Используем height вместо isExpanded!
        const currentHeight = tg.viewportStableHeight || tg.viewportHeight;
        console.log('[App] Telegram: currentHeight =', currentHeight, 'initialHeight =', initialViewportHeight);

        // Если это первое измерение - сохраняем как начальную высоту
        if (initialViewportHeight === null) {
          console.log('[App] Сохраняем начальную высоту:', currentHeight);
          setInitialViewportHeight(currentHeight);
          setIsKeyboardOpen(false);
          return;
        }

        // Клавиатура открыта если текущая высота значительно меньше начальной
        const keyboardOpen = currentHeight < initialViewportHeight * 0.85;
        console.log('[App] Telegram: keyboardOpen =', keyboardOpen, '(currentHeight < initialHeight * 0.85)');
        setIsKeyboardOpen(keyboardOpen);
      } else if (window.visualViewport) {
        // В обычных браузерах используем visualViewport
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const keyboardOpen = viewportHeight < windowHeight * 0.8;
        console.log('[App] Browser: viewportHeight =', viewportHeight, 'windowHeight =', windowHeight, '=> keyboardOpen =', keyboardOpen);
        setIsKeyboardOpen(keyboardOpen);
      } else {
        console.log('[App] Ни Telegram WebApp ни visualViewport не доступны');
      }
    };

    // Telegram WebApp API
    if (tg) {
      console.log('[App] Подключаемся к Telegram viewportChanged событию');
      const handleViewportChanged = () => {
        console.log('[App] viewportChanged событие сработало');
        checkKeyboardState();
      };

      tg.onEvent('viewportChanged', handleViewportChanged);

      // Проверяем начальное состояние
      console.log('[App] Проверяем начальное состояние клавиатуры (Telegram)');
      checkKeyboardState();

      return () => {
        console.log('[App] Отключаемся от Telegram viewportChanged');
        tg.offEvent('viewportChanged', handleViewportChanged);
      };
    }

    // visualViewport API для обычных браузеров
    if (window.visualViewport) {
      console.log('[App] Подключаемся к visualViewport resize событию');
      const handleResize = () => {
        console.log('[App] visualViewport resize событие сработало');
        checkKeyboardState();
      };

      window.visualViewport.addEventListener('resize', handleResize);
      console.log('[App] Проверяем начальное состояние клавиатуры (visualViewport)');
      checkKeyboardState();

      return () => {
        console.log('[App] Отключаемся от visualViewport resize');
        window.visualViewport.removeEventListener('resize', handleResize);
      };
    }

    console.log('[App] Не удалось инициализировать отслеживание клавиатуры');
  }, [initialViewportHeight]);

  // Услуги загружаются из БД
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  // Услуги шиномонтажа загружаются из БД
  const [tireServices, setTireServices] = useState<any[]>([]);
  const [tireServicesLoading, setTireServicesLoading] = useState(true);

  // Данные организаций (позже будут загружаться из БД)
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationDrivers, setOrganizationDrivers] = useState<OrganizationDriver[]>([]);
  const [organizationCars, setOrganizationCars] = useState<OrganizationCar[]>([]);
  // Данные клиентов физлиц
  const [clients, setClients] = useState<Client[]>([]);

  // Настройки зарплаты (загружаются из БД)
  const [salarySettings, setSalarySettings] = useState<any>(null);

  // Состояния для клиентского интерфейса
  const [isClientDataLoaded, setIsClientDataLoaded] = useState(false); // Загружены ли все клиентские данные
  const [isWizardOpen, setIsWizardOpen] = useState(false); // Открыт ли мастер записи

  // Загрузка услуг из БД
  useEffect(() => {
    const loadServices = async () => {
      try {
        const data = await getServices();
        setServices(data);
      } catch (error) {
        console.error('Ошибка загрузки услуг:', error);
      } finally {
        setServicesLoading(false);
      }
    };

    loadServices();
  }, []);

  // Загрузка организаций, водителей, автомобилей, клиентов и персонала из БД
  useEffect(() => {
    const loadData = async () => {
      try {
        const [orgs, drivers, cars, clientsData] = await Promise.all([
          getOrganizations(),
          getOrganizationDrivers(),
          getOrganizationCars(),
          getClients()
        ]);
        setOrganizations(orgs);
        setOrganizationDrivers(drivers);
        setOrganizationCars(cars);
        setClients(clientsData);
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
      }
    };

    loadData();
  }, []);

  // Загрузка настроек зарплаты из БД
  useEffect(() => {
    const loadSalarySettingsData = async () => {
      try {
        const settings = await getSalarySettings();
        setSalarySettings(settings);
      } catch (error) {
        console.error('Ошибка загрузки настроек зарплаты:', error);
      }
    };

    loadSalarySettingsData();
  }, []);

  // Загрузка персонала из БД
  useEffect(() => {
    const loadWorkers = async () => {
      try {
        const { getWorkers } = await import('./lib/api/workers');
        const { getTireWorkers } = await import('./lib/api/tire-workers');
        const { getAdmins } = await import('./lib/api/admins');
        const [workersData, techniciansData, adminsData] = await Promise.all([
          getWorkers(),
          getTireWorkers(),
          getAdmins()
        ]);
        setWorkers(workersData);
        setTireTechnicians(techniciansData);
        setAdmins(adminsData);
      } catch (error) {
        console.error('Ошибка загрузки персонала:', error);
      }
    };

    loadWorkers();
  }, []);

  // ✅ Отслеживание загрузки всех клиентских данных
  useEffect(() => {
    // Все данные загружены когда:
    // - services загружены (!servicesLoading)
    // - tireServices загружены (!tireServicesLoading)
    // - organizations загружены (длина > 0 или массив не пустой)
    // - clients загружены (длина > 0 или массив не пустой)
    const allLoaded = !servicesLoading && !tireServicesLoading &&
                      organizations.length >= 0 && clients.length >= 0;
    setIsClientDataLoaded(allLoaded);
  }, [servicesLoading, tireServicesLoading, organizations.length, clients.length]);

  // Обработка Telegram авторизации для админов и владельцев
  const handleTelegramAuth = async (role: 'admin' | 'owner') => {
    setIsTelegramAuth(true);
    try {
      await initTelegramWebApp();
      const telegramId = getTelegramId();

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .eq('telegram_id', telegramId)
        .eq('role', role)
        .single();

      if (profileError || !profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
        alert('Доступ запрещён. Пользователь не найден или нет прав.');
        setIsTelegramAuth(false);
        return;
      }

      // Обновляем last_auth_method
      await supabase.from('profiles').update({
        last_auth_method: 'telegram',
        updated_at: new Date().toISOString()
      }).eq('id', profile.id);

      setUserId(profile.id);
      setUserRole(profile.role);
      setIsAuthenticated(true);
      setIsTelegramAuth(false);

      // Перенаправляем на dashboard после успешной авторизации
      window.location.hash = '#dashboard';
    } catch (error) {
      console.error('[App] Telegram auth error:', error);
      setIsTelegramAuth(false);
      alert('Ошибка авторизации через Telegram');
    }
  };

  // Обработка URL параметров для клиентской онлайн-записи
  useEffect(() => {
    const handleHashChange = () => {
      try {
        // Читаем view из hash (для Telegram Web App) или из query (для обычного браузера)
        const hashView = window.location.hash.replace('#', '');
        const queryView = new URLSearchParams(window.location.search).get('view');

        // ✅ Telegram добавляет свои параметры в hash (?tgWebAppData=...)
        // Берём только часть до знака вопроса
        const cleanHashView = hashView?.split('?')[0];
        const view = cleanHashView || queryView;

        // ✅ Публичная страница (без авторизации)
        if (view === 'public') {
          setClientView('public' as View);
          setCurrentView('public' as View);
        }
        // ✅ Клиентские view
        else if (view === 'client-book' || view === 'client-tire-book' || view === 'onlinebook') {
          setClientView(view as View);
          setCurrentView(view as View);
        }
        // ✅ Страница возврата после оплаты (показываем без авторизации)
        else if (view === 'payment-return') {
          setClientView(null);
          setCurrentView('payment-return' as View);
        }
        // ✅ Админские view через Telegram
        else if (view === 'admin' || view === 'owner') {
          handleTelegramAuth(view as 'admin' | 'owner');
        }
        else {
          setClientView(null);
        }
      } catch (error) {
        console.error('[App] Error handling hash change:', error);
      }
    };

    // Вызываем сразу при загрузке
    handleHashChange();

    // Добавляем слушатель события hashchange
    window.addEventListener('hashchange', handleHashChange);

    // Удаляем слушатели при размонтировании
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Загрузка услуг шиномонтажа из БД
  useEffect(() => {
    const loadTireServices = async () => {
      try {
        const data = await getTireServices();
        setTireServices(data);
      } catch (error) {
        console.error('Ошибка загрузки услуг шиномонтажа:', error);
      } finally {
        setTireServicesLoading(false);
      }
    };

    loadTireServices();
  }, []);

  // Assign Worker Modal State
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  
  // Assign Tire Technician Modal State
  const [isAssignTireTechnicianOpen, setIsAssignTireTechnicianOpen] = useState(false);
  const [selectedTireBookingId, setSelectedTireBookingId] = useState<string | null>(null);
  
  // Change Payment Method Modal State
  const [isPaymentMethodOpen, setIsPaymentMethodOpen] = useState(false);
  const [selectedPaymentBookingId, setSelectedPaymentBookingId] = useState<string | null>(null);
  const [selectedPaymentBookingType, setSelectedPaymentBookingType] = useState<'carwash' | 'tire' | null>(null);
  
  // Booking Wizard State
  const [initialBookingHour, setInitialBookingHour] = useState<number | undefined>();
  const [initialBookingBox, setInitialBookingBox] = useState<number | undefined>();
  const [initialBookingDate, setInitialBookingDate] = useState<string | undefined>();
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [isQuickBookingMode, setIsQuickBookingMode] = useState(false); // Флаг режима быстрого заказа
  const [tireSelectedDate, setTireSelectedDate] = useState(formatDate(new Date()));
  const [isTireServiceOpen, setIsTireServiceOpen] = useState(() => {
    const saved = localStorage.getItem('isTireServiceOpen');
    return saved !== null ? saved === 'true' : true;
  });
  
  // Tire Booking Wizard State
  const [initialTireBookingTime, setInitialTireBookingTime] = useState<string>();
  const [initialTireBookingDate, setInitialTireBookingDate] = useState<string>();
  
  // Состояние закрытых боксов (загружается из БД)
  const [closedBoxes, setClosedBoxes] = useState<Map<number, number[]>>(new Map());
  
  // Загрузка закрытых боксов из БД для выбранной даты
  const loadClosedBoxes = async () => {
    try {
      const boxes = await getClosedBoxesForDate(selectedDate);
      // Создаем Map: box_number -> open_hours
      const boxesMap = new Map<number, number[]>();
      boxes.forEach(box => {
        if (box.is_closed) {
          boxesMap.set(box.box_number, box.open_hours || []);
        }
      });
      setClosedBoxes(boxesMap);
    } catch (error) {
      console.error('[App] Ошибка загрузки закрытых боксов:', error);
    }
  };
  
  // Функция переключения состояния бокса (с полным сбросом open_hours)
  const toggleBox = async (boxNumber: number) => {
    try {
      // Используем toggleBoxWithReset для полного сброса при переключении
      await toggleBoxWithReset(boxNumber, selectedDate, userId);

      // Перезагружаем боксы из БД
      await loadClosedBoxes();
    } catch (error) {
      console.error('[App] Ошибка переключения бокса:', error);
      alert('Не удалось изменить статус бокса');
    }
  };

  // Функция перезагрузки закрытых боксов (используется после openBoxForHour)
  const reloadClosedBoxes = async () => {
    await loadClosedBoxes();
  };

  // Обработчики для BookingsList - вынесены за пределы рендера
  const handlePaymentMethodChangeForBookingsList = (bookingId: string) => {
    openChangePaymentMethodModal(bookingId, 'carwash');
  };

  // --- MOCK DATA STATE ---
  const [posts, setPosts] = useState([
    { id: 1, status: PostStatus.BUSY, car: 'Toyota Camry (А123БВ)', worker: 'Жора', timeLeft: 15, price: 1500 },
    { id: 2, status: PostStatus.FREE, car: null, worker: null, timeLeft: 0, price: 0 },
    { id: 3, status: PostStatus.BUSY, car: 'BMW X5 (В456СД)', worker: 'Вася', timeLeft: 40, price: 2200 },
  ]);

  // Кэш заказов по датам (обычные заказы)
  const [bookingsByDate, setBookingsByDate] = useState<Record<string, Booking[]>>({});
  // Текущие заказы для выбранной даты
  const bookings = useMemo(() => bookingsByDate[selectedDate] || [], [bookingsByDate, selectedDate]);

  // Быстрые заказы (30 минут) - только на актуальную дату
  const [quickBookings, setQuickBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  // Для оптимизации памяти
  const MAX_CACHED_DATES = 14; // 2 недели

  const cleanOldCache = (cache: Record<string, Booking[]>) => {
    const dates = Object.keys(cache);
    if (dates.length > MAX_CACHED_DATES) {
      const sorted = dates.sort();
      const toKeep = sorted.slice(-MAX_CACHED_DATES);
      return Object.fromEntries(toKeep.map(d => [d, cache[d]]));
    }
    return cache;
  };

  // Функции загрузки заказов из Supabase с кэшированием
  const loadBookings = async (date?: string) => {
    const targetDate = date || selectedDate;
    
    // Проверяем, есть ли данные в кэше
    if (bookingsByDate[targetDate]) {
      console.log(`[App] Загрузка заказов из кэша для даты: ${targetDate}`);
      return bookingsByDate[targetDate];
    }

    setBookingsLoading(true);
    try {
      const data = await getBookingsByDate(targetDate);
      setBookingsByDate(prev => cleanOldCache({
        ...prev,
        [targetDate]: data || []
      }));
      return data || [];
    } catch (error) {
      console.error('Ошибка загрузки заказов:', error);
      alert('Не удалось загрузить заказы');
      return [];
    } finally {
      setBookingsLoading(false);
    }
  };

  const loadQuickBookings = async (date?: string) => {
    try {
      const data = await getQuickBookings(date || selectedDate);
      setQuickBookings(data || []);
    } catch (error) {
      console.error('Ошибка загрузки быстрых заказов:', error);
      setQuickBookings([]);
    }
  };

  const loadTireBookings = async (date?: string) => {
    const targetDate = date || tireSelectedDate;
    
    // Проверяем, есть ли данные в кэше
    if (tireBookingsByDate[targetDate]) {
      console.log(`[App] Загрузка заказов шиномонтажа из кэша для даты: ${targetDate}`);
      return tireBookingsByDate[targetDate];
    }

    try {
      const data = await getTireBookingsByDate(targetDate);
      setTireBookingsByDate(prev => cleanOldCache({
        ...prev,
        [targetDate]: data || []
      }));
      return data || [];
    } catch (error) {
      console.error('Ошибка загрузки заказов шиномонтажа:', error);
      return [];
    }
  };

  // Функция для обновления данных без race condition
  const refreshBookingsData = async (newDate?: string) => {
    if (newDate && newDate !== selectedDate) {
      // Дата изменилась → useEffect перезагрузит автоматически
      setSelectedDate(newDate);
    } else {
      // Дата та же → загружаем вручную
      await loadBookings();
      await loadQuickBookings();
    }
  };

  // Функция для обновления данных шиномонтажа без race condition
  const refreshTireBookingsData = async (newDate?: string) => {
    if (newDate && newDate !== tireSelectedDate) {
      // Дата изменилась → useEffect перезагрузит автоматически
      setTireSelectedDate(newDate);
    } else {
      // Дата та же → загружаем вручную
      await loadTireBookings();
    }
  };

  // Кэш заказов шиномонтажа по датам
  const [tireBookingsByDate, setTireBookingsByDate] = useState<Record<string, TireBooking[]>>({});
  // Текущие заказы шиномонтажа для выбранной даты
  const tireBookings = useMemo(() => tireBookingsByDate[tireSelectedDate] || [], [tireBookingsByDate, tireSelectedDate]);

  // Workers state - загружаем из БД
  const [workers, setWorkers] = useState<Worker[]>([]);
  
  // Tire Technicians state - загружаем из БД
  const [tireTechnicians, setTireTechnicians] = useState<TireWorker[]>([]);
  
  // Admins state - загружаем из БД
  const [admins, setAdmins] = useState<Admin[]>([]);

  // Инициализация и сохранение workers в localStorage
  useEffect(() => {
    const initWorkers = async () => {
      const savedWorkersState = localStorage.getItem('workersState');
      const today = formatDate(new Date());

      if (savedWorkersState) {
        const { date, workers: savedWorkers } = JSON.parse(savedWorkersState);

        // Миграция данных: добавляем новые поля если их нет
        const migratedWorkers = savedWorkers.map((worker: Worker) => ({
          ...worker,
          current_balance: worker.current_balance ?? 0,
          is_advance_taken: worker.is_advance_taken ?? false,
        }));

        // Если сохраненная дата совпадает с сегодняшней - восстанавливаем состояние
        // Если дата другая - значит наступил новый день (00:00), api/reset-daily.ts уже перенес деньги и сбросил статистику
        if (date === today) {
          setWorkers(migratedWorkers);
        } else {
          // Новый день - api/reset-daily.ts уже перенес деньги и сбросил статистику
          // Просто перезагружаем работников из БД
          const { getWorkers } = await import('./lib/api/workers');
          const workersData = await getWorkers();
          setWorkers(workersData);
        }
      }
    };
    initWorkers();
  }, []);

  // Загрузка закрытых боксов из БД при старте
  useEffect(() => {
    loadClosedBoxes();
  }, []);

  // Загрузка закрытых боксов при изменении даты
  useEffect(() => {
    loadClosedBoxes();
  }, [selectedDate]);

  // Загрузка заказов из Supabase при изменении даты
  useEffect(() => {
    loadBookings();
    loadQuickBookings();
  }, [selectedDate]);

  // ✅ Supabase Realtime подписка на изменения в bookings для админа/владельца (postgres_changes)
  useEffect(() => {
    if (!isAuthenticated) return

    console.log('[App] Подключение к Realtime для bookings (админ/владелец, postgres_changes)')

    const subscription = supabase
      .channel('public:bookings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings'
      }, async (payload: any) => {
        console.log('[App] Изменение в bookings:', payload)
        
        // Определяем дату изменённого заказа
        const bookingDate = payload.new?.booking_date || payload.old?.booking_date;
        
        if (bookingDate) {
          // Перезагружаем данные из БД для конкретной даты (игнорируя кэш)
          try {
            const data = await getBookingsByDate(bookingDate);
            setBookingsByDate(prev => cleanOldCache({
              ...prev,
              [bookingDate]: data || []
            }));
          } catch (error) {
            console.error('[App] Ошибка загрузки заказов из БД:', error);
          }
          
          // Если это быстрые заказы (только актуальная дата)
          const today = formatDate(new Date());
          if (bookingDate === today) {
            await loadQuickBookings(today);
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[App] Подписано на public:bookings')
        }
      })

    return () => {
      console.log('[App] Отключение от Realtime (админ/владелец)')
      subscription.unsubscribe()
    }
  }, [isAuthenticated])

  // Загрузка заказов шиномонтажа из Supabase при изменении даты
  useEffect(() => {
    loadTireBookings();
  }, [tireSelectedDate]);

  // ✅ Supabase Realtime подписка на изменения в tire_bookings для админа/владельца (postgres_changes)
  useEffect(() => {
    if (!isAuthenticated) return

    console.log('[App] Подключение к Realtime для tire_bookings (админ/владелец, postgres_changes)')

    const subscription = supabase
      .channel('public:tire_bookings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tire_bookings'
      }, async (payload: any) => {
        console.log('[App] Изменение в tire_bookings:', payload)
        
        // Определяем дату изменённого заказа
        const bookingDate = payload.new?.booking_date || payload.old?.booking_date;
        
        if (bookingDate) {
          // Перезагружаем данные из БД для конкретной даты (игнорируя кэш)
          try {
            const data = await getTireBookingsByDate(bookingDate);
            setTireBookingsByDate(prev => cleanOldCache({
              ...prev,
              [bookingDate]: data || []
            }));
          } catch (error) {
            console.error('[App] Ошибка загрузки заказов шиномонтажа из БД:', error);
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[App] Подписано на public:tire_bookings')
        }
      })

    return () => {
      console.log('[App] Отключение от Realtime (админ/владелец)')
      subscription.unsubscribe()
    }
  }, [isAuthenticated])

  // ✅ Supabase Realtime подписка на изменения в organization_drivers
  useEffect(() => {
    if (!isAuthenticated) return

    console.log('[App] Подключение к Realtime для organization_drivers')

    const subscription = supabase
      .channel('public:organization_drivers')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'organization_drivers'
      }, async (payload: any) => {
        console.log('[App] Изменение в organization_drivers:', payload)
        
        // Перезагружаем водителей из БД
        try {
          const drivers = await getOrganizationDrivers()
          setOrganizationDrivers(drivers)
        } catch (error) {
          console.error('[App] Ошибка загрузки водителей:', error)
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[App] Подписано на public:organization_drivers')
        }
      })

    return () => {
      console.log('[App] Отключение от Realtime (organization_drivers)')
      subscription.unsubscribe()
    }
  }, [isAuthenticated])

  // ✅ Supabase Realtime подписка на изменения в organization_cars
  useEffect(() => {
    if (!isAuthenticated) return

    console.log('[App] Подключение к Realtime для organization_cars')

    const subscription = supabase
      .channel('public:organization_cars')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'organization_cars'
      }, async (payload: any) => {
        console.log('[App] Изменение в organization_cars:', payload)
        
        // Перезагружаем автомобили из БД
        try {
          const cars = await getOrganizationCars()
          setOrganizationCars(cars)
        } catch (error) {
          console.error('[App] Ошибка загрузки автомобилей:', error)
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[App] Подписано на public:organization_cars')
        }
      })

    return () => {
      console.log('[App] Отключение от Realtime (organization_cars)')
      subscription.unsubscribe()
    }
  }, [isAuthenticated])

  // ✅ Supabase Realtime подписка на изменения в clients
  useEffect(() => {
    if (!isAuthenticated) return

    console.log('[App] Подключение к Realtime для clients')

    const subscription = supabase
      .channel('public:clients')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'clients'
      }, async (payload: any) => {
        console.log('[App] Изменение в clients:', payload)
        
        // Перезагружаем клиентов из БД
        try {
          const clientsData = await getClients()
          setClients(clientsData)
        } catch (error) {
          console.error('[App] Ошибка загрузки клиентов:', error)
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[App] Подписано на public:clients')
        }
      })

    return () => {
      console.log('[App] Отключение от Realtime (clients)')
      subscription.unsubscribe()
    }
  }, [isAuthenticated])

  // ✅ Supabase Realtime подписка на изменения в client_cars
  useEffect(() => {
    if (!isAuthenticated) return

    console.log('[App] Подключение к Realtime для client_cars')

    const subscription = supabase
      .channel('public:client_cars')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'client_cars'
      }, async (payload: any) => {
        console.log('[App] Изменение в client_cars:', payload)
        
        // Перезагружаем клиентов и их автомобили из БД
        try {
          const [clientsData] = await Promise.all([
            getClients()
          ])
          setClients(clientsData)
        } catch (error) {
          console.error('[App] Ошибка загрузки данных клиентов:', error)
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[App] Подписано на public:client_cars')
        }
      })

    return () => {
      console.log('[App] Отключение от Realtime (client_cars)')
      subscription.unsubscribe()
    }
  }, [isAuthenticated])

  // ✅ Supabase Realtime подписка на изменения в salary_settings
  useEffect(() => {
    if (!isAuthenticated) return

    console.log('[App] Подключение к Realtime для salary_settings')

    const subscription = supabase
      .channel('public:salary_settings')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'salary_settings'
      }, async (payload: any) => {
        console.log('[App] Изменение в salary_settings:', payload)

        // Перезагружаем настройки зарплаты из БД
        try {
          const settings = await getSalarySettings()
          setSalarySettings(settings)
        } catch (error) {
          console.error('[App] Ошибка загрузки настроек зарплаты:', error)
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[App] Подписано на public:salary_settings')
        }
      })

    return () => {
      console.log('[App] Отключение от Realtime (salary_settings)')
      subscription.unsubscribe()
    }
  }, [isAuthenticated])

  // Сохранение workers в localStorage при изменении
  useEffect(() => {
    const today = formatDate(new Date());
    localStorage.setItem('workersState', JSON.stringify({
      date: today,
      workers: workers
    }));
  }, [workers]);

  // Инициализация и сохранение tireTechnicians в localStorage
  useEffect(() => {
    const initTechnicians = async () => {
      const savedTechniciansState = localStorage.getItem('tireTechniciansState');
      const today = formatDate(new Date());

      if (savedTechniciansState) {
        const { date, technicians: savedTechnicians } = JSON.parse(savedTechniciansState);

        // Миграция данных: добавляем новые поля если их нет
        const migratedTechnicians = savedTechnicians.map((technician: TireWorker) => ({
          ...technician,
          current_balance: technician.current_balance ?? 0,
          is_advance_taken: technician.is_advance_taken ?? false,
        }));

        // Если сохраненная дата совпадает с сегодняшней - восстанавливаем состояние
        // Если дата другая - значит наступил новый день (00:00), api/reset-daily.ts уже перенес деньги и сбросил статистику
        if (date === today) {
          setTireTechnicians(migratedTechnicians);
        } else {
          // Новый день - api/reset-daily.ts уже перенес деньги и сбросил статистику
          // Просто перезагружаем шиномонтажников из БД
          const { getTireWorkers } = await import('./lib/api/tire-workers');
          const techniciansData = await getTireWorkers();
          setTireTechnicians(techniciansData);
        }
      }
    };
    initTechnicians();
  }, []);

  // Сохранение tireTechnicians в localStorage при изменении
  useEffect(() => {
    const today = formatDate(new Date());
    localStorage.setItem('tireTechniciansState', JSON.stringify({
      date: today,
      technicians: tireTechnicians
    }));
  }, [tireTechnicians]);
  
  // Сохранение состояния шиномонтажа в localStorage
  useEffect(() => {
    localStorage.setItem('isTireServiceOpen', String(isTireServiceOpen));
  }, [isTireServiceOpen]);

  // Автоматическое обновление статусов заказов шиномонтажа
  useEffect(() => {
    const updateStatuses = async () => {
      try {
        const updatedCount = await autoUpdateTireBookingStatuses();
        if (updatedCount > 0) {
          // Перезагружаем заказы для синхронизации с БД
          await loadTireBookings();
        }
      } catch (error) {
        console.error('[App] Ошибка при автоматическом обновлении статусов:', error);
      }
    };

    // Проверяем каждую минуту
    const interval = setInterval(updateStatuses, 60000);

    // Проверяем сразу при загрузке
    updateStatuses();

    return () => clearInterval(interval);
  }, []);

  // --- ACTIONS ---
  const handleLogout = () => {
    // Очищаем состояние авторизации
    setUserId('');
    setUserRole('admin');
    setIsAuthenticated(false);
    // Очищаем localStorage
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
  };

  const withPin = (action: () => void) => {
    setPinAction(() => action);
    setIsPinOpen(true);
  };

  const handlePinSuccess = () => {
    setIsPinOpen(false);
    if (pinAction) {
      pinAction();
      setPinAction(null);
    }
  };

  const handlePinCancel = () => {
    setIsPinOpen(false);
    setPinAction(null);
    // ✅ Сбрасываем состояние загрузки при отмене
    setIsCreatingBooking(false);
    setIsCreatingTireBooking(false);
  };

  const openAssignWorkerModal = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setIsAssignOpen(true);
  };

  const openAssignTireTechnicianModal = (bookingId: string) => {
    setSelectedTireBookingId(bookingId);
    setIsAssignTireTechnicianOpen(true);
  };

  const handleWorkerAssigned = async (workerId: string) => {
    if (!selectedBookingId) return;

    try {
      // Находим выбранного работника
      const worker = workers.find(w => w.id === workerId);
      if (!worker) {
        console.error('[handleWorkerAssigned] Worker not found:', workerId);
        return;
      }

      // ✅ Находим выбранный заказ
      const booking = [...bookings, ...quickBookings].find(b => b.id === selectedBookingId);
      if (!booking) {
        console.error('[handleWorkerAssigned] Booking not found:', selectedBookingId);
        return;
      }

      // ✅ СНАЧАЛА очищаем существующих работников с этого заказа
      if (booking.worker_id) {
        const { updateWorker } = await import('./lib/api/workers');
        await updateWorker(booking.worker_id, {
          status: 'available',
          current_booking_id: null
        });
      }

      if (booking.worker_id_2) {
        const { updateWorker } = await import('./lib/api/workers');
        await updateWorker(booking.worker_id_2, {
          status: 'available',
          current_booking_id: null
        });
      }

      
      const { updateWorker } = await import('./lib/api/workers');

      // Если работник в паре - находим партнёра
      let partnerId: string | undefined;

      if (worker.working_mode === 'pair' && worker.partner_id) {
        const partner = workers.find(w => w.id === worker.partner_id);
        if (partner) {
          partnerId = partner.id;

          // Обновляем партнёра в БД
          await updateWorker(partnerId, {
            status: 'busy',
            current_booking_id: selectedBookingId
          });
        }
      }

      // Обновляем работника в БД
      await updateWorker(workerId, {
        status: 'busy',
        current_booking_id: selectedBookingId
      });

      // Назначаем работника(ов) на заказ в БД — staff API derives
      // worker_name / worker_name_2 server-side from the worker rows.
      await assignStaffWorker(
        selectedBookingId,
        workerId,
        worker.working_mode,
        partnerId,
      );
      
      // Закрываем модальное окно
      setIsAssignOpen(false);
      setSelectedBookingId(null);

      // Перезагружаем данные из БД для синхронизации
      await loadBookings();
      await loadQuickBookings();

      // Обновляем состояние работников из БД
      const { getWorkers } = await import('./lib/api/workers');
      const updatedWorkers = await getWorkers();
      setWorkers(updatedWorkers);

    } catch (error) {
      console.error('[handleWorkerAssigned] Ошибка назначения работника:', error);
      alert('Не удалось назначить работника');
    }
  };

  const handleTireTechnicianAssigned = async (technicianId: string) => {
    if (!selectedTireBookingId) return;

    try {
      const technician = tireTechnicians.find(t => t.id === technicianId);
      if (!technician) return;

      // staff API derives worker_name from tire_workers row.
      await assignStaffTireTechnician(
        selectedTireBookingId,
        technicianId,
      );

      setIsAssignTireTechnicianOpen(false);
      setSelectedTireBookingId(null);

      await loadTireBookings();

      const { getTireWorkers } = await import('./lib/api/tire-workers');
      const updatedTechnicians = await getTireWorkers();
      setTireTechnicians(updatedTechnicians);

    } catch (error) {
      console.error('[handleTireTechnicianAssigned] Ошибка назначения мастера:', error);
      alert('Не удалось назначить мастера');
    }
  };

 const openChangePaymentMethodModal = (bookingId: string, type: 'carwash' | 'tire') => {
    setSelectedPaymentBookingId(bookingId);
    setSelectedPaymentBookingType(type);
    setIsPaymentMethodOpen(true);
  };

  const handlePaymentMethodChanged = async (method: 'Наличный' | 'Безналичный' | 'Перевод') => {
    if (selectedPaymentBookingId && selectedPaymentBookingType) {
      if (selectedPaymentBookingType === 'tire') {
        // ✅ Для шиномонтажа обновляем в БД
        try {
          await updateStaffTirePaymentMethod(selectedPaymentBookingId, method);
          // Перезагружаем данные из БД для синхронизации
          await loadTireBookings();
        } catch (error) {
          console.error('Ошибка обновления способа оплаты:', error);
          alert('Не удалось обновить способ оплаты');
          return;
        }
      } else {
        // Проверяем, является ли заказ быстрым (id начинается с 'quick-')
        if (selectedPaymentBookingId.startsWith('quick-')) {
          // Быстрые заказы тоже хранятся в БД, обновляем
          try {
            await updateStaffPaymentMethod(selectedPaymentBookingId, method);
            // Перезагружаем данные из БД для синхронизации
            await loadQuickBookings();
          } catch (error) {
            console.error('Ошибка обновления способа оплаты:', error);
            alert('Не удалось обновить способ оплаты');
            return;
          }
        } else {
          // Обычные заказы - обновляем в БД
          try {
            await updateStaffPaymentMethod(selectedPaymentBookingId, method);
            // Перезагружаем данные из БД для синхронизации
            await loadBookings();
          } catch (error) {
            console.error('Ошибка обновления способа оплаты:', error);
            alert('Не удалось обновить способ оплаты');
            return;
          }
        }
      }
      setIsPaymentMethodOpen(false);
      setSelectedPaymentBookingId(null);
      setSelectedPaymentBookingType(null);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    withPin(async () => {
      try {
        // ✅ Находим заказ до отмены для освобождения мойщиков
        const booking = [...bookings, ...quickBookings].find(b => b.id === bookingId);
        if (!booking) return;

        const { getWorkerById, updateWorker, getWorkers } = await import('./lib/api/workers');

        // ✅ Освобождаем первого мойщика
        if (booking.worker_id) {
          await updateWorker(booking.worker_id, {
            status: 'available',
            current_booking_id: null
          });
          console.log('[handleCancelBooking] Первый мойщик освобожден:', booking.worker_name);
        }

        // ✅ Освобождаем второго мойщика (если есть)
        if (booking.worker_id_2) {
          await updateWorker(booking.worker_id_2, {
            status: 'available',
            current_booking_id: null
          });
          console.log('[handleCancelBooking] Второй мойщик освобожден:', booking.worker_name_2);
        }

        // ✅ Перезагружаем работников из БД для синхронизации
        const updatedWorkers = await getWorkers();
        setWorkers(updatedWorkers);

        // Отменяем заказ
        await staffCancelBooking(bookingId);
        await loadBookings();
        await loadQuickBookings();
      } catch (error) {
        console.error('Ошибка отмены заказа:', error);
        alert('Не удалось отменить заказ');
      }
    });
  };

  const handleMarkAsReady = async (bookingId: string) => {
    try {
      const booking = [...bookings, ...quickBookings].find(b => b.id === bookingId);
      if (!booking) return;

      if (booking.status === 'ГОТОВО') {
        console.log('[handleMarkAsReady] Заказ уже ГОТОВО, пропускаем');
        return;
      }

      const { getWorkerById, updateWorker } = await import('./lib/api/workers');
      const updatedWorkers: Worker[] = [];
 
      // booking.services - это массив строк (UUID или service_id)
      // Для обычных услуг хранится UUID (id), для незамерзайки - service_id
      const hasOnlyAntifreeze = booking.services.every(serviceId =>
        ANTIFREEZE_SERVICE_IDS.includes(serviceId)
      );

      if (hasOnlyAntifreeze) {
        if (booking.worker_id) {
          await updateWorker(booking.worker_id, {
            status: 'available',
            current_booking_id: null
          });
        }
        if (booking.worker_id_2) {
          await updateWorker(booking.worker_id_2, {
            status: 'available',
            current_booking_id: null
          });
        }
      } else {
        if (booking.worker_id && booking.worker_name) {
          const worker = await getWorkerById(booking.worker_id);
          if (worker) {
            const updatedWorker = await addWorkerEarningsForBooking(
              booking.worker_id,
              bookingId,
              booking.price,
              booking.worker_name_2 || undefined
            );

            await updateWorker(booking.worker_id, {
              status: 'available',
              current_booking_id: null
            });

            updatedWorkers.push({
              ...updatedWorker,
              status: 'available',
              current_booking_id: null
            });
          }
        }

        if (booking.worker_id_2 && booking.worker_name_2) {
          const worker2 = await getWorkerById(booking.worker_id_2);
          if (worker2) {
            const updatedWorker2 = await addWorkerEarningsForBooking(
              booking.worker_id_2,
              bookingId,
              booking.price,
              booking.worker_name || undefined
            );

            await updateWorker(booking.worker_id_2, {
              status: 'available',
              current_booking_id: null
            });

            updatedWorkers.push({
              ...updatedWorker2,
              status: 'available',
              current_booking_id: null
            });
          }
        }

        if (updatedWorkers.length > 0) {
          setWorkers(currentWorkers =>
            currentWorkers.map(w => {
              const updated = updatedWorkers.find(uw => uw.id === w.id);
              return updated ? updated : w;
            })
          );
        }
      }

      await markStaffReady(bookingId);

      await loadBookings();
      await loadQuickBookings();
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
      alert('Не удалось обновить статус');
    }
  };

  const handleStartWork = async (bookingId: string) => {
    try {
      await startStaffWork(bookingId);
      // Перезагружаем данные из БД для синхронизации
      await loadBookings();
      await loadQuickBookings();
    } catch (error) {
      console.error('Ошибка обновления статуса:', error);
      alert('Не удалось обновить статус');
    }
  };

  const handleMarkAsPaid = async (bookingId: string) => {
    try {
      await markStaffPaid(bookingId);
      // Перезагружаем данные из БД для синхронизации
      await loadBookings();
      await loadQuickBookings();
    } catch (error) {
      console.error('Ошибка отметки как оплаченный:', error);
      alert('Не удалось отметить как оплаченный');
    }
  };

  const handleAddService = async (bookingId: string, serviceIds: string[], discount: number = 0) => {
    try {
      const booking = [...bookings, ...quickBookings].find(b => b.id === bookingId);
      if (!booking) return;

      // add-staff-services recomputes price server-side via the atomic RPC.
      // Existing booking.discount is preserved (RPC COALESCE p_discount).
      // If caller passes a discount, we send antifreeze_intents/allow_override
      // — but the existing handler in the booking wizard never used them.
      await addStaffServices(bookingId, serviceIds);

      // Перезагружаем списки
      await loadBookings();
      await loadQuickBookings();
    } catch (error) {
      console.error('Ошибка добавления услуг:', error);
      alert('Не удалось добавить услуги');
    }
  };

  const handleRemoveService = async (bookingId: string, serviceId: string) => {
    try {
      const booking = [...bookings, ...quickBookings].find(b => b.id === bookingId);
      if (!booking) return;

      // remove-staff-services: server reads booking + recomputes price.
      await removeStaffService(bookingId, serviceId);

      // Перезагружаем списки
      await loadBookings();
      await loadQuickBookings();
    } catch (error) {
      console.error('Ошибка удаления услуги:', error);
      alert('Не удалось удалить услугу');
    }
  };

  const handleRemoveDiscount = async (bookingId: string) => {
    try {
      // Удаляем скидку (устанавливаем на 0) — patch-staff-booking,
      // server recomputes price = total - 0 = total.
      await updateStaffBooking(bookingId, { discount: 0 });

      // Перезагружаем списки
      await loadBookings();
      await loadQuickBookings();
    } catch (error) {
      console.error('Ошибка удаления скидки:', error);
      alert('Не удалось удалить скидку');
    }
  };

  const handleUpdateCarType = async (bookingId: string, carType: CarType) => {
    try {
      // update-staff-booking with car_type — server recomputes price
      // using the booking's stored services, antifreeze_intents, and
      // existing discount (RPC COALESCE on p_discount=NULL).
      await updateStaffBooking(bookingId, { car_type: carType });
      // Перезагружаем данные из БД для синхронизации
      await loadBookings();
      await loadQuickBookings();
    } catch (error) {
      console.error('Ошибка обновления типа авто:', error);
      alert('Не удалось обновить тип авто');
    }
  };

  const handleToggleWorkerWorking = async (workerId: string, isWorking: boolean) => {
    try {
      const worker = workers.find(w => w.id === workerId);
      if (!worker) {
        return;
      }

      const updatedWorker = await toggleWorkerWorkingToday(worker);
      setWorkers(currentWorkers =>
        currentWorkers.map(w => w.id === updatedWorker.id ? updatedWorker : w)
      );
    } catch (error) {
      console.error('Ошибка переключения статуса мойщика:', error);
      alert('Не удалось переключить статус');
    }
  };

  const handleToggleWorkerWorkingMode = async (workerId: string, mode: WorkingMode, partnerId?: string) => {
    try {
      const worker = workers.find(w => w.id === workerId);
      if (!worker) return;

      const updatedWorker = await toggleWorkerWorkingMode(worker);
      setWorkers(currentWorkers =>
        currentWorkers.map(w => w.id === updatedWorker.id ? updatedWorker : w)
      );
    } catch (error) {
      console.error('Ошибка переключения режима мойщика:', error);
      alert('Не удалось переключить режим');
    }
  };

  // Обработчики для TireTechnicians
  const handleToggleTechnicianWorking = async (technicianId: string, isWorking: boolean) => {
    try {
      const technician = tireTechnicians.find(t => t.id === technicianId);
      if (!technician) return;

      const updatedTechnician = await toggleTechnicianWorkingToday(technician);
      setTireTechnicians(currentTechnicians =>
        currentTechnicians.map(t => t.id === updatedTechnician.id ? updatedTechnician : t)
      );
    } catch (error) {
      console.error('Ошибка переключения статуса мастера:', error);
      alert('Не удалось переключить статус');
    }
  };

  // Обработчики для TireBookingsList
  const handlePaymentMethodChangeForTireBookingsList = (bookingId: string) => {
    openChangePaymentMethodModal(bookingId, 'tire');
  };

  const handleCancelTireBooking = async (bookingId: string) => {
    withPin(async () => {
      try {
        await staffCancelTireBooking(bookingId);
        await loadTireBookings();
      } catch (error) {
        console.error('Ошибка отмены заказа шиномонтажа:', error);
        alert('Не удалось отменить заказ');
      }
    });
  };

  const handleStartTireBookingWork = async (bookingId: string) => {
    try {
      await startStaffTireWork(bookingId);
      await loadTireBookings();
    } catch (error) {
      console.error('Ошибка обновления статуса заказа шиномонтажа:', error);
      alert('Не удалось обновить статус');
    }
  };

  const handleMarkTireBookingAsReady = async (bookingId: string) => {
    try {
      // ✅ Проверка: заказ уже ГОТОВО?
      const booking = tireBookings.find(b => b.id === bookingId);
      if (booking && booking.status === 'ГОТОВО') {
        console.log('[handleMarkTireBookingAsReady] Заказ уже ГОТОВО, пропускаем');
        return;
      }

      // ✅ Используем mark-staff-tire-ready с проверкой is_paid и начислением зарплаты
      await markStaffTireReady(bookingId);

      // Перезагружаем заказы и мастеров из БД
      await loadTireBookings();

      const { getTireWorkers } = await import('./lib/api/tire-workers');
      const updatedTechnicians = await getTireWorkers();
      setTireTechnicians(updatedTechnicians);
    } catch (error) {
      console.error('Ошибка обновления статуса заказа шиномонтажа:', error);
      alert('Не удалось обновить статус');
    }
  };

  const handleMarkTireBookingAsPaid = async (bookingId: string) => {
    try {
      await markStaffTirePaid(bookingId);
      // Перезагружаем данные из БД для синхронизации
      await loadTireBookings();
    } catch (error) {
      console.error('Ошибка отметки заказа шиномонтажа как оплаченного:', error);
      alert('Не удалось отметить как оплаченный');
    }
  };

  const handleAddTireService = async (bookingId: string, services: Array<{ service_id: string; quantity: number }>) => {
    try {
      // Staff API recomputes total_price + services_with_quantities via
      // atomic_modify_tire_services RPC. Caller passes only the new IDs.
      const ids = services.map(s => s.service_id);
      await addStaffTireServices(bookingId, ids);
      // Перезагружаем заказы из БД
      await loadTireBookings();
    } catch (error) {
      console.error('Ошибка добавления услуг шиномонтажа:', error);
      alert('Не удалось добавить услуги');
    }
  };

  const handleRemoveTireService = async (bookingId: string, serviceId: string) => {
    try {
      await removeStaffTireService(bookingId, serviceId);
      // Перезагружаем заказы из БД
      await loadTireBookings();
    } catch (error) {
      console.error('Ошибка удаления услуги шиномонтажа:', error);
      alert('Не удалось удалить услугу');
    }
  };

  const handleCreateTireBooking = (booking: Omit<TireBooking, 'id' | 'status'>) => {
    const newBooking: TireBooking = {
      ...booking,
      id: `tire-${Date.now()}`,
      status: 'ОЖИДАЕТ',
    };
    // Добавляем в кэш для текущей выбранной даты
    setTireBookingsByDate(prev => ({
      ...prev,
      [tireSelectedDate]: [...(prev[tireSelectedDate] || []), newBooking]
    }));
  };

  const handleCreateTireBookingFromWizard = async (data: TireBookingWizardData) => {
    setIsCreatingTireBooking(true);
    withPin(async () => {
      try {
        // Конвертируем телефон из формата "+7 (XXX) XXX-XX-XX" в формат "8XXXXXXXXXX"
        const formattedPhone = data.phone.replace(/\D/g, '').replace(/^7/, '8');

        // Staff API derives total_price + services_with_quantities server-side
        // from the tire_services catalog (idempotent recompute inside the RPC).
        // We pass only the new service IDs.
        const bookingData = {
          client_name: data.clientName,
          phone: formattedPhone,
          car_model: data.carModel,
          plate_number: data.carNumber,
          start_time: data.startTime,
          booking_date: data.date || initialTireBookingDate || tireSelectedDate,
          estimated_duration: data.estimatedDuration,
          services: data.services.map(s => s.service_id),
          payment_method: data.paymentType,
          is_org: data.clientType === 'ORG',
          organization_id: data.organizationId,
          driver_id: data.driverId,
          car_id: data.carId,
          client_id: data.clientId,
          client_car_id: data.clientCarId,
          is_paid: false,
        };

        // Создаем заказ через staff API (atomic RPC).
        const newTireBooking = await createStaffTireBooking(bookingData);

        // Создаем запись в ведомости для организаций
        if (newTireBooking.organization_id && newTireBooking.is_org) {
          try {
            await createWorksheetEntry({
              tire_booking_id: newTireBooking.id,
              organization_id: newTireBooking.organization_id,
              driver_id: newTireBooking.driver_id,
              car_id: newTireBooking.car_id,
              driver_name: data.clientName, // ✅ Берем из wizard data!
              car_model: newTireBooking.car_model,
              plate_number: newTireBooking.plate_number,
              service_date: newTireBooking.booking_date,
              services_provided: newTireBooking.services,
              total_amount: newTireBooking.total_price,
              service_type: 'tire',
              signature_data: newTireBooking.signature_data,
            });
          } catch (error) {
            console.error('[App] Ошибка создания записи ведомости:', error);
            // Не прерываем создание заказа
          }
        }

        // Обновляем данные без race condition
        const bookingDate = data.date || initialTireBookingDate || tireSelectedDate;
        await refreshTireBookingsData(bookingDate);

        setInitialTireBookingTime(undefined);
        setInitialTireBookingDate(undefined);
        setCurrentView('bookings');
      } catch (error) {
        console.error('Ошибка создания заказа шиномонтажа:', error);
        alert('Не удалось создать заказ шиномонтажа');
      } finally {
        setIsCreatingTireBooking(false);
      }
    });
  };

  // --- RENDER ---

  // Если есть клиентский view из URL параметров - показываем обёртку без Login
  if (clientView) {
    // ✅ Публичная страница (показываем без навигации и ограничений)
    if (clientView === 'public') {
      return <PublicPage services={services} tireServices={tireServices} />;
    }

    let clientContent;
    switch (clientView) {
      case 'onlinebook':
        clientContent = <UnifiedClientBooking
          activeService={clientActiveService}
          setActiveService={setClientActiveService}
          services={services}
          tireServices={tireServices}
          organizations={organizations}
          organizationDrivers={organizationDrivers}
          organizationCars={organizationCars}
          clients={clients}
          onWizardOpen={() => setIsWizardOpen(true)}
          onWizardClose={() => setIsWizardOpen(false)}
          isWizardOpen={isWizardOpen}
        />;
        break;
      case 'client-book':
        clientContent = <ClientBookingWrapper
          services={services}
          organizations={organizations}
          organizationDrivers={organizationDrivers}
          organizationCars={organizationCars}
          clients={clients}
          onWizardOpen={() => setIsWizardOpen(true)}
          onWizardClose={() => setIsWizardOpen(false)}
          isWizardOpen={isWizardOpen}
        />;
        break;
      case 'client-tire-book':
        clientContent = <ClientTireBookingWrapper
          tireServices={tireServices}
          organizations={organizations}
          organizationDrivers={organizationDrivers}
          organizationCars={organizationCars}
          clients={clients}
          onWizardOpen={() => setIsWizardOpen(true)}
          onWizardClose={() => setIsWizardOpen(false)}
          isWizardOpen={isWizardOpen}
        />;
        break;
      default:
        clientContent = <div className="p-10 text-center text-gray-500">Page not found</div>;
    }
    return (
      <div className="min-h-screen bg-[#f5f5f5] text-gray-900 font-sans flex flex-col max-w-md mx-auto md:max-w-2xl lg:max-w-4xl shadow-2xl relative">
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto pt-safe telegram-safe-area-top">
          {clientContent}
        </main>

        {/* Navigation для клиентского view - показываем только когда данные загружены, мастер закрыт и клавиатура закрыта */}
        {(() => {
          const showNav = isClientDataLoaded && !isWizardOpen && !isKeyboardOpen;
          console.log('[App] Клиентская навигация: showNav =', showNav, 'isClientDataLoaded =', isClientDataLoaded, '!isWizardOpen =', !isWizardOpen, '!isKeyboardOpen =', !isKeyboardOpen);
          return showNav;
        })() && (
          <nav className="bg-white border-t border-gray-200 px-4 py-3 flex justify-around items-center z-10 sticky bottom-0 pb-safe shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
            <NavBtn
              icon={<ShowerHead />}
              label="Автомойка"
              active={clientActiveService === 'carwash'}
              onClick={() => setClientActiveService('carwash')}
            />
            <NavBtn
              icon={<LifeBuoy />}
              label="Шиномонтаж"
              active={clientActiveService === 'tire'}
              onClick={() => setClientActiveService('tire')}
            />
            <NavBtn
              icon={<Car />}
              label="Мой гараж"
              active={clientActiveService === 'my-garage'}
              onClick={() => setClientActiveService('my-garage')}
            />
          </nav>
        )}
      </div>
    );
  }

  // Показываем индикатор загрузки во время Telegram авторизации для админов/владельцев
  if (isTelegramAuth && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Авторизация через Telegram...</p>
        </div>
      </div>
    );
  }

  // Для админских views показываем Login если не авторизован
  if (!isAuthenticated) {
    return <Login
      onLogin={(id, role) => {
        setUserId(id);
        setUserRole(role);
        setIsAuthenticated(true);
        setSessionExpiredMessage(''); // clear any pre-login banner
      }}
      expiredMessage={sessionExpiredMessage}
    />;
  }

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            onNewBooking={(hour, boxNumber, date) => {
              setInitialBookingHour(hour);
              setInitialBookingBox(boxNumber);
              setInitialBookingDate(date);
              setIsQuickBookingMode(false);
              setCurrentView('booking-wizard');
            }}
            onNavigate={(page) => setCurrentView(page as View)}
            onAssignWorker={openAssignWorkerModal}
            onCancelBooking={handleCancelBooking}
            onChangePaymentMethod={handlePaymentMethodChangeForBookingsList}
            onMarkAsReady={handleMarkAsReady}
            onStartWork={handleStartWork}
            onMarkAsPaid={handleMarkAsPaid}
            onAddService={handleAddService}
            onRemoveService={handleRemoveService}
            onRemoveDiscount={handleRemoveDiscount}
            onUpdateCarType={handleUpdateCarType}
            onLogout={handleLogout}
            mockPosts={posts}
            bookings={bookings}
            workers={workers}
            services={services}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            quickBookings={quickBookings}
            onQuickBooking={async (data) => {
              try {
                // Вычисляем название организации
                const organizationName = data.organizationId
                  ? organizations.find(o => o.id === data.organizationId)?.name
                  : (data.newOrganizationName?.trim() || undefined);

                const bookingData = mapWizardDataToBooking({
                  ...data,
                  isQuickBooking: true,
                  orgName: organizationName
                });
                const newBooking = await createStaffBooking(bookingData);

                // Создаем запись в ведомости для организаций
                if (newBooking.organization_id && newBooking.is_org) {
                  try {
                    await createWorksheetEntry({
                      carwash_booking_id: newBooking.id,
                      organization_id: newBooking.organization_id,
                      driver_id: newBooking.driver_id,
                      car_id: newBooking.car_id,
                      driver_name: data.clientName, // ✅ Берем из wizard data!
                      car_model: newBooking.car_model,
                      plate_number: newBooking.plate_number,
                      service_date: newBooking.booking_date,
                      services_provided: newBooking.services,
                      total_amount: newBooking.price,
                      service_type: 'carwash',
                      signature_data: newBooking.signature_data,
                      services_with_quantities: newBooking.services_with_quantities, // ✅ Передаём количества
                      car_type: newBooking.car_type as CarType, // ✅ Приводим к типу CarType
                    });
                  } catch (error) {
                    console.error('[App] Ошибка создания записи ведомости:', error);
                    // Не прерываем создание заказа
                  }
                }

                // Обновляем данные без race condition (быстрый заказ всегда на текущую дату)
                await refreshBookingsData();

                setCurrentView('dashboard');
              } catch (error) {
                console.error('Ошибка создания быстрого заказа:', error);
                alert('Не удалось создать быстрый заказ');
              }
            }}
            closedBoxes={closedBoxes}
            onToggleBox={toggleBox}
            onReloadClosedBoxes={reloadClosedBoxes}
            bookingsLoading={bookingsLoading}
            adminId={userId}
          />
        );
      case 'booking-wizard':
      return (
        <BookingWizard
          bookings={bookings}
          workers={workers}
          services={services}
          selectedDate={initialBookingDate || selectedDate}
          isQuickBookingMode={isQuickBookingMode}
          organizations={organizations}
          organizationDrivers={organizationDrivers}
          organizationCars={organizationCars}
          clients={clients}
          isCreatingBooking={isCreatingBooking}
          onBack={() => {
            setInitialBookingHour(undefined);
            setInitialBookingBox(undefined);
            setInitialBookingDate(undefined);
            setIsQuickBookingMode(false);
            setCurrentView('dashboard');
          }}
          onQuickBooking={() => {
            // Устанавливаем флаг быстрого заказа
            setIsQuickBookingMode(true);
          }}
          onComplete={async (data: BookingWizardData) => {
            setIsCreatingBooking(true);
            withPin(async () => {
              // Создаем заказ через Supabase API
              try {
                const bookingData = mapWizardDataToBooking(data);
                const newBooking = await createStaffBooking(bookingData);

                // Создаем запись в ведомости для организаций
                if (newBooking.organization_id && newBooking.is_org) {
                  try {
                    await createWorksheetEntry({
                      carwash_booking_id: newBooking.id,
                      organization_id: newBooking.organization_id,
                      driver_id: newBooking.driver_id,
                      car_id: newBooking.car_id,
                      driver_name: data.clientName, // ✅ Берем из wizard data!
                      car_model: newBooking.car_model,
                      plate_number: newBooking.plate_number,
                      service_date: newBooking.booking_date,
                      services_provided: newBooking.services,
                      total_amount: newBooking.price,
                      service_type: 'carwash',
                      signature_data: newBooking.signature_data,
                      services_with_quantities: newBooking.services_with_quantities, // ✅ Передаём количества
                      car_type: newBooking.car_type as CarType, // ✅ Приводим к типу CarType
                    });
                  } catch (error) {
                    console.error('[App] Ошибка создания записи ведомости:', error);
                    // Не прерываем создание заказа
                  }
                }

                // Обновляем данные без race condition
                const bookingDate = data.date || initialBookingDate || selectedDate;
                await refreshBookingsData(bookingDate);

                setInitialBookingHour(undefined);
                setInitialBookingBox(undefined);
                setInitialBookingDate(undefined);
                setIsQuickBookingMode(false);
                setCurrentView('dashboard');
              } catch (error) {
                console.error('Ошибка создания заказа:', error);
                alert('Не удалось создать заказ');
              } finally {
                setIsCreatingBooking(false);
              }
            });
          }}
          initialHour={initialBookingHour}
          initialBoxNumber={initialBookingBox || 1}
          closedBoxes={closedBoxes}
        />
      );
      case 'quick-booking-wizard':
        return (
          <BookingWizard
            bookings={bookings}
            workers={workers}
            services={services}
            selectedDate={initialBookingDate || selectedDate}
            isQuickBookingMode={true}
            organizations={organizations}
            organizationDrivers={organizationDrivers}
            organizationCars={organizationCars}
            clients={clients}
            isCreatingBooking={isCreatingBooking}
            onBack={() => {
              setInitialBookingHour(undefined);
              setInitialBookingBox(undefined);
              setInitialBookingDate(undefined);
              setIsQuickBookingMode(false);
              setCurrentView('dashboard');
            }}
            onComplete={async (data: BookingWizardData) => {
              setIsCreatingBooking(true);
              withPin(async () => {
                try {
                  // Создаем быстрый заказ (30 минут) с актуальным временем
                  const now = new Date();
                  const startHour = now.getHours();
                  const startMinute = now.getMinutes();
                
                  // Конец через 30 минут
                  const endTime = new Date(now.getTime() + 30 * 60 * 1000);
                  const endHour = endTime.getHours();
                  const endMinute = endTime.getMinutes();
                
                  const boxNumber = data.selectedBoxNumber || initialBookingBox || 1;
                
                  // Создаем данные для быстрого заказа с актуальным временем
                  const bookingData = mapWizardDataToBooking({
                    ...data,
                    isQuickBooking: true,
                    selectedHour: startHour, // Используем текущий час
                    selectedBoxNumber: boxNumber,
                    date: formatDate(now)
                  });
                
                  // Переписываем start_time и end_time на точное время (с минутами)
                  bookingData.start_time = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
                  bookingData.end_time = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
                
                  const newBooking = await createStaffBooking(bookingData);

                  // Создаем запись в ведомости для организаций
                  if (newBooking.organization_id && newBooking.is_org) {
                    try {
                      await createWorksheetEntry({
                        carwash_booking_id: newBooking.id,
                        organization_id: newBooking.organization_id,
                        driver_id: newBooking.driver_id,
                        car_id: newBooking.car_id,
                        driver_name: data.clientName, // ✅ Берем из wizard data!
                        car_model: newBooking.car_model,
                        plate_number: newBooking.plate_number,
                        service_date: newBooking.booking_date,
                        services_provided: newBooking.services,
                        total_amount: newBooking.price,
                        service_type: 'carwash',
                        signature_data: newBooking.signature_data,
                        services_with_quantities: newBooking.services_with_quantities, // ✅ Передаем количества
                        car_type: newBooking.car_type as CarType, // ✅ Приводим к типу CarType
                      });
                    } catch (error) {
                      console.error('[App] Ошибка создания записи ведомости:', error);
                      // Не прерываем создание заказа
                    }
                  }

                  // Обновляем данные без race condition (быстрый заказ всегда на текущую дату)
                  await refreshBookingsData(formatDate(now));

                  setInitialBookingHour(undefined);
                  setInitialBookingBox(undefined);
                  setInitialBookingDate(undefined);
                  setIsQuickBookingMode(false);
                  setCurrentView('dashboard');
                } catch (error) {
                  console.error('Ошибка создания быстрого заказа:', error);
                  alert('Не удалось создать быстрый заказ');
                } finally {
                  setIsCreatingBooking(false);
                }
              });
            }}
            initialHour={initialBookingHour}
            initialBoxNumber={initialBookingBox || 1}
            closedBoxes={closedBoxes}
          />
        );
      case 'tire-booking-wizard':
        return (
          <TireBookingWizard
            onBack={() => {
              setInitialTireBookingTime(undefined);
              setInitialTireBookingDate(undefined);
              setCurrentView('bookings');
            }}
            onComplete={handleCreateTireBookingFromWizard}
            initialTime={initialTireBookingTime}
            selectedDate={initialTireBookingDate || tireSelectedDate}
            existingBookings={tireBookings}
            isCreatingTireBooking={isCreatingTireBooking}
          />
        );
      case 'bookings':
        return (
            <TireBookingsList
                key="tire-bookings"
                bookings={tireBookings}
                onCancelBooking={handleCancelTireBooking}
                onChangePaymentMethod={handlePaymentMethodChangeForTireBookingsList}
                onAddService={handleAddTireService}
                onRemoveService={handleRemoveTireService}
                onMarkAsReady={handleMarkTireBookingAsReady}
                onStartWork={handleStartTireBookingWork}
                onMarkAsPaid={handleMarkTireBookingAsPaid}
                onAssignTechnician={openAssignTireTechnicianModal}
                onNavigate={(page) => setCurrentView(page as View)}
                initialTab="waiting"
                selectedDate={tireSelectedDate}
                onDateChange={setTireSelectedDate}
                onCreateBooking={handleCreateTireBooking}
                onNavigateToWizard={(time, date) => {
                  setInitialTireBookingTime(time);
                  setInitialTireBookingDate(date);
                  setCurrentView('tire-booking-wizard');
                }}
                isWorkingToday={isTireServiceOpen}
                onToggleWorkingToday={() => setIsTireServiceOpen(!isTireServiceOpen)}
                technicians={tireTechnicians}
                tireServices={tireServices}
            />
        );
      case 'bookings-actual':
        return (
            <BookingsList
                bookings={bookings}
                onAssignWorker={openAssignWorkerModal}
                onCancelBooking={handleCancelBooking}
                onChangePaymentMethod={handlePaymentMethodChangeForBookingsList}
                onNavigate={(page) => setCurrentView(page as View)}
                initialTab="waiting"
                services={services}
                onAddService={handleAddService}
                onRemoveService={handleRemoveService}
            />
        );
      case 'workers':
        return (
          <Workers
            onBack={() => setCurrentView('dashboard')}
            workers={workers}
            setWorkers={setWorkers}
            bookings={bookings}
            quickBookings={quickBookings}
            services={services}
            onToggleWorkerWorking={handleToggleWorkerWorking}
            // onToggleWorkerWorkingMode удалён - Workers компонент сам обрабатывает переключение режима
            tireTechnicians={tireTechnicians}
            setTireTechnicians={setTireTechnicians}
            onToggleTechnicianWorking={handleToggleTechnicianWorking}
            tireBookings={tireBookings}
            admins={admins}
            setAdmins={setAdmins}
            salarySettings={salarySettings}
            userRole={userRole}
          />
        );
      case 'inventory':
        return <Inventory userId={userId} />;
      case 'summary':
        return (
          <SummaryPage
            bookings={bookings}
            tireBookings={tireBookings}
            workers={workers}
            technicians={tireTechnicians}
            selectedDate={selectedDate}
            userId={userId}
            userRole={userRole}
          />
        );
      case 'analytics':
        return (
          <AnalyticsPage
            userId={userId}
            userRole={userRole}
          />
        );
      case 'payment-return':
        return <PaymentReturnPage />;
      default:
        return <div className="p-10 text-center text-gray-500">Page not found</div>;
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-gray-900 font-sans flex flex-col max-w-md mx-auto md:max-w-2xl lg:max-w-4xl shadow-2xl relative">
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto pt-safe telegram-safe-area-top">
        {renderContent()}
      </main>

      {/* Navigation - Hide on full screen wizards, client booking views and when keyboard is open */}
      {!clientView && currentView !== 'booking-wizard' && currentView !== 'tire-booking-wizard' && currentView !== 'quick-booking-wizard' && !isKeyboardOpen && (
        <nav className="bg-white border-t border-gray-200 px-4 py-3 flex justify-between items-center z-10 sticky bottom-0 pb-safe shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
          <NavBtn
            icon={<ShowerHead />}
            label="Автомойка"
            active={currentView === 'dashboard'}
            onClick={() => setCurrentView('dashboard')}
          />
          <NavBtn
            icon={<BarChart3 />}
            label="Сводка"
            active={currentView === 'summary'}
            onClick={() => setCurrentView('summary')}
          />
          <NavBtn
            icon={<LifeBuoy />}
            label="Шиномонтаж"
            active={currentView === 'bookings'}
            onClick={() => setCurrentView('bookings')}
          />
          <NavBtn
            icon={<Users />}
            label="Персонал"
            active={currentView === 'workers'}
            onClick={() => setCurrentView('workers')}
          />
          <NavBtn
            icon={<Package />}
            label="Склад"
            active={currentView === 'inventory'}
            onClick={() => setCurrentView('inventory')}
          />
          {userRole === 'owner' && (
            <NavBtn
              icon={<BarChart3 />}
              label="Аналитика"
              active={currentView === 'analytics'}
              onClick={() => setCurrentView('analytics')}
            />
          )}
        </nav>
      )}

      {/* Modals */}
      <PinCodeModal 
        isOpen={isPinOpen} 
        onClose={handlePinCancel} 
        onSuccess={handlePinSuccess} 
      />
      
      <AssignWorkerModal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        onAssign={handleWorkerAssigned}
        bookingId={selectedBookingId}
        bookings={[...bookings, ...quickBookings]}
        workers={workers}
        selectedDate={selectedDate}
      />
      
      <AssignTireTechnicianModal
        isOpen={isAssignTireTechnicianOpen}
        onClose={() => setIsAssignTireTechnicianOpen(false)}
        onAssign={handleTireTechnicianAssigned}
        technicians={tireTechnicians}
        assignedTechnicianId={tireBookings.find(b => b.id === selectedTireBookingId)?.worker_id}
      />
      
      <ChangePaymentMethodModal
        isOpen={isPaymentMethodOpen}
        onClose={() => setIsPaymentMethodOpen(false)}
        onChange={handlePaymentMethodChanged}
        currentMethod={
          selectedPaymentBookingType === 'tire'
            ? tireBookings.find(b => b.id === selectedPaymentBookingId)?.payment_method
            : bookings.find(b => b.id === selectedPaymentBookingId)?.payment_method
        }
      />
      
    </div>
  );
}

const NavBtn = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex flex-col items-center gap-1 transition-all duration-200 active:scale-95",
      active ? "text-primary" : "text-gray-400 hover:text-gray-600"
    )}
  >
    {React.cloneElement(icon as React.ReactElement<any>, { 
      className: cn("w-6 h-6 transition-transform", active && "scale-110") 
    })}
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);
