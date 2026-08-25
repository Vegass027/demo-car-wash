import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ArrowLeft, AlertCircle, Building2, QrCode, Clock, CheckCircle, Smartphone, Mail } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

interface BankSelectionStepProps {
  bookingDetails: {
    date: string;
    time: string;
    boxNumber: number;
    carModel: string;
    plateNumber: string;
    services: string[];
    price: number;
  };
  services: any[];
  profileId: string;
  profileName: string;
  profilePhone: string;
  onBack: () => void;
  onPaymentComplete: () => void;
  onWizardClose?: () => void;
  serviceType?: 'carwash' | 'tire'; // Тип услуги: carwash (автомойка) или tire (шиномонтаж)
}

export const BankSelectionStep: React.FC<BankSelectionStepProps> = ({
  bookingDetails,
  services,
  profileId,
  profileName,
  profilePhone,
  onBack,
  onPaymentComplete,
  onWizardClose,
  serviceType = 'carwash' // По умолчанию автомойка
}) => {
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed' | 'waiting'>('idle');
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [pollAttempts, setPollAttempts] = useState(0);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false); // Отдельный state для UI загрузки
  const [clientEmail, setClientEmail] = useState(''); // Email клиента для чека
  const [emailError, setEmailError] = useState(''); // Ошибка валидации email
  const MAX_POLL_ATTEMPTS = 20; // 20 попыток * 3 секунды = 1 минута

  // Валидация email
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Загружаем email клиента из БД при монтировании компонента
  useEffect(() => {
    const loadClientEmail = async () => {
      try {
        const { data: client, error } = await supabase
          .from('clients')
          .select('email')
          .eq('profile_id', profileId)
          .single();

        if (error) {
          console.error('[BankSelectionStep] Error loading client email:', error);
          return;
        }

        if (client?.email) {
          setClientEmail(client.email);
          console.log('[BankSelectionStep] Loaded client email:', client.email);
        }
      } catch (err) {
        console.error('[BankSelectionStep] Error loading client email:', err);
      }
    };

    loadClientEmail();
  }, [profileId]);

  // Обработчик оплаты через СБП
  const handleSBPPayment = async () => {
    try {
      // Валидация email
      if (!clientEmail.trim()) {
        setEmailError('Введите email для получения чека');
        return;
      }

      if (!validateEmail(clientEmail)) {
        setEmailError('Введите корректный email');
        return;
      }

      setPaymentStatus('processing');
      setError(null);
      setEmailError(''); // Сбрасываем ошибку email
      setIsCheckingStatus(false); // Сбрасываем состояние проверки
      setPollAttempts(0); // Сбрасываем счетчик попыток при создании нового платежа

      // Подготовка данных для логирования
      const requestData = {
        profile_id: profileId, // UUID из таблицы profiles
        client_name: profileName, // Реальное имя клиента из профиля
        phone: profilePhone, // Реальный телефон клиента из профиля
        car_model: bookingDetails.carModel,
        plate_number: bookingDetails.plateNumber,
        booking_date: bookingDetails.date,
        start_time: bookingDetails.time,
        end_time: bookingDetails.time, // TODO: рассчитать на основе услуг
        services: bookingDetails.services,
        total_price: bookingDetails.price,
        post: bookingDetails.boxNumber,
        client_email: clientEmail.trim(), // Email для чека
        service_type: serviceType, // Тип услуги: carwash или tire
      };

      console.log('[BankSelectionStep] Creating pending booking with data:', requestData);
      console.log('[BankSelectionStep] profileId:', profileId, 'type:', typeof profileId);

      // Создаем pending booking
      const pendingResponse = await fetch('/api/create-pending-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      const pendingData = await pendingResponse.json();

      console.log('[BankSelectionStep] Pending booking response:', pendingData);

      if (!pendingResponse.ok) {
        console.error('[BankSelectionStep] Pending booking failed:', pendingData);
        throw new Error(pendingData.error || 'Не удалось создать предварительную запись');
      }

      // Сохраняем pending_booking_id для проверки статуса
      setPendingBookingId(pendingData.pending_booking_id);

      // Создаем платеж СБП (без указания банка!)
      console.log('[BankSelectionStep] Creating payment with pending_booking_id:', pendingData.pending_booking_id);
      const paymentResponse = await fetch('/api/create-payment-sbp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pending_booking_id: pendingData.pending_booking_id,
          amount: bookingDetails.price,
        }),
      });

      const paymentData = await paymentResponse.json();

      console.log('[BankSelectionStep] Payment response:', paymentData);

      if (!paymentResponse.ok) {
        console.error('[BankSelectionStep] Payment failed:', paymentData);
        throw new Error(paymentData.error || 'Не удалось создать платеж');
      }

      // Сохраняем QR-код для fallback
      if (paymentData.confirmationUrl) {
        setQrCodeUrl(paymentData.confirmationUrl);
      }

      // Перенаправляем на страницу ЮМoney
      if (paymentData.confirmationUrl) {
        // Проверяем, есть ли Telegram WebApp API
        if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openLink) {
          (window as any).Telegram.WebApp.openLink(paymentData.confirmationUrl);
        } else {
          window.location.href = paymentData.confirmationUrl;
        }
      }

      // ✅ Устанавливаем статус 'waiting' вместо 'success'
      // Статус 'success' будет установлен только после подтверждения платежа через webhook
      setPaymentStatus('waiting');
    } catch (err: any) {
      console.error('[BankSelectionStep] Error processing payment:', err);
      setPaymentStatus('failed');
      setError(err.message || 'Ошибка при создании платежа. Попробуйте снова.');
    }
  };

  // Обработчик повтора
  const handleRetry = () => {
    setPaymentStatus('idle');
    setError(null);
    setShowQRCode(false);
    setQrCodeUrl(null);
    setPendingBookingId(null);
    setIsCheckingStatus(false); // Сбрасываем состояние проверки
    setPollAttempts(0); // Сбрасываем счетчик попыток
  };

  // Обработчик показа QR кода
  const handleShowQRCode = () => {
    setShowQRCode(true);
  };

  // Функция проверки статуса платежа
  const checkPaymentStatus = async () => {
    if (!pendingBookingId) {
      setError('Нет ID платежа для проверки');
      return;
    }

    try {
      setIsCheckingStatus(true); // Показываем загрузку только на кнопке
      setError(null);

      const response = await fetch('/api/check-payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pending_booking_id: pendingBookingId }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[BankSelectionStep] Check payment status failed:', data);
        throw new Error(data.error || 'Не удалось проверить статус платежа');
      }

      console.log('[BankSelectionStep] Payment status:', data);

      if (data.status === 'succeeded') {
        // Платеж подтвержден
        setPaymentStatus('success');
        // ✅ Отправляем событие для обновления активных записей в MyGarage
        window.dispatchEvent(new CustomEvent('payment-succeeded'));
        // ✅ Сразу закрываем мастер БЕЗ задержки
        onPaymentComplete();
        onWizardClose?.();
      } else if (data.status === 'canceled') {
        // Платеж отменен
        setPaymentStatus('failed');
        setError('Платеж был отменен');
      } else if (data.status === 'expired') {
        // Время оплаты истекло
        setPaymentStatus('failed');
        setError('Время оплаты истекло. Попробуйте снова.');
      }
      // Если платеж все еще ожидает, НЕ меняем paymentStatus (остается 'waiting')
    } catch (err: any) {
      console.error('[BankSelectionStep] Error checking payment status:', err);
      setError(err.message || 'Ошибка при проверке статуса. Попробуйте снова.');
    } finally {
      setIsCheckingStatus(false); // Скрываем загрузку
    }
  };

  // ✅ Периодическая проверка статуса платежа (polling)
  useEffect(() => {
    // Запускаем polling только если есть pendingBookingId и статус 'waiting'
    if (pendingBookingId && paymentStatus === 'waiting' && pollAttempts < MAX_POLL_ATTEMPTS) {
      console.log('[BankSelectionStep] Starting payment status polling, attempt:', pollAttempts + 1);

      // Проверяем статус сразу
      checkPaymentStatus();

      // Затем проверяем каждые 3 секунды
      const interval = setInterval(() => {
        setPollAttempts(prev => {
          const nextAttempt = prev + 1;

          if (nextAttempt >= MAX_POLL_ATTEMPTS) {
            console.log('[BankSelectionStep] Max polling attempts reached, stopping');
            clearInterval(interval);
            return prev;
          }

          console.log('[BankSelectionStep] Polling payment status, attempt:', nextAttempt);
          checkPaymentStatus();

          return nextAttempt;
        });
      }, 3000);

      // Очищаем интервал при размонтировании или изменении условий
      return () => {
        console.log('[BankSelectionStep] Cleaning up polling interval');
        clearInterval(interval);
      };
    }
  }, [pendingBookingId, paymentStatus, pollAttempts]);

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} disabled={paymentStatus === 'processing'}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div>
          <h3 className="text-xl font-bold">Оплата через СБП</h3>
          <div className="text-xs text-gray-500">Шаг 4 из 4</div>
        </div>
      </div>

      {/* Детали заказа */}
      <Card className="border-primary bg-blue-50/50">
        <CardContent className="p-4 space-y-3">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Дата и время</div>
            <div className="font-bold text-lg">
              {bookingDetails.date} в {bookingDetails.time}
            </div>
          </div>
          {serviceType === 'carwash' && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Бокс</div>
              <div className="font-medium">Бокс {bookingDetails.boxNumber}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Автомобиль</div>
            <div className="font-medium">{bookingDetails.carModel} ({bookingDetails.plateNumber})</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Услуги</div>
            <div className="space-y-1">
              {bookingDetails.services.map((serviceId) => {
                const service = services.find(s => s.id === serviceId);
                return (
                  <div key={serviceId} className="text-sm">
                    {service?.name}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="border-t pt-3 flex justify-between items-center">
            <span className="font-bold">Итого:</span>
            <span className="text-xl font-bold">{bookingDetails.price} ₽</span>
          </div>
        </CardContent>
      </Card>

      {/* Поле email для чека */}
      {paymentStatus === 'idle' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Mail className="w-4 h-4" />
            <span>Email для получения чека</span>
          </div>
          <Input
            type="email"
            placeholder="example@mail.ru"
            value={clientEmail}
            onChange={(e) => {
              setClientEmail(e.target.value);
              setEmailError(''); // Сбрасываем ошибку при вводе
            }}
            className={emailError ? 'border-red-500' : ''}
          />
          {emailError && (
            <div className="text-red-500 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {emailError}
            </div>
          )}
        </div>
      )}

      {/* Кнопка оплаты */}
      {paymentStatus === 'idle' && (
        <Button
          className="w-full h-14 text-lg"
          onClick={handleSBPPayment}
          disabled={paymentStatus === 'processing'}
        >
          <Building2 className="w-5 h-5 mr-2" />
          Оплатить и записаться
        </Button>
      )}

      {/* Обработка платежа */}
      {paymentStatus === 'processing' && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <div className="font-medium mb-2">Создание платежа...</div>
          <div className="text-sm text-gray-500 flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" />
            Пожалуйста, подождите
          </div>
        </div>
      )}

      {/* QR-код fallback */}
      {showQRCode && qrCodeUrl && paymentStatus === 'processing' && (
        <div className="text-center py-4">
          <div className="text-sm text-gray-600 mb-3">
            Если приложение банка не открылось, отсканируйте QR-код:
          </div>
          <Card className="inline-block p-4">
            <QrCode className="w-48 h-48 mx-auto text-gray-400" />
            <div className="text-xs text-gray-500 mt-2">QR-код для оплаты</div>
          </Card>
        </div>
      )}

      {/* Ожидание оплаты */}
      {paymentStatus === 'waiting' && (
        <div className="text-center py-8 space-y-4">
          <Clock className="w-16 h-16 mx-auto mb-4 text-blue-500" />
          <div className="text-lg font-bold text-blue-600 mb-2">Ожидание оплаты...</div>
          <div className="text-sm text-gray-600 mb-4">
            Перейдите в приложение банка и завершите оплату. После оплаты нажмите кнопку ниже.
          </div>
          <Button
            className="w-full"
            onClick={checkPaymentStatus}
            disabled={isCheckingStatus}
          >
            {isCheckingStatus ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Проверка...
              </>
            ) : (
              <>
                <Smartphone className="w-5 h-5 mr-2" />
                Проверить статус платежа
              </>
            )}
          </Button>
          <div className="text-xs text-gray-500">
            Если оплата прошла успешно, но статус не обновился, попробуйте снова через несколько секунд
          </div>
        </div>
      )}

      {/* Успех */}
      {paymentStatus === 'success' && (
        <div className="text-center py-8">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <div className="text-lg font-bold text-green-600 mb-2">Оплата успешна!</div>
          <div className="text-sm text-gray-600">Запись создана</div>
        </div>
      )}

      {/* Ошибка */}
      {paymentStatus === 'failed' && (
        <div className="space-y-4">
          <div className="text-red-500 text-sm font-medium flex items-center gap-2 p-4 bg-red-50 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
          <Button
            className="w-full"
            onClick={handleRetry}
          >
            Попробовать снова
          </Button>
        </div>
      )}
    </div>
  );
};
