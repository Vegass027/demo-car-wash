import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Конфигурация для Vercel Serverless Functions
export const config = {
  maxDuration: 30, // максимальное время выполнения в секундах
};

interface CreatePendingBookingRequest {
  profile_id: string; // UUID из таблицы profiles
  client_name: string;
  phone: string;
  car_model: string;
  plate_number: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  services: any[];
  post: number;
  total_price: number;
  client_email?: string; // Email клиента для отправки чека 54-ФЗ
  service_type?: 'carwash' | 'tire'; // Тип услуги: carwash (автомойка) или tire (шиномонтаж)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Логирование всего запроса для диагностики
    console.log('[CREATE-PENDING-BOOKING] Request body:', JSON.stringify(req.body, null, 2));

    const {
      profile_id,
      client_name,
      phone,
      car_model,
      plate_number,
      booking_date,
      start_time,
      end_time,
      services,
      post,
      total_price,
      client_email,
      service_type = 'carwash', // По умолчанию автомойка
    }: CreatePendingBookingRequest = req.body;

    // Детальное логирование валидации
    const validationCheck = {
      profile_id: { value: profile_id, valid: !!profile_id && typeof profile_id === 'string' },
      client_name: { value: client_name, valid: !!client_name },
      phone: { value: phone, valid: !!phone },
      car_model: { value: car_model, valid: !!car_model },
      plate_number: { value: plate_number, valid: !!plate_number },
      booking_date: { value: booking_date, valid: !!booking_date },
      start_time: { value: start_time, valid: !!start_time },
      end_time: { value: end_time, valid: !!end_time },
      services: { value: services, valid: !!services && Array.isArray(services) },
      post: { value: post, valid: !!post },
      total_price: { value: total_price, valid: total_price !== undefined },
    };

    console.log('[CREATE-PENDING-BOOKING] Validation check:', JSON.stringify(validationCheck, null, 2));

    // Валидация обязательных полей
    if (!profile_id || !client_name || !phone || !car_model || !plate_number ||
        !booking_date || !start_time || !end_time || !services || !post || total_price === undefined) {
      const missingFields = [];
      if (!profile_id) missingFields.push('profile_id');
      if (!client_name) missingFields.push('client_name');
      if (!phone) missingFields.push('phone');
      if (!car_model) missingFields.push('car_model');
      if (!plate_number) missingFields.push('plate_number');
      if (!booking_date) missingFields.push('booking_date');
      if (!start_time) missingFields.push('start_time');
      if (!end_time) missingFields.push('end_time');
      if (!services) missingFields.push('services');
      if (!post) missingFields.push('post');
      if (total_price === undefined) missingFields.push('total_price');
      
      console.error('[CREATE-PENDING-BOOKING] Missing required fields:', missingFields);
      return res.status(400).json({ error: 'Missing required fields', missingFields });
    }

    console.log('[CREATE-PENDING-BOOKING] Getting telegram_id for profile_id:', profile_id);

    // Получаем telegram_id из таблицы profiles по UUID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', profile_id)
      .single();

    if (profileError || !profile || !profile.telegram_id) {
      console.error('[CREATE-PENDING-BOOKING] Profile not found or telegram_id missing:', profileError);
      return res.status(404).json({ 
        error: 'Profile not found or telegram_id missing',
        details: profileError?.message 
      });
    }

    const telegram_user_id = profile.telegram_id;
    console.log('[CREATE-PENDING-BOOKING] Found telegram_id:', telegram_user_id);

    // Вычисляем expires_at (30 минут от текущего времени)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    // Создаем запись в pending_bookings
    const { data: pendingBooking, error: insertError } = await supabase
      .from('pending_bookings')
      .insert({
        telegram_user_id,
        client_name,
        phone,
        car_model,
        plate_number,
        booking_date,
        start_time,
        end_time,
        services,
        post,
        total_price,
        client_email, // Email клиента для отправки чека
        service_type, // Тип услуги: carwash или tire
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[CREATE-PENDING-BOOKING] Insert error:', insertError);
      throw insertError;
    }

    console.log('[CREATE-PENDING-BOOKING] Pending booking created:', pendingBooking.id);

    return res.status(200).json({
      success: true,
      pending_booking_id: pendingBooking.id,
      expires_at: pendingBooking.expires_at,
    });

  } catch (error: any) {
    console.error('[CREATE-PENDING-BOOKING] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to create pending booking',
      details: error.message 
    });
  }
}
