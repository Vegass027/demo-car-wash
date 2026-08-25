import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Конфигурация для Vercel Serverless Functions
export const config = {
  maxDuration: 30, // максимальное время выполнения в секундах
};

interface CreatePaymentSBPRequest {
  pending_booking_id: string;
  amount: number;
}

// Функция создания платежа СБП (инлайн для избежания проблем с импортом)
async function createSBPPayment(params: {
  amount: number;
  pending_booking_id: string;
  metadata: any;
  receipt: any;
}): Promise<{
  paymentId: string;
  confirmationUrl: string;
}> {
  const { amount, pending_booking_id, metadata, receipt } = params;

  console.log('[YOOKASSA] Creating SBP payment for pending_booking_id:', pending_booking_id);

  const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';
  const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID!;
  const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY!;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

  const idempotenceKey = `sbp-${pending_booking_id}-${Date.now()}`;

  function getAuthHeader(): string {
    const auth = `${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`;
    return `Basic ${Buffer.from(auth).toString('base64')}`;
  }

  const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': getAuthHeader(),
      'Idempotence-Key': idempotenceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: {
        value: amount.toString(),
        currency: 'RUB',
      },
      payment_method_data: {
        type: 'sbp',
      },
      confirmation: {
        type: 'redirect',
        return_url: `${APP_URL}/payment-return?paymentId={PAYMENT_ID}`,
      },
      capture: true,
      description: `Оплата записи на автомойку`,
      receipt: receipt, // ← Чек для 54-ФЗ
      metadata: metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[YOOKASSA] Create payment error:', error);
    throw new Error(`YooKassa API error: ${JSON.stringify(error)}`);
  }

  const payment = await response.json();

  console.log('[YOOKASSA] Payment created:', payment.id);

  return {
    paymentId: payment.id,
    confirmationUrl: payment.confirmation?.confirmation_url || '',
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pending_booking_id, amount }: CreatePaymentSBPRequest = req.body;

    // Валидация обязательных полей
    if (!pending_booking_id || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('[CREATE-PAYMENT-SBP] Creating payment for pending_booking_id:', pending_booking_id);

    // ШАГ 1: Получаем данные из pending_bookings
    const { data: pendingBooking, error: fetchError } = await supabase
      .from('pending_bookings')
      .select('*')
      .eq('id', pending_booking_id)
      .single();

    if (fetchError || !pendingBooking) {
      console.error('[CREATE-PAYMENT-SBP] Pending booking not found:', fetchError);
      return res.status(404).json({ error: 'Pending booking not found' });
    }

    // Проверяем, не истекло ли время действия
    const now = new Date();
    const expiresAt = new Date(pendingBooking.expires_at);
    if (now > expiresAt) {
      console.log('[CREATE-PAYMENT-SBP] Pending booking expired');
      return res.status(400).json({ error: 'Pending booking has expired' });
    }

    // ШАГ 2: Получаем детали услуг для формирования чека
    const serviceIds = pendingBooking.services;
    const serviceType = pendingBooking.service_type || 'carwash'; // carwash или tire

    let receiptItems: any[] = [];

    if (serviceType === 'tire') {
      // Для шиномонтажа получаем услуги из tire_services
      const { data: tireServices, error: tireServicesError } = await supabase
        .from('tire_services')
        .select('id, name, price')
        .in('id', serviceIds);

      if (tireServicesError || !tireServices) {
        console.error('[CREATE-PAYMENT-SBP] Tire services not found:', tireServicesError);
        return res.status(404).json({ error: 'Tire services not found' });
      }

      // Формируем товары для чека (шиномонтаж)
      receiptItems = tireServices.map((service) => {
        const price = service.price || 0;

        return {
          description: service.name,
          quantity: 1,
          amount: {
            value: price.toString(),
            currency: 'RUB',
          },
          vat_code: 1, // Без НДС (для УСН)
          payment_mode: 'full_prepayment',
          payment_subject: 'service',
        };
      });
    } else {
      // Для автомойки получаем услуги из services
      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select('id, name, service_type, category, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan')
        .in('id', serviceIds);

      if (servicesError || !services) {
        console.error('[CREATE-PAYMENT-SBP] Services not found:', servicesError);
        return res.status(404).json({ error: 'Services not found' });
      }

      // Определяем тип авто для цены (по умолчанию sedan)
      // TODO: В будущем нужно получать car_type из запроса
      const carType = 'sedan'; // sedan, crossover, jeep, large_suv, minivan

      // Формируем товары для чека (автомойка)
      receiptItems = services.map((service) => {
        // Получаем цену в зависимости от типа авто
        const priceField = `price_${carType}` as keyof typeof service;
        const price = service[priceField] || 0;

        return {
          description: service.name,
          quantity: 1,
          amount: {
            value: price.toString(),
            currency: 'RUB',
          },
          vat_code: 1, // Без НДС (для УСН)
          payment_mode: 'full_prepayment',
          payment_subject: 'service',
        };
      });
    }

    // Проверяем, что сумма чека совпадает с суммой платежа
    const receiptTotal = receiptItems.reduce((sum, item) => sum + parseFloat(item.amount.value), 0);
    if (Math.abs(receiptTotal - amount) > 0.01) {
      console.error('[CREATE-PAYMENT-SBP] Receipt total mismatch:', receiptTotal, 'vs payment amount:', amount);
      return res.status(400).json({
        error: 'Receipt total does not match payment amount',
        receiptTotal,
        paymentAmount: amount
      });
    }

    // Подготавливаем чек для 54-ФЗ
    const receipt = {
      customer: {
        email: pendingBooking.client_email, // Email обязателен для отправки чека
        phone: pendingBooking.phone.replace(/[^0-9]/g, ''), // Дополнительно
      },
      items: receiptItems,
      tax_system_code: 5, // Патент
      internet: true, // Онлайн-платёж
      timezone: 3, // Москва (UTC+3)
    };

    // ШАГ 3: Подготавливаем metadata для YooKassa
    // YooKassa metadata принимает только простые типы (строки, числа, булевы), не массивы
    const metadata = {
      pending_booking_id: pendingBooking.id,
      client_name: pendingBooking.client_name,
      phone: pendingBooking.phone,
      car_model: pendingBooking.car_model,
      plate_number: pendingBooking.plate_number,
      booking_date: pendingBooking.booking_date,
      start_time: pendingBooking.start_time,
      end_time: pendingBooking.end_time,
      services: JSON.stringify(pendingBooking.services), // Преобразуем массив в строку
      post: pendingBooking.post,
    };

    // ШАГ 3: Создаем платеж в YooKassa
    const { paymentId, confirmationUrl } = await createSBPPayment({
      amount,
      pending_booking_id,
      metadata,
      receipt,
    });

    // ШАГ 4: Сохраняем платеж в БД (booking_id пока NULL!)
    console.log('[CREATE-PAYMENT-SBP] Inserting payment with pending_booking_id:', pendingBooking.id);
    const { data: savedPayment, error: insertError } = await supabase
      .from('payments')
      .insert({
        yookassa_payment_id: paymentId,
        amount: amount,
        currency: 'RUB',
        status: 'pending',
        payment_method: 'sbp',
        metadata: metadata,
        pending_booking_id: pendingBooking.id, // ← Заполняем pending_booking_id
        booking_id: null, // ← Пока NULL, заполнится после оплаты через webhook
        tire_booking_id: null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[CREATE-PAYMENT-SBP] Insert payment error:', insertError);
      throw insertError;
    }

    console.log('[CREATE-PAYMENT-SBP] Payment saved:', {
      id: savedPayment.id,
      pending_booking_id: savedPayment.pending_booking_id,
      yookassa_payment_id: savedPayment.yookassa_payment_id,
    });

    return res.status(200).json({
      success: true,
      paymentId: paymentId,
      confirmationUrl: confirmationUrl,
    });

  } catch (error: any) {
    console.error('[CREATE-PAYMENT-SBP] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to create payment',
      details: error.message 
    });
  }
}
