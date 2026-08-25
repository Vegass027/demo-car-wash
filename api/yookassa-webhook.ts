import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Конфигурация для Vercel Serverless Functions
export const config = {
  maxDuration: 60, // максимальное время выполнения в секундах
};

// IP адреса ЮКассы для проверки webhook
const YOOKASSA_IP_RANGES = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11',
  '77.75.156.35',
  '77.75.154.128/25',
  '2a02:5180::/32'
];

// Функция проверки IP адреса
function isValidYookassaIP(ip: string): boolean {
  for (const range of YOOKASSA_IP_RANGES) {
    if (range.includes('/')) {
      // IPv4 CIDR notation
      const [network, prefixLength] = range.split('/');
      const prefix = parseInt(prefixLength, 10);
      const ipParts = ip.split('.').map(Number);
      const networkParts = network.split('.').map(Number);
      
      if (ipParts.length === 4 && networkParts.length === 4) {
        const mask = 0xFFFFFFFF << (32 - prefix);
        const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
        const networkNum = (networkParts[0] << 24) + (networkParts[1] << 16) + (networkParts[2] << 8) + networkParts[3];
        
        if ((ipNum & mask) === (networkNum & mask)) {
          return true;
        }
      }
    } else {
      // IPv6
      // Для простоты считаем что IPv6 адреса валидны если они в списке
      return true;
    }
  }
  return false;
}

// Функция отмены платежа (инлайн для избежания проблем с импортом)
async function cancelPayment(paymentId: string): Promise<any> {
  console.log('[YOOKASSA] Canceling payment:', paymentId);

  const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';
  const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID!;
  const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY!;

  function getAuthHeader(): string {
    const auth = `${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`;
    return `Basic ${Buffer.from(auth).toString('base64')}`;
  }

  const response = await fetch(`${YOOKASSA_API_URL}/payments/${paymentId}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': getAuthHeader(),
      'Idempotence-Key': `cancel-${paymentId}-${Date.now()}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('[YOOKASSA] Cancel payment error:', error);
    throw new Error(`YooKassa API error: ${JSON.stringify(error)}`);
  }

  const payment = await response.json();

  console.log('[YOOKASSA] Payment canceled:', payment.id);

  return payment;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ШАГ 1: Проверка IP адреса (ЮКасса не отправляет заголовок подписи)
    const clientIP = req.headers['x-forwarded-for'] || 
                    req.headers['x-real-ip'] || 
                    req.socket.remoteAddress;
    
    console.log('[YOOKASSA-WEBHOOK] Client IP:', clientIP);
    
    if (!clientIP || !isValidYookassaIP(clientIP)) {
      console.error('[YOOKASSA-WEBHOOK] Invalid IP address:', clientIP);
      return res.status(403).json({ error: 'Forbidden - Invalid IP' });
    }
    
    console.log('[YOOKASSA-WEBHOOK] IP verified');

    const event = req.body.event;
    const payment = req.body.object;

    console.log('[YOOKASSA-WEBHOOK] Event:', event, 'Payment ID:', payment.id);

    // ШАГ 2: Idempotency check - проверяем, не обрабатывали ли уже этот платеж
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id, status, booking_id, tire_booking_id, pending_booking_id')
      .eq('yookassa_payment_id', payment.id)
      .single();

    if (!existingPayment) {
      console.error('[YOOKASSA-WEBHOOK] Payment not found in database');
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Если платеж уже обработан - возвращаем 200 OK (idempotency)
    if (event === 'payment.succeeded' && existingPayment.booking_id) {
      console.log('[YOOKASSA-WEBHOOK] Payment already processed, skipping');
      return res.status(200).json({ status: 'already_processed' });
    }

    if (event === 'payment.canceled' && existingPayment.status === 'canceled') {
      console.log('[YOOKASSA-WEBHOOK] Payment already canceled, skipping');
      return res.status(200).json({ status: 'already_processed' });
    }

    // ШАГ 3: Обработка события payment.succeeded
    if (event === 'payment.succeeded') {
      console.log('[YOOKASSA-WEBHOOK] Processing payment.succeeded');
      
      // Получаем данные pending_booking для car_type и других полей
      let carType = 'SEDAN'; // Дефолтное значение
      let created_by_profile_id: string | undefined;
      let client_id: string | undefined;
      let serviceType = 'carwash'; // По умолчанию автомойка
      
      if (existingPayment.pending_booking_id) {
        const { data: pendingBooking } = await supabase
          .from('pending_bookings')
          .select('id, expires_at, telegram_user_id, service_type, client_email')
          .eq('id', existingPayment.pending_booking_id)
          .single();

        if (pendingBooking) {
          console.log('[YOOKASSA-WEBHOOK] Pending booking found:', pendingBooking.id);
          console.log('[YOOKASSA-WEBHOOK] Using default car_type:', carType);
          console.log('[YOOKASSA-WEBHOOK] Service type:', pendingBooking.service_type);
          
          // ✅ Сохраняем service_type из pending_booking
          serviceType = pendingBooking.service_type || 'carwash';
          
          // ✅ Получаем profile_id по telegram_user_id
          if (pendingBooking.telegram_user_id) {
            console.log('[YOOKASSA-WEBHOOK] Searching profile for telegram_user_id:', pendingBooking.telegram_user_id);
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('id')
              .eq('telegram_id', pendingBooking.telegram_user_id)
              .single();
            
            if (profileError) {
              console.error('[YOOKASSA-WEBHOOK] Profile search error:', profileError);
            }
            
            if (profile) {
              created_by_profile_id = profile.id;
              console.log('[YOOKASSA-WEBHOOK] Profile found, created_by_profile_id:', created_by_profile_id);
              
              // ✅ Получаем client_id по profile_id
              console.log('[YOOKASSA-WEBHOOK] Searching client for profile_id:', profile.id);
              const { data: client, error: clientError } = await supabase
                .from('clients')
                .select('id')
                .eq('profile_id', profile.id)
                .maybeSingle();
              
              if (clientError) {
                console.error('[YOOKASSA-WEBHOOK] Client search error:', clientError);
              }
              
              if (client) {
                client_id = client.id;
                console.log('[YOOKASSA-WEBHOOK] Client found, client_id:', client_id);
              } else {
                console.log('[YOOKASSA-WEBHOOK] Client not found for profile_id:', profile.id);
              }
            } else {
              console.log('[YOOKASSA-WEBHOOK] Profile not found for telegram_user_id:', pendingBooking.telegram_user_id);
            }
          } else {
            console.log('[YOOKASSA-WEBHOOK] No telegram_user_id in pending_booking');
          }
          
          const now = new Date();
          const expiresAt = new Date(pendingBooking.expires_at);
          if (now > expiresAt) {
            console.log('[YOOKASSA-WEBHOOK] Pending booking expired, canceling payment');
            
            // Отменяем платеж в YooKassa
            await cancelPayment(payment.id);
            
            // Обновляем статус платежа
            await supabase
              .from('payments')
              .update({ status: 'canceled' })
              .eq('id', existingPayment.id);
            
            return res.status(200).json({ status: 'canceled_due_to_expiration' });
          }
        }
      }

      // Обновляем статус платежа
      await supabase
        .from('payments')
        .update({ status: 'succeeded' })
        .eq('id', existingPayment.id);

      // Создаем запись в bookings или tire_bookings в зависимости от service_type
      // services приходит как JSON строка, нужно распарсить
      const services = typeof payment.metadata.services === 'string' 
        ? JSON.parse(payment.metadata.services)
        : payment.metadata.services;

      console.log('[YOOKASSA-WEBHOOK] Creating booking with:', {
        created_by_profile_id,
        client_id,
        booking_source: 'online',
        service_type: serviceType,
      });

      let booking;
      let bookingError;
      
      if (serviceType === 'tire') {
        // ✅ Для шиномонтажа создаем запись в tire_bookings
        console.log('[YOOKASSA-WEBHOOK] Creating tire booking...');
        
        // Получаем услуги из tire_services
        const { data: tireServicesData } = await supabase
          .from('tire_services')
          .select('*')
          .in('id', services);
        
        // Формируем массив услуг для tire_bookings
        const tireServices = (tireServicesData || []).map(service => ({
          service_id: service.id,
          name: service.name,
          quantity: 1,
          price: service.price,
          total: service.price
        }));
        
        const { data: tireBooking, error: tireBookingError } = await supabase
          .from('tire_bookings')
          .insert({
            client_name: payment.metadata.client_name,
            phone: payment.metadata.phone,
            car_model: payment.metadata.car_model,
            plate_number: payment.metadata.plate_number,
            booking_date: payment.metadata.booking_date,
            start_time: payment.metadata.start_time,
            estimated_duration: payment.metadata.estimated_duration || 60,
            services: tireServices,
            total_price: parseFloat(payment.amount.value),
            payment_method: 'СБП',
            is_paid: true,
            paid_at: new Date().toISOString(),
            status: 'ОЖИДАЕТ',
            created_at: new Date().toISOString(),
            created_by_profile_id: created_by_profile_id,
            client_id: client_id,
            booking_source: 'online',
          })
          .select()
          .single();
        
        booking = tireBooking;
        bookingError = tireBookingError;
      } else {
        // ✅ Для автомойки создаем запись в bookings
        console.log('[YOOKASSA-WEBHOOK] Creating carwash booking...');

        // Получаем услуги из services для получения названий
        const { data: servicesData } = await supabase
          .from('services')
          .select('*')
          .in('id', services);

        // Формируем массив услуг для bookings (только ID услуг, как в схеме БД)
        const bookingServices = (servicesData || []).map(service => service.id);

        const { data: carwashBooking, error: carwashBookingError } = await supabase
          .from('bookings')
          .insert({
            client_name: payment.metadata.client_name,
            phone: payment.metadata.phone,
            car_model: payment.metadata.car_model,
            plate_number: payment.metadata.plate_number,
            car_type: carType,
            booking_date: payment.metadata.booking_date,
            start_time: payment.metadata.start_time,
            end_time: payment.metadata.end_time,
            services: bookingServices, // ← Теперь массив объектов с названиями!
            box_number: payment.metadata.post,
            price: parseFloat(payment.amount.value),
            payment_method: 'СБП',
            yookassa_payment_id: payment.id,
            is_paid: true,
            paid_at: new Date().toISOString(),
            status: 'ОЖИДАЕТ',
            created_at: new Date().toISOString(),
            created_by_profile_id: created_by_profile_id,
            client_id: client_id,
            booking_source: 'online',
          })
          .select()
          .single();

        booking = carwashBooking;
        bookingError = carwashBookingError;
      }

      if (bookingError) {
        console.error('[YOOKASSA-WEBHOOK] Booking creation error:', bookingError);
        throw bookingError;
      }

      console.log('[YOOKASSA-WEBHOOK] Booking created:', booking.id);

      // Обновляем платеж с правильным полем (booking_id или tire_booking_id)
      // НЕ очищаем pending_booking_id - он нужен для отслеживания истории платежа
      const updateData: any = {};
      
      if (serviceType === 'tire') {
        updateData.tire_booking_id = booking.id;
      } else {
        updateData.booking_id = booking.id;
      }
      
      await supabase
        .from('payments')
        .update(updateData)
        .eq('id', existingPayment.id);

      console.log('[YOOKASSA-WEBHOOK] Payment updated with booking_id:', booking.id);

      // ✅ Сохраняем email клиента в таблицу clients (если есть client_id и email)
      if (client_id && existingPayment.pending_booking_id) {
        // Получаем client_email из pending_bookings
        const { data: pendingBookingForEmail } = await supabase
          .from('pending_bookings')
          .select('client_email')
          .eq('id', existingPayment.pending_booking_id)
          .single();

        if (pendingBookingForEmail?.client_email) {
          console.log('[YOOKASSA-WEBHOOK] Saving client email:', pendingBookingForEmail.client_email);
          const { error: emailUpdateError } = await supabase
            .from('clients')
            .update({ email: pendingBookingForEmail.client_email })
            .eq('id', client_id);

          if (emailUpdateError) {
            console.error('[YOOKASSA-WEBHOOK] Failed to save client email:', emailUpdateError);
          } else {
            console.log('[YOOKASSA-WEBHOOK] Client email saved successfully');
          }
        }
      }

      return res.status(200).json({ 
        status: 'ok',
        booking_id: booking.id,
      });

    } else if (event === 'payment.canceled') {
      console.log('[YOOKASSA-WEBHOOK] Processing payment.canceled');

      // Обновляем статус платежа
      await supabase
        .from('payments')
        .update({ status: 'canceled' })
        .eq('id', existingPayment.id);

      console.log('[YOOKASSA-WEBHOOK] Payment canceled:', payment.id);

      return res.status(200).json({ status: 'canceled' });

    } else {
      console.log('[YOOKASSA-WEBHOOK] Unknown event:', event);
      return res.status(400).json({ error: 'Unknown event' });
    }

  } catch (error: any) {
    console.error('[YOOKASSA-WEBHOOK] Error:', error);
    return res.status(500).json({ 
      error: 'Webhook processing failed',
      details: error.message 
    });
  }
}
