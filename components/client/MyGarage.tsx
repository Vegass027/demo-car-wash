import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Calendar, History } from 'lucide-react';
import { supabase, getSessionToken } from '../../lib/supabase';
import { loginViaTelegram, telegramAuthErrorUI, reloadMiniApp, TelegramAuthError } from '../../lib/client-auth';
import { LoyaltyProgressBar } from './LoyaltyProgressBar';
import { ActiveBookingCard } from './ActiveBookingCard';
import { MyCarsList } from './MyCarsList';
import { AddCarForm } from './AddCarForm';
import { BookingHistory } from './BookingHistory';
import { useLoyaltyProgress } from '../../shared/hooks/useLoyaltyProgress';
import { useClientCars } from '../../shared/hooks/useClientCars';
import { useActiveBookings } from '../../shared/hooks/useActiveBookings';
import { useBookingHistory } from '../../shared/hooks/useBookingHistory';
import { Service } from '../../lib/api/services';
import { Organization, OrganizationDriver, OrganizationCar } from '../../lib/api/organizations';
import { Client } from '../../lib/api/clients';
// deleteClientCar removed: soft-delete routes through POST /api/client-delete-car
// (server-admin BACKEND enforced ownership gate, JWT-verified).

interface MyGarageProps {
  services: Service[];
  tireServices: any[];
  organizations: Organization[];
  organizationDrivers: OrganizationDriver[];
  organizationCars: OrganizationCar[];
  clients: Client[];
}

export const MyGarage: React.FC<MyGarageProps> = ({
  services,
  tireServices,
  organizations,
  organizationDrivers,
  organizationCars,
  clients,
}) => {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recoveryAction, setRecoveryAction] = useState<'reload_mini_app' | 'retry' | 'none'>('none');
  const [showAddCarForm, setShowAddCarForm] = useState(false);

  // Хуки для данных
  const { cars, isLoading: carsLoading, addCar, refetch: refetchCars } = useClientCars(profileId, profilePhone);
  const { carwashBookings, tireBookings, isLoading: activeBookingsLoading, refetch: refetchActiveBookings } = useActiveBookings(profileId, profilePhone);
  const { 
    carwashBookings: historyCarwash, 
    tireBookings: historyTire, 
    isLoading: historyLoading,
    refetch: refetchHistory
  } = useBookingHistory(profileId);

  // Загрузка данных клиента
  const loadClientData = async () => {
    try {
      // Phase 1.6b: HMAC-verified /api/telegram-auth replaces 4-step lookup.
      // Server-side role-check ensures admin/owner with linked Telegram
      // get 403, not a stolen client UI.
      const { profile_id } = await loginViaTelegram();

      // profilePhone needed by useClientCars / useBookingHistory hooks (org-cars).
      // /api/telegram-auth doesn't return phone (would expand payload),
      // so we read it via wrapper-authenticated select. RLS-safe even
      // before Phase 2 (clients table is public_all_access today).
      const { data: profileRow, error: phoneErr } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', profile_id)
        .single();

      if (!phoneErr && profileRow?.phone) {
        setProfilePhone(profileRow.phone);
      }

      // Найти client по profile_id
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('profile_id', profile_id)
        .single();

      if (clientError || !client) {
        setError('Клиент не найден');
        setLoading(false);
        return;
      }

      setProfileId(profile_id);
      setClientId(client.id);
    } catch (err) {
      // TelegramAuthError → typed UI; other errors → generic.
      const maybeAuthErr = err as Partial<TelegramAuthError>;
      if (maybeAuthErr && typeof maybeAuthErr.kind === 'string') {
        const ui = telegramAuthErrorUI(maybeAuthErr.kind as TelegramAuthError['kind']);
        setError(ui.message);
        setRecoveryAction(ui.recovery);
      } else {
        console.error('[MyGarage] Error loading client:', err);
        setError('Ошибка загрузки данных');
        setRecoveryAction('retry');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClientData();
  }, []);

  // ❌ УБРАНО: Realtime подписки теперь в хуках (useActiveBookings, useBookingHistory)
  // Хуки сами обрабатывают изменения без мигания

  // ✅ Перезагружаем активные записи после успешной оплаты (для СБП оплаты)
  useEffect(() => {
    const handlePaymentSuccess = () => {
      console.log('[MyGarage] Платеж успешен, перезагружаем активные записи')
      refetchActiveBookings()
    };

    window.addEventListener('payment-succeeded', handlePaymentSuccess)

    return () => {
      window.removeEventListener('payment-succeeded', handlePaymentSuccess)
    }
  }, [refetchActiveBookings])

  // Обработчик добавления машины
  const handleAddCar = async (carData: { client_id: string; car_model: string; plate_number: string; car_type: string }) => {
    try {
      await addCar(carData.car_model, carData.plate_number, carData.car_type);
      setShowAddCarForm(false);
      // ❌ НЕ вызываем refetchCars() - Realtime подписка сама обработает изменение
      // await refetchCars();
    } catch (err: any) {
      alert(err.message || 'Не удалось добавить машину');
    }
  };

  // Обработчик удаления машины
  const handleDeleteCar = async (carId: string, type: 'personal' | 'organization') => {
    console.log('[MyGarage] handleDeleteCar вызван, carId:', carId, 'type:', type);
    if (type !== 'personal') {
      alert('Нельзя удалить организационную машину');
      return;
    }

    if (!confirm('Вы уверены, что хотите удалить эту машину?')) {
      return;
    }

    const token = getSessionToken();
    if (!token) {
      alert('Сессия не активна. Перезагрузите Mini App.');
      return;
    }

    try {
      const res = await fetch('/api/client-delete-car', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ car_id: carId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = body?.error || `HTTP ${res.status}`;
        let friendly = 'Не удалось удалить машину';
        if (code === 'car_id_not_owned') friendly = 'Машина вам не принадлежит.';
        throw new Error(friendly);
      }
      console.log('[MyGarage] car soft-deleted via /api/client-delete-car');
      // ❌ НЕ вызываем refetchCars() - Realtime подписка сама обработает изменение
      // await refetchCars();
    } catch (err: any) {
      console.error('[MyGarage] Ошибка при удалении машины:', err);
      alert(err.message || 'Не удалось удалить машину');
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
    );
  }

  if (!profileId || !clientId) {
    return null;
  }

  const hasActiveBookings = carwashBookings.length > 0 || tireBookings.length > 0;

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h1 className="text-2xl font-bold text-gray-900">Мой гараж</h1>
        <p className="text-gray-600">Управляйте своими машинами и записями</p>
      </div>

      {/* Прогресс бар лояльности */}
      <LoyaltyProgressBar profileId={profileId} />

      {/* Актуальные записи */}
      {(hasActiveBookings || activeBookingsLoading) && (
        <div className="space-y-3">
          <Badge className="bg-gray-800 border-2 border-black px-4 py-2 text-lg font-bold flex items-center gap-2 w-full justify-center">
            <Calendar className="w-5 h-5" />
            Актуальные записи
          </Badge>
          {activeBookingsLoading ? (
            <div className="text-center py-8 text-gray-500">Загрузка...</div>
          ) : (
            <div className="space-y-3">
              {carwashBookings.map((booking) => (
                <ActiveBookingCard
                  key={booking.id}
                  booking={booking}
                  type="carwash"
                  services={services}
                  profileId={profileId}
                  // ✅ onDelete не нужен - Realtime подписка сама обработает удаление
                />
              ))}
              {tireBookings.map((booking) => (
                <ActiveBookingCard
                  key={booking.id}
                  booking={booking}
                  type="tire"
                  tireServices={tireServices}
                  profileId={profileId}
                  // ✅ onDelete не нужен - Realtime подписка сама обработает удаление
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Разделитель */}
      <div className="border-t border-gray-200 my-6"></div>

      {/* Форма добавления машины */}
      {showAddCarForm && (
        <AddCarForm
          clientId={clientId}
          onSuccess={() => {
            setShowAddCarForm(false);
            // ❌ НЕ вызываем refetchCars() - Realtime подписка сама обработает изменение
            // refetchCars();
          }}
          onCancel={() => setShowAddCarForm(false)}
        />
      )}

      {/* Мои машины */}
      <div className="space-y-3">
        {!showAddCarForm && (
          <MyCarsList
            cars={cars}
            onAddCar={() => setShowAddCarForm(true)}
            onDeleteCar={handleDeleteCar}
          />
        )}
      </div>

      {/* Разделитель */}
      <div className="border-t border-gray-200 my-6"></div>

      {/* История записей */}
      <div className="space-y-3">
        <Badge className="bg-gray-800 border-2 border-black px-4 py-2 text-lg font-bold flex items-center gap-2">
          <History className="w-5 h-5" />
          История записей
        </Badge>
        {historyLoading ? (
          <div className="text-center py-8 text-gray-500">Загрузка...</div>
        ) : (
          <BookingHistory
            carwashBookings={historyCarwash}
            tireBookings={historyTire}
            services={services}
          />
        )}
      </div>
    </div>
  );
};
