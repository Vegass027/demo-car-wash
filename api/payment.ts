import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = {
  maxDuration: 60,
};

// ============== action: create-pending-booking ==============
async function createPendingBooking(req: any, res: any) {
  console.log('[PAYMENT] create-pending-booking body:', JSON.stringify(req.body, null, 2));

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
    service_type = 'carwash',
  } = req.body || {};

  if (!profile_id || !client_name || !phone || !car_model || !plate_number ||
      !booking_date || !start_time || !end_time || !services || !post || total_price === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('telegram_id')
    .eq('id', profile_id)
    .single();

  if (profileError || !profile || !profile.telegram_id) {
    return res.status(404).json({ error: 'Profile not found or telegram_id missing' });
  }

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 30);

  const { data: pendingBooking, error: insertError } = await supabase
    .from('pending_bookings')
    .insert({
      telegram_user_id: profile.telegram_id,
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
      service_type,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (insertError) throw insertError;

  return res.status(200).json({
    success: true,
    pending_booking_id: pendingBooking.id,
    expires_at: pendingBooking.expires_at,
  });
}

// ============== action: create-payment-sbp ==============
async function createSBPPayment(params: {
  amount: number;
  pending_booking_id: string;
  metadata: any;
  receipt: any;
}): Promise<{ paymentId: string; confirmationUrl: string }> {
  const { amount, pending_booking_id, metadata, receipt } = params;
  const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';
  const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID!;
  const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY!;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
  const idempotenceKey = `sbp-${pending_booking_id}-${Date.now()}`;

  const auth = `Basic ${Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64')}`;

  const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Idempotence-Key': idempotenceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: { value: amount.toString(), currency: 'RUB' },
      payment_method_data: { type: 'sbp' },
      confirmation: {
        type: 'redirect',
        return_url: `${APP_URL}/payment-return?paymentId={PAYMENT_ID}`,
      },
      capture: true,
      description: 'Оплата записи на автомойку',
      receipt,
      metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`YooKassa API error: ${JSON.stringify(error)}`);
  }
  const payment = await response.json();
  return {
    paymentId: payment.id,
    confirmationUrl: payment.confirmation?.confirmation_url || '',
  };
}

async function createPaymentSBP(req: any, res: any) {
  const { pending_booking_id, amount } = req.body || {};
  if (!pending_booking_id || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { data: pendingBooking, error: fetchError } = await supabase
    .from('pending_bookings')
    .select('*')
    .eq('id', pending_booking_id)
    .single();

  if (fetchError || !pendingBooking) {
    return res.status(404).json({ error: 'Pending booking not found' });
  }

  const now = new Date();
  if (now > new Date(pendingBooking.expires_at)) {
    return res.status(400).json({ error: 'Pending booking has expired' });
  }

  const serviceIds = pendingBooking.services;
  const serviceType = pendingBooking.service_type || 'carwash';
  let receiptItems: any[] = [];

  if (serviceType === 'tire') {
    const { data: tireServices } = await supabase
      .from('tire_services')
      .select('id, name, price')
      .in('id', serviceIds);
    if (!tireServices) return res.status(404).json({ error: 'Tire services not found' });
    receiptItems = tireServices.map((service) => ({
      description: service.name,
      quantity: 1,
      amount: { value: (service.price || 0).toString(), currency: 'RUB' },
      vat_code: 1,
      payment_mode: 'full_prepayment',
      payment_subject: 'service',
    }));
  } else {
    const { data: services } = await supabase
      .from('services')
      .select('id, name, service_type, category, price_sedan, price_crossover, price_jeep, price_large_suv, price_minivan')
      .in('id', serviceIds);
    if (!services) return res.status(404).json({ error: 'Services not found' });
    const carType = 'sedan';
    receiptItems = services.map((service) => {
      const priceField = `price_${carType}` as keyof typeof service;
      const price = service[priceField] || 0;
      return {
        description: service.name,
        quantity: 1,
        amount: { value: price.toString(), currency: 'RUB' },
        vat_code: 1,
        payment_mode: 'full_prepayment',
        payment_subject: 'service',
      };
    });
  }

  const receiptTotal = receiptItems.reduce((s, i) => s + parseFloat(i.amount.value), 0);
  if (Math.abs(receiptTotal - amount) > 0.01) {
    return res.status(400).json({ error: 'Receipt total mismatch', receiptTotal, paymentAmount: amount });
  }

  const receipt = {
    customer: {
      email: pendingBooking.client_email,
      phone: pendingBooking.phone?.replace(/[^0-9]/g, ''),
    },
    items: receiptItems,
    tax_system_code: 5,
    internet: true,
    timezone: 3,
  };

  const metadata = {
    pending_booking_id: pendingBooking.id,
    client_name: pendingBooking.client_name,
    phone: pendingBooking.phone,
    car_model: pendingBooking.car_model,
    plate_number: pendingBooking.plate_number,
    booking_date: pendingBooking.booking_date,
    start_time: pendingBooking.start_time,
    end_time: pendingBooking.end_time,
    services: JSON.stringify(pendingBooking.services),
    post: pendingBooking.post,
  };

  const { paymentId, confirmationUrl } = await createSBPPayment({
    amount, pending_booking_id, metadata, receipt,
  });

  const { data: savedPayment, error: insertError } = await supabase
    .from('payments')
    .insert({
      yookassa_payment_id: paymentId,
      amount,
      currency: 'RUB',
      status: 'pending',
      payment_method: 'sbp',
      metadata,
      pending_booking_id: pendingBooking.id,
      booking_id: null,
      tire_booking_id: null,
    })
    .select()
    .single();

  if (insertError) throw insertError;

  return res.status(200).json({
    success: true,
    paymentId,
    confirmationUrl,
  });
}

// ============== action: check-payment-status ==============
async function checkPaymentStatus(req: any, res: any) {
  const body = req.body || {};
  const pending_booking_id = body.pending_booking_id || body.paymentId; // accept either

  let payment;
  if (pending_booking_id) {
    const { data, error } = await supabase
      .from('payments')
      .select('id, status, booking_id, tire_booking_id, pending_booking_id')
      .eq('pending_booking_id', pending_booking_id)
      .single();
    if (!error) payment = data;
  }

  // fallback: lookup by yookassa_payment_id
  if (!payment && body.paymentId) {
    const { data, error } = await supabase
      .from('payments')
      .select('id, status, booking_id, tire_booking_id, pending_booking_id')
      .eq('yookassa_payment_id', body.paymentId)
      .single();
    if (!error) payment = data;
  }

  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  if (payment.pending_booking_id) {
    const { data: pendingBooking } = await supabase
      .from('pending_bookings')
      .select('expires_at')
      .eq('id', payment.pending_booking_id)
      .single();
    if (pendingBooking && new Date() > new Date(pendingBooking.expires_at)) {
      return res.status(200).json({ status: 'expired', message: 'Payment expired' });
    }
  }

  return res.status(200).json({
    status: payment.status,
    message: payment.status === 'succeeded' ? 'Payment succeeded' : 'Payment pending',
  });
}

// ============== main dispatcher ==============
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const action = req.query.action || req.body?.action;
    switch (action) {
      case 'create-pending-booking':
        return await createPendingBooking(req, res);
      case 'create-payment-sbp':
        return await createPaymentSBP(req, res);
      case 'check-payment-status':
        return await checkPaymentStatus(req, res);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[PAYMENT] Error:', error);
    return res.status(500).json({ error: 'Internal error', details: error.message });
  }
}
