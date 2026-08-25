import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Calendar, History } from 'lucide-react';
import { getTelegramId, initTelegramWebApp, isTelegramWebApp } from '../../shared/telegram/telegram';
import { supabase } from '../../lib/supabase';
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
import { deleteClientCar } from '../../lib/api/clients';

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
  useEffect(() => {
    const loadClientData = async () => {
      try {
        // Инициализация Telegram Web App
        await initTelegramWebApp();

        // Проверка что открыто в Telegram
        const isTelegram = isTelegramWebApp();
        if (!isTelegram) {
          setError('Откройте через Telegram бота');
          setLoading(false);
          return;
        }

        // Получить telegram_id
        const telegramId = getTelegramId();
        if (!telegramId) {
          setError('Не удалось получить данные Telegram');
          setLoading(false);
          return;
        }

        // Найти profile по telegram_id
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, phone, role')
          .eq('telegram_id', telegramId)
          .single();

        if (profileError || !profile) {
          setError('Профиль не найден. Авторизуйтесь через бота');
          setLoading(false);
          return;
        }

        // Проверить что профиль - клиент
        if (profile.role !== 'client') {
          setError('Доступ только для клиентов');
          setLoading(false);
          return;
        }

        // Сохраняем телефон профиля для загрузки организационных машин
        setProfilePhone(profile.phone);

        // Найти client по profile_id
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .select('id')
          .eq('profile_id', profile.id)
          .single();

        if (clientError || !client) {
          setError('Клиент не найден');
          setLoading(false);
          return;
        }

        setProfileId(profile.id);
        setClientId(client.id);
      } catch (err) {
        console.error('[MyGarage] Error loading client:', err);
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    };

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

    try {
      console.log('[MyGarage] Вызываем deleteClientCar');
      await deleteClientCar(carId);
      console.log('[MyGarage] deleteClientCar выполнен успешно, ждем Realtime обновления');
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
