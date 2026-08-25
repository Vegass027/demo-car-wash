import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';

type PaymentStatus = 'loading' | 'succeeded' | 'pending' | 'canceled' | 'error';

export function PaymentReturnPage() {
  const [status, setStatus] = useState<PaymentStatus>('loading');
  const [message, setMessage] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Получаем paymentId из URL hash
  const getPaymentId = () => {
    const hash = window.location.hash;
    const match = hash.match(/[?&]paymentId=([^&]+)/);
    return match ? match[1] : null;
  };

  const checkPaymentStatus = async (paymentId: string) => {
    try {
      const response = await fetch(`/api/check-payment-status?paymentId=${paymentId}`);

      if (!response.ok) {
        throw new Error('Ошибка проверки статуса платежа');
      }

      const data = await response.json();

      if (data.status === 'succeeded') {
        setStatus('succeeded');
        setBookingId(data.booking_id || null);
        setMessage('Оплата успешно выполнена!');

        // Перенаправляем на страницу с заказами через 2 секунды
        setTimeout(() => {
          window.location.hash = '#onlinebook';
          // ✅ Отправляем событие для перезагрузки активных записей
          window.dispatchEvent(new CustomEvent('payment-succeeded'));
        }, 2000);
      } else if (data.status === 'pending') {
        setStatus('pending');
        setMessage('Платеж обрабатывается...');

        // Повторная проверка через 3 секунды (максимум 5 попыток)
        if (retryCount < 5) {
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
            checkPaymentStatus(paymentId);
          }, 3000);
        } else {
          setStatus('error');
          setMessage('Время ожидания платежа истекло. Пожалуйста, свяжитесь с поддержкой.');
        }
      } else if (data.status === 'canceled') {
        setStatus('canceled');
        setMessage('Платеж отменен');

        // Перенаправляем на страницу с заказами через 2 секунды
        setTimeout(() => {
          window.location.hash = '#onlinebook';
        }, 2000);
      } else if (data.status === 'pending_booking_expired') {
        setStatus('canceled');
        setMessage('Время бронирования истекло. Пожалуйста, создайте новую запись.');

        setTimeout(() => {
          window.location.hash = '#onlinebook';
        }, 3000);
      } else {
        setStatus('error');
        setMessage(`Неизвестный статус платежа: ${data.status}`);
      }
    } catch (error) {
      console.error('[PaymentReturnPage] Error:', error);
      setStatus('error');
      setMessage('Произошла ошибка при проверке статуса платежа');
    }
  };

  useEffect(() => {
    const paymentId = getPaymentId();

    if (!paymentId) {
      setStatus('error');
      setMessage('Не указан идентификатор платежа');
      return;
    }

    console.log('[PaymentReturnPage] Checking payment:', paymentId);
    checkPaymentStatus(paymentId);
  }, [retryCount]);

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-4" />
            <h2 className="text-xl font-semibold mb-2">Проверка статуса платежа...</h2>
            <p className="text-gray-600 text-center">Пожалуйста, подождите</p>
          </div>
        );

      case 'succeeded':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-green-600">Оплата выполнена!</h2>
            <p className="text-gray-600 text-center mb-4">{message}</p>
            {bookingId && (
              <p className="text-sm text-gray-500">ID заказа: {bookingId}</p>
            )}
            <button
              onClick={() => {
                window.location.hash = '#onlinebook';
              }}
              className="mt-6 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
            >
              Мои записи
            </button>
            <p className="text-sm text-gray-500 mt-4">Перенаправление...</p>
          </div>
        );

      case 'pending':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Clock className="w-16 h-16 text-yellow-500 mb-4 animate-pulse" />
            <h2 className="text-xl font-semibold mb-2 text-yellow-600">Ожидание оплаты</h2>
            <p className="text-gray-600 text-center mb-4">{message}</p>
            <p className="text-sm text-gray-500">Попытка {retryCount + 1} из 5</p>
          </div>
        );

      case 'canceled':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <XCircle className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-red-600">Платеж отменен</h2>
            <p className="text-gray-600 text-center mb-4">{message}</p>
            <p className="text-sm text-gray-500">Перенаправление...</p>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <XCircle className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2 text-red-600">Ошибка</h2>
            <p className="text-gray-600 text-center mb-4">{message}</p>
            <button
              onClick={() => window.location.hash = '#onlinebook'}
              className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Вернуться к записи
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        {renderContent()}
      </div>
    </div>
  );
}
