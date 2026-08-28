import { useEffect, useState, useMemo } from 'react'
import { OnlineBookingWizard, OnlineBookingWizardData } from './OnlineBookingWizard'
import { DayTimeline } from '../admin/DayTimeline'
import { supabase, getSessionToken } from '../../lib/supabase'
import { loginViaTelegram, telegramAuthErrorUI, reloadMiniApp, TelegramAuthError } from '../../lib/client-auth'
import { Booking } from '../../lib/api/bookings'
import { formatDate, addDays } from '../../shared/utils/date'
import { findDriversByPhone } from '../../lib/api/organizations'
import { Service } from '../../lib/api/services'
import { Organization, OrganizationDriver, OrganizationCar } from '../../entities/organization/model'
import { Client } from '../../lib/api/clients'
import { Lock, Clock } from 'lucide-react'

interface ClientBookingWrapperProps {
  services: Service[];
  organizations: Organization[];
  organizationDrivers: OrganizationDriver[];
  organizationCars: OrganizationCar[];
  clients: Client[];
  onWizardOpen?: () => void;
  onWizardClose?: () => void;
  isWizardOpen?: boolean;
}

// Phase 2 / Slice #1 of carwash-full-security-lockdown-plan.md.
//
// After commit #3, this component does NOT make any anon SELECT/INSERT/UPDATE
// against bookings / clients / client_cars / closed_boxes from the client flow:
//   - availability (occupied slots + closed boxes) comes from public RPCs
//     (get_public_booking_slots / get_public_closed_boxes);
//   - own bookings (history + DayTimeline "own" cards) come from
//     /api/client?action=get-bookings (server-side client_id → clients.profile_id chain);
//   - create / cancel go through /api/client?action=create-booking and
//     /api/client?action=cancel-booking;
//   - profile / client / cars / blocked-state come from /api/client?action=get-my-cars.
//
// The combined `[client, combined_cars]` payload collapses 3 anon SELECTs into
// one server-side roundtrip. driverOrganizationIds is derived from combined_cars
// where type='organization' — no second anon SELECT against organization_drivers
// at UI load time (still needed for wizard-side org-car selection; the latter
// uses a dedicated anon helper which is acceptable for now and gets moved in a
// later phase covering orgs Category B).
//
// DayTimeline's redacting logic (line 75) is preserved by passing non-own
// bookings with `client_id: null` so the `isPersonalBooking` check fails and
// the row gets rendered as 'Занято' with no PII.

export function ClientBookingWrapper({
  services,
  organizations,
  organizationDrivers,
  organizationCars,
  clients,
  onWizardOpen,
  onWizardClose,
  isWizardOpen = false,
}: ClientBookingWrapperProps) {
  const [profileId, setProfileId] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string>('')
  const [profilePhone, setProfilePhone] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recoveryAction, setRecoveryAction] = useState<'reload_mini_app' | 'retry' | 'none'>('none')
  const [combinedCars, setCombinedCars] = useState<any[]>([])
  const [driverOrganizationIds, setDriverOrganizationIds] = useState<string[]>([])

  const [isBlocked, setIsBlocked] = useState(false)
  const [isLoadingBlocked, setIsLoadingBlocked] = useState(true)
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null)

  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const SWITCH_HOUR = 18;
    if (currentHour >= SWITCH_HOUR) {
      return formatDate(addDays(now, 1));
    }
    return formatDate(now);
  })
  // Timeline data: combined availability (RPC slots) + own bookings (endpoint).
  // DayTimeline receives this as `bookings` and redacts non-own rows.
  const [bookingsByDate, setBookingsByDate] = useState<Record<string, Booking[]>>({})
  const bookings = useMemo(() => bookingsByDate[selectedDate] || [], [bookingsByDate, selectedDate])
  // Closed boxes state — per-date map of box_number -> open_hours array.
  const [closedBoxesByDate, setClosedBoxesByDate] = useState<Record<string, Map<number, number[]>>>({})
  const closedBoxes = useMemo(() => closedBoxesByDate[selectedDate] || new Map(), [closedBoxesByDate, selectedDate])

  const [selectedSlot, setSelectedSlot] = useState<{ hour: number; boxNumber: number } | null>(null)

  // --------- Telegram auth + JWT-establish at mount ---------
  useEffect(() => {
    loadClientData()
  }, [])

  // --------- Re-load timeline + closed boxes when date or profile changes ---------
  useEffect(() => {
    if (profileId) {
      loadOccupancyForDate(selectedDate)
      loadClosedBoxesForDate(selectedDate)
      loadOwnBookingsForDate(selectedDate)
    }
  }, [selectedDate, profileId])

  // --------- After wizard closes (booking success), refresh affected data ---------
  useEffect(() => {
    if (!isWizardOpen || !profileId || !selectedDate) return;

    let isMounted = true;
    const MAX_RETRIES = 2;
    const RELOAD_DELAY_MS = 2000;
    const RETRY_DELAY_MS = 1000;

    async function reloadWithRetry(attempt = 0): Promise<void> {
      try {
        await Promise.all([
          loadOccupancyForDate(selectedDate),
          loadClosedBoxesForDate(selectedDate),
          loadOwnBookingsForDate(selectedDate),
        ]);
        if (isMounted) {
          console.log('[ClientBookingWrapper] Timeline reloaded after wizard close');
        }
      } catch (error) {
        if (attempt < MAX_RETRIES && isMounted) {
          console.warn(`[ClientBookingWrapper] Reload attempt ${attempt + 1} failed, retrying...`);
          setTimeout(() => {
            if (isMounted) reloadWithRetry(attempt + 1);
          }, RETRY_DELAY_MS);
        } else if (isMounted) {
          console.error('[ClientBookingWrapper] Ошибка при перезагрузке (после retries):', error);
        }
      }
    }

    const timeout = setTimeout(() => {
      if (isMounted) reloadWithRetry();
    }, RELOAD_DELAY_MS);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [isWizardOpen, profileId, selectedDate])

  const MAX_CACHED_DATES = 14

  const cleanOldCache = (cache: Record<string, Booking[]>) => {
    const dates = Object.keys(cache);
    if (dates.length > MAX_CACHED_DATES) {
      const sorted = dates.sort();
      const toKeep = sorted.slice(-MAX_CACHED_DATES);
      return Object.fromEntries(toKeep.map(d => [d, cache[d]]));
    }
    return cache;
  }

  const cleanOldClosedBoxesCache = (cache: Record<string, Map<number, number[]>>) => {
    const dates = Object.keys(cache);
    if (dates.length > MAX_CACHED_DATES) {
      const sorted = dates.sort();
      const toKeep = sorted.slice(-MAX_CACHED_DATES);
      return Object.fromEntries(toKeep.map(d => [d, cache[d]]));
    }
    return cache;
  }

  // --------- Realtime: bookings changes (own only via RLS) ---------
  // Note: This still uses anon channel list (Bookings is a public schema
  // table). When Category C RLS lands on bookings this naturally filters
  // to own rows. Until then, refresh fires on any booking change.
  useEffect(() => {
    if (!profileId) return;

    const subscription = supabase
      .channel(`client-booking:bookings:${profileId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings'
      }, (payload: any) => {
        console.log('[ClientBookingWrapper] Изменение в bookings:', payload);

        const bookingDate = payload.new?.booking_date || payload.old?.booking_date;
        if (!bookingDate) return;

        // Bug-fix: was guarded by `if (bookingsByDate[bookingDate])` which
        // silently dropped events when the affected date hadn't been loaded
        // yet (e.g. wizard-created booking before any date click). Now we
        // always re-load for the affected date so the row appears without
        // requiring a manual F5.
        loadOccupancyForDate(bookingDate);
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [profileId])

  // --------- Realtime: closed_boxes (still anon-channel for now) ---------
  useEffect(() => {
    if (!profileId) return;

    const subscription = supabase
      .channel(`client-booking:closed-boxes:${profileId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'closed_boxes'
      }, (payload: any) => {
        const closedDate = payload.new?.closed_date || payload.old?.closed_date;
        if (!closedDate) return;

        setClosedBoxesByDate(prev => {
          const currentMap = new Map(prev[closedDate] || []);
          if (payload.eventType === 'DELETE') {
            currentMap.delete(payload.old.box_number);
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (payload.new.is_closed) {
              currentMap.set(payload.new.box_number, payload.new.open_hours || []);
            } else {
              currentMap.delete(payload.new.box_number);
            }
          }
          return cleanOldClosedBoxesCache({ ...prev, [closedDate]: currentMap });
        });
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [profileId])

  // --------- API helpers ---------
  // POST /api/client-* with Bearer client JWT.
  async function apiPost(path: string, body: any): Promise<any> {
    const token = getSessionToken();
    if (!token) throw new Error('No session token');
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    let parsed: any = null;
    try { parsed = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      const msg = parsed?.error || `HTTP ${res.status}`;
      const err: any = new Error(msg);
      err.status = res.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  }

  async function loadClientData() {
    try {
      console.log('[ClientBookingWrapper] Начало загрузки данных клиента');

      // 1) Telegram auth — yields JWT via supabase-js wrapper.
      const { profile_id, full_name } = await loginViaTelegram();

      // 2) Single POST /api/client?action=get-my-cars — replaces 3 anon SELECTs
      //    (clients / client_cars / organization_drivers) plus the
      //    isProfileBlockedForOnlineBooking check. server_admin (BYPASSRLS)
      //    resolves client + phone + cars + blocked_until + driver-org-ids
      //    in one roundtrip.
      let apiResult: any;
      try {
        apiResult = await apiPost('/api/client?action=get-my-cars', {});
      } catch (e: any) {
        if (e.status === 404 && e.body?.error === 'client_profile_not_linked') {
          // Profile created without link-client-profile run; trigger it now.
          const linkRes = await fetch('/api/link-client-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getSessionToken()}`,
            },
            body: JSON.stringify({ full_name: full_name || '', phone: '' }),
          });
          if (!linkRes.ok) {
            const errBody = await linkRes.json().catch(() => ({}));
            throw new Error(`link-client-profile failed: ${errBody.error || linkRes.status}`);
          }
          // Retry the get-my-cars call.
          apiResult = await apiPost('/api/client?action=get-my-cars', {});
        } else {
          throw e;
        }
      }

      const { client, combined_cars } = apiResult?.data ?? {};
      if (!client?.id) {
        throw new Error('client_get_my_cars returned no client.id');
      }

      setProfileId(profile_id);
      setClientId(client.id as string);
      setProfileName(full_name || '');
      setProfilePhone(client.phone ?? '');
      setCombinedCars(combined_cars || []);

      // Derive driverOrganizationIds locally — no extra server roundtrip.
      const driverIds = (combined_cars || [])
        .filter((c: any) => c.type === 'organization' && c.organization_id)
        .map((c: any) => c.organization_id);
      setDriverOrganizationIds(driverIds);

      // Block status comes from same payload.
      if (client.online_booking_blocked_until) {
        setIsBlocked(true);
        const [year, month, day] = client.online_booking_blocked_until.split('-');
        setBlockedUntil(`${day}.${month}.${year}`);
      } else {
        setIsBlocked(false);
        setBlockedUntil(null);
      }
      setIsLoadingBlocked(false);

      console.log('[ClientBookingWrapper] Данные клиента загружены успешно');
    } catch (err) {
      const maybeAuthErr = err as Partial<TelegramAuthError>;
      if (maybeAuthErr && typeof maybeAuthErr.kind === 'string') {
        const ui = telegramAuthErrorUI(maybeAuthErr.kind as TelegramAuthError['kind']);
        setError(ui.message);
        setRecoveryAction(ui.recovery);
      } else {
        console.error('[ClientBookingWrapper] Error loading client:', err);
        setError(err instanceof Error ? err.message : 'Ошибка загрузки данных');
        setRecoveryAction('retry');
      }
    } finally {
      setLoading(false);
    }
  }

  // Combined timeline load: RPC slots (anon, public) + own bookings (Bearer).
  // Returns a unified Booking[] sorted by start_time for DayTimeline.
  async function loadCombinedTimeline(date: string) {
    const [slotsRes, ownRes, closedRes] = await Promise.all([
      supabase.rpc('get_public_booking_slots', { p_target_date: date }),
      apiPost('/api/client?action=get-bookings', { date }),
      supabase.rpc('get_public_closed_boxes', { p_target_date: date }),
    ]);

    if (slotsRes.error) {
      console.error('[ClientBookingWrapper] get_public_booking_slots error:', slotsRes.error.message);
    }
    if (ownRes?.error) {
      console.error('[ClientBookingWrapper] /api/client?action=get-bookings error:', ownRes.error);
    }
    if (closedRes.error) {
      console.error('[ClientBookingWrapper] get_public_closed_boxes error:', closedRes.error.message);
    }

    const slots = (slotsRes.data ?? []) as Array<{
      start_time: string;
      end_time: string;
      box_number: number;
    }>;
    const ownBookings = (ownRes?.data?.bookings ?? []) as Booking[];

    // Map RPC slots to minimal Booking-like rows.
    // RPC slots are occupancy-only — no PII. They get redacted by DayTimeline
    // (client_id !== currentClientId ⇒ redact to 'Занято'). We pre-populate
    // the redact fields AND set status='ОЖИДАЕТ' so DayTimeline's text path
    // always has something meaningful to render (was previously undefined ⇒
    // fell to undefined.car_model.slice and rendered an empty div).
    const syntheticSlots: Booking[] = slots.map((s, i) => ({
      id: `__rpc_slot_${date}_${i}`,
      client_id: null,
      booking_date: date,
      start_time: s.start_time,
      end_time: s.end_time,
      box_number: s.box_number,
      is_quick_booking: false,
      is_org: false,
      status: 'ОЖИДАЕТ',          // active statuses only returned by RPC
      client_name: 'Занято',       // matches DayTimeline's redact label
      car_model: '',
      plate_number: '',
      phone: '',
      services: [],
      price: 0,
      _synthetic: true,
    } as any));

    // ownBookings FIRST so DayTimeline's `displayBookings.find(...)` returns
    // own row (with full PII) when both exist at the same (hour, box) —
    // stable sort preserves array order on equal keys.
    const unified = [...ownBookings, ...syntheticSlots].sort((a, b) => {
      const sa = String(a.start_time ?? '');
      const sb = String(b.start_time ?? '');
      return sa.localeCompare(sb);
    });

    // Closed boxes map.
    const cbRows = (closedRes.data ?? []) as Array<{
      box_number: number;
      closed_date: string;
      open_hours: number[];
    }>;
    const boxMap = new Map<number, number[]>();
    for (const row of cbRows) {
      boxMap.set(row.box_number, row.open_hours ?? []);
    }

    return { unified, closedBoxes: boxMap };
  }

  async function loadOccupancyForDate(date: string) {
    // Public RPCs only — no PII. Combined with loadOwnBookingsForDate.
    try {
      const { unified } = await loadCombinedTimeline(date);
      setBookingsByDate(prev => cleanOldCache({ ...prev, [date]: unified }));
    } catch (error) {
      console.error('[ClientBookingWrapper] Error loading occupancy:', error);
    }
  }

  async function loadOwnBookingsForDate(date: string) {
    // No-op here — loadOccupancyForDate handles combined load atomically.
    // Kept for symmetry with prior RealTime handler. Future: incremental
    // own-only reload after cancel.
  }

  async function loadClosedBoxesForDate(date: string) {
    // Closed boxes are loaded together with loadCombinedTimeline, so this
    // is a thin pass-through. Kept to preserve the previously-existing
    // per-date cache key.
    try {
      const { closedBoxes: boxMap } = await loadCombinedTimeline(date);
      setClosedBoxesByDate(prev => cleanOldClosedBoxesCache({ ...prev, [date]: boxMap }));
    } catch (error) {
      console.error('[ClientBookingWrapper] Error loading closed boxes:', error);
    }
  }

  const handleSlotClick = (hour: number, boxNumber: number) => {
    console.log('[ClientBookingWrapper] Выбран слот:', hour, 'Бокс:', boxNumber);

    if (combinedCars.length === 0) {
      alert('Чтобы создать запись нужно добавить свое авто в разделе "Мой гараж"');
      return;
    }

    setSelectedSlot({ hour, boxNumber });
    onWizardOpen?.();
  };

  const handleWizardBack = () => {
    setSelectedSlot(null);
    onWizardClose?.();
  };

  const handleWizardComplete = async (data: OnlineBookingWizardData) => {
    try {
      console.log('[ClientBookingWrapper] Создание заказа через /api/client?action=create-booking');

      // Find driver_id if org car selected.
      let driverId: string | undefined;
      if (data.isOrganizationCar && data.organizationId && profilePhone) {
        const drivers = await findDriversByPhone(profilePhone);
        if (drivers && drivers.length > 0) {
          const driver = drivers.find(d => d.organization.id === data.organizationId);
          if (driver) driverId = driver.driver.id;
        }
      }

      const payload: Record<string, unknown> = {
        car_model: data.carModel,
        plate_number: data.plateNumber,
        car_type: data.carType,
        services: data.services,
        price: data.price,
        payment_method: data.paymentMethod,
        booking_date: data.bookingDate,
        start_time: data.startTime,
        box_number: data.boxNumber,
      };
      if (data.clientCarId) payload.client_car_id = data.clientCarId;
      if (data.organizationCarId) payload.car_id = data.organizationCarId;
      if (data.organizationId) payload.organization_id = data.organizationId;
      if (driverId) payload.driver_id = driverId;

      const result = await apiPost('/api/client?action=create-booking', payload);
      console.log('[ClientBookingWrapper] Бронь создана:', result?.data?.booking?.id);

      setSelectedSlot(null);
      onWizardClose?.();
      alert('Запись успешно создана!');
    } catch (err: any) {
      console.error('[ClientBookingWrapper] Ошибка создания:', err);
      // Map server error code to a friendly user message.
      const code = err?.body?.error || err?.message;
      let friendly = 'Ошибка при создании записи';
      if (code === 'box_occupied') friendly = 'Этот слот уже занят — выберите другое время.';
      else if (code === 'box_closed') friendly = 'Этот бокс закрыт на выбранное время.';
      else if (code === 'duplicate_booking_for_car') friendly = 'У вас уже есть запись на эту машину в это время.';
      else if (code === 'client_car_id_not_owned') friendly = 'Выбранная машина вам не принадлежит.';
      else if (code === 'car_id_not_owned') friendly = 'Выбранная машина организации вам не принадлежит.';
      setError(friendly);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Загрузка...</p>
        </div>
      </div>
    );
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
              onClick={() => { setError(null); loadClientData(); }}
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
    );
  }

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
    );
  }

  if (!profileId || !clientId) {
    return null;
  }

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
          boxNumber: selectedSlot.boxNumber,
        }}
        selectedDate={selectedDate}
        isFromTimeline={true}
      />
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 pt-safe telegram-safe-area-top">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Запись на мойку</h1>
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
  );
}
